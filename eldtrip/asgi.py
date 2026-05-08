import os
import sys
from pathlib import Path

from django.core.asgi import get_asgi_application

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "backend"))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "eldtrip.settings")

application = get_asgi_application()