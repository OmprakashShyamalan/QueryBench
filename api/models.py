
from django.db import models
from django.contrib.auth.models import User


class DatabaseConfig(models.Model):
    PROVIDER_CHOICES = [
        ('SQL_SERVER', 'SQL Server'),
        ('POSTGRES', 'PostgreSQL'),
        ('SQLITE', 'SQLite'),
    ]
    config_name = models.CharField(max_length=100)
    host = models.CharField(max_length=255)
    port = models.IntegerField(default=1433)
    database_name = models.CharField(max_length=128)
    trusted_connection = models.BooleanField(default=False)
    username = models.CharField(max_length=128, blank=True, default='')
    password_secret_ref = models.CharField(max_length=255, blank=True, default='')
    provider = models.CharField(max_length=50, choices=PROVIDER_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'database_configs'

    def __str__(self):
        return f"{self.config_name} ({self.database_name})"


class Question(models.Model):
    DIFFICULTY_CHOICES = [
        ('EASY', 'Easy'),
        ('MEDIUM', 'Medium'),
        ('HARD', 'Hard'),
    ]
    title = models.CharField(max_length=255)
    prompt = models.TextField()
    difficulty = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES)
    tags = models.JSONField(default=list, blank=True)
    expected_schema_ref = models.CharField(max_length=255, null=True, blank=True)
    solution_query = models.TextField()
    is_validated = models.BooleanField(default=False)
    order_sensitive = models.BooleanField(
        default=False,
        help_text="When True, participant result row order must match the solution exactly.",
    )
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'questions'

    def __str__(self):
        return self.title


class Assessment(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    duration_minutes = models.IntegerField(default=60)
    attempts_allowed = models.IntegerField(default=1)
    db_config = models.ForeignKey(DatabaseConfig, on_delete=models.PROTECT)
    questions = models.ManyToManyField(Question, through='AssessmentQuestion')
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'assessments'

    def __str__(self):
        return self.name


class AssessmentQuestion(models.Model):
    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE)
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    sort_order = models.IntegerField(default=0)
    weight = models.DecimalField(max_digits=5, decimal_places=2, default=1.0)

    class Meta:
        db_table = 'assessment_questions'
        unique_together = ('assessment', 'question')
        ordering = ['sort_order']


class Assignment(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
        ('EXPIRED', 'Expired'),
    ]
    assessment = models.ForeignKey(Assessment, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    due_date = models.DateTimeField()
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'assignments'


class Attempt(models.Model):
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name='attempts')
    started_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    review_notes = models.TextField(blank=True)
    is_session_closed = models.BooleanField(
        default=False,
        help_text="True when the participant closed the tab mid-attempt. Prevents resuming.",
    )

    class Meta:
        db_table = 'attempts'


class AttemptAnswer(models.Model):
    STATUS_CHOICES = [
        ('CORRECT', 'Correct'),
        ('INCORRECT', 'Incorrect'),
        ('NOT_ATTEMPTED', 'Not Attempted'),
    ]
    attempt = models.ForeignKey(Attempt, on_delete=models.CASCADE, related_name='answers')
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    participant_query = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='NOT_ATTEMPTED')
    execution_time_ms = models.IntegerField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    feedback = models.TextField(blank=True)

    class Meta:
        db_table = 'attempt_answers'
