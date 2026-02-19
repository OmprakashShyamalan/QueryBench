
import re
import decimal
import datetime
import time
import pyodbc
import logging
from typing import List, Dict, Any, Tuple, Optional
from .config import QUERY_TIMEOUT_SECONDS, MAX_RESULT_ROWS, DECIMAL_PRECISION, CASE_INSENSITIVE_COLUMNS, STRIP_STRINGS
from .db_router import db_router
from .governor import query_semaphore, check_rate_limit

logger = logging.getLogger("QueryBench.Runner")

# Security: Forbidden Keywords / Tokens (Banned server-side commands for SQL Server)
BANNED_TOKENS = [
    r'\bDROP\b', r'\bDELETE\b', r'\bUPDATE\b', r'\bINSERT\b', r'\bTRUNCATE\b',
    r'\bALTER\b', r'\bEXEC\b', r'\bEXECUTE\b', r'\bMERGE\b', r'\bGRANT\b',
    r'\bREVOKE\b', r'\bXP_CMDSHELL\b', r'\bSP_CONFIGURE\b', r'\bOPENROWSET\b',
    r'\bOPENDATASOURCE\b', r'\bCREATE\b', r'\bINTO\b', r'\bOUTPUT\b', r'\bBACKUP\b', r'\bRESTORE\b'
]

def validate_sql_security(query: str, is_solution: bool = False) -> Tuple[bool, str]:
    """
    Strict validation for QueryBench (SQL Server).
    """
    clean_query = query.strip()
    upper_query = clean_query.upper()
    
    # 1. Basics: Must start with SELECT or WITH (for CTEs)
    if not (upper_query.startswith('SELECT') or upper_query.startswith('WITH')):
        return False, "Query must be a SELECT statement."

    # 2. Block multi-statement / comments
    # Disallow semicolons that aren't at the very end
    if ';' in clean_query:
        if clean_query.rstrip().rstrip(';').find(';') != -1:
            return False, "Multi-statement queries are disallowed for security."

    if '--' in clean_query or '/*' in clean_query:
        return False, "SQL comments are disallowed to ensure clarity and block obfuscated injections."

    # 3. Block DDL/DML/System commands
    for token in BANNED_TOKENS:
        if re.search(token, upper_query):
            return False, f"Unauthorized token detected: {token.replace(r'\\b', '')}"
            
    # 4. Deterministic Ordering check (Mandatory for TOP 100 fairness)
    if 'ORDER BY' not in upper_query:
        msg = "Solution query must include ORDER BY for deterministic scoring." if is_solution else \
              "ORDER BY is required for deterministic scoring. Add ORDER BY and retry."
        return False, msg

    return True, ""

def rewrite_to_top_100(query: str) -> str:
    """
    Rewrites a SQL Server SELECT to enforce TOP (100).
    Wraps the query to ensure we capture the final projection without corrupting complex subqueries.
    """
    # Removing trailing semicolon if present to avoid syntax error in wrapper
    clean_sql = query.strip().rstrip(';')
    
    # We wrap the user's query and apply TOP (100).
    # NOTE: In SQL Server, the inner query CANNOT have an ORDER BY unless TOP/OFFSET is used.
    # If the user provided an ORDER BY, the wrapper must move it outside or the query must be injected.
    
    # Improved Injection logic:
    # Handle WITH clauses separately, then inject TOP (100) after the first SELECT
    limit = MAX_RESULT_ROWS
    
    # This regex looks for the first SELECT and injects TOP (limit)
    # It handles optional WITH clauses and DISTINCT
    pattern = r'^(\s*WITH\s+.*?\bAS\s+\(.*?\)\s*)?(\s*SELECT\b)(\s+DISTINCT\b)?'
    if re.search(pattern, clean_sql, re.IGNORECASE | re.DOTALL):
        rewritten = re.sub(pattern, rf'\1\2\3 TOP ({limit})', clean_sql, count=1, flags=re.IGNORECASE | re.DOTALL)
        return rewritten
    
    # Fallback wrapper if regex fails (though less performant/more fragile with ordering)
    return f"SELECT TOP ({limit}) * FROM ({clean_sql}) AS q"

def normalize_value(val: Any) -> Any:
    """
    Normalizes values for fair deterministic comparison.
    """
    if val is None:
        return None
    if isinstance(val, decimal.Decimal):
        return round(float(val), DECIMAL_PRECISION)
    if isinstance(val, (datetime.date, datetime.datetime)):
        # Normalize time to ISO 8601 without microseconds
        return val.replace(microsecond=0).isoformat()
    if isinstance(val, str) and STRIP_STRINGS:
        return val.strip()
    return val

def execute_query(query: str, user_id: str = "system") -> Tuple[Optional[List[Dict[str, Any]]], Optional[str], float]:
    """
    Safely executes query on SQL Server with TOP 100 rewrite, timeout, and concurrency control.
    """
    start_time = time.time()
    
    # 1. Enforce App-wide concurrency cap
    with query_semaphore:
        conn = None
        try:
            # Router handles load balancing across replicas/primary
            conn = db_router.get_connection()
            cursor = conn.cursor()
            
            # Configure statement-level timeout if supported by driver, 
            # otherwise we rely on DB user limits and LOCK_TIMEOUT
            try:
                # Some ODBC drivers allow setting query timeout
                cursor.setinputsizes([(pyodbc.SQL_QUERY_TIMEOUT, QUERY_TIMEOUT_SECONDS, 0)])
            except:
                pass

            rewritten_sql = rewrite_to_top_100(query)
            
            # Execute the query
            cursor.execute(rewritten_sql)
            
            # Prepare result structure
            cols = [column[0] for column in cursor.description]
            if CASE_INSENSITIVE_COLUMNS:
                cols = [c.lower() for c in cols]

            # Hard fetch limit in application memory
            rows = cursor.fetchmany(MAX_RESULT_ROWS)
            
            results = []
            for row in rows:
                results.append(dict(zip(cols, [normalize_value(v) for v in row])))
            
            duration_ms = (time.time() - start_time) * 1000
            
            logger.info(f"User: {user_id} | Execution Success | Target: {conn.getinfo(pyodbc.SQL_SERVER_NAME)} | Duration: {duration_ms:.1f}ms")
            return results, None, duration_ms

        except pyodbc.Error as e:
            err_msg = str(e)
            logger.error(f"User: {user_id} | Execution Error: {err_msg}")
            
            # Sanitize error to avoid leaking internals
            if "timeout" in err_msg.lower():
                display_msg = "Query execution timed out. Limit your query's complexity or check for missing joins."
            else:
                display_msg = "Database execution failed. Verify your SQL syntax and schema references."
            
            return None, display_msg, (time.time() - start_time) * 1000
        finally:
            if conn:
                conn.close()

def evaluate_submission(user_id: str, question_id: str, participant_query: str, solution_query: str) -> Dict[str, Any]:
    """
    Full deterministic evaluation flow.
    """
    # 1. Throttle by rate limit
    if not check_rate_limit(user_id):
        return {"status": "ERROR", "feedback": "Rate limit exceeded. Please wait a moment before submitting again."}

    # 2. Security & Determinism check (Participant)
    is_safe, msg = validate_sql_security(participant_query)
    if not is_safe:
        return {"status": "INCORRECT", "feedback": msg}

    # 3. Execute Solution (Gold Standard)
    # This must work. Admin validates on creation, but we execute against live data.
    sol_res, sol_err, _ = execute_query(solution_query, "system_eval")
    if sol_err:
        return {"status": "ERROR", "feedback": "System Error: Failed to generate expected results. Please contact an admin."}

    # 4. Execute Participant
    user_res, user_err, user_dur = execute_query(participant_query, user_id)
    if user_err:
        return {"status": "INCORRECT", "feedback": user_err}

    # 5. Deterministic Ordered Comparison
    # a) Column count
    user_cols = list(user_res[0].keys()) if user_res else []
    sol_cols = list(sol_res[0].keys()) if sol_res else []
    
    if len(user_cols) != len(sol_cols):
        return {"status": "INCORRECT", "feedback": "Column count mismatch. Check your SELECT projection."}
    
    # b) Column Names (Case-insensitive check)
    if [c.lower() for c in user_cols] != [c.lower() for c in sol_cols]:
        return {"status": "INCORRECT", "feedback": "Column names or ordering mismatch. Check your aliases."}

    # c) Row-by-row ordered equality
    if user_res == sol_res:
        return {
            "status": "CORRECT",
            "execution_metadata": {"duration_ms": user_dur, "rows_returned": len(user_res)}
        }
    else:
        # Give hints but never the solution
        feedback = "Result set mismatch."
        if len(user_res) != len(sol_res):
            feedback = f"Row count mismatch. Expected {len(sol_res)} (top 100 limit), got {len(user_res)}."
        else:
            feedback = "Rows match in count but values or order are incorrect. Verify your filters and sorting."
            
        return {
            "status": "INCORRECT", 
            "feedback": feedback,
            "admin_diff_hint": "Specific mismatch found in row data comparison."
        }
