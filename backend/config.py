
import os

# Operational Limits
QUERY_TIMEOUT_SECONDS = int(os.getenv('QUERY_TIMEOUT_SECONDS', 5))
MAX_RESULT_ROWS = int(os.getenv('MAX_RESULT_ROWS', 100))
RUN_RATE_LIMIT = int(os.getenv('RUN_RATE_LIMIT', 10)) # Runs per minute per user
MAX_CONCURRENT_QUERY_RUNS = int(os.getenv('MAX_CONCURRENT_QUERY_RUNS', 20)) # App-wide concurrency cap

# Database Connections
# Primary is mandatory
PRIMARY_CONN = os.getenv('ASSESSMENT_DB_PRIMARY_CONN', "Driver={ODBC Driver 17 for SQL Server};Server=primary-db;Database=master;Uid=readonly;Pwd=password;")

# Replicas are optional, comma separated. Can be missing or empty.
REPLICAS_STR = os.getenv('ASSESSMENT_DB_REPLICA_CONNS', "")
REPLICAS = [s.strip() for s in REPLICAS_STR.split(',') if s.strip()] if REPLICAS_STR else []

# Normalization Settings for Deterministic Comparison
DECIMAL_PRECISION = int(os.getenv('DECIMAL_PRECISION', 4))
CASE_INSENSITIVE_COLUMNS = os.getenv('CASE_INSENSITIVE_COLUMNS', 'True').lower() == 'true'
STRIP_STRINGS = os.getenv('STRIP_STRINGS', 'True').lower() == 'true'
