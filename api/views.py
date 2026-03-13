
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from uuid import uuid4
from django.contrib.auth import authenticate, login, logout # type: ignore
from django.contrib.auth.models import User
from django.core.cache import cache
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from .models import DatabaseConfig, Question, Assessment, AssessmentQuestion, Assignment, Attempt, AttemptAnswer
from .serializers import *
from backend.runner import evaluate_submission, execute_query, validate_sql_security
from backend.schema_loader import inspect_schema
from backend.crypto import decrypt_field

logger = logging.getLogger(__name__)

# Async job executor — threads are per-process; job state lives in Django cache
# so results are visible across workers when the cache backend is Redis.
QUERY_JOB_TTL_SECONDS = 10 * 60
_query_job_executor = ThreadPoolExecutor(max_workers=6)

_JOB_KEY = "qjob:{}"


def _start_query_job(work_fn):
    job_id = uuid4().hex
    cache.set(_JOB_KEY.format(job_id), {'status': 'queued'}, timeout=QUERY_JOB_TTL_SECONDS)

    def _runner():
        cache.set(_JOB_KEY.format(job_id), {'status': 'running'}, timeout=QUERY_JOB_TTL_SECONDS)
        try:
            result = work_fn()
            cache.set(_JOB_KEY.format(job_id), {'status': 'completed', 'result': result}, timeout=QUERY_JOB_TTL_SECONDS)
        except Exception as e:
            logger.error(f"Async job failed for job_id={job_id}: {e}", exc_info=True)
            cache.set(_JOB_KEY.format(job_id), {'status': 'failed', 'error': str(e)}, timeout=QUERY_JOB_TTL_SECONDS)

    _query_job_executor.submit(_runner)
    return job_id


def _get_query_job(job_id: str):
    return cache.get(_JOB_KEY.format(job_id))


def _is_better_result(new_status: str, new_time_ms: int, current_best_status: str, current_best_time_ms: int) -> bool:
    """
    Determines if a new result is better than the current best.
    
    Logic:
    - CORRECT is always better than INCORRECT or NOT_ATTEMPTED
    - Among CORRECT results, faster execution time is better
    - INCORRECT is better than NOT_ATTEMPTED
    """
    # Status priority: CORRECT > INCORRECT > NOT_ATTEMPTED
    status_priority = {
        'CORRECT': 3,
        'INCORRECT': 2,
        'NOT_ATTEMPTED': 1,
        '': 0  # Empty string for no previous best
    }
    
    new_priority = status_priority.get(new_status, 0)
    current_priority = status_priority.get(current_best_status, 0)
    
    # If new status has higher priority, it's better
    if new_priority > current_priority:
        return True
    
    # If new status has lower priority, it's not better
    if new_priority < current_priority:
        return False
    
    # Same status - compare execution times (only meaningful for CORRECT status)
    # For CORRECT results, faster is better
    if new_status == 'CORRECT' and current_best_status == 'CORRECT':
        if new_time_ms is not None and current_best_time_ms is not None:
            return new_time_ms < current_best_time_ms
        elif new_time_ms is not None:
            return True  # New has time, old doesn't
        return False  # Neither has time or old has time but new doesn't
    
    # For same status but not CORRECT, newer is considered equal (not better)
    return False


def _update_best_result_if_needed(
    attempt_answer: AttemptAnswer,
    new_status: str,
    new_query: str,
    new_time_ms: int
) -> bool:
    """
    Updates the best result fields in an AttemptAnswer if the new result is better.
    
    Returns True if the best result was updated, False otherwise.
    """
    is_better = _is_better_result(
        new_status, 
        new_time_ms, 
        attempt_answer.best_status, 
        attempt_answer.best_execution_time_ms
    )
    
    if is_better:
        attempt_answer.best_status = new_status
        attempt_answer.best_query = new_query
        attempt_answer.best_execution_time_ms = new_time_ms
        attempt_answer.best_achieved_at = timezone.now()
        return True
    
    return False


def _attempt_expired(attempt) -> bool:
    """
    Returns True if the attempt has exceeded the assessment's allowed duration
    plus the configured grace period (SUBMIT_GRACE_SECONDS, default 60 s).

    The grace period covers:
      - auto-finalize latency: the frontend timer fires at t=0 and immediately
        calls submit_answer for all questions before calling finalize; those HTTP
        requests arrive on the server a few hundred ms after the hard deadline
      - client/server clock skew and slow networks

    Hard cheating (submitting minutes after expiry) is still blocked.
    Set SUBMIT_GRACE_SECONDS=0 to enforce strictly (breaks auto-finalize).
    """
    import datetime
    from backend.config import SUBMIT_GRACE_SECONDS
    duration_minutes = attempt.assignment.assessment.duration_minutes
    deadline = attempt.started_at + datetime.timedelta(
        minutes=duration_minutes, seconds=SUBMIT_GRACE_SECONDS
    )
    return timezone.now() > deadline


def _user_to_dict(user):
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'name': f'{user.first_name} {user.last_name}'.strip() or user.username,
        'role': 'ADMIN' if user.is_staff else 'PARTICIPANT',
    }


def _build_conn_str(config: DatabaseConfig) -> str:
    """Build an ODBC connection string from a DatabaseConfig model instance."""
    host = config.host
    db = config.database_name

    if config.trusted_connection:
        conn_str = (
            f"Driver={{ODBC Driver 17 for SQL Server}};"
            f"Server={host};"
            f"Database={db};"
            f"Trusted_Connection=yes;"
        )
    else:
        conn_str = (
            f"Driver={{ODBC Driver 17 for SQL Server}};"
            f"Server={host};"
            f"Database={db};"
            f"UID={config.username};"
            f"PWD={decrypt_field(config.password_secret_ref)};"
        )

    # For named instances (e.g. localhost\SQLEXPRESS), port is resolved via SQL Server Browser.
    # Only append port when no named instance is present.
    if config.port and config.port != 1433 and '\\' not in host:
        conn_str = conn_str.replace(
            f"Server={host};",
            f"Server={host},{config.port};"
        )

    return conn_str


# ─── Auth ─────────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')
    if not username or not password:
        return Response({'error': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)
    user = authenticate(request, username=username, password=password)
    if user is None:
        return Response({'error': 'Invalid username or password.'}, status=status.HTTP_401_UNAUTHORIZED)
    login(request, user)
    return Response(_user_to_dict(user))


@api_view(['POST'])
def logout_view(request):
    logout(request)
    return Response({'message': 'Logged out successfully.'})


@api_view(['POST'])
def bulk_import_users_view(request):
    """
    Creates multiple users from a list.
    Expects: { "users": [{ "username", "email", "password", "first_name", "last_name", "role" }, ...] }
    """
    rows = request.data.get('users', [])
    if not rows:
        return Response({'error': 'No user rows provided.'}, status=status.HTTP_400_BAD_REQUEST)

    created, errors = [], []
    for row in rows:
        username = (row.get('username') or '').strip()
        password = (row.get('password') or '').strip()
        email = (row.get('email') or '').strip()
        first_name = (row.get('first_name') or '').strip()
        last_name = (row.get('last_name') or '').strip()
        role = (row.get('role') or 'PARTICIPANT').strip().upper()

        if not username or not password:
            errors.append({'username': username or '(blank)', 'error': 'Username and password are required.'})
            continue
        if User.objects.filter(username=username).exists():
            errors.append({'username': username, 'error': f"Username '{username}' already exists."})
            continue
        try:
            user = User.objects.create_user(
                username=username, email=email, password=password,
                first_name=first_name, last_name=last_name,
            )
            user.is_staff = (role == 'ADMIN')
            user.is_superuser = (role == 'ADMIN')
            user.save()
            created.append(_user_to_dict(user))
        except Exception as e:
            errors.append({'username': username, 'error': str(e)})

    return Response(
        {'created': created, 'errors': errors},
        status=status.HTTP_207_MULTI_STATUS if errors else status.HTTP_201_CREATED,
    )


@api_view(['POST'])
def bulk_assign_by_text_view(request):
    """
    Creates assignments by resolving a list of usernames or emails (instead of user IDs).
    Expects: { "assessment_id": int, "identifiers": ["user@email.com", "username", ...], "due_date": "YYYY-MM-DD" }
    """
    assessment_id = request.data.get('assessment_id')
    identifiers = request.data.get('identifiers', [])
    due_date = request.data.get('due_date')

    if not assessment_id or not identifiers or not due_date:
        return Response(
            {'error': 'assessment_id, identifiers, and due_date are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        assessment = Assessment.objects.get(id=assessment_id)
    except Assessment.DoesNotExist:
        return Response({'error': 'Assessment not found.'}, status=status.HTTP_404_NOT_FOUND)

    created, errors = [], []
    for identifier in identifiers:
        identifier = identifier.strip()
        if not identifier:
            continue
        user = (
            User.objects.filter(username=identifier).first()
            or User.objects.filter(email=identifier).first()
        )
        if not user:
            errors.append({'identifier': identifier, 'error': f"No user found with username or email '{identifier}'."})
            continue
        try:
            assignment, _ = Assignment.objects.get_or_create(
                assessment=assessment,
                user=user,
                defaults={'due_date': due_date, 'status': 'PENDING'},
            )
            created.append(AssignmentSerializer(assignment).data)
        except Exception as e:
            errors.append({'identifier': identifier, 'error': str(e)})

    return Response(
        {'created': created, 'errors': errors},
        status=status.HTTP_207_MULTI_STATUS if errors else status.HTTP_201_CREATED,
    )


@api_view(['GET'])
def me_view(request):
    return Response(_user_to_dict(request.user))


# ─── Schema introspection ─────────────────────────────────────────────────────

@api_view(['GET'])
def schema_view(request):
    """
    Returns the schema (tables + columns + PK/FK metadata) for a given DatabaseConfig.
    GET /api/v1/schema/?config_id=<id>
    """
    config_id = request.query_params.get('config_id')
    question_id = request.query_params.get('question_id')
    solution_query = None
    if question_id:
        try:
            q = Question.objects.get(pk=question_id)
            solution_query = q.solution_query
        except Question.DoesNotExist:
            pass

    if not config_id:
        return Response({'error': 'config_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        config = DatabaseConfig.objects.get(pk=config_id)
    except DatabaseConfig.DoesNotExist:
        return Response({'error': 'DatabaseConfig not found.'}, status=status.HTTP_404_NOT_FOUND)

    conn_str = _build_conn_str(config)
    schema = inspect_schema(conn_str=conn_str, solution_query=solution_query, schema_filter=config.schema_filter or '')
    return Response(schema)


# ─── ViewSets ─────────────────────────────────────────────────────────────────

class QuestionViewSet(viewsets.ModelViewSet):
    queryset = Question.objects.all()
    serializer_class = QuestionSerializer


class AssessmentViewSet(viewsets.ModelViewSet):
    queryset = Assessment.objects.prefetch_related('questions').all()
    serializer_class = AssessmentSerializer

    @action(detail=True, methods=['post'])
    def set_questions(self, request, pk=None):
        assessment = self.get_object()
        question_ids = request.data.get('question_ids', [])
        # Replace all existing question links
        AssessmentQuestion.objects.filter(assessment=assessment).delete()
        for i, qid in enumerate(question_ids):
            try:
                q = Question.objects.get(pk=qid)
                AssessmentQuestion.objects.create(assessment=assessment, question=q, sort_order=i)
            except Question.DoesNotExist:
                pass
        return Response(AssessmentSerializer(assessment).data)

    @action(detail=True, methods=['get'])
    def full(self, request, pk=None):
        """Returns assessment detail including full question data (not just IDs)."""
        assessment = self.get_object()
        questions = assessment.questions.all().order_by('assessmentquestion__sort_order')
        data = AssessmentSerializer(assessment).data
        data['questions_data'] = QuestionSerializer(questions, many=True).data
        return Response(data)


class AssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = AssignmentSerializer

    def get_queryset(self):
        qs = Assignment.objects.select_related(
            'assessment', 'assessment__db_config', 'user'
        ).prefetch_related('assessment__questions').all()
        if self.request.query_params.get('me'):
            qs = qs.filter(user=self.request.user)
        return qs

    @action(detail=True, methods=['post'])
    def start_attempt(self, request, pk=None):
        assignment = self.get_object()
        if assignment.status == 'COMPLETED':
            return Response({'error': 'Assignment already completed.'}, status=status.HTTP_400_BAD_REQUEST)

        # Return existing active (not yet submitted) attempt to support resuming —
        # UNLESS the participant closed the tab, in which case the attempt is locked.
        existing = assignment.attempts.filter(submitted_at__isnull=True).first()
        if existing:
            if existing.is_session_closed:
                return Response(
                    {'error': 'Your session was closed when you left. This attempt cannot be resumed.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return Response(AttemptSerializer(existing).data)

        # Reject new attempts started after the due date.
        if assignment.due_date and timezone.now() > assignment.due_date:
            return Response(
                {'error': 'The due date for this assignment has passed. No new attempts are allowed.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Enforce attempts_allowed — count only submitted (completed) attempts.
        attempts_allowed = assignment.assessment.attempts_allowed
        submitted_count = assignment.attempts.filter(submitted_at__isnull=False).count()
        if submitted_count >= attempts_allowed:
            return Response(
                {
                    'error': (
                        f'Attempt limit reached. '
                        f'You have used {submitted_count} of {attempts_allowed} allowed attempt(s).'
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Create a fresh attempt
        attempt = Attempt.objects.create(assignment=assignment)
        assignment.status = 'IN_PROGRESS'
        assignment.save()
        return Response(AttemptSerializer(attempt).data, status=status.HTTP_201_CREATED)


class AttemptViewSet(viewsets.ModelViewSet):
    queryset = Attempt.objects.none()  # required by DRF router for basename; get_queryset() overrides at runtime
    serializer_class = AttemptSerializer

    def get_queryset(self):
        qs = Attempt.objects.select_related('assignment__assessment').prefetch_related('answers')
        # Staff can access all attempts (for grading/results).
        # Participants are restricted to their own attempts — this implicitly
        # protects every detail action (submit_answer, finalize, close_session)
        # without needing per-action ownership checks.
        if not self.request.user.is_staff:
            qs = qs.filter(assignment__user=self.request.user)
        return qs

    @action(detail=True, methods=['post'])
    def submit_answer(self, request, pk=None):
        attempt = self.get_object()

        if _attempt_expired(attempt):
            return Response(
                {'error': 'Time is up. The assessment deadline has passed and no further answers can be submitted.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        question_id = request.data.get('question_id')
        participant_query = request.data.get('query')

        try:
            question = Question.objects.get(id=question_id)
        except Question.DoesNotExist:
            return Response({'error': 'Question not found'}, status=status.HTTP_404_NOT_FOUND)

        # Determine which database to evaluate against
        conn_str = None
        try:
            db_config = attempt.assignment.assessment.db_config
            conn_str = _build_conn_str(db_config)
        except Exception:
            pass

        # Full deterministic evaluation
        eval_result = evaluate_submission(
            user_id=str(request.user.id),
            question_id=str(question.id),
            participant_query=participant_query,
            solution_query=question.solution_query,
            conn_str=conn_str,
            order_sensitive=question.order_sensitive,
        )

        # Get or create the answer record
        attempt_answer, created = AttemptAnswer.objects.get_or_create(
            attempt=attempt,
            question=question,
            defaults={
                'participant_query': participant_query,
                'status': eval_result.get('status', 'INCORRECT'),
                'execution_time_ms': eval_result.get('execution_metadata', {}).get('duration_ms'),
                'feedback': eval_result.get('feedback', ''),
                'attempt_count': 1
            }
        )

        if not created:
            # Update current attempt
            attempt_answer.participant_query = participant_query
            attempt_answer.status = eval_result.get('status', 'INCORRECT')
            attempt_answer.execution_time_ms = eval_result.get('execution_metadata', {}).get('duration_ms')
            attempt_answer.feedback = eval_result.get('feedback', '')
            attempt_answer.attempt_count += 1

        # Check and update best result
        new_status = eval_result.get('status', 'INCORRECT')
        new_time_ms = eval_result.get('execution_metadata', {}).get('duration_ms')
        
        is_new_best = _update_best_result_if_needed(
            attempt_answer,
            new_status,
            participant_query,
            new_time_ms
        )
        
        attempt_answer.save()

        # Add best result info to response
        response_data = dict(eval_result)
        response_data['is_new_best'] = is_new_best
        response_data['attempt_count'] = attempt_answer.attempt_count
        if is_new_best:
            response_data['best_result'] = {
                'status': attempt_answer.best_status,
                'execution_time_ms': attempt_answer.best_execution_time_ms,
                'achieved_at': attempt_answer.best_achieved_at
            }

        return Response(response_data)

    @action(detail=True, methods=['post'])
    def finalize(self, request, pk=None):
        """
        Finalises the attempt: calculates score, marks as submitted, sets assignment COMPLETED.
        """
        attempt = self.get_object()

        if attempt.submitted_at:
            return Response({'error': 'Attempt already submitted.'}, status=status.HTTP_400_BAD_REQUEST)

        # Build a weight map: {question_id: weight} from the through table
        aq_qs = AssessmentQuestion.objects.filter(
            assessment=attempt.assignment.assessment
        ).values('question_id', 'weight')
        weight_map = {row['question_id']: Decimal(str(row['weight'])) for row in aq_qs}

        total_weight = sum(weight_map.values())
        correct_question_ids = set(
            attempt.answers.filter(status='CORRECT').values_list('question_id', flat=True)
        )
        earned_weight = sum(w for qid, w in weight_map.items() if qid in correct_question_ids)

        score = (earned_weight / total_weight * 100) if total_weight > 0 else Decimal(0)
        score = score.quantize(Decimal('0.01'))

        attempt.submitted_at = timezone.now()
        attempt.score = score
        attempt.save()

        attempt.assignment.status = 'COMPLETED'
        attempt.assignment.save()

        if attempt.source == 'lms':
            try:
                from lti.services import submit_grade_for_attempt
                submit_grade_for_attempt(attempt, float(score), 100.0)
                logger.info("grade returned")
            except Exception as e:
                logger.error(f"LTI grade return failed for attempt={attempt.id}: {e}", exc_info=True)

        return Response({
            'score': float(score),
            'correct': len(correct_question_ids),
            'total': len(weight_map),
            'submitted_at': attempt.submitted_at,
        })

    @action(detail=True, methods=['post'])
    def close_session(self, request, pk=None):
        """
        Called via navigator.sendBeacon when the participant closes the tab.

        - If the attempt is still in progress (not yet submitted), marks it as
          session-closed (preventing resume) and destroys the Django session.
        - If already submitted, only destroys the session (safe to call twice).

        CSRF token must be supplied as the ``csrfmiddlewaretoken`` form field
        (URLSearchParams body) because sendBeacon cannot set custom headers.
        """
        attempt = self.get_object()
        if attempt.submitted_at is None:
            attempt.is_session_closed = True
            attempt.save()
        logout(request)
        return Response({'status': 'closed'})

    @action(detail=False, methods=['post'])
    def run_query(self, request):
        """
        Executes a query for preview (no evaluation/scoring).
        Accepts optional config_id to target a specific DatabaseConfig.
        """
        query = request.data.get('query')
        config_id = request.data.get('config_id')

        if not query:
            return Response({'error': 'Query required'}, status=status.HTTP_400_BAD_REQUEST)

        conn_str = None
        if config_id:
            try:
                config = DatabaseConfig.objects.get(pk=config_id)
                conn_str = _build_conn_str(config)
            except DatabaseConfig.DoesNotExist:
                return Response({'error': 'DatabaseConfig not found.'}, status=status.HTTP_404_NOT_FOUND)

        is_safe, validation_msg = validate_sql_security(query)
        if not is_safe:
            return Response(
                {'columns': [], 'rows': [], 'execution_time_ms': 0, 'error': validation_msg},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            results, err, duration = execute_query(query, user_id=str(request.user.id), conn_str=conn_str)
        except Exception as e:
            logger.error(f"run_query unexpected error for user {request.user.id}: {e}", exc_info=True)
            return Response(
                {'columns': [], 'rows': [], 'execution_time_ms': 0, 'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if err:
            # Return the error message from the backend for user feedback
            return Response({
                'columns': [],
                'rows': [],
                'execution_time_ms': duration,
                'error': err
            }, status=status.HTTP_400_BAD_REQUEST)

        if results:
            columns = list(results[0].keys())
            rows = [list(row.values()) for row in results]
            return Response({'columns': columns, 'rows': rows, 'execution_time_ms': duration})

        return Response({'columns': [], 'rows': [], 'execution_time_ms': duration})

    @action(detail=False, methods=['post'])
    def run_query_async(self, request):
        """
        Starts async query execution and returns a job_id for polling.
        """
        query = request.data.get('query')
        config_id = request.data.get('config_id')

        if not query:
            return Response({'error': 'Query required'}, status=status.HTTP_400_BAD_REQUEST)

        conn_str = None
        if config_id:
            try:
                config = DatabaseConfig.objects.get(pk=config_id)
                conn_str = _build_conn_str(config)
            except DatabaseConfig.DoesNotExist:
                return Response({'error': 'DatabaseConfig not found.'}, status=status.HTTP_404_NOT_FOUND)

        is_safe, validation_msg = validate_sql_security(query)
        if not is_safe:
            return Response({'error': validation_msg}, status=status.HTTP_400_BAD_REQUEST)

        def _run_query_job():
            results, err, duration = execute_query(query, user_id=str(request.user.id), conn_str=conn_str)
            if err:
                return {'columns': [], 'rows': [], 'execution_time_ms': duration, 'error': err}
            if results:
                columns = list(results[0].keys())
                rows = [list(row.values()) for row in results]
                return {'columns': columns, 'rows': rows, 'execution_time_ms': duration}
            return {'columns': [], 'rows': [], 'execution_time_ms': duration}

        job_id = _start_query_job(_run_query_job)
        return Response({'job_id': job_id, 'status': 'queued'}, status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=['get'])
    def run_query_status(self, request):
        """
        Polls status/result for an async query execution job.
        """
        job_id = request.query_params.get('job_id', '').strip()
        if not job_id:
            return Response({'error': 'job_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

        job = _get_query_job(job_id)
        if not job:
            return Response({'error': 'Job not found or expired.'}, status=status.HTTP_404_NOT_FOUND)

        payload = {'job_id': job_id, 'status': job.get('status')}
        if job.get('status') == 'completed':
            payload['result'] = job.get('result')
        elif job.get('status') == 'failed':
            payload['error'] = job.get('error', 'Async query execution failed.')
        return Response(payload)

    @action(detail=False, methods=['post'])
    def validate_query(self, request):
        """
        Validates a participant's query against expected solution results (real-time feedback).
        Does NOT score or submit the answer officially, but DOES track best results if attempt_id is provided.
        """
        query = request.data.get('query')
        question_id = request.data.get('question_id')
        config_id = request.data.get('config_id')
        attempt_id = request.data.get('attempt_id')  # Optional: track best result when provided

        if not query or not question_id:
            return Response({'error': 'Query and question_id are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            question = Question.objects.get(id=question_id)
        except Question.DoesNotExist:
            return Response({'error': 'Question not found'}, status=status.HTTP_404_NOT_FOUND)

        # Determine database connection
        conn_str = None
        if config_id:
            try:
                config = DatabaseConfig.objects.get(pk=config_id)
                conn_str = _build_conn_str(config)
            except DatabaseConfig.DoesNotExist:
                return Response({'error': 'DatabaseConfig not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            # Use the same validation logic as submit_answer
            eval_result = evaluate_submission(
                user_id=str(request.user.id),
                question_id=str(question.id),
                participant_query=query,
                solution_query=question.solution_query,
                conn_str=conn_str,
                order_sensitive=question.order_sensitive,
            )
            
            # Track best result if attempt_id is provided
            if attempt_id:
                try:
                    attempt = Attempt.objects.get(id=attempt_id)
                    # Verify user owns this attempt (security check)
                    if attempt.assignment.user == request.user or request.user.is_staff:
                        # Get or create the answer record
                        attempt_answer, created = AttemptAnswer.objects.get_or_create(
                            attempt=attempt,
                            question=question,
                            defaults={
                                'participant_query': '',  # Don't save query for validation
                                'status': 'NOT_ATTEMPTED',  # Keep official status as not attempted
                                'attempt_count': 1
                            }
                        )
                        
                        if not created:
                            attempt_answer.attempt_count += 1
                        
                        # Check and update best result
                        new_status = eval_result.get('status', 'INCORRECT')
                        new_time_ms = eval_result.get('execution_metadata', {}).get('duration_ms')
                        
                        is_new_best = _update_best_result_if_needed(
                            attempt_answer,
                            new_status,
                            query,
                            new_time_ms
                        )
                        
                        attempt_answer.save()
                        
                        # Add tracking info to response
                        eval_result['is_new_best'] = is_new_best
                        eval_result['attempt_count'] = attempt_answer.attempt_count
                        if is_new_best:
                            eval_result['best_result'] = {
                                'status': attempt_answer.best_status,
                                'execution_time_ms': attempt_answer.best_execution_time_ms,
                                'achieved_at': attempt_answer.best_achieved_at
                            }
                except Attempt.DoesNotExist:
                    logger.warning(f"Attempt {attempt_id} not found for validate_query tracking")
                except Exception as e:
                    logger.error(f"Error tracking best result in validate_query: {e}", exc_info=True)
            
            return Response(eval_result)
        except Exception as e:
            logger.error(f"Validation error for user {request.user.id}: {str(e)}")
            return Response({
                'status': 'ERROR',
                'feedback': 'Unable to validate query. This may indicate a database connection issue or an invalid solution query.'
            })

    @action(detail=False, methods=['post'])
    def validate_query_async(self, request):
        """
        Starts async query validation and returns a job_id for polling.
        Tracks best results if attempt_id is provided.
        """
        query = request.data.get('query')
        question_id = request.data.get('question_id')
        config_id = request.data.get('config_id')
        attempt_id = request.data.get('attempt_id')  # Optional: track best result when provided

        if not query or not question_id:
            return Response({'error': 'Query and question_id are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            question = Question.objects.get(id=question_id)
        except Question.DoesNotExist:
            return Response({'error': 'Question not found'}, status=status.HTTP_404_NOT_FOUND)

        conn_str = None
        if config_id:
            try:
                config = DatabaseConfig.objects.get(pk=config_id)
                conn_str = _build_conn_str(config)
            except DatabaseConfig.DoesNotExist:
                return Response({'error': 'DatabaseConfig not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Capture user and attempt for the background job
        user_id = request.user.id
        user = request.user

        def _validate_query_job():
            eval_result = evaluate_submission(
                user_id=str(user_id),
                question_id=str(question.id),
                participant_query=query,
                solution_query=question.solution_query,
                conn_str=conn_str,
                order_sensitive=question.order_sensitive,
            )
            
            # Track best result if attempt_id is provided
            if attempt_id:
                try:
                    attempt = Attempt.objects.get(id=attempt_id)
                    # Verify user owns this attempt (security check)
                    if attempt.assignment.user_id == user_id or user.is_staff:
                        # Get or create the answer record
                        attempt_answer, created = AttemptAnswer.objects.get_or_create(
                            attempt=attempt,
                            question=question,
                            defaults={
                                'participant_query': '',
                                'status': 'NOT_ATTEMPTED',
                                'attempt_count': 1
                            }
                        )
                        
                        if not created:
                            attempt_answer.attempt_count += 1
                        
                        # Check and update best result
                        new_status = eval_result.get('status', 'INCORRECT')
                        new_time_ms = eval_result.get('execution_metadata', {}).get('duration_ms')
                        
                        is_new_best = _update_best_result_if_needed(
                            attempt_answer,
                            new_status,
                            query,
                            new_time_ms
                        )
                        
                        attempt_answer.save()
                        
                        # Add tracking info to response
                        eval_result['is_new_best'] = is_new_best
                        eval_result['attempt_count'] = attempt_answer.attempt_count
                        if is_new_best:
                            eval_result['best_result'] = {
                                'status': attempt_answer.best_status,
                                'execution_time_ms': attempt_answer.best_execution_time_ms,
                                'achieved_at': attempt_answer.best_achieved_at.isoformat() if attempt_answer.best_achieved_at else None
                            }
                except Attempt.DoesNotExist:
                    logger.warning(f"Attempt {attempt_id} not found for validate_query_async tracking")
                except Exception as e:
                    logger.error(f"Error tracking best result in validate_query_async: {e}", exc_info=True)
            
            return eval_result

        job_id = _start_query_job(_validate_query_job)
        return Response({'job_id': job_id, 'status': 'queued'}, status=status.HTTP_202_ACCEPTED)

    @action(detail=False, methods=['get'])
    def validate_query_status(self, request):
        """
        Polls status/result for an async query validation job.
        """
        job_id = request.query_params.get('job_id', '').strip()
        if not job_id:
            return Response({'error': 'job_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

        job = _get_query_job(job_id)
        if not job:
            return Response({'error': 'Job not found or expired.'}, status=status.HTTP_404_NOT_FOUND)

        payload = {'job_id': job_id, 'status': job.get('status')}
        if job.get('status') == 'completed':
            payload['result'] = job.get('result')
        elif job.get('status') == 'failed':
            payload['error'] = job.get('error', 'Async query validation failed.')
        return Response(payload)


class DatabaseConfigViewSet(viewsets.ModelViewSet):
    queryset = DatabaseConfig.objects.all()
    serializer_class = DatabaseConfigSerializer

    @action(detail=False, methods=['post'])
    def test_connection(self, request):
        """
        Tests a database connection with the supplied parameters, without persisting anything.
        Always returns HTTP 200; the response body carries { success, message }.
        """
        import pyodbc  # local import — keeps startup fast if pyodbc absent

        host = (request.data.get('host') or '').strip()
        database_name = (request.data.get('database_name') or '').strip()
        port = request.data.get('port', 1433)
        trusted = request.data.get('trusted_connection', False)
        username = (request.data.get('username') or '').strip()
        password = (request.data.get('password_secret_ref') or '').strip()

        if not host or not database_name:
            return Response({'success': False, 'message': 'Host and database name are required.'})

        if trusted:
            conn_str = (
                f"Driver={{ODBC Driver 17 for SQL Server}};"
                f"Server={host};"
                f"Database={database_name};"
                f"Trusted_Connection=yes;"
            )
        else:
            if not username:
                return Response({'success': False, 'message': 'Username is required for SQL auth connections.'})
            conn_str = (
                f"Driver={{ODBC Driver 17 for SQL Server}};"
                f"Server={host};"
                f"Database={database_name};"
                f"UID={username};"
                f"PWD={password};"
            )

        if port and port != 1433 and '\\' not in host:
            conn_str = conn_str.replace(f"Server={host};", f"Server={host},{port};")

        try:
            conn = pyodbc.connect(conn_str, timeout=5)
            conn.cursor().execute("SELECT 1")
            conn.close()
            return Response({'success': True, 'message': f'Connected to {database_name} on {host}.'})
        except Exception as e:
            return Response({'success': False, 'message': str(e)[:300]})


# ─── User management ──────────────────────────────────────────────────────────

@api_view(['GET', 'POST'])
def users_view(request):
    if request.method == 'GET':
        users = User.objects.all().order_by('username')
        return Response([_user_to_dict(u) for u in users])

    # POST — create a new user
    username = request.data.get('username', '').strip()
    email = request.data.get('email', '').strip()
    password = request.data.get('password', '')
    first_name = request.data.get('first_name', '').strip()
    last_name = request.data.get('last_name', '').strip()
    role = request.data.get('role', 'PARTICIPANT')

    if not username or not password:
        return Response({'error': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(username=username).exists():
        return Response({'error': f"Username '{username}' already exists."}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(
        username=username, email=email, password=password,
        first_name=first_name, last_name=last_name,
    )
    user.is_staff = (role == 'ADMIN')
    user.is_superuser = (role == 'ADMIN')
    user.save()
    return Response(_user_to_dict(user), status=status.HTTP_201_CREATED)


@api_view(['PATCH', 'DELETE'])
def user_detail_view(request, pk):
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        if user == request.user:
            return Response({'error': 'Cannot delete your own account.'}, status=status.HTTP_400_BAD_REQUEST)
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PATCH — update password or role
    new_password = request.data.get('password')
    role = request.data.get('role')
    if new_password:
        user.set_password(new_password)
    if role:
        user.is_staff = (role == 'ADMIN')
        user.is_superuser = (role == 'ADMIN')
    user.save()
    return Response(_user_to_dict(user))


# ─── Results ──────────────────────────────────────────────────────────────────

def _attempt_to_history_item(a):
    score = float(a.score) if a.score is not None else None
    return {
        'id': a.id,
        'score': score,
        'result_status': 'PASSED' if score is not None and score >= 70 else ('FAILED' if score is not None else 'PENDING'),
        'submitted_at': a.submitted_at,
        'submitted_date': a.submitted_at.strftime('%Y-%m-%d') if a.submitted_at else None,
    }


@api_view(['GET'])
def results_view(request):
    """
    Returns one row per (participant, assessment) showing the best (highest-score) attempt.
    Each row includes a `history` list of all attempts for that combination, ordered most-recent first.
    """
    from collections import defaultdict

    all_attempts = (
        Attempt.objects
        .filter(submitted_at__isnull=False)
        .select_related('assignment', 'assignment__user', 'assignment__assessment')
        .order_by('assignment__user_id', 'assignment__assessment_id', '-score', '-submitted_at')
    )

    # Group by (user_id, assessment_id)
    grouped = defaultdict(list)
    for attempt in all_attempts:
        key = (attempt.assignment.user_id, attempt.assignment.assessment_id)
        grouped[key].append(attempt)

    rows = []
    for attempt_list in grouped.values():
        # Best attempt = highest score; ties broken by most recent submission
        best = max(attempt_list, key=lambda a: (float(a.score) if a.score is not None else -1, a.submitted_at))
        u = best.assignment.user
        score = float(best.score) if best.score is not None else None
        rows.append({
            'id': best.id,
            'participant_name': f'{u.first_name} {u.last_name}'.strip() or u.username,
            'participant_email': u.email,
            'assessment_name': best.assignment.assessment.name,
            'score': score,
            'result_status': 'PASSED' if score is not None and score >= 70 else ('FAILED' if score is not None else 'PENDING'),
            'submitted_at': best.submitted_at,
            'submitted_date': best.submitted_at.strftime('%Y-%m-%d') if best.submitted_at else None,
            'attempts_count': len(attempt_list),
            'history': [_attempt_to_history_item(a) for a in sorted(attempt_list, key=lambda a: a.submitted_at, reverse=True)],
        })

    # Sort final list: name asc, assessment asc
    rows.sort(key=lambda r: (r['participant_name'].lower(), r['assessment_name'].lower()))
    return Response(rows)


# ─── Bulk assignment ──────────────────────────────────────────────────────────

@api_view(['POST'])
def bulk_assign_view(request):
    assessment_id = request.data.get('assessment_id')
    user_ids = request.data.get('user_ids', [])
    due_date = request.data.get('due_date')

    if not assessment_id or not user_ids:
        return Response({'error': 'assessment_id and user_ids are required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        assessment = Assessment.objects.get(id=assessment_id)
    except Assessment.DoesNotExist:
        return Response({'error': 'Assessment not found.'}, status=status.HTTP_404_NOT_FOUND)

    created, errors = [], []
    for uid in user_ids:
        try:
            user = User.objects.get(pk=uid)
            assignment, _ = Assignment.objects.get_or_create(
                assessment=assessment,
                user=user,
                defaults={'due_date': due_date, 'status': 'PENDING'},
            )
            created.append(AssignmentSerializer(assignment).data)
        except User.DoesNotExist:
            errors.append({'user_id': uid, 'error': f'User id={uid} not found.'})

    return Response({'created': created, 'errors': errors},
                    status=status.HTTP_207_MULTI_STATUS if errors else status.HTTP_201_CREATED)
