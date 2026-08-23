from django.contrib import admin
from django.urls import include, path

from trips.views import (
    TripHistoryView,
    TripPlanView,
    TripSuggestView,
    api_root,
    health_check,
)

urlpatterns = [
    path("", api_root),
    path("health/", health_check, name="root-health"),
    path("api/", api_root),
    path("api/health/", health_check, name="api-health"),
    path("admin/", admin.site.urls),
    path("api/trip/", include("trips.urls")),
    path("api/suggest/", TripSuggestView.as_view(), name="direct-suggest"),
    path("api/plan/", TripPlanView.as_view(), name="direct-plan"),
    path("api/history/", TripHistoryView.as_view(), name="direct-history"),
]

