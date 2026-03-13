
from django.conf import settings
from django.contrib import admin
from django.urls import path, include
from lti.views import lti_jwks_view

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/', include('api.urls')),
    path('lti/', include('lti.urls')),
    path('.well-known/jwks.json', lti_jwks_view, name='lti-jwks'),
]

# OIDC / Enterprise SSO routes — only mounted when QB_USE_SSO=true.
# Requires mozilla-django-oidc installed and OIDC_* env vars configured.
if getattr(settings, "USE_ENTERPRISE_SSO", False):
    urlpatterns += [
        path("oidc/", include("mozilla_django_oidc.urls")),
    ]
