import re

# --- Table extraction utility ---
def extract_tables_from_sqlserver(sql: str) -> set[str]:
    """
    Extracts table/view names from a SQL Server query string.
    Handles:
      - FROM and JOIN table refs
      - schema prefixes (dbo.Users)
      - aliases (Users u)
      - bracketed names ([dbo].[Users])
      - WITH CTE (ignores CTE names, extracts from CTE body and final SELECT)
      - Ignores comments and string literals
    Returns a set of normalized table names (case-insensitive, no brackets).
    """
    # Remove line/block comments
    sql = re.sub(r'--.*?$', '', sql, flags=re.MULTILINE)
    sql = re.sub(r'/\*.*?\*/', '', sql, flags=re.DOTALL)
    # Remove string literals (single/double quotes)
    sql = re.sub(r"'([^']|'')*'", "''", sql)
    sql = re.sub(r'"([^"]|"")*"', '""', sql)

    # Helper: normalize table name (strip brackets, lower, keep schema)
    def norm(name):
        name = name.strip()
        if name.startswith('[') and name.endswith(']'):
            name = name[1:-1]
        name = name.replace('[', '').replace(']', '')
        return name.lower()

    tables = set()

    # Handle CTEs: extract CTE body and final SELECT
    cte_match = re.match(r'\s*WITH\s+(.*?)\)\s*SELECT', sql, flags=re.IGNORECASE|re.DOTALL)
    if cte_match:
        # Try to extract all subqueries in CTEs
        cte_body = cte_match.group(1)
        # Find all FROM/JOIN in CTE body
        for m in re.finditer(r'(FROM|JOIN)\s+([\[\]\w\.]+)', cte_body, flags=re.IGNORECASE):
            tables.add(norm(m.group(2)))
        # Continue with the rest after the last )SELECT
        sql = sql[cte_match.end()-6:]

    # Find all FROM/JOIN table refs in the remaining SQL
    for m in re.finditer(r'(FROM|JOIN)\s+([\[\]\w\.]+)', sql, flags=re.IGNORECASE):
        tables.add(norm(m.group(2)))

    # Remove CTE names if present (CTE names are before AS in WITH ... AS (...))
    # Not perfect, but avoids false positives
    if 'with' in sql.lower():
        for m in re.finditer(r'with\s+([\w\[\]]+)\s+as', sql, flags=re.IGNORECASE):
            tables.discard(norm(m.group(1)))

    return {t for t in tables if t}

import pyodbc
from typing import Dict, List, Any, Optional
from .config import PRIMARY_CONN
from .db_router import db_router

# SQL Server introspection query - extracts schemas, tables, columns, PKs, FKs
_META_QUERY = """
SELECT
    s.name AS schema_name,
    t.name AS table_name,
    c.name AS column_name,
    ty.name AS data_type,
    c.is_nullable,
    CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
    fk.referenced_schema,
    fk.referenced_table,
    fk.referenced_column
FROM sys.tables t
INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
INNER JOIN sys.columns c ON t.object_id = c.object_id
INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
LEFT JOIN (
    SELECT i.object_id, ic.column_id
    FROM sys.indexes i
    INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
    WHERE i.is_primary_key = 1
) pk ON t.object_id = pk.object_id AND c.column_id = pk.column_id
LEFT JOIN (
    SELECT
        fkc.parent_object_id,
        fkc.parent_column_id,
        rs.name AS referenced_schema,
        rt.name AS referenced_table,
        rc.name AS referenced_column
    FROM sys.foreign_key_columns fkc
    INNER JOIN sys.tables rt ON fkc.referenced_object_id = rt.object_id
    INNER JOIN sys.schemas rs ON rt.schema_id = rs.schema_id
    INNER JOIN sys.columns rc ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
) fk ON t.object_id = fk.parent_object_id AND c.column_id = fk.parent_column_id
WHERE t.is_ms_shipped = 0
ORDER BY s.name, t.name, c.column_id;
"""


def _parse_rows(rows, schema_filter: str = '') -> Dict[str, Any]:
    """
    Parse raw rows from _META_QUERY into a schema dict.

    Each table is keyed as "schema.table" (e.g. "sales.Orders").
    Tables whose schema does not match schema_filter (when provided) are omitted.
    The returned table dicts include a "schema" property so the frontend can
    display fully-qualified names.
    """
    tables_map: Dict[str, Any] = {}
    seen_cols: Dict[str, set] = {}  # qualified_name → set of column names already added
    filter_lower = schema_filter.strip().lower()

    for row in rows:
        schema_name, t_name, c_name, dtype, nullable, is_pk, ref_schema, ref_table, ref_col = row

        # Apply optional schema scope filter
        if filter_lower and schema_name.lower() != filter_lower:
            continue

        qualified = f"{schema_name}.{t_name}"

        if qualified not in tables_map:
            tables_map[qualified] = {"name": t_name, "schema": schema_name, "qualifiedName": qualified, "columns": []}
            seen_cols[qualified] = set()

        # Skip duplicate column entries.  Duplicates occur when a column participates
        # in multiple FK constraints, causing the LEFT JOIN in _META_QUERY to emit
        # more than one row for the same (table, column) pair.
        if c_name in seen_cols[qualified]:
            continue
        seen_cols[qualified].add(c_name)

        col_meta = {
            "name": c_name,
            "type": dtype.upper(),
            "isNullable": bool(nullable),
            "isPrimaryKey": bool(is_pk),
            "isForeignKey": bool(ref_table),
        }
        if ref_table:
            ref_qualified = f"{ref_schema}.{ref_table}" if ref_schema else ref_table
            col_meta["references"] = {"table": ref_table, "schema": ref_schema or '', "qualifiedTable": ref_qualified, "column": ref_col}
        tables_map[qualified]["columns"].append(col_meta)

    return {"tables": list(tables_map.values())}


def inspect_schema(db_config_id: int = None, conn_str: Optional[str] = None, solution_query: Optional[str] = None, schema_filter: str = '') -> Dict[str, Any]:
    """
    Extracts schema metadata (Tables, Columns, PKs, FKs) from the target database.

    schema_filter: when non-empty, only tables in that schema are returned
                   (e.g. "sales" returns only sales.* tables).

    When solution_query is provided, only the tables referenced by that query are
    returned, along with FK relationships between those tables.
    Falls back to the full schema when solution_query is absent or matches nothing.

    If conn_str is provided, connects directly using that string.
    Otherwise falls back to the primary router connection.
    """
    conn = None
    try:
        if conn_str:
            conn = pyodbc.connect(conn_str, timeout=5)
        else:
            conn = db_router.get_connection(force_primary=True)
        cursor = conn.cursor()
        cursor.execute(_META_QUERY)
        rows = cursor.fetchall()
        full_schema = _parse_rows(rows, schema_filter=schema_filter)

        if solution_query:
            referenced = extract_tables_from_sqlserver(solution_query)
            if referenced:
                # Build lookup sets: both bare names ("orders") and qualified names
                # ("sales.orders") so either form in a solution query matches correctly.
                referenced_lower = {t.lower() for t in referenced}
                filtered_tables = [
                    t for t in full_schema['tables']
                    if t['qualifiedName'].lower() in referenced_lower
                    or t['name'].lower() in referenced_lower
                ]
                if filtered_tables:
                    present_qualified = {t['qualifiedName'].lower() for t in filtered_tables}
                    present_bare = {t['name'].lower() for t in filtered_tables}
                    for t in filtered_tables:
                        t['columns'] = [
                            col if not (col.get('isForeignKey') and col.get('references'))
                            or col['references']['qualifiedTable'].lower() in present_qualified
                            or col['references']['table'].lower() in present_bare
                            else {k: v for k, v in col.items() if k != 'references'}
                            for col in t['columns']
                        ]
                    return {'tables': filtered_tables}

        return full_schema
    except Exception as e:
        return {"error": str(e), "tables": []}
    finally:
        if conn:
            conn.close()
