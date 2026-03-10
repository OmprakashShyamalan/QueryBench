"""
QueryBench Load Test
=====================
Simulates participants logging in, running preview queries,
validating answers, and submitting final answers.

Target: http://127.0.0.1:8000
Assessment: id=19 (W3Schools_DB, 6 questions, db_config_id=28)

Run:
    locust -f locustfile.py --headless -u 10 -r 2 --run-time 2m --html load_report.html
    locust -f locustfile.py   # interactive UI at http://localhost:8089
"""

import json
import random
from locust import HttpUser, task, between, events

# ── Test data ────────────────────────────────────────────────────────────────

USERS = [
    {"username": f"loadtest_user_{i}", "password": f"LoadTest@{i}!"}
    for i in range(1, 11)
]

ASSESSMENT_ID = 19
DB_CONFIG_ID  = 28

# Real question IDs from assessment 19
QUESTION_IDS = [85, 86, 87, 88, 89, 90]

# Correct answer queries (will score CORRECT)
CORRECT_QUERIES = {
    85: "SELECT ProductName, Price FROM Products ORDER BY ProductName",
    86: "SELECT CustomerName, City FROM Customers WHERE Country = 'Germany' ORDER BY CustomerName",
    87: "SELECT s.SupplierName, COUNT(p.ProductID) AS ProductCount FROM Suppliers s JOIN Products p ON s.SupplierID = p.SupplierID GROUP BY s.SupplierName",
    88: "SELECT TOP 100 o.OrderID, o.OrderDate, c.CustomerName FROM Orders o JOIN Customers c ON o.CustomerID = c.CustomerID",
    89: "SELECT c.CategoryName, SUM(od.Quantity * p.Price) AS TotalRevenue FROM Categories c JOIN Products p ON c.CategoryID = p.CategoryID JOIN OrderDetails od ON p.ProductID = od.ProductID GROUP BY c.CategoryName",
    90: "SELECT TOP 5 c.CustomerName, c.Country, COUNT(DISTINCT o.OrderID) AS OrderCount, SUM(od.Quantity * p.Price) AS TotalSpend FROM Customers c JOIN Orders o ON c.CustomerID = o.CustomerID JOIN OrderDetails od ON o.OrderID = od.OrderID JOIN Products p ON od.ProductID = p.ProductID GROUP BY c.CustomerName, c.Country ORDER BY TotalSpend DESC",
}

# Incorrect queries (will score INCORRECT — simulates wrong attempts)
WRONG_QUERIES = [
    "SELECT ProductName FROM Products",
    "SELECT CustomerName FROM Customers WHERE Country = 'France'",
    "SELECT TOP 10 OrderID FROM Orders",
]

# Preview/exploration queries (run_query — no scoring)
PREVIEW_QUERIES = [
    "SELECT TOP 5 * FROM Products",
    "SELECT TOP 5 * FROM Customers",
    "SELECT TOP 5 * FROM Orders",
    "SELECT COUNT(*) AS TotalOrders FROM Orders",
    "SELECT DISTINCT Country FROM Customers",
]


# ── Participant simulation ────────────────────────────────────────────────────

class ParticipantUser(HttpUser):
    """
    Simulates one exam participant:
      - Logs in
      - Starts an attempt
      - Explores data with preview queries  (run_query_async)
      - Validates a query before submitting (validate_query_async + poll)
      - Submits a final answer              (submit_answer — synchronous)
    """
    wait_time = between(2, 6)   # realistic pause between actions
    host = "http://127.0.0.1:8000"

    # Assigned at login
    _attempt_id = None
    _csrftoken   = None

    # ── Lifecycle ────────────────────────────────────────────────────────────

    def on_start(self):
        creds = random.choice(USERS)
        self._login(creds["username"], creds["password"])
        self._start_attempt()

    def on_stop(self):
        self.client.post("/api/v1/auth/logout/")

    # ── Login / attempt helpers ───────────────────────────────────────────────

    def _login(self, username, password):
        resp = self.client.post(
            "/api/v1/auth/login/",
            json={"username": username, "password": password},
            name="/api/v1/auth/login/",
        )
        if resp.status_code == 200:
            self._csrftoken = self.client.cookies.get("csrftoken", "")
        else:
            self.environment.runner.quit()

    def _start_attempt(self):
        """Find the assignment for assessment 19 and start an attempt."""
        resp = self.client.get(
            "/api/v1/assignments/?me=true",
            name="/api/v1/assignments/ [me]",
        )
        if resp.status_code != 200:
            return
        assignments = resp.json()
        target = next(
            (a for a in assignments if a["assessment"] == ASSESSMENT_ID), None
        )
        if not target:
            return
        resp2 = self.client.post(
            f"/api/v1/assignments/{target['id']}/start_attempt/",
            headers=self._csrf_headers(),
            name="/api/v1/assignments/[id]/start_attempt/",
        )
        if resp2.status_code in (200, 201):
            self._attempt_id = resp2.json().get("id")

    def _csrf_headers(self):
        return {"X-CSRFToken": self._csrftoken or ""}

    # ── Tasks ─────────────────────────────────────────────────────────────────

    @task(4)
    def preview_query(self):
        """Run a quick exploratory query (async) — most frequent action."""
        query = random.choice(PREVIEW_QUERIES)
        resp = self.client.post(
            "/api/v1/attempts/run_query_async/",
            json={"query": query, "config_id": DB_CONFIG_ID},
            headers=self._csrf_headers(),
            name="/api/v1/attempts/run_query_async/",
        )
        if resp.status_code == 202:
            self._poll_job(resp.json()["job_id"], "/api/v1/attempts/run_query_status/")

    @task(3)
    def validate_answer(self):
        """Validate a query against the solution without committing."""
        qid = random.choice(QUESTION_IDS)
        query = random.choice([CORRECT_QUERIES.get(qid, WRONG_QUERIES[0])] + WRONG_QUERIES)
        resp = self.client.post(
            "/api/v1/attempts/validate_query_async/",
            json={"query": query, "question_id": qid, "config_id": DB_CONFIG_ID},
            headers=self._csrf_headers(),
            name="/api/v1/attempts/validate_query_async/",
        )
        if resp.status_code == 202:
            self._poll_job(resp.json()["job_id"], "/api/v1/attempts/validate_query_status/")

    @task(1)
    def submit_answer(self):
        """Submit a final answer (synchronous — hits the semaphore directly)."""
        if not self._attempt_id:
            return
        qid = random.choice(QUESTION_IDS)
        # Mix correct and incorrect to simulate real behaviour
        query = CORRECT_QUERIES.get(qid) if random.random() < 0.6 else random.choice(WRONG_QUERIES)
        self.client.post(
            f"/api/v1/attempts/{self._attempt_id}/submit_answer/",
            json={"question_id": qid, "query": query},
            headers=self._csrf_headers(),
            name="/api/v1/attempts/[id]/submit_answer/",
        )

    # ── Polling helper ────────────────────────────────────────────────────────

    def _poll_job(self, job_id: str, status_url: str, max_polls: int = 10):
        """Poll an async job until completed/failed or max_polls reached."""
        for _ in range(max_polls):
            resp = self.client.get(
                status_url,
                params={"job_id": job_id},
                name=f"{status_url} [poll]",
            )
            if resp.status_code != 200:
                break
            state = resp.json().get("status")
            if state in ("completed", "failed"):
                break
