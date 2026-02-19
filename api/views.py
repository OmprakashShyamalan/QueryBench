
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import DatabaseConfig, Question, Assessment, Assignment, Attempt, AttemptAnswer
from .serializers import *
from backend.runner import evaluate_submission, execute_query

class QuestionViewSet(viewsets.ModelViewSet):
    queryset = Question.objects.all()
    serializer_class = QuestionSerializer

class AssessmentViewSet(viewsets.ModelViewSet):
    queryset = Assessment.objects.all()
    serializer_class = AssessmentSerializer

class AssignmentViewSet(viewsets.ModelViewSet):
    queryset = Assignment.objects.all()
    serializer_class = AssignmentSerializer

    @action(detail=True, methods=['post'])
    def start_attempt(self, request, pk=None):
        assignment = self.get_object()
        if assignment.status == 'COMPLETED':
            return Response({'error': 'Assignment already completed'}, status=status.HTTP_400_BAD_REQUEST)
        
        attempt = Attempt.objects.create(assignment=assignment)
        assignment.status = 'IN_PROGRESS'
        assignment.save()
        return Response(AttemptSerializer(attempt).data)

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

        # Call the backend runner for deterministic evaluation
        eval_result = evaluate_submission(
            user_id=str(request.user.id),
            question_id=str(question.id),
            participant_query=participant_query,
            solution_query=question.solution_query
        )

        # Persistence
        answer, _ = AttemptAnswer.objects.update_or_create(
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

    @action(detail=False, methods=['post'])
    def run_query(self, request):
        query = request.data.get('query')
        if not query:
            return Response({'error': 'Query required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Simple sandbox execution (uses TOP 100 rewrite internally)
        results, err, duration = execute_query(query, user_id=str(request.user.id))
        
        if err:
            return Response({'error': err, 'duration_ms': duration}, status=status.HTTP_400_BAD_REQUEST)
        
        # Format for frontend grid
        if results:
            columns = list(results[0].keys())
            rows = [list(row.values()) for row in results]
            return Response({
                'columns': columns,
                'rows': rows,
                'execution_time_ms': duration
            })
        
        return Response({'columns': [], 'rows': [], 'execution_time_ms': duration})

class DatabaseConfigViewSet(viewsets.ModelViewSet):
    queryset = DatabaseConfig.objects.all()
    serializer_class = DatabaseConfigSerializer
