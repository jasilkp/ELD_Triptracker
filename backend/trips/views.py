import requests
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import APIView

from .hos_calculator import plan_trip
from .models import TripHistory
from .routing import build_route, geocode_suggestions
from .serializers import TripPlanRequestSerializer


def _api_error(detail: str, code: int):
    return Response({"detail": detail}, status=code)


class TripPlanView(APIView):
    def post(self, request):
        serializer = TripPlanRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "detail": "Please correct the highlighted fields and try again.",
                    "errors": serializer.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        payload = serializer.validated_data

        try:
            route = build_route(
                payload["current_location"],
                payload["pickup_location"],
                payload["dropoff_location"],
            )
            plan = plan_trip(route, payload)
        except ValueError as exc:
            return _api_error(str(exc), status.HTTP_400_BAD_REQUEST)
        except requests.Timeout:
            return _api_error("Routing service timed out. Please try again.", status.HTTP_504_GATEWAY_TIMEOUT)
        except requests.RequestException:
            return _api_error("Routing provider error. Please try again.", status.HTTP_502_BAD_GATEWAY)

        response = {
            "total_distance_miles": route["total_distance_miles"],
            "total_duration_hours": route["total_duration_hours"],
            "stops": plan["stops"],
            "log_sheets": plan["log_sheets"],
            "route": plan["route"],
        }

        TripHistory.objects.create(
            current_location=payload["current_location"],
            pickup_location=payload["pickup_location"],
            dropoff_location=payload["dropoff_location"],
            driver_name=payload.get("driver_name", ""),
            total_distance_miles=route["total_distance_miles"],
            total_duration_hours=route["total_duration_hours"],
            stops_count=len(plan["stops"]),
        )

        return Response(response, status=status.HTTP_200_OK)


class TripSuggestView(APIView):
    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if len(query) < 3:
            return Response({"suggestions": []}, status=status.HTTP_200_OK)
        try:
            suggestions = geocode_suggestions(query)
        except ValueError as exc:
            return _api_error(str(exc), status.HTTP_400_BAD_REQUEST)
        except requests.Timeout:
            return _api_error("Suggestion lookup timed out.", status.HTTP_504_GATEWAY_TIMEOUT)
        except requests.RequestException:
            suggestions = []
        return Response({"suggestions": suggestions}, status=status.HTTP_200_OK)


class TripHistoryView(APIView):
    def get(self, request):
        raw_limit = request.query_params.get("limit", "10")
        try:
            limit = max(1, min(int(raw_limit), 50))
        except ValueError:
            limit = 10

        rows = TripHistory.objects.all()[:limit]
        history = [
            {
                "id": row.id,
                "created_at": row.created_at.isoformat(),
                "current_location": row.current_location,
                "pickup_location": row.pickup_location,
                "dropoff_location": row.dropoff_location,
                "driver_name": row.driver_name,
                "total_distance_miles": row.total_distance_miles,
                "total_duration_hours": row.total_duration_hours,
                "stops_count": row.stops_count,
            }
            for row in rows
        ]
        return Response({"count": len(history), "results": history}, status=status.HTTP_200_OK)


@api_view(["GET"])
def api_root(request):
    return Response(
        {
            "status": "ok",
            "message": "ELD Trip Planner API",
            "endpoints": {
                "plan": "/api/trip/plan/",
                "suggest": "/api/trip/suggest/",
                "history": "/api/trip/history/",
            },
        },
        status=status.HTTP_200_OK,
    )
