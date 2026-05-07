import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";

const colorMap = {
  current: "#3b82f6",
  pickup: "#22c55e",
  dropoff: "#22c55e",
  rest: "#ef4444",
  fuel: "#f97316",
  break: "#facc15",
  driving: "#3b82f6",
};

const createIcon = (color) =>
  L.divIcon({
    className: "custom-marker",
    html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 6px rgba(0,0,0,0.35)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

export default function MapView({ route }) {
  if (!route?.polyline?.length) {
    return (
      <div className="glass-panel flex h-full items-center justify-center rounded-2xl p-6 text-sm text-steel-200">
        <div className="text-center">
          <svg className="mx-auto mb-4 h-14 w-14 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 003 16.382V5.618a1 1 0 011.553-.894L9 7m0 13l6.553 3.276A1 1 0 0017 20.382V9.618a1 1 0 00-1.553-.894L9 13m6-11.618l5.447-2.724A1 1 0 0122 3.618v10.764a1 1 0 01-1.553.894L15 11" />
          </svg>
          <p className="text-steel-100 font-medium">Route map will appear once a trip is planned</p>
        </div>
      </div>
    );
  }

  const center = route.current?.coordinates
    ? [route.current.coordinates.lat, route.current.coordinates.lng]
    : route.polyline[0];

  const step = Math.max(Math.floor(route.polyline.length / 20), 8);
  const waypointPositions = route.polyline.filter((_, idx) => {
    if (idx === 0 || idx === route.polyline.length - 1) {
      return false;
    }
    return idx % step === 0;
  });

  return (
    <div className="glass-panel h-full rounded-2xl p-3">
      <MapContainer center={center} zoom={6} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={route.polyline} color="#38bdf8" weight={4} />
        {waypointPositions.map((pos, idx) => (
          <Marker key={`waypoint-${idx}`} position={pos} icon={createIcon(colorMap.driving)}>
            <Popup className="map-popup">
              <div className="text-sm">
                <p className="map-popup-title">Driving</p>
                <p className="map-popup-body">En route waypoint</p>
              </div>
            </Popup>
          </Marker>
        ))}
        {route.current?.coordinates && (
          <Marker
            position={[route.current.coordinates.lat, route.current.coordinates.lng]}
            icon={createIcon(colorMap.current)}
          >
            <Popup className="map-popup">
              <div className="text-sm">
                <p className="map-popup-title">Current</p>
                <p className="map-popup-body">{route.current.label}</p>
              </div>
            </Popup>
          </Marker>
        )}
        {route.markers?.map((stop, idx) => (
          <Marker
            key={`${stop.type}-${idx}`}
            position={[stop.coordinates.lat, stop.coordinates.lng]}
            icon={createIcon(colorMap[stop.type] || "#3b82f6")}
          >
            <Popup className="map-popup">
              <div className="text-sm">
                <p className="map-popup-title">{stop.type}</p>
                <p className="map-popup-body">{stop.location}</p>
                <p className="map-popup-body">Arrival: {new Date(stop.arrival_time).toLocaleString()}</p>
                <p className="map-popup-body">Departure: {new Date(stop.departure_time).toLocaleString()}</p>
                <p className="map-popup-body">Duration: {stop.duration_hours} hrs</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
