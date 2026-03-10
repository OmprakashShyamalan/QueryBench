
import os

# Operational Limits
QUERY_TIMEOUT_SECONDS = int(os.getenv('QUERY_TIMEOUT_SECONDS', 5))
MAX_RESULT_ROWS = int(os.getenv('MAX_RESULT_ROWS', 100))
RUN_RATE_LIMIT = int(os.getenv('RUN_RATE_LIMIT', 10)) # Runs per minute per user
MAX_CONCURRENT_QUERY_RUNS = int(os.getenv('MAX_CONCURRENT_QUERY_RUNS', 20)) # App-wide concurrency cap

# Grace period after the assessment deadline during which submit_answer is still accepted.
# Covers: auto-finalize latency (frontend timer fires → HTTP round-trip takes ~100-500ms),
# client/server clock skew, and slow networks.
# Set to 0 to enforce the deadline strictly (not recommended — breaks auto-finalize).
SUBMIT_GRACE_SECONDS = int(os.getenv('SUBMIT_GRACE_SECONDS', 60))

# Schema introspection cache TTL in seconds. Set to 0 to disable caching.
SCHEMA_CACHE_TTL_SECONDS = int(os.getenv('SCHEMA_CACHE_TTL_SECONDS', 300))

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
