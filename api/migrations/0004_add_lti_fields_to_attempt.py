from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('lti', '0001_initial'),
        ('api', '0003_add_best_result_tracking'),
    ]

    operations = [
        migrations.AddField(
            model_name='attempt',
            name='source',
            field=models.CharField(
                choices=[('standalone', 'Standalone'), ('lms', 'LMS')],
                default='standalone',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='attempt',
            name='lms_provider',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to='lti.lmsprovider',
            ),
        ),
        migrations.AddField(
            model_name='attempt',
            name='lms_assignment_id',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='attempt',
            name='lti_context_id',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='attempt',
            name='lti_user_id',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='attempt',
            name='lti_resource_link_id',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='attempt',
            name='lti_ags_endpoint',
            field=models.CharField(blank=True, default='', max_length=500),
        ),
        migrations.AddField(
            model_name='attempt',
            name='lti_lineitem',
            field=models.CharField(blank=True, default='', max_length=500),
        ),
        migrations.AddField(
            model_name='attempt',
            name='lti_ags_scope',
            field=models.TextField(blank=True, default=''),
        ),
    ]
