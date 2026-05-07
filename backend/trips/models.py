from django.db import models


class TripHistory(models.Model):
	created_at = models.DateTimeField(auto_now_add=True)
	current_location = models.CharField(max_length=255)
	pickup_location = models.CharField(max_length=255)
	dropoff_location = models.CharField(max_length=255)
	driver_name = models.CharField(max_length=120, blank=True)
	total_distance_miles = models.FloatField(default=0)
	total_duration_hours = models.FloatField(default=0)
	stops_count = models.PositiveIntegerField(default=0)

	class Meta:
		ordering = ["-created_at"]

	def __str__(self):
		return f"{self.pickup_location} -> {self.dropoff_location} ({self.created_at:%Y-%m-%d %H:%M})"
