
from django.conf import settings
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/', include('api.urls')),
]

# OIDC / Enterprise SSO routes — only mounted when QB_USE_SSO=true.
# Requires mozilla-django-oidc installed and OIDC_* env vars configured.
if getattr(settings, "USE_ENTERPRISE_SSO", False):
    urlpatterns += [
        path("oidc/", include("mozilla_django_oidc.urls")),
    ]
