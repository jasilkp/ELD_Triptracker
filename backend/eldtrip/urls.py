from django.contrib import admin
from django.urls import include, path

from trips.views import api_root

urlpatterns = [
    path("", api_root),
    path("api/", api_root),
    path("admin/", admin.site.urls),
    path("api/trip/", include("trips.urls")),
]
