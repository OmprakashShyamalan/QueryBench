# Generated migration to add best result tracking to AttemptAnswer

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0002_add_schema_fields_to_databaseconfig'),
    ]

    operations = [
        migrations.AddField(
            model_name='attemptanswer',
            name='best_status',
            field=models.CharField(
                blank=True,
                choices=[('CORRECT', 'Correct'), ('INCORRECT', 'Incorrect'), ('NOT_ATTEMPTED', 'Not Attempted')],
                default='',
                help_text='Best status achieved across all attempts for this question',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='attemptanswer',
            name='best_query',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Query that achieved the best result',
            ),
        ),
        migrations.AddField(
            model_name='attemptanswer',
            name='best_execution_time_ms',
            field=models.IntegerField(
                blank=True,
                help_text='Execution time of the best result in milliseconds',
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='attemptanswer',
            name='best_achieved_at',
            field=models.DateTimeField(
                blank=True,
                help_text='Timestamp when the best result was achieved',
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='attemptanswer',
            name='attempt_count',
            field=models.IntegerField(
                default=0,
                help_text='Number of times the participant has attempted this question',
            ),
        ),
    ]
