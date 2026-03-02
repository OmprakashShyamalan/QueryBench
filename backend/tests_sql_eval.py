"""
Unit tests for backend/sql_eval.py

Run from the project root:
    python -m unittest backend.tests_sql_eval -v

No database connection or Django settings required.
"""

import decimal
import datetime
import unittest

from backend.sql_eval import validate_sql, apply_row_limit, normalize_result


# ---------------------------------------------------------------------------
# validate_sql
# ---------------------------------------------------------------------------

class TestValidateSQL(unittest.TestCase):

    # ── passing cases ────────────────────────────────────────────────────────

    def test_plain_select_ok(self):
        validate_sql("SELECT col1 FROM employees")

    def test_select_with_order_by_ok(self):
        validate_sql("SELECT col1 FROM employees ORDER BY col1")

    def test_order_by_not_required(self):
        # ORDER BY must not be mandatory — evaluation is order-insensitive by default
        validate_sql("SELECT col1, col2 FROM orders")  # no exception

    def test_cte_ok(self):
        validate_sql(
            "WITH ranked AS (SELECT id, name FROM t WHERE id > 5) "
            "SELECT id, name FROM ranked"
        )

    def test_multiple_ctes_ok(self):
        validate_sql(
            "WITH a AS (SELECT id FROM t1), b AS (SELECT id FROM t2) "
            "SELECT a.id FROM a JOIN b ON a.id = b.id"
        )

    def test_trailing_semicolon_ok(self):
        validate_sql("SELECT col1 FROM t;")

    def test_uppercase_select_ok(self):
        validate_sql("SELECT Name FROM Employees ORDER BY Name")

    def test_lowercase_with_ok(self):
        validate_sql("with cte as (select 1 as n) select n from cte")

    # ── must-start-with-select-or-with ───────────────────────────────────────

    def test_reject_empty(self):
        with self.assertRaises(ValueError):
            validate_sql("")

    def test_reject_whitespace_only(self):
        with self.assertRaises(ValueError):
            validate_sql("   ")

    def test_reject_drop(self):
        with self.assertRaises(ValueError):
            validate_sql("DROP TABLE employees")

    def test_reject_update(self):
        with self.assertRaises(ValueError):
            validate_sql("UPDATE employees SET salary = 0")

    def test_reject_insert(self):
        with self.assertRaises(ValueError):
            validate_sql("INSERT INTO t VALUES (1)")

    # ── comments blocked ─────────────────────────────────────────────────────

    def test_reject_line_comment(self):
        with self.assertRaises(ValueError) as cm:
            validate_sql("SELECT col1 FROM t -- bypass filter")
        self.assertIn("comment", str(cm.exception).lower())

    def test_reject_block_comment(self):
        with self.assertRaises(ValueError) as cm:
            validate_sql("SELECT /* hidden */ col1 FROM t")
        self.assertIn("comment", str(cm.exception).lower())

    # ── multi-statement blocked ───────────────────────────────────────────────

    def test_reject_multi_statement(self):
        with self.assertRaises(ValueError) as cm:
            validate_sql("SELECT 1; SELECT 2")
        self.assertIn("Multiple", str(cm.exception))

    def test_reject_drop_via_semicolon(self):
        with self.assertRaises(ValueError):
            validate_sql("SELECT 1; DROP TABLE t")

    # ── banned keyword table ─────────────────────────────────────────────────

    def test_reject_exec(self):
        # Input deliberately avoids other banned keywords so EXEC is the first hit
        with self.assertRaises(ValueError) as cm:
            validate_sql("SELECT EXEC('SELECT 1') FROM t")
        self.assertIn("EXEC", str(cm.exception))

    def test_reject_xp_cmdshell(self):
        with self.assertRaises(ValueError) as cm:
            validate_sql("SELECT xp_cmdshell FROM t")
        self.assertIn("xp_", str(cm.exception).lower())

    def test_reject_sp_procedure(self):
        with self.assertRaises(ValueError) as cm:
            validate_sql("SELECT sp_helptext FROM t")
        self.assertIn("sp_", str(cm.exception).lower())

    def test_reject_select_into(self):
        with self.assertRaises(ValueError) as cm:
            validate_sql("SELECT col1 INTO #temp FROM t")
        self.assertIn("INTO", str(cm.exception))

    def test_reject_openrowset(self):
        with self.assertRaises(ValueError) as cm:
            validate_sql("SELECT * FROM OPENROWSET('SQLNCLI', 'server=x', 'SELECT 1')")
        self.assertIn("OPENROWSET", str(cm.exception))

    def test_reject_create(self):
        with self.assertRaises(ValueError) as cm:
            validate_sql("WITH x AS (SELECT 1) SELECT * INTO #t FROM x")
        self.assertIn("INTO", str(cm.exception))

    def test_reject_shutdown(self):
        with self.assertRaises(ValueError) as cm:
            validate_sql("SELECT SHUTDOWN")
        self.assertIn("SHUTDOWN", str(cm.exception))


# ---------------------------------------------------------------------------
# apply_row_limit
# ---------------------------------------------------------------------------

class TestApplyRowLimit(unittest.TestCase):
    def test_order_by_preserved_and_no_derived_table(self):
        # Regression: ORDER BY in participant query should not error (no derived table)
        sql = "SELECT col1 FROM t ORDER BY col1 DESC"
        result = self._apply(sql)
        self.assertIn("ORDER BY COL1 DESC", result.upper())
        self.assertNotIn("FROM (", result.upper())

    def test_cte_with_order_by_preserved(self):
        # Regression: CTE + ORDER BY should not error (no derived table)
        sql = "WITH cte AS (SELECT id FROM t) SELECT id FROM cte ORDER BY id DESC"
        result = self._apply(sql)
        self.assertIn("ORDER BY ID DESC", result.upper())
        self.assertNotIn("FROM (", result.upper())


    LIMIT = 100

    def _apply(self, sql, limit=None):
        return apply_row_limit(sql, limit or self.LIMIT)

    # ── basic injection ───────────────────────────────────────────────────────

    def test_plain_select_gets_top(self):
        result = self._apply("SELECT col1, col2 FROM employees ORDER BY col1")
        self.assertIn("TOP (100)", result.upper())
        self.assertTrue(result.upper().startswith("SELECT TOP"))

    def test_plain_select_without_order_by_gets_top(self):
        result = self._apply("SELECT col1, col2 FROM employees")
        self.assertIn("TOP (100)", result.upper())

    def test_trailing_semicolon_stripped(self):
        result = self._apply("SELECT col1 FROM t;")
        self.assertNotIn(";", result)
        self.assertIn("TOP (100)", result.upper())

    def test_lowercase_select(self):
        result = self._apply("select name from employees order by name")
        self.assertIn("TOP (100)", result.upper())

    # ── DISTINCT ─────────────────────────────────────────────────────────────

    def test_select_distinct_gets_top_after_distinct(self):
        result = self._apply("SELECT DISTINCT dept FROM employees ORDER BY dept")
        upper = result.upper()
        self.assertIn("TOP (100)", upper)
        self.assertIn("DISTINCT", upper)
        # DISTINCT must precede TOP
        self.assertLess(upper.index("DISTINCT"), upper.index("TOP"))

    # ── CTE handling ─────────────────────────────────────────────────────────

    def test_single_cte_outer_select_gets_top(self):
        sql = (
            "WITH cte AS (SELECT id, name FROM t WHERE id > 5) "
            "SELECT id, name FROM cte ORDER BY id"
        )
        result = self._apply(sql)
        self.assertIn("TOP (100)", result.upper())
        # TOP must not appear inside the CTE body (before the outer SELECT)
        cte_body_end = result.upper().index(') SELECT')
        top_pos = result.upper().index("TOP (100)")
        self.assertGreater(top_pos, cte_body_end)

    def test_multiple_ctes_outer_select_gets_top(self):
        sql = (
            "WITH a AS (SELECT id FROM t1), b AS (SELECT id FROM t2) "
            "SELECT a.id FROM a JOIN b ON a.id = b.id ORDER BY a.id"
        )
        result = self._apply(sql)
        upper = result.upper()
        self.assertIn("TOP (100)", upper)
        # Exactly one injection — CTE inner SELECTs must not get TOP
        self.assertEqual(upper.count("TOP (100)"), 1)
        # Outer SELECT comes directly after the last CTE ') ' — verify pattern
        import re as _re
        self.assertRegex(upper, r'\)\s+SELECT TOP \(100\)')

    def test_nested_subquery_top_in_outer_only(self):
        sql = "SELECT id FROM t WHERE id IN (SELECT id FROM sub WHERE x = 1) ORDER BY id"
        result = self._apply(sql)
        # The very first SELECT at depth 0 gets TOP
        self.assertTrue(result.upper().startswith("SELECT TOP"))

    # ── existing TOP handling ────────────────────────────────────────────────

    def test_already_top_within_limit_unchanged(self):
        sql = "SELECT TOP (50) col1 FROM t ORDER BY col1"
        self.assertEqual(self._apply(sql), sql)

    def test_already_top_at_limit_unchanged(self):
        sql = "SELECT TOP (100) col1 FROM t ORDER BY col1"
        self.assertEqual(self._apply(sql), sql)

    def test_already_top_exceeding_limit_is_reduced_parens(self):
        result = self._apply("SELECT TOP (500) col1 FROM t ORDER BY col1")
        self.assertIn("TOP (100)", result.upper())
        self.assertNotIn("500", result)

    def test_already_top_exceeding_limit_is_reduced_bare(self):
        result = self._apply("SELECT TOP 500 col1 FROM t ORDER BY col1")
        self.assertNotIn("500", result)
        self.assertIn("100", result)

    # ── OFFSET / FETCH ───────────────────────────────────────────────────────

    def test_offset_fetch_within_limit_unchanged(self):
        sql = "SELECT col1 FROM t ORDER BY col1 OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY"
        self.assertEqual(self._apply(sql), sql)

    def test_offset_fetch_at_limit_unchanged(self):
        sql = "SELECT col1 FROM t ORDER BY col1 OFFSET 0 ROWS FETCH NEXT 100 ROWS ONLY"
        self.assertEqual(self._apply(sql), sql)

    def test_offset_fetch_exceeding_limit_capped(self):
        sql = "SELECT col1 FROM t ORDER BY col1 OFFSET 0 ROWS FETCH NEXT 1000 ROWS ONLY"
        result = self._apply(sql)
        self.assertIn("FETCH NEXT 100", result.upper())
        self.assertNotIn("1000", result)

    def test_offset_fetch_mixed_case_capped(self):
        sql = "select col1 from t order by col1 offset 0 rows fetch next 9999 rows only"
        result = self._apply(sql)
        self.assertNotIn("9999", result)

    # ── custom limit ────────────────────────────────────────────────────────

    def test_custom_limit_applied(self):
        result = apply_row_limit("SELECT col1 FROM t ORDER BY col1", limit=25)
        self.assertIn("TOP (25)", result.upper())

    def test_custom_limit_reduces_existing_top(self):
        result = apply_row_limit("SELECT TOP (200) col1 FROM t", limit=25)
        self.assertIn("TOP (25)", result.upper())
        self.assertNotIn("200", result)


# ---------------------------------------------------------------------------
# normalize_result
# ---------------------------------------------------------------------------

class TestNormalizeResult(unittest.TestCase):
    def test_order_insensitive_comparison(self):
        # Same rows, different order, should compare equal (default)
        rows1 = [{'a': 1, 'b': 2}, {'a': 3, 'b': 4}]
        rows2 = [{'a': 3, 'b': 4}, {'a': 1, 'b': 2}]
        self.assertEqual(self._normalize(rows1, ['a', 'b']), self._normalize(rows2, ['a', 'b']))

    def _normalize(self, rows, columns):
        return normalize_result(rows, columns)

    def test_empty_result(self):
        self.assertEqual(self._normalize([], []), [])

    def test_single_row(self):
        rows = [{'name': 'Alice', 'age': 30}]
        result = self._normalize(rows, ['name', 'age'])
        self.assertEqual(result, [('Alice', 30)])

    def test_order_insensitive_same_rows_different_order(self):
        rows_a = [{'name': 'Alice', 'score': 90}, {'name': 'Bob', 'score': 80}]
        rows_b = [{'name': 'Bob', 'score': 80}, {'name': 'Alice', 'score': 90}]
        self.assertEqual(
            self._normalize(rows_a, ['name', 'score']),
            self._normalize(rows_b, ['name', 'score']),
        )

    def test_different_values_not_equal(self):
        rows_a = [{'name': 'Alice', 'score': 90}]
        rows_b = [{'name': 'Bob',   'score': 80}]
        self.assertNotEqual(
            self._normalize(rows_a, ['name', 'score']),
            self._normalize(rows_b, ['name', 'score']),
        )

    def test_different_row_counts_not_equal(self):
        rows_a = [{'id': 1}, {'id': 2}]
        rows_b = [{'id': 1}]
        self.assertNotEqual(
            self._normalize(rows_a, ['id']),
            self._normalize(rows_b, ['id']),
        )

    def test_null_values_handled(self):
        rows = [{'name': 'Alice', 'dept': None}, {'name': None, 'dept': 'Eng'}]
        result = self._normalize(rows, ['name', 'dept'])
        # None sorts before real values (sentinel '\x00' < any printable char)
        self.assertIsNone(result[0][0])  # (None, 'Eng') sorts before ('Alice', None)

    def test_decimal_normalised_to_float(self):
        rows = [{'val': decimal.Decimal('3.14159')}]
        result = self._normalize(rows, ['val'])
        self.assertEqual(result[0][0], round(3.14159, 4))

    def test_datetime_normalised_to_iso(self):
        dt = datetime.datetime(2024, 6, 1, 12, 30, 45, 123456)
        rows = [{'ts': dt}]
        result = self._normalize(rows, ['ts'])
        self.assertEqual(result[0][0], '2024-06-01T12:30:45')  # microseconds stripped

    def test_date_normalised_to_iso(self):
        rows = [{'d': datetime.date(2024, 1, 15)}]
        result = self._normalize(rows, ['d'])
        self.assertEqual(result[0][0], '2024-01-15')

    def test_string_stripped(self):
        rows = [{'name': '  Alice  '}]
        result = self._normalize(rows, ['name'])
        self.assertEqual(result[0][0], 'Alice')

    def test_column_lookup_case_insensitive(self):
        # Row dict keys are lowercase (execute_query lowercases them);
        # columns list passed in mixed-case should still match.
        rows = [{'name': 'Alice', 'score': 10}]
        result_lower = self._normalize(rows, ['name', 'score'])
        result_upper = self._normalize(rows, ['NAME', 'SCORE'])
        self.assertEqual(result_lower, result_upper)

    def test_sorted_deterministically(self):
        rows = [{'x': 3}, {'x': 1}, {'x': 2}]
        result = self._normalize(rows, ['x'])
        self.assertEqual(result, [(1,), (2,), (3,)])


if __name__ == '__main__':
    unittest.main()
