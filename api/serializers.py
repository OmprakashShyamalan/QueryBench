
from rest_framework import serializers
from django.contrib.auth.models import User
from .models import DatabaseConfig, Question, Assessment, Assignment, Attempt, AttemptAnswer


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name']


class DatabaseConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = DatabaseConfig
        fields = '__all__'


class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = '__all__'


class AssessmentSerializer(serializers.ModelSerializer):
    questions_count = serializers.IntegerField(source='questions.count', read_only=True)
    db_config_detail = DatabaseConfigSerializer(source='db_config', read_only=True)
    question_ids = serializers.SerializerMethodField()

    def get_question_ids(self, obj):
        return list(obj.questions.values_list('id', flat=True))

    class Meta:
        model = Assessment
        fields = '__all__'


class AssignmentSerializer(serializers.ModelSerializer):
    assessment_name = serializers.CharField(source='assessment.name', read_only=True)
    assessment_detail = AssessmentSerializer(source='assessment', read_only=True)
    user_name = serializers.SerializerMethodField()
    user_email = serializers.SerializerMethodField()

    def get_user_name(self, obj):
        u = obj.user
        return f'{u.first_name} {u.last_name}'.strip() or u.username

    def get_user_email(self, obj):
        return obj.user.email

    class Meta:
        model = Assignment
        fields = '__all__'


class AttemptAnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = AttemptAnswer
        fields = '__all__'


class AttemptSerializer(serializers.ModelSerializer):
    answers = AttemptAnswerSerializer(many=True, read_only=True)

    class Meta:
        model = Attempt
        fields = '__all__'


class ResultSerializer(serializers.ModelSerializer):
    participant_name = serializers.SerializerMethodField()
    participant_email = serializers.SerializerMethodField()
    assessment_name = serializers.SerializerMethodField()
    result_status = serializers.SerializerMethodField()
    submitted_date = serializers.SerializerMethodField()

    def get_participant_name(self, obj):
        u = obj.assignment.user
        return f'{u.first_name} {u.last_name}'.strip() or u.username

    def get_participant_email(self, obj):
        return obj.assignment.user.email

    def get_assessment_name(self, obj):
        return obj.assignment.assessment.name

    def get_result_status(self, obj):
        if obj.score is None:
            return 'PENDING'
        return 'PASSED' if float(obj.score) >= 70 else 'FAILED'

    def get_submitted_date(self, obj):
        if obj.submitted_at:
            return obj.submitted_at.strftime('%Y-%m-%d')
        return None

    class Meta:
        model = Attempt
        fields = ['id', 'participant_name', 'participant_email', 'assessment_name',
                  'score', 'result_status', 'submitted_at', 'submitted_date']
