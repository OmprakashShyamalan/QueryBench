from django.db import models
from django.utils import timezone


class LmsProvider(models.Model):
    name = models.CharField(max_length=100)
    issuer = models.CharField(max_length=255)
    client_id = models.CharField(max_length=255)
    auth_url = models.URLField(max_length=500)
    token_url = models.URLField(max_length=500)
    keyset_url = models.URLField(max_length=500)
    deployment_id = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lms_provider"
        unique_together = ("issuer", "client_id", "deployment_id")

    def __str__(self) -> str:
        return f"{self.name} ({self.issuer})"


class LmsAssessmentMapping(models.Model):
    provider = models.ForeignKey(LmsProvider, on_delete=models.CASCADE, related_name="assessment_mappings")
    lms_course_id = models.CharField(max_length=255)
    lms_assignment_id = models.CharField(max_length=255)
    querybench_assessment = models.ForeignKey("api.Assessment", on_delete=models.CASCADE, related_name="lms_mappings")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lms_assessment_mapping"
        unique_together = ("provider", "lms_course_id", "lms_assignment_id")

    def __str__(self) -> str:
        return f"{self.provider.name}:{self.lms_course_id}:{self.lms_assignment_id}"


class LtiNonce(models.Model):
    issuer = models.CharField(max_length=255)
    nonce = models.CharField(max_length=255)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "lti_nonce"
        unique_together = ("issuer", "nonce")

    @classmethod
    def purge_expired(cls) -> None:
        cls.objects.filter(expires_at__lt=timezone.now()).delete()
