
import pyodbc
from typing import Dict, List, Any
from .config import PRIMARY_CONN
from .db_router import db_router

def inspect_schema(db_config_id: int = None) -> Dict[str, Any]:
    """
    Connects to the target database and extracts schema metadata 
    (Tables, Columns, PKs, FKs) in the format expected by the frontend Visualizer.
    
    If db_config_id is None, it defaults to the App DB or primary connection.
    """
    
    # SQL Server Metadata Query
    # Extracts columns, types, nullability
    meta_query = """
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

    conn = None
    try:
        # For MVP, we use the router's primary connection. 
        # In full prod, fetch connection string based on db_config_id from DatabaseConfigs table.
        conn = db_router.get_connection(force_primary=True)
        cursor = conn.cursor()
        cursor.execute(meta_query)
        rows = cursor.fetchall()
        
        tables_map = {}
        
        for row in rows:
            t_name, c_name, dtype, nullable, is_pk, ref_table, ref_col = row
            
            if t_name not in tables_map:
                tables_map[t_name] = {
                    "name": t_name,
                    "columns": []
                }
            
            col_meta = {
                "name": c_name,
                "type": dtype.upper(),
                "isNullable": bool(nullable),
                "isPrimaryKey": bool(is_pk),
                "isForeignKey": bool(ref_table),
            }
            
            if ref_table:
                col_meta["references"] = {
                    "table": ref_table,
                    "column": ref_col
                }
                
            tables_map[t_name]["columns"].append(col_meta)
            
        return {
            "tables": list(tables_map.values())
        }

    except Exception as e:
        return {"error": str(e), "tables": []}
    finally:
        if conn:
            conn.close()
