import { useEffect, useRef, useState } from "react";
import { TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "./MapTiles.css";

// Direct browser requests retain normal HTTP caching and OSM attribution.
// Send only the app origin: confirmation paths and tokens must never become a Referer.
export default function MapTiles() {
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (notice.current) {
      L.DomEvent.disableClickPropagation(notice.current);
      L.DomEvent.disableScrollPropagation(notice.current);
    }
  }, [failed]);
  return <>
    <TileLayer
      key={revision}
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      referrerPolicy="origin"
      eventHandlers={{ tileerror: () => setFailed(true) }}
    />
    {failed && <div ref={notice} className="map-tile-notice" role="status">
      <strong>Map background unavailable</strong>
      <span>Reports and location controls still work. You can also enter coordinates when reporting.</span>
      <button type="button" onClick={() => { setFailed(false); setRevision(value => value + 1); }}>Retry map background</button>
    </div>}
  </>;
}

export function ResponsiveMap() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    let frame = 0;
    let width = -1, height = -1;
    const updateSize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const size = container.getBoundingClientRect();
        if (!size.width || !size.height || (size.width === width && size.height === height)) return;
        width = size.width; height = size.height;
        map.invalidateSize({ animate: false, debounceMoveend: true });
      });
    };
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    updateSize();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [map]);
  return null;
}
