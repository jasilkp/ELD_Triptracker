from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta
from typing import Dict, List, Tuple
from zoneinfo import ZoneInfo

from timezonefinder import TimezoneFinder

STATUS_OFF_DUTY = "off_duty"
STATUS_SLEEPER = "sleeper_berth"
STATUS_DRIVING = "driving"
STATUS_ON_DUTY = "on_duty_not_driving"

FUEL_EVERY_MILES = 1000.0
FUEL_DURATION_HOURS = 0.5
BREAK_AFTER_HOURS = 8.0
BREAK_DURATION_HOURS = 0.5
PICKUP_DURATION_HOURS = 1.0
DROPOFF_DURATION_HOURS = 1.0
DAILY_DRIVING_LIMIT = 11.0
DAILY_WINDOW_LIMIT = 14.0
SHIFT_REST_HOURS = 10.0
CYCLE_LIMIT_HOURS = 70.0
CYCLE_RESET_HOURS = 34.0

EPSILON = 1e-6


def _hour_float(dt: datetime) -> float:
    return dt.hour + (dt.minute / 60.0) + (dt.second / 3600.0)


_tz_finder = TimezoneFinder()


def _get_timezone(lat: float, lng: float) -> ZoneInfo:
    tz_name = _tz_finder.timezone_at(lat=lat, lng=lng)
    if not tz_name:
        tz_name = "UTC"
    return ZoneInfo(tz_name)


def _start_of_day(dt: datetime) -> datetime:
    return datetime.combine(dt.date(), time(0, 0), tzinfo=dt.tzinfo)


@dataclass
class DriverInfo:
    driver_name: str
    carrier_name: str
    vehicle_number: str
    main_office_address: str
    co_driver: str


class LogBuilder:
    def __init__(self, driver_info: DriverInfo, tz: ZoneInfo):
        self.driver_info = driver_info
        self.tz = tz
        self.logs: Dict[str, Dict] = {}

    def _get_log(self, day: datetime) -> Dict:
        key = day.strftime("%Y-%m-%d")
        if key not in self.logs:
            self.logs[key] = {
                "date": key,
                "driver_name": self.driver_info.driver_name,
                "carrier_name": self.driver_info.carrier_name,
                "vehicle_number": self.driver_info.vehicle_number,
                "main_office_address": self.driver_info.main_office_address,
                "co_driver": self.driver_info.co_driver,
                "total_miles": 0.0,
                "segments": [],
                "remarks": [],
                "total_hours": {
                    STATUS_OFF_DUTY: 0.0,
                    STATUS_SLEEPER: 0.0,
                    STATUS_DRIVING: 0.0,
                    STATUS_ON_DUTY: 0.0,
                },
            }
        return self.logs[key]

    def add_segment(self, status: str, start: datetime, end: datetime, miles: float = 0.0) -> None:
        if end <= start:
            return
        total_hours = (end - start).total_seconds() / 3600.0
        remaining_start = start
        remaining_end = end

        while remaining_start < remaining_end:
            day_end = _start_of_day(remaining_start) + timedelta(days=1)
            segment_end = min(remaining_end, day_end)
            segment_hours = (segment_end - remaining_start).total_seconds() / 3600.0

            log = self._get_log(remaining_start)
            start_hour = _hour_float(remaining_start)
            if segment_end == day_end:
                end_hour = 24.0
            else:
                end_hour = _hour_float(segment_end)

            log["segments"].append(
                {
                    "status": status,
                    "start_hour": round(start_hour, 2),
                    "end_hour": round(end_hour, 2),
                }
            )

            log["total_hours"][status] += segment_hours
            if status == STATUS_DRIVING and miles > 0.0 and total_hours > 0.0:
                proportion = segment_hours / total_hours
                log["total_miles"] += miles * proportion

            remaining_start = segment_end

    def add_remark(self, when: datetime, location: str, note: str) -> None:
        log = self._get_log(when)
        log["remarks"].append(
            {
                "time": when.strftime("%H:%M"),
                "location": location,
                "note": note,
            }
        )

    def as_list(self) -> List[Dict]:
        logs = []
        for key in sorted(self.logs.keys()):
            log = self.logs[key]
            for status in log["total_hours"]:
                log["total_hours"][status] = round(log["total_hours"][status], 2)
            log["total_miles"] = round(log["total_miles"], 1)
            logs.append(log)
        return logs


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    from math import asin, cos, radians, sin, sqrt

    r = 3958.8
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    c = 2 * asin(sqrt(a))
    return r * c


def _build_distance_index(polyline: List[List[float]]) -> List[float]:
    cumulative = [0.0]
    total = 0.0
    for idx in range(1, len(polyline)):
        lat1, lng1 = polyline[idx - 1]
        lat2, lng2 = polyline[idx]
        total += _haversine_miles(lat1, lng1, lat2, lng2)
        cumulative.append(total)
    return cumulative


def _interpolate_point(polyline: List[List[float]], distances: List[float], target: float) -> Tuple[float, float]:
    if not polyline:
        return 0.0, 0.0
    if target <= 0:
        return polyline[0][0], polyline[0][1]
    if target >= distances[-1]:
        return polyline[-1][0], polyline[-1][1]

    for idx in range(1, len(distances)):
        if distances[idx] >= target:
            prev_dist = distances[idx - 1]
            next_dist = distances[idx]
            ratio = (target - prev_dist) / max(next_dist - prev_dist, EPSILON)
            lat1, lng1 = polyline[idx - 1]
            lat2, lng2 = polyline[idx]
            lat = lat1 + (lat2 - lat1) * ratio
            lng = lng1 + (lng2 - lng1) * ratio
            return lat, lng
    return polyline[-1][0], polyline[-1][1]


def plan_trip(route: Dict, request_data: Dict) -> Dict:
    current = route["current"]
    pickup = route["pickup"]
    dropoff = route["dropoff"]

    tz = _get_timezone(current["lat"], current["lng"])
    now = datetime.now(tz)
    start_time = datetime.combine(now.date(), time(6, 0), tzinfo=tz)

    driver_info = DriverInfo(
        driver_name=request_data.get("driver_name", ""),
        carrier_name=request_data.get("carrier_name", ""),
        vehicle_number=request_data.get("vehicle_number", ""),
        main_office_address=request_data.get("main_office_address", ""),
        co_driver=request_data.get("co_driver", ""),
    )

    log_builder = LogBuilder(driver_info, tz)

    day_start = _start_of_day(start_time)
    if start_time > day_start:
        log_builder.add_segment(STATUS_OFF_DUTY, day_start, start_time)

    log_builder.add_remark(start_time, current["label"], "Start shift")

    polyline = route.get("geometry", [])
    distance_index = _build_distance_index(polyline)

    stops: List[Dict] = []
    markers: List[Dict] = []

    current_time = start_time
    distance_traveled = 0.0
    distance_since_fuel = 0.0
    driving_since_break = 0.0
    daily_driving_used = 0.0
    shift_elapsed = 0.0
    cycle_used = float(request_data.get("current_cycle_used", 0.0))

    total_distance = max(route.get("total_distance_miles", 0.0), EPSILON)
    total_duration = max(route.get("total_duration_hours", 0.0), EPSILON)
    average_speed = total_distance / total_duration

    current_label = current["label"]
    current_coord = (current["lat"], current["lng"])

    def add_marker(stop_type: str, location: str, coord: Tuple[float, float], arrival: datetime, departure: datetime, duration: float, notes: str) -> None:
        markers.append(
            {
                "type": stop_type,
                "location": location,
                "arrival_time": arrival.isoformat(),
                "departure_time": departure.isoformat(),
                "duration_hours": round(duration, 2),
                "notes": notes,
                "coordinates": {"lat": coord[0], "lng": coord[1]},
            }
        )

    def add_stop(stop_type: str, location: str, coord: Tuple[float, float], duration_hours: float, notes: str) -> None:
        nonlocal current_time
        arrival = current_time
        departure = current_time + timedelta(hours=duration_hours)
        stops.append(
            {
                "type": stop_type,
                "location": location,
                "arrival_time": arrival.isoformat(),
                "departure_time": departure.isoformat(),
                "duration_hours": round(duration_hours, 2),
                "notes": notes,
            }
        )
        add_marker(stop_type, location, coord, arrival, departure, duration_hours, notes)
        current_time = departure

    def ensure_cycle_available(required_hours: float) -> None:
        nonlocal cycle_used
        if cycle_used + required_hours <= CYCLE_LIMIT_HOURS:
            return
        take_rest(CYCLE_RESET_HOURS, "34-hour reset for 70-hour cycle")
        cycle_used = 0.0

    def take_rest(hours: float, note: str) -> None:
        nonlocal current_time, shift_elapsed, daily_driving_used, driving_since_break
        arrival = current_time
        departure = current_time + timedelta(hours=hours)
        stops.append(
            {
                "type": "rest",
                "location": current_label,
                "arrival_time": arrival.isoformat(),
                "departure_time": departure.isoformat(),
                "duration_hours": round(hours, 2),
                "notes": note,
            }
        )
        add_marker("rest", current_label, current_coord, arrival, departure, hours, note)
        log_builder.add_segment(STATUS_OFF_DUTY, arrival, departure)
        current_time = departure
        shift_elapsed = 0.0
        daily_driving_used = 0.0
        driving_since_break = 0.0
        log_builder.add_remark(current_time, current_label, "Start shift")

    def add_on_duty_stop(stop_type: str, duration: float, note: str, location: str, coord: Tuple[float, float], reset_fuel: bool = False) -> None:
        nonlocal current_time, shift_elapsed, cycle_used, driving_since_break, distance_since_fuel
        ensure_cycle_available(duration)
        arrival = current_time
        departure = current_time + timedelta(hours=duration)
        stops.append(
            {
                "type": stop_type,
                "location": location,
                "arrival_time": arrival.isoformat(),
                "departure_time": departure.isoformat(),
                "duration_hours": round(duration, 2),
                "notes": note,
            }
        )
        add_marker(stop_type, location, coord, arrival, departure, duration, note)
        log_builder.add_segment(STATUS_ON_DUTY, arrival, departure)
        log_builder.add_remark(arrival, location, note)
        current_time = departure
        shift_elapsed += duration
        cycle_used += duration
        if duration >= BREAK_DURATION_HOURS:
            driving_since_break = 0.0
        if reset_fuel:
            distance_since_fuel = 0.0

    def drive_hours(hours: float) -> None:
        nonlocal current_time, distance_traveled, distance_since_fuel, driving_since_break
        nonlocal daily_driving_used, shift_elapsed, cycle_used
        ensure_cycle_available(hours)
        start = current_time
        end = current_time + timedelta(hours=hours)
        miles = hours * average_speed
        log_builder.add_segment(STATUS_DRIVING, start, end, miles=miles)
        current_time = end
        distance_traveled += miles
        distance_since_fuel += miles
        driving_since_break += hours
        daily_driving_used += hours
        shift_elapsed += hours
        cycle_used += hours

    def handle_leg(leg_distance: float, leg_hours: float, destination_type: str, destination_label: str, destination_coord: Tuple[float, float], stop_duration: float) -> None:
        nonlocal current_label, current_coord
        remaining_distance = leg_distance
        remaining_hours = leg_hours

        while remaining_hours > EPSILON:
            available_driving = min(DAILY_DRIVING_LIMIT - daily_driving_used, DAILY_WINDOW_LIMIT - shift_elapsed)
            if available_driving <= EPSILON:
                take_rest(SHIFT_REST_HOURS, "10-hour off-duty reset")
                continue

            break_due = max(BREAK_AFTER_HOURS - driving_since_break, 0.0)
            fuel_due_hours = max((FUEL_EVERY_MILES - distance_since_fuel) / average_speed, 0.0)

            drive_chunk = min(remaining_hours, available_driving, break_due, fuel_due_hours)
            if drive_chunk <= EPSILON:
                if break_due <= EPSILON:
                    location = f"En route (mile {round(distance_traveled, 1)})"
                    coord = _interpolate_point(polyline, distance_index, distance_traveled)
                    add_on_duty_stop("break", BREAK_DURATION_HOURS, "30-minute break", location, coord)
                    continue
                if fuel_due_hours <= EPSILON:
                    location = f"En route (mile {round(distance_traveled, 1)})"
                    coord = _interpolate_point(polyline, distance_index, distance_traveled)
                    add_on_duty_stop("fuel", FUEL_DURATION_HOURS, "Fuel stop", location, coord, reset_fuel=True)
                    continue
                take_rest(SHIFT_REST_HOURS, "10-hour off-duty reset")
                continue

            drive_hours(drive_chunk)
            remaining_hours -= drive_chunk
            remaining_distance -= drive_chunk * average_speed

            if remaining_hours <= EPSILON:
                break

            if driving_since_break >= BREAK_AFTER_HOURS - EPSILON:
                location = f"En route (mile {round(distance_traveled, 1)})"
                coord = _interpolate_point(polyline, distance_index, distance_traveled)
                add_on_duty_stop("break", BREAK_DURATION_HOURS, "30-minute break", location, coord)
                continue

            if distance_since_fuel >= FUEL_EVERY_MILES - EPSILON:
                location = f"En route (mile {round(distance_traveled, 1)})"
                coord = _interpolate_point(polyline, distance_index, distance_traveled)
                add_on_duty_stop("fuel", FUEL_DURATION_HOURS, "Fuel stop", location, coord, reset_fuel=True)
                continue

            if daily_driving_used >= DAILY_DRIVING_LIMIT - EPSILON or shift_elapsed >= DAILY_WINDOW_LIMIT - EPSILON:
                take_rest(SHIFT_REST_HOURS, "10-hour off-duty reset")
                continue

        add_on_duty_stop(destination_type, stop_duration, f"1 hour {destination_type} stop", destination_label, destination_coord)
        current_label = destination_label
        current_coord = destination_coord

    legs = route.get("legs", [])
    if len(legs) >= 1:
        handle_leg(
            legs[0]["distance_miles"],
            legs[0]["duration_hours"],
            "pickup",
            pickup["label"],
            (pickup["lat"], pickup["lng"]),
            PICKUP_DURATION_HOURS,
        )
    if len(legs) >= 2:
        handle_leg(
            legs[1]["distance_miles"],
            legs[1]["duration_hours"],
            "dropoff",
            dropoff["label"],
            (dropoff["lat"], dropoff["lng"]),
            DROPOFF_DURATION_HOURS,
        )

    route_info = {
        "polyline": polyline,
        "markers": markers,
        "current": {"label": current["label"], "coordinates": {"lat": current["lat"], "lng": current["lng"]}},
        "pickup": {"label": pickup["label"], "coordinates": {"lat": pickup["lat"], "lng": pickup["lng"]}},
        "dropoff": {"label": dropoff["label"], "coordinates": {"lat": dropoff["lat"], "lng": dropoff["lng"]}},
    }

    return {
        "stops": stops,
        "log_sheets": log_builder.as_list(),
        "route": route_info,
    }
