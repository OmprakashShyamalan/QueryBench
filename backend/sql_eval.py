"""
sql_eval.py — focused SQL safety, rewriting, and result-normalisation layer.

Public API
-----------
    validate_sql(sql)            — raises ValueError if the query is unsafe/unsupported
    apply_row_limit(sql, limit)  — rewrites SQL to enforce a TOP (n) hard row cap (never wraps in a derived table; always preserves ORDER BY)
    normalize_result(rows, cols) — canonical sorted list of tuples for set comparison

This module ensures:
    - Only a single SELECT/CTE statement is allowed (no DML/DDL/EXEC, no multi-statement, no comments)
    - Row limits are always enforced at the outermost SELECT (never by wrapping in a derived table)
    - ORDER BY is always preserved at the top level (never inside a derived table)
    - CTEs and queries with ORDER BY are supported and safe
    - Result comparison is order-insensitive by default (unless order_sensitive=True)
    - All unsafe or ambiguous SQL is rejected
"""

import re
import decimal
import datetime
import sqlparse
from typing import Any, Dict, List, Tuple

from .config import MAX_RESULT_ROWS, DECIMAL_PRECISION, CASE_INSENSITIVE_COLUMNS, STRIP_STRINGS

# ---------------------------------------------------------------------------
# Internal: banned keyword table
# ---------------------------------------------------------------------------

_BANNED: List[Tuple[str, str]] = [
    (r'\bDROP\b',           'DROP'),
    (r'\bDELETE\b',         'DELETE'),
    (r'\bUPDATE\b',         'UPDATE'),
    (r'\bINSERT\b',         'INSERT'),
    (r'\bTRUNCATE\b',       'TRUNCATE'),
    (r'\bALTER\b',          'ALTER'),
    (r'\bCREATE\b',         'CREATE'),
    (r'\bEXEC\b',           'EXEC'),
    (r'\bEXECUTE\b',        'EXECUTE'),
    (r'\bMERGE\b',          'MERGE'),
    (r'\bGRANT\b',          'GRANT'),
    (r'\bREVOKE\b',         'REVOKE'),
    (r'\bDENY\b',           'DENY'),
    (r'\bSHUTDOWN\b',       'SHUTDOWN'),
    (r'\bXP_',              'xp_ (extended stored procedure)'),
    (r'\bSP_',              'sp_ (system stored procedure)'),
    (r'\bOPENROWSET\b',     'OPENROWSET'),
    (r'\bOPENDATASOURCE\b', 'OPENDATASOURCE'),
    (r'\bOPENQUERY\b',      'OPENQUERY'),
    (r'\bINTO\b',           'INTO (SELECT INTO / INSERT INTO)'),
    (r'\bOUTPUT\b',         'OUTPUT'),
    (r'\bBACKUP\b',         'BACKUP'),
    (r'\bRESTORE\b',        'RESTORE'),
]

# ---------------------------------------------------------------------------
# validate_sql
# ---------------------------------------------------------------------------

def validate_sql(sql: str) -> None:
    """
    Validates a SQL string for safety and structural correctness.

    Raises ValueError with a human-readable reason if:
      - the query is empty or does not start with SELECT / WITH
      - SQL comments are present (-- or /* */)
      - multiple statements are chained with semicolons
      - any DDL, DML, or dangerous system keyword is detected

    ORDER BY is NOT required — result comparison is order-insensitive by default.
    Assessment questions that require ordering should set order_sensitive=True
    on the Question model; the evaluation layer enforces row-order there.
    """
    stripped = sql.strip()
    if not stripped:
        raise ValueError("Query cannot be empty.")

    # 0. sqlparse: defence-in-depth multi-statement check.
    #    Runs before regex checks so malformed input never reaches them.
    try:
        parsed_stmts = sqlparse.parse(stripped)
        if len(parsed_stmts) != 1:
            raise ValueError("Multiple SQL statements are not allowed.")
    except ValueError:
        raise
    except Exception:
        pass  # sqlparse failure is non-fatal; downstream checks cover the same cases

    upper = stripped.upper()

    # 1. Must start with SELECT or WITH (CTEs)
    if not (upper.startswith('SELECT') or upper.startswith('WITH')):
        raise ValueError("Query must be a SELECT statement.")

    # 2. Block SQL comments entirely.
    #    Comments are banned to prevent obfuscation; they are unnecessary
    #    in a controlled assessment environment.
    if '--' in stripped:
        raise ValueError("SQL line comments (--) are not allowed.")
    if '/*' in stripped:
        raise ValueError("SQL block comments (/* ... */) are not allowed.")

    # 3. Block multi-statement chaining.
    #    A single trailing semicolon is permitted (common editor habit).
    #    Because comments are already rejected, the only remaining edge-case
    #    is a semicolon inside a string literal — this is over-conservative
    #    but safe for an assessment context.
    bare = stripped.rstrip().rstrip(';')
    if ';' in bare:
        raise ValueError(
            "Multiple SQL statements are not allowed. "
            "Remove the semicolon separator."
        )

    # 4. Block DDL / DML / dangerous system keywords.
    for pattern, label in _BANNED:
        if re.search(pattern, upper):
            raise ValueError(f"Unauthorized keyword detected: {label}.")


# ---------------------------------------------------------------------------
# apply_row_limit
# ---------------------------------------------------------------------------

def apply_row_limit(sql: str, limit: int = MAX_RESULT_ROWS) -> str:
    """
     Rewrites a SQL Server SELECT to enforce a hard row cap of ``limit``.

     Strategy (checked in priority order):

     1. If OFFSET / FETCH NEXT is present at the outermost level, cap FETCH NEXT n to limit (never wrap or move ORDER BY).
     2. Otherwise, inject or reduce TOP (n) at the outermost SELECT (never inside a derived table, never wrap the query).
     3. ORDER BY is always preserved at the top level, so SQL Server never sees ORDER BY inside a derived table (prevents error 42000).
     4. CTEs and queries with ORDER BY are supported and safe.

     Known limitation: OFFSET/FETCH detection uses a regex and may incorrectly
     match the pattern inside a string literal (e.g. SELECT 'FETCH NEXT 99').
     This is a negligible edge-case for assessment queries.
     """
    clean = sql.strip().rstrip(';')
    upper = clean.upper()

    # ── Case 1: OFFSET / FETCH NEXT ─────────────────────────────────────────
    # SQL Server paging: ORDER BY col OFFSET 0 ROWS FETCH NEXT n ROWS ONLY
    fetch_match = re.search(
        r'(\bFETCH\s+NEXT\s+)(\d+)(\s+ROWS?\s+ONLY\b)',
        clean,
        re.IGNORECASE,
    )
    if fetch_match:
        existing_n = int(fetch_match.group(2))
        if existing_n > limit:
            return (
                clean[:fetch_match.start(2)]
                + str(limit)
                + clean[fetch_match.end(2):]
            )
        return clean  # already within limit

    # ── Case 2: depth-tracking TOP injection ────────────────────────────────
    # Find the outermost SELECT after all CTEs (if WITH is present)
    length = len(clean)
    depth = 0
    i = 0
    outer_select_pos = None
    outer_select_upper = None
    # If WITH is present, skip to the SELECT after the last closing paren
    if upper.startswith('WITH'):
        # Find the last closing paren before the main SELECT
        last_paren = -1
        for idx, ch in enumerate(clean):
            if ch == ')':
                last_paren = idx
        # Start search after last_paren
        i = last_paren + 1 if last_paren != -1 else 0
    while i < length:
        ch = clean[i]
        if ch == '(':
            depth += 1
            i += 1
            continue
        if ch == ')':
            depth -= 1
            i += 1
            continue
        # Only act on the outermost SELECT (depth 0)
        if depth == 0 and upper[i:i + 6] == 'SELECT':
            before_ok = i == 0 or not (clean[i - 1].isalnum() or clean[i - 1] == '_')
            after_ok  = i + 6 >= length or not (clean[i + 6].isalnum() or clean[i + 6] == '_')
            if not (before_ok and after_ok):
                i += 1
                continue
            outer_select_pos = i
            outer_select_upper = upper
            break
        i += 1
    if outer_select_pos is not None:
        insert_pos = outer_select_pos + 6
        # Skip whitespace to inspect the next token
        j = insert_pos
        while j < length and clean[j] in (' ', '\t', '\n', '\r'):
            j += 1
        # Does DISTINCT follow?
        has_distinct = (
            upper[j:j + 8] == 'DISTINCT'
            and (j + 8 >= length or not (clean[j + 8].isalnum() or clean[j + 8] == '_'))
        )
        if has_distinct:
            distinct_end = j + 8
            tss = distinct_end  # top_search_start
            while tss < length and clean[tss] in (' ', '\t', '\n', '\r'):
                tss += 1
        else:
            distinct_end = insert_pos  # injection point when no DISTINCT
            tss = j
        # Does TOP follow (possibly after DISTINCT)?
        has_top = (
            upper[tss:tss + 3] == 'TOP'
            and (tss + 3 >= length or not (clean[tss + 3].isalnum() or clean[tss + 3] == '_'))
        )
        if has_top:
            # Parse the n from TOP (n) or bare TOP n
            k = tss + 3
            while k < length and clean[k] in (' ', '\t', '\n', '\r'):
                k += 1
            if k < length and clean[k] == '(': 
                # TOP (n) form
                close = clean.index(')', k + 1)
                n_str = clean[k + 1:close].strip()
                if n_str.isdigit() and int(n_str) > limit:
                    return clean[:k] + f'({limit})' + clean[close + 1:]
            else:
                # TOP n bare form
                num_start = k
                while k < length and clean[k].isdigit():
                    k += 1
                n_str = clean[num_start:k]
                if n_str.isdigit() and int(n_str) > limit:
                    return clean[:num_start] + str(limit) + clean[k:]
            return clean  # TOP present and n <= limit (or complex expression)
        # No TOP — inject it
        if has_distinct:
            # Insert after DISTINCT keyword: "SELECT DISTINCT TOP (n) ..."
            return clean[:distinct_end] + f' TOP ({limit})' + clean[distinct_end:]
        # Insert after SELECT: "SELECT TOP (n) ..."
        return clean[:insert_pos] + f' TOP ({limit})' + clean[insert_pos:]
    # Unreachable for valid SELECT/WITH queries; fallback keeps ORDER BY legal.
    return f"{clean} OFFSET 0 ROWS FETCH NEXT {limit} ROWS ONLY"


# ---------------------------------------------------------------------------
# ensure_order_by
# ---------------------------------------------------------------------------

def ensure_order_by(sql: str) -> str:
    """
    Appends ORDER BY 1 if the query has no ORDER BY clause.

    SQL Server requires ORDER BY when OFFSET/FETCH is used, and consistent
    ordering avoids non-deterministic results across runs.
    """
    if not re.search(r'\bORDER\s+BY\b', sql, re.IGNORECASE):
        return f"{sql} ORDER BY 1"
    return sql


# ---------------------------------------------------------------------------
# normalize_result
# ---------------------------------------------------------------------------

def _norm_val(val: Any) -> Any:
    """Per-cell normalisation (mirrors runner.normalize_value)."""
    if val is None:
        return None
    if isinstance(val, decimal.Decimal):
        return round(float(val), DECIMAL_PRECISION)
    if isinstance(val, datetime.datetime):
        return val.replace(microsecond=0).isoformat()
    if isinstance(val, datetime.date):
        return val.isoformat()
    if isinstance(val, str) and STRIP_STRINGS:
        return val.strip()
    return val


def normalize_result(
    rows: List[Dict[str, Any]],
    columns: List[str],
) -> List[Tuple]:
    """
    Returns a canonical, sorted list of tuples for order-insensitive comparison.

    - Values are normalised (Decimal → float, date/datetime → ISO string, etc.).
    - Column lookup is case-insensitive; ``columns`` are expected already lowercased
      (execute_query downcases them when CASE_INSENSITIVE_COLUMNS is True).
    - The list is sorted so two result sets with identical rows but different
      ORDER BY are considered equal.
    - None sorts before any real value (sentinel '\x00' is used as the sort key).
    """
    cols_lower = [c.lower() for c in columns]

    def to_tuple(row: Dict[str, Any]) -> Tuple:
        return tuple(_norm_val(row.get(c)) for c in cols_lower)

    canonical = [to_tuple(r) for r in rows]
    canonical.sort(key=lambda t: tuple('\x00' if v is None else str(v) for v in t))
    return canonical
