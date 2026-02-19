
import pyodbc
import random
import time
from typing import List, Dict
from .config import PRIMARY_CONN, REPLICAS

class AssessmentDBRouter:
    """
    Manages connection strings, connection pooling (via ODBC), 
    and routes queries to read replicas with fallback to primary.
    """
    def __init__(self):
        self.primary = PRIMARY_CONN
        self.replicas = REPLICAS
        self._last_index = 0
        self._unhealthy_replicas: Dict[str, float] = {}
        self._health_check_cooldown = 300 # 5 minutes

    def _is_healthy(self, conn_str: str) -> bool:
        if conn_str not in self._unhealthy_replicas:
            return True
        if time.time() - self._unhealthy_replicas[conn_str] > self._health_check_cooldown:
            # Try to recover
            del self._unhealthy_replicas[conn_str]
            return True
        return False

    def mark_unhealthy(self, conn_str: str):
        if conn_str != self.primary:
            self._unhealthy_replicas[conn_str] = time.time()

    def get_connection(self, force_primary: bool = False) -> pyodbc.Connection:
        """
        Returns a connection. Tries replicas in round-robin fashion first.
        Falls back to primary if all replicas are unhealthy or fail.
        """
        targets = []
        if not force_primary and self.replicas:
            # Filter healthy replicas
            healthy = [r for r in self.replicas if self._is_healthy(r)]
            if healthy:
                # Rotate selection
                self._last_index = (self._last_index + 1) % len(healthy)
                targets.append(healthy[self._last_index])
        
        # Always fallback/default to primary
        targets.append(self.primary)

        last_error = None
        for conn_str in targets:
            try:
                # pyodbc handles pooling internally when using same connection strings
                return pyodbc.connect(conn_str, timeout=2)
            except pyodbc.Error as e:
                last_error = e
                self.mark_unhealthy(conn_str)
                continue
        
        raise last_error or Exception("No database targets available.")

db_router = AssessmentDBRouter()
