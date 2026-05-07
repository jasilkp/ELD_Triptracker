from django.contrib import admin

from .models import TripHistory


@admin.register(TripHistory)
class TripHistoryAdmin(admin.ModelAdmin):
	list_display = (
		"created_at",
		"driver_name",
		"current_location",
		"pickup_location",
		"dropoff_location",
		"total_distance_miles",
		"total_duration_hours",
		"stops_count",
	)
	search_fields = ("driver_name", "current_location", "pickup_location", "dropoff_location")
	list_filter = ("created_at",)
