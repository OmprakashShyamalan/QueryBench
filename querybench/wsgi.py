import os
from django.core.wsgi import get_wsgi_application  # type: ignore[import-not-found]

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'querybench.settings')

application = get_wsgi_application()