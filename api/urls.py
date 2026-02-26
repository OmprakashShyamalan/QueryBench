
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    QuestionViewSet, AssessmentViewSet, AssignmentViewSet,
    AttemptViewSet, DatabaseConfigViewSet,
    login_view, logout_view, me_view,
    results_view, bulk_assign_view,
    users_view, user_detail_view,
    schema_view,
)

router = DefaultRouter()
router.register(r'questions', QuestionViewSet)
router.register(r'assessments', AssessmentViewSet)
router.register(r'assignments', AssignmentViewSet, basename='assignment')
router.register(r'attempts', AttemptViewSet)
router.register(r'configs', DatabaseConfigViewSet)

urlpatterns = [
    # Custom endpoints MUST come before router includes to avoid router's
    # {pk}/ pattern swallowing custom action paths (returns 405).
    path('auth/login/', login_view, name='auth-login'),
    path('auth/logout/', logout_view, name='auth-logout'),
    path('auth/me/', me_view, name='auth-me'),
    path('results/', results_view, name='results'),
    path('schema/', schema_view, name='schema'),
    path('assignments/bulk_assign/', bulk_assign_view, name='bulk-assign'),
    path('users/', users_view, name='users'),
    path('users/<int:pk>/', user_detail_view, name='user-detail'),
    # Router last
    path('', include(router.urls)),
]
