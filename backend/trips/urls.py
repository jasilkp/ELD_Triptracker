from django.urls import path
from .views import TripHistoryView, TripPlanView, TripSuggestView, health_check

urlpatterns = [
    path("health/", health_check, name="trip-health"),
    path("plan/", TripPlanView.as_view(), name="trip-plan"),
    path("suggest/", TripSuggestView.as_view(), name="trip-suggest"),
    path("history/", TripHistoryView.as_view(), name="trip-history"),
]
