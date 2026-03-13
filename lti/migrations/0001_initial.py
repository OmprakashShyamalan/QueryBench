from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('api', '0003_add_best_result_tracking'),
    ]

    operations = [
        migrations.CreateModel(
            name='LmsProvider',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('issuer', models.CharField(max_length=255)),
                ('client_id', models.CharField(max_length=255)),
                ('auth_url', models.URLField(max_length=500)),
                ('token_url', models.URLField(max_length=500)),
                ('keyset_url', models.URLField(max_length=500)),
                ('deployment_id', models.CharField(max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'lms_provider',
                'unique_together': {('issuer', 'client_id', 'deployment_id')},
            },
        ),
        migrations.CreateModel(
            name='LtiNonce',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('issuer', models.CharField(max_length=255)),
                ('nonce', models.CharField(max_length=255)),
                ('expires_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'db_table': 'lti_nonce',
                'unique_together': {('issuer', 'nonce')},
            },
        ),
        migrations.CreateModel(
            name='LmsAssessmentMapping',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('lms_course_id', models.CharField(max_length=255)),
                ('lms_assignment_id', models.CharField(max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('provider', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assessment_mappings', to='lti.lmsprovider')),
                ('querybench_assessment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lms_mappings', to='api.assessment')),
            ],
            options={
                'db_table': 'lms_assessment_mapping',
                'unique_together': {('provider', 'lms_course_id', 'lms_assignment_id')},
            },
        ),
    ]
