
from decimal import Decimal
from django.contrib.auth import authenticate, login, logout # type: ignore
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from .models import DatabaseConfig, Question, Assessment, AssessmentQuestion, Assignment, Attempt, AttemptAnswer
from .serializers import *
from backend.runner import evaluate_submission, execute_query
from backend.schema_loader import inspect_schema


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
            f"PWD={config.password_secret_ref};"
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
    if not config_id:
        return Response({'error': 'config_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        config = DatabaseConfig.objects.get(pk=config_id)
    except DatabaseConfig.DoesNotExist:
        return Response({'error': 'DatabaseConfig not found.'}, status=status.HTTP_404_NOT_FOUND)

    conn_str = _build_conn_str(config)
    schema = inspect_schema(conn_str=conn_str)
    return Response(schema)


# ─── ViewSets ─────────────────────────────────────────────────────────────────

class QuestionViewSet(viewsets.ModelViewSet):
    queryset = Question.objects.all()
    serializer_class = QuestionSerializer


class AssessmentViewSet(viewsets.ModelViewSet):
    queryset = Assessment.objects.all()
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
        qs = Assignment.objects.select_related('assessment', 'assessment__db_config', 'user').all()
        if self.request.query_params.get('me'):
            qs = qs.filter(user=self.request.user)
        return qs

    @action(detail=True, methods=['post'])
    def start_attempt(self, request, pk=None):
        assignment = self.get_object()
        if assignment.status == 'COMPLETED':
            return Response({'error': 'Assignment already completed.'}, status=status.HTTP_400_BAD_REQUEST)

        # Return existing active (not yet submitted) attempt to support resuming
        existing = assignment.attempts.filter(submitted_at__isnull=True).first()
        if existing:
            return Response(AttemptSerializer(existing).data)

        # Create a fresh attempt
        attempt = Attempt.objects.create(assignment=assignment)
        assignment.status = 'IN_PROGRESS'
        assignment.save()
        return Response(AttemptSerializer(attempt).data, status=status.HTTP_201_CREATED)


class AttemptViewSet(viewsets.ModelViewSet):
    queryset = Attempt.objects.all()
    serializer_class = AttemptSerializer

    @action(detail=True, methods=['post'])
    def submit_answer(self, request, pk=None):
        attempt = self.get_object()
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
        )

        # Persist the answer
        AttemptAnswer.objects.update_or_create(
            attempt=attempt,
            question=question,
            defaults={
                'participant_query': participant_query,
                'status': eval_result.get('status', 'INCORRECT'),
                'execution_time_ms': eval_result.get('execution_metadata', {}).get('duration_ms'),
                'feedback': eval_result.get('feedback', '')
            }
        )

        return Response(eval_result)

    @action(detail=True, methods=['post'])
    def finalize(self, request, pk=None):
        """
        Finalises the attempt: calculates score, marks as submitted, sets assignment COMPLETED.
        """
        attempt = self.get_object()

        if attempt.submitted_at:
            return Response({'error': 'Attempt already submitted.'}, status=status.HTTP_400_BAD_REQUEST)

        total_questions = attempt.assignment.assessment.questions.count()
        correct = attempt.answers.filter(status='CORRECT').count()
        score = (Decimal(correct) / Decimal(total_questions) * 100) if total_questions > 0 else Decimal(0)

        attempt.submitted_at = timezone.now()
        attempt.score = score
        attempt.save()

        attempt.assignment.status = 'COMPLETED'
        attempt.assignment.save()

        return Response({
            'score': float(score),
            'correct': correct,
            'total': total_questions,
            'submitted_at': attempt.submitted_at,
        })

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

        results, err, duration = execute_query(query, user_id=str(request.user.id), conn_str=conn_str)

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
    def validate_query(self, request):
        """
        Validates a participant's query against expected solution results (real-time feedback).
        Does NOT score or submit the answer.
        """
        query = request.data.get('query')
        question_id = request.data.get('question_id')
        config_id = request.data.get('config_id')

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
            )
            return Response(eval_result)
        except Exception as e:
            logger.error(f"Validation error for user {request.user.id}: {str(e)}")
            return Response({
                'status': 'ERROR',
                'feedback': 'Unable to validate query. This may indicate a database connection issue or an invalid solution query.'
            })


class DatabaseConfigViewSet(viewsets.ModelViewSet):
    queryset = DatabaseConfig.objects.all()
    serializer_class = DatabaseConfigSerializer


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

@api_view(['GET'])
def results_view(request):
    attempts = (
        Attempt.objects
        .filter(submitted_at__isnull=False)
        .select_related('assignment', 'assignment__user', 'assignment__assessment')
    )
    return Response(ResultSerializer(attempts, many=True).data)


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
