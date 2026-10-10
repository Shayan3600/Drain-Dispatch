import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import type { Incident } from "./types";
import { categories, statuses } from "./types";
export const center: [number, number] = [35.9132, -79.0558];
function icon(color: string, selected = false) {
  return L.divIcon({
    className: "",
    html: `<span class="map-pin ${selected ? "chosen" : ""}" style="--pin:${color}"><span></span></span>`,
    iconSize: [30, 36],
    iconAnchor: [15, 34],
  });
}
function Controls({
  onPick,
  position,
}: {
  onPick?: (location: [number, number]) => void;
  position?: [number, number];
}) {
  const map = useMap();
  useMapEvents({
    click(event) {
      onPick?.([event.latlng.lat, event.latlng.lng]);
    },
  });
  useEffect(() => {
    if (position) map.panTo(position);
  }, [map, position]);
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 180);
    return () => clearTimeout(id);
  }, [map]);
  return null;
}
export default function DrainMap({
  incidents,
  onSelect,
  onPick,
  position,
  small = false,
}: {
  incidents: Incident[];
  onSelect?: (incident: Incident) => void;
  onPick?: (location: [number, number]) => void;
  position?: [number, number];
  small?: boolean;
}) {
  return (
    <div
      className={`map-frame ${small ? "map-small" : ""}`}
      aria-label={
        onPick
          ? "Select report location on the map"
          : "Map of Chapel Hill drainage incidents"
      }
    >
      <MapContainer
        center={position || center}
        zoom={14}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Controls onPick={onPick} position={position} />
        {incidents.map((incident) => (
          <Marker
            key={incident.id}
            alt={`${categories[incident.issueType]} · ${statuses[incident.status]}`}
            title={`${categories[incident.issueType]} · ${statuses[incident.status]}`}
            position={[incident.latitude, incident.longitude]}
            icon={icon(
              incident.status === "closed"
                ? "#679e62"
                : incident.issueType === "standing_water"
                  ? "#4b94c3"
                  : "#d9923a",
            )}
            eventHandlers={{ click: () => onSelect?.(incident) }}
          >
            <Popup>
              <strong>{categories[incident.issueType]}</strong>
              <p>{incident.description}</p>
              <span>
                {statuses[incident.status]}
                {incident.isDemo ? " · Demo" : ""}
              </span>
              {onSelect && (
                <button
                  className="popup-button"
                  onClick={() => onSelect(incident)}
                >
                  View observations
                </button>
              )}
            </Popup>
          </Marker>
        ))}
        {position && (
          <Marker
            alt="Selected report location"
            title="Selected report location"
            position={position}
            icon={icon("#147e79", true)}
          >
            <Popup>Selected location</Popup>
          </Marker>
        )}
      </MapContainer>
      {onPick && (
        <div className="map-hint">Click the map to place your report</div>
      )}
    </div>
  );
}
