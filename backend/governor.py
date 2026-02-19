
import time
import threading
from collections import deque
from .config import RUN_RATE_LIMIT, MAX_CONCURRENT_QUERY_RUNS

# App-wide Concurrency Cap
query_semaphore = threading.Semaphore(MAX_CONCURRENT_QUERY_RUNS)

# Per-user Rate Limiter (In-memory for MVP, use Redis for multi-worker prod)
user_rate_limits = {}
rate_limit_lock = threading.Lock()

def check_rate_limit(user_id: str) -> bool:
    """
    Returns True if user is within the rate limit (e.g. 10 runs / min).
    """
    now = time.time()
    with rate_limit_lock:
        if user_id not in user_rate_limits:
            user_rate_limits[user_id] = deque()
        
        user_queue = user_rate_limits[user_id]
        
        # Cleanup old entries
        while user_queue and user_queue[0] < now - 60:
            user_queue.popleft()
        
        if len(user_queue) >= RUN_RATE_LIMIT:
            return False
            
        user_queue.append(now)
        return True
