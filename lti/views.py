import logging

from django.contrib.auth import login
from django.http import JsonResponse, HttpResponseRedirect
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from api.models import Attempt
from .services import (
    LtiValidationError,
    enforce_https_for_lti,
    get_tool_jwks,
    process_lti_launch,
    submit_grade_for_attempt,
)

logger = logging.getLogger("querybench.lti")


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def lti_launch_view(request):
    try:
        enforce_https_for_lti(request)
        logger.info("LTI launch received")

        id_token = request.data.get("id_token") or request.POST.get("id_token")
        launch = process_lti_launch(id_token)

        logger.info("JWT validated")
        logger.info("user provisioned")
        logger.info("assessment mapped")
        logger.info("session created")

        login(request, launch.user, backend="django.contrib.auth.backends.ModelBackend")

        redirect_url = f"/?launch_assignment_id={launch.assignment.id}&launch_attempt_id={launch.attempt.id}"
        return HttpResponseRedirect(redirect_url)
    except LtiValidationError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception:
        logger.exception("LTI launch failed")
        return Response({"error": "LTI launch failed."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET"])
@permission_classes([AllowAny])
def lti_jwks_view(request):
    return JsonResponse(get_tool_jwks())


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def lti_submit_grade_view(request):
    try:
        session_id = request.data.get("session_id")
        score = float(request.data.get("score"))
        max_score = float(request.data.get("max_score"))
    except (TypeError, ValueError):
        return Response(
            {"error": "session_id, score and max_score are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        attempt = Attempt.objects.select_related("lms_provider", "assignment__user").get(pk=session_id)
    except Attempt.DoesNotExist:
        return Response({"error": "Session not found."}, status=status.HTTP_404_NOT_FOUND)

    if not request.user.is_staff and attempt.assignment.user_id != request.user.id:
        return Response({"error": "Forbidden."}, status=status.HTTP_403_FORBIDDEN)

    try:
        enforce_https_for_lti(request)
        result = submit_grade_for_attempt(attempt, score, max_score)
        logger.info("grade returned")
        return Response(result)
    except LtiValidationError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception:
        logger.exception("LTI grade return failed")
        return Response({"error": "Grade return failed."}, status=status.HTTP_502_BAD_GATEWAY)
