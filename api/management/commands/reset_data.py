from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from api.models import AttemptAnswer, Attempt, Assignment, AssessmentQuestion, Assessment, Question, DatabaseConfig


class Command(BaseCommand):
    help = 'Delete all data except admin (staff/superuser) accounts.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--yes',
            action='store_true',
            help='Skip confirmation prompt.',
        )

    def handle(self, *args, **options):
        if not options['yes']:
            confirm = input(
                'This will delete ALL data except admin accounts. Type "yes" to continue: '
            )
            if confirm.strip().lower() != 'yes':
                self.stdout.write(self.style.WARNING('Aborted.'))
                return

        counts = {}

        counts['attempt_answers'] = AttemptAnswer.objects.all().delete()[0]
        counts['attempts'] = Attempt.objects.all().delete()[0]
        counts['assignments'] = Assignment.objects.all().delete()[0]
        counts['assessment_questions'] = AssessmentQuestion.objects.all().delete()[0]
        counts['assessments'] = Assessment.objects.all().delete()[0]
        counts['questions'] = Question.objects.all().delete()[0]
        counts['database_configs'] = DatabaseConfig.objects.all().delete()[0]
        counts['users'] = User.objects.filter(is_staff=False, is_superuser=False).delete()[0]

        self.stdout.write(self.style.SUCCESS('Reset complete:'))
        for table, n in counts.items():
            if n:
                self.stdout.write(f'  {table}: {n} deleted')

        remaining_admins = User.objects.filter(is_staff=True).count()
        self.stdout.write(self.style.SUCCESS(f'  Admin accounts kept: {remaining_admins}'))
