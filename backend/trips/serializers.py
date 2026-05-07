from rest_framework import serializers


class TripPlanRequestSerializer(serializers.Serializer):
    current_location = serializers.CharField(max_length=255, trim_whitespace=True)
    pickup_location = serializers.CharField(max_length=255, trim_whitespace=True)
    dropoff_location = serializers.CharField(max_length=255, trim_whitespace=True)
    current_cycle_used = serializers.FloatField(min_value=0, max_value=70)
    driver_name = serializers.CharField(required=False, allow_blank=True, default="")
    carrier_name = serializers.CharField(required=False, allow_blank=True, default="")
    vehicle_number = serializers.CharField(required=False, allow_blank=True, default="")
    main_office_address = serializers.CharField(required=False, allow_blank=True, default="")
    co_driver = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        required_fields = ["current_location", "pickup_location", "dropoff_location"]
        missing = [field for field in required_fields if not attrs.get(field, "").strip()]
        if missing:
            raise serializers.ValidationError({field: "This field is required." for field in missing})
        return attrs


class TripPlanResponseSerializer(serializers.Serializer):
    total_distance_miles = serializers.FloatField()
    total_duration_hours = serializers.FloatField()
    stops = serializers.ListField()
    log_sheets = serializers.ListField()
    route = serializers.DictField()
