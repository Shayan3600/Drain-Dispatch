import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { categories, statuses, type Incident } from "./types";
import { cityIssueColors, cityMarkerStyle, countForeground } from "./cityMapStyle";

export interface ReviewBounds { south: number; north: number; west: number; east: number }
export function insideReviewBounds(incident: Incident, bounds: ReviewBounds) {
  const longitude = ((incident.longitude + 180) % 360 + 360) % 360 - 180;
  const west = ((bounds.west + 180) % 360 + 360) % 360 - 180;
  const east = ((bounds.east + 180) % 360 + 360) % 360 - 180;
  return incident.latitude >= bounds.south && incident.latitude <= bounds.north &&
    (bounds.east - bounds.west >= 360 || (west <= east ? longitude >= west && longitude <= east : longitude >= west || longitude <= east));
}
function Controls({ incidents, selected, onBounds }: { incidents: Incident[]; selected?: Incident; onBounds: (bounds: ReviewBounds) => void }) {
  const map = useMap();
  const fitted = useRef(false);
  const tools = useRef<HTMLDivElement>(null);
  function reportBounds() { const bounds = map.getBounds(); onBounds({south: bounds.getSouth(), north: bounds.getNorth(), west: bounds.getWest(), east: bounds.getEast()}); }
  function fit() { if (incidents.length) map.fitBounds(L.latLngBounds(incidents.map(item => [item.latitude, item.longitude] as [number, number])), {padding:[35,35],maxZoom:16,animate:false}); }
  useMapEvents({ moveend: reportBounds, resize: reportBounds });
  useEffect(() => { if (!fitted.current && incidents.length) { fitted.current = true; fit(); } }, [incidents]);
  useEffect(() => { if (selected) map.setView([selected.latitude,selected.longitude], Math.max(map.getZoom(),15), {animate:false}); }, [selected?.id]);
  useEffect(() => { map.invalidateSize(); reportBounds(); }, [map]);
  useEffect(() => { if (tools.current) { L.DomEvent.disableClickPropagation(tools.current); L.DomEvent.disableScrollPropagation(tools.current); } }, []);
  return <div ref={tools} className="cr-map-tools"><button className="cr-button" disabled={!incidents.length} onClick={fit}>Fit filtered reports</button><button className="cr-button" disabled={!selected} onClick={() => { if (selected) map.setView([selected.latitude,selected.longitude],16,{animate:false}); }}>Focus selected report</button></div>;
}
export default function CityReviewMap({ incidents, selected, onSelect, onBounds }: {
  incidents: Incident[]; selected?: Incident; onSelect: (incident: Incident) => void; onBounds: (bounds: ReviewBounds) => void;
}) {
  return <div className="cr-city-map">
    <MapContainer center={[35.9132,-79.0558]} zoom={14} scrollWheelZoom={false}>
      {/* OSM requires a Referer. Send only the origin, never report paths or query parameters. */}
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" referrerPolicy="origin" />
      <Controls incidents={incidents} selected={selected} onBounds={onBounds} />
      {incidents.map(item => {
        const style = cityMarkerStyle(item);
        const label = `${categories[item.issueType]} · ${style.count} submission${style.count===1 ? "" : "s"} · ${statuses[item.status]}`;
        return <Marker key={item.id} position={[item.latitude,item.longitude]} title={label} alt={label} eventHandlers={{click:() => onSelect(item)}} icon={L.divIcon({className:"",html:`<span class="map-pin ${item.id === selected?.id ? "chosen" : ""} ${item.status === "closed" ? "cr-pin-closed" : ""}" data-band="${style.band}" data-submissions="${style.count}" style="--pin:${style.color};--pin-ink:${style.foreground}"><span>${style.count>99 ? "99+" : style.count}</span></span>`,iconSize:[34,40],iconAnchor:[17,38]})}>
          <Popup><strong>{categories[item.issueType]}</strong><p>{item.description}</p><p>{style.count} submission{style.count===1 ? "" : "s"} (not unique people)</p><p>{statuses[item.status]}{item.isDemo ? " · DEMO / TEST" : ""}</p><button className="popup-button" onClick={() => onSelect(item)}>Review evidence</button></Popup>
        </Marker>;
      })}
    </MapContainer>
    <div className="cr-map-legend" aria-label="Map legend">
      <div className="cr-legend-categories">{Object.entries(categories).map(([category,label])=><div className="cr-legend-category" key={category}>
        <strong>{label}</strong><div className="cr-shade-scale" aria-label={`${label}: 1 to 5 or more submissions`}>{cityIssueColors[category as Incident["issueType"]].map((shade,index)=><span className="cr-legend-shade" key={shade} style={{backgroundColor:shade,color:countForeground(shade)}} title={`${index===4 ? "5 or more" : index+1} submissions`}>{index===4 ? "5+" : index+1}</span>)}</div>
      </div>)}</div>
      <p className="cr-legend-notes">Darker = more submissions, not severity or unique people. 5+ shares the darkest shade. Dashed border = closed community report. Ring = selected report.</p>
    </div>
  </div>;
}
