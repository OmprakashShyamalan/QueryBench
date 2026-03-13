from django.urls import path

from .views import lti_launch_view, lti_submit_grade_view


urlpatterns = [
    path("launch", lti_launch_view, name="lti-launch"),
    path("submit-grade", lti_submit_grade_view, name="lti-submit-grade"),
]
