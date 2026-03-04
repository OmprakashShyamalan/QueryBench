
import decimal
import datetime
import time
import pyodbc
import logging
from typing import List, Dict, Any, Tuple, Optional

from .config import QUERY_TIMEOUT_SECONDS, MAX_RESULT_ROWS, DECIMAL_PRECISION, CASE_INSENSITIVE_COLUMNS, STRIP_STRINGS
from .db_router import db_router
from .governor import query_semaphore, check_rate_limit
from . import sql_eval

logger = logging.getLogger("QueryBench.Runner")


def validate_sql_security(query: str, is_solution: bool = False) -> Tuple[bool, str]:
    """
    Validates a SQL query for safety.  Delegates to sql_eval.validate_sql.

    Returns (True, "") on success or (False, human-readable reason) on failure.
    ``is_solution`` is retained for API compatibility but has no effect — both
    participant and solution queries are validated with the same rules.
    """
    try:
        sql_eval.validate_sql(query)
        return True, ""
    except ValueError as e:
        return False, str(e)


def normalize_value(val: Any) -> Any:
    """Per-cell value normalisation used by execute_query."""
    if val is None:
        return None
    if isinstance(val, decimal.Decimal):
        return round(float(val), DECIMAL_PRECISION)
    if isinstance(val, (datetime.date, datetime.datetime)):
        return val.replace(microsecond=0).isoformat()
    if isinstance(val, str) and STRIP_STRINGS:
        return val.strip()
    return val


def execute_query(
    query: str,
    user_id: str = "system",
    conn_str: Optional[str] = None,
) -> Tuple[Optional[List[Dict[str, Any]]], Optional[str], float]:
    """
    Safely executes a query on SQL Server with enforced row limit (never wraps in a derived table), timeout,
    and app-wide concurrency control.

    - Row limit is always enforced at the outermost SELECT (never by wrapping in a derived table)
    - ORDER BY is always preserved at the top level (never inside a derived table)
    - CTEs and queries with ORDER BY are supported and safe
    - All unsafe or ambiguous SQL is rejected by validate_sql

    ``conn_str``: if provided, connects to that database directly rather
    than using the router (used for per-assessment database targeting).
    """
    start_time = time.time()

    with query_semaphore:
        conn = None
        try:
            if conn_str:
                conn = pyodbc.connect(conn_str, timeout=2)
            else:
                conn = db_router.get_connection()
            cursor = conn.cursor()

            # Enforce statement-level query timeout (pyodbc >= 4.0.26 only)
            try:
                cursor.timeout = QUERY_TIMEOUT_SECONDS
            except Exception:
                pass

            rewritten_sql = sql_eval.apply_row_limit(query)
            rewritten_sql = sql_eval.ensure_order_by(rewritten_sql)
            cursor.execute(rewritten_sql)

            cols = [column[0] for column in cursor.description]
            if CASE_INSENSITIVE_COLUMNS:
                cols = [c.lower() for c in cols]

            # Hard fetch cap in application memory (defence-in-depth)
            rows = cursor.fetchmany(MAX_RESULT_ROWS)

            results = [
                dict(zip(cols, [normalize_value(v) for v in row]))
                for row in rows
            ]

            duration_ms = (time.time() - start_time) * 1000
            logger.info(
                f"User: {user_id} | Execution Success | "
                f"Target: {conn.getinfo(pyodbc.SQL_SERVER_NAME)} | "
                f"Duration: {duration_ms:.1f}ms"
            )
            return results, None, duration_ms

        except pyodbc.Error as e:
            err_msg = str(e)
            logger.error(f"User: {user_id} | Execution Error: {err_msg}")

            if "timeout" in err_msg.lower():
                display_msg = "Query execution timed out. Limit your query's complexity or check for missing joins."
            else:
                display_msg = f"Database Error: {err_msg[:300]}"

            return None, display_msg, (time.time() - start_time) * 1000
        except Exception as e:
            err_msg = str(e)
            logger.error(f"User: {user_id} | Unexpected Error: {err_msg}", exc_info=True)
            return None, f"Query execution error: {err_msg[:200]}", (time.time() - start_time) * 1000
        finally:
            if conn:
                conn.close()


def evaluate_submission(
    user_id: str,
    question_id: str,
    participant_query: str,
    solution_query: str,
    conn_str: Optional[str] = None,
    order_sensitive: bool = False,
) -> Dict[str, Any]:
    """
    Full deterministic evaluation flow.

    ``conn_str``:      optional ODBC connection string for the assessment database.
    ``order_sensitive``: when False (default) result rows are compared as an
                         unordered set — ORDER BY in the participant query does
                         not affect the CORRECT/INCORRECT verdict.
                         When True, row order must match the solution exactly.
    """
    # 1. Per-user rate limit
    if not check_rate_limit(user_id):
        return {"status": "ERROR", "feedback": "Rate limit exceeded. Please wait a moment before submitting again."}

    # 2. Security validation (participant only; solution queries are admin-trusted)
    is_safe, msg = validate_sql_security(participant_query)
    if not is_safe:
        return {"status": "INCORRECT", "feedback": msg}

    # 3. Execute solution (gold standard)
    sol_res, sol_err, _ = execute_query(solution_query, "system_eval", conn_str=conn_str)
    if sol_err:
        return {"status": "ERROR", "feedback": "System Error: Failed to generate expected results. Please contact an admin."}

    # 4. Execute participant query
    user_res, user_err, user_dur = execute_query(participant_query, user_id, conn_str=conn_str)
    if user_err:
        return {"status": "INCORRECT", "feedback": user_err}

    # 5. Structural checks — column count and names
    user_cols = list(user_res[0].keys()) if user_res else []
    sol_cols  = list(sol_res[0].keys())  if sol_res  else []

    if len(user_cols) != len(sol_cols):
        return {
            "status": "INCORRECT",
            "feedback": (
                f"Column count mismatch: You returned {len(user_cols)} columns, "
                f"expected {len(sol_cols)}. Check your SELECT clause."
            ),
        }

    if [c.lower() for c in user_cols] != [c.lower() for c in sol_cols]:
        return {
            "status": "INCORRECT",
            "feedback": (
                f"Column names or order mismatch. "
                f"You have: {', '.join(user_cols)} | Expected: {', '.join(sol_cols)}"
            ),
        }

    # 6. Row-level comparison
    if order_sensitive:
        # Exact ordered comparison — ORDER BY matters
        is_correct = (user_res == sol_res)
        order_hint = (
            " Check your ORDER BY clause."
            if not is_correct and len(user_res) == len(sol_res)
            else ""
        )
    else:
        # Set comparison — sort both sides before comparing
        is_correct = (
            sql_eval.normalize_result(user_res, user_cols)
            == sql_eval.normalize_result(sol_res, sol_cols)
        )
        order_hint = ""

    if is_correct:
        return {
            "status": "CORRECT",
            "execution_metadata": {"duration_ms": user_dur, "rows_returned": len(user_res)},
        }

    feedback = "Result set mismatch."
    if len(user_res) != len(sol_res):
        feedback = (
            f"Row count mismatch: You returned {len(user_res)} rows, "
            f"expected {len(sol_res)}. Check your WHERE clause and filters."
        )
    else:
        feedback = f"Row count matches but values are incorrect.{order_hint} Check your WHERE conditions and JOINs."

    return {"status": "INCORRECT", "feedback": feedback}
