
import time
import threading
from django.core.cache import cache
from .config import RUN_RATE_LIMIT, MAX_CONCURRENT_QUERY_RUNS

# App-wide concurrency cap — intentionally per-process.
# Each worker process gets its own semaphore of MAX_CONCURRENT_QUERY_RUNS slots.
# This means total concurrent DB queries across N workers = N * MAX_CONCURRENT_QUERY_RUNS.
# Reduce MAX_CONCURRENT_QUERY_RUNS proportionally when running multiple workers
# (e.g. 4 workers → set MAX_CONCURRENT_QUERY_RUNS=5 for the same ~20 total cap).
query_semaphore = threading.Semaphore(MAX_CONCURRENT_QUERY_RUNS)


def check_rate_limit(user_id: str) -> bool:
    """
    Returns True if the user is within the rate limit (RUN_RATE_LIMIT runs/min).

    Uses a fixed 1-minute window keyed by (user_id, current minute bucket).
    State is stored in Django's cache, so it works correctly across multiple
    Gunicorn workers when the cache backend is Redis.
    """
    bucket = int(time.time() // 60)
    key = f"rl:{user_id}:{bucket}"
    # cache.add is atomic: sets key to 0 only if it doesn't already exist.
    # cache.incr then atomically increments and returns the new count.
    cache.add(key, 0, timeout=120)  # 2-minute TTL covers the current and prior bucket
    count = cache.incr(key)
    return count <= RUN_RATE_LIMIT
