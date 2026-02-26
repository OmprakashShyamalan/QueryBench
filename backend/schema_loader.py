
import pyodbc
from typing import Dict, List, Any, Optional
from .config import PRIMARY_CONN
from .db_router import db_router

# SQL Server introspection query - extracts tables, columns, PKs, FKs
_META_QUERY = """
SELECT
    t.name AS table_name,
    c.name AS column_name,
    ty.name AS data_type,
    c.is_nullable,
    CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END AS is_primary_key,
    fk.referenced_table,
    fk.referenced_column
FROM sys.tables t
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
        rt.name AS referenced_table,
        rc.name AS referenced_column
    FROM sys.foreign_key_columns fkc
    INNER JOIN sys.tables rt ON fkc.referenced_object_id = rt.object_id
    INNER JOIN sys.columns rc ON fkc.referenced_object_id = rc.object_id AND fkc.referenced_column_id = rc.column_id
) fk ON t.object_id = fk.parent_object_id AND c.column_id = fk.parent_column_id
WHERE t.is_ms_shipped = 0
ORDER BY t.name, c.column_id;
"""


def _parse_rows(rows) -> Dict[str, Any]:
    tables_map = {}
    for row in rows:
        t_name, c_name, dtype, nullable, is_pk, ref_table, ref_col = row
        if t_name not in tables_map:
            tables_map[t_name] = {"name": t_name, "columns": []}
        col_meta = {
            "name": c_name,
            "type": dtype.upper(),
            "isNullable": bool(nullable),
            "isPrimaryKey": bool(is_pk),
            "isForeignKey": bool(ref_table),
        }
        if ref_table:
            col_meta["references"] = {"table": ref_table, "column": ref_col}
        tables_map[t_name]["columns"].append(col_meta)
    return {"tables": list(tables_map.values())}


def inspect_schema(db_config_id: int = None, conn_str: Optional[str] = None) -> Dict[str, Any]:
    """
    Extracts schema metadata (Tables, Columns, PKs, FKs) from the target database.

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
        return _parse_rows(rows)
    except Exception as e:
        return {"error": str(e), "tables": []}
    finally:
        if conn:
            conn.close()
