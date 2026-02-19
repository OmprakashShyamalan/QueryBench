
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import *

router = DefaultRouter()
router.register(r'questions', QuestionViewSet)
router.register(r'assessments', AssessmentViewSet)
router.register(r'assignments', AssignmentViewSet)
router.register(r'attempts', AttemptViewSet)
router.register(r'configs', DatabaseConfigViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
