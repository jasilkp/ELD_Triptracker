import os
from typing import Dict, List

import requests
from dotenv import load_dotenv

load_dotenv()

ORS_BASE_URL = "https://api.openrouteservice.org"


def _get_api_key() -> str:
    api_key = os.getenv("OPENROUTESERVICE_API_KEY")
    if not api_key:
        raise ValueError("OPENROUTESERVICE_API_KEY is not set")
    return api_key


def geocode_location(location_text: str) -> Dict[str, float | str]:
    api_key = _get_api_key()
    url = f"{ORS_BASE_URL}/geocode/search"
    params = {"api_key": api_key, "text": location_text}
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException:
        raise ValueError(f"Location lookup failed for '{location_text}'. Please check spelling or select from suggestions.")
    
    features = payload.get("features", [])
    if not features:
        raise ValueError(f"Location '{location_text}' could not be found. Please verify spelling.")
    feature = features[0]
    coords = feature["geometry"]["coordinates"]
    label = feature.get("properties", {}).get("label", location_text)
    return {"label": label, "lng": coords[0], "lat": coords[1]}


def geocode_suggestions(query: str, size: int = 5) -> List[str]:
    api_key = _get_api_key()
    labels: List[str] = []
    url = f"{ORS_BASE_URL}/geocode/search"
    params = {"api_key": api_key, "text": query, "size": size}
    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException:
        return []
    
    features = payload.get("features", [])
    for feature in features:
        label = feature.get("properties", {}).get("label")
        if label and label not in labels:
            labels.append(label)
    return labels


def build_route(current_location: str, pickup_location: str, dropoff_location: str) -> Dict:
    current = geocode_location(current_location)
    pickup = geocode_location(pickup_location)
    dropoff = geocode_location(dropoff_location)

    api_key = _get_api_key()
    url = f"{ORS_BASE_URL}/v2/directions/driving-car/geojson"
    payload = {
        "coordinates": [
            [current["lng"], current["lat"]],
            [pickup["lng"], pickup["lat"]],
            [dropoff["lng"], dropoff["lat"]],
        ],
        "units": "mi",
    }
    try:
        response = requests.post(url, params={"api_key": api_key}, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        err_msg = ""
        if hasattr(exc, "response") and exc.response is not None:
            try:
                err_data = exc.response.json()
                err_msg = err_data.get("error", {}).get("message", "")
            except Exception:
                pass
        if err_msg:
            raise ValueError(f"Could not calculate driving route: {err_msg}")
        raise ValueError(
            "Could not calculate a driving route between these locations. "
            "Please ensure all locations are reachable by road (e.g. within North America)."
        )

    features = data.get("features", [])
    if not features:
        raise ValueError("No route returned from OpenRouteService")

    feature = features[0]
    properties = feature.get("properties", {})
    summary = properties.get("summary", {})
    total_distance_miles = float(summary.get("distance", 0.0))
    total_duration_hours = float(summary.get("duration", 0.0)) / 3600.0

    segments = properties.get("segments", [])
    legs: List[Dict[str, float]] = []
    for segment in segments:
        legs.append(
            {
                "distance_miles": float(segment.get("distance", 0.0)),
                "duration_hours": float(segment.get("duration", 0.0)) / 3600.0,
            }
        )

    geometry = feature.get("geometry", {}).get("coordinates", [])
    polyline = [[coord[1], coord[0]] for coord in geometry]

    return {
        "current": current,
        "pickup": pickup,
        "dropoff": dropoff,
        "legs": legs,
        "geometry": polyline,
        "total_distance_miles": total_distance_miles,
        "total_duration_hours": total_duration_hours,
    }
