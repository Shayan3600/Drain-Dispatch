import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import CityReviewMap, { insideReviewBounds, type ReviewBounds } from "./CityReviewMap";
import CitySelect from "./CitySelect";
import CityEvidencePhoto from "./CityEvidencePhoto";
import PacketPreview from "./PacketPreview";
import { api } from "./api";
import { createCityReviewData } from "./cityReviewData";
import { useCityReports } from "./useCityReports";
import { cityIssueColors, cityMarkerStyle } from "./cityMapStyle";
import { categories, statuses, type Incident, type IncidentEvent } from "./types";
import { ArrowDown, ArrowUpRight, FileText, Layers3, MapPin, RefreshCw } from "lucide-react";
import "./city-review.css";
import "./city-clearflow.css";
import "./city-typography.css";

const fontLicenseUrl = new URL("./assets/clearflow/Not-Just-Groovy-LICENSE.txt?no-inline", import.meta.url).href;

function timestamp(value?: string) {
  const time = value ? new Date(value) : undefined;
  return time && Number.isFinite(time.getTime())
    ? time.toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })
    : "Date unavailable";
}
function photoSource(value?: string) {
  if (!value) return undefined;
  try {
    // Uploaded image paths may belong to a separately hosted API.
    const apiOrigin = (import.meta as unknown as { env: Record<string, string> }).env.VITE_API_URL;
    const url = new URL(value, apiOrigin || window.location.origin);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
const eventNames: Record<string, string> = {
  incident_created: "Report created", observation_added: "Observation added", status_changed: "Community status changed",
};

export default function CityReview({ onSignOut }: { onSignOut?: () => void } = {}) {
  const data = useMemo(() => createCityReviewData({ mode:"live",request:api }), []);
  const [detailRevision, setDetailRevision] = useState(0);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("active");
  const [query, setQuery] = useState("");
  const [multiple, setMultiple] = useState(false);
  const [photosOnly, setPhotosOnly] = useState(false);
  const [sort, setSort] = useState("observations");
  const [mapAreaOnly, setMapAreaOnly] = useState(false);
  const [bounds, setBounds] = useState<ReviewBounds>();
  const { incidents, loading, refreshing, error, updatedAt, version, refresh } = useCityReports(data, true);
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<Incident>();
  const [history, setHistory] = useState<IncidentEvent[]>([]);
  const [detailKey, setDetailKey] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailStale, setDetailStale] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const detailIdentity = useRef("");
  const [evidenceUpdatedAt, setEvidenceUpdatedAt] = useState<Date>();

  const filtered = useMemo(() => incidents.filter(item =>
    (category === "all" || item.issueType === category) &&
    (status === "all" || (status === "active" ? item.status !== "closed" : item.status === status)) &&
    (!multiple || item.observationCount >= 2) &&
    (!photosOnly || item.hasPhoto === true) &&
    (!query.trim() || `${item.id} ${item.description} ${categories[item.issueType]}`.toLowerCase().includes(query.trim().toLowerCase())),
  ).sort((a, b) => (sort === "observations" ? b.latestObservationAt ?? b.updatedAt : b.updatedAt).localeCompare(sort === "observations" ? a.latestObservationAt ?? a.updatedAt : a.updatedAt) || a.id.localeCompare(b.id)), [incidents, category, status, multiple, photosOnly, query, sort]);
  const visible = useMemo(() => mapAreaOnly && bounds ? filtered.filter(item => insideReviewBounds(item, bounds)) : filtered, [filtered, mapAreaOnly, bounds]);
  // Panning must not close evidence for a selected report outside the viewport.
  const selected = filtered.find(item => item.id === selectedId);
  const selectionKey = selected ? `database:${selected.id}` : "";

  useEffect(() => {
    if (!selectedId || !selectionKey) return;
    const controller = new AbortController();
    const sameIncident = detailIdentity.current === selectionKey;
    detailIdentity.current = selectionKey;
    if (!sameIncident) { setDetail(undefined); setHistory([]); setEvidenceUpdatedAt(undefined); setDetailStale(false); }
    setDetailKey(selectionKey);
    setDetailLoading(true); setDetailError(""); setHistoryError("");
    setHistoryLoading(true);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
    void data.getIncident(selectedId, signal)
      .then(item => { if (!controller.signal.aborted) { setDetail(item); setEvidenceUpdatedAt(new Date()); setDetailStale(false); } })
      .catch(reason => { if (!controller.signal.aborted) { setDetailStale(true); setDetailError(reason instanceof Error ? reason.message : "Evidence could not be loaded."); } })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    void data.getHistory(selectedId, signal)
      .then(items => { if (!controller.signal.aborted) setHistory(items); })
      .catch(() => { if (!controller.signal.aborted) setHistoryError("History is unavailable. The report evidence can still be reviewed."); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [data, selectedId, selectionKey, version, detailRevision]);

  const currentDetail = detailKey === selectionKey ? detail : undefined;
  function resetFilters() {
    setSelectedId(undefined); setCategory("all"); setStatus("active"); setQuery("");
    setMultiple(false); setPhotosOnly(false); setMapAreaOnly(false); setSort("observations");
  }
  return <main className="city-review">
    <a className="cr-skip" href="#city-queue">Skip to report queue</a>
    <header className="cr-header">
      <a href="/" className="cr-brand"><img className="cr-brand-logo" src="/clearflow/assets/drop-logo.png" alt="" />Clearflow</a>
      <nav className="cr-nav" aria-label="City workspace navigation"><a href="#city-queue">Review queue</a><a href="#city-map">Map</a><a href="#city-evidence">Evidence</a></nav>
      <a href="/" className="cr-button cr-button-primary" aria-label="Community dashboard"><span className="cr-community-long">Community dashboard</span><span className="cr-community-short">Community</span><ArrowUpRight size={15} aria-hidden="true" /></a>
      {onSignOut && <button type="button" className="cr-button cr-sign-out" onClick={onSignOut}>Sign out</button>}
    </header>
    <section className="cr-intro" aria-label="City review introduction">
      <div><span className="cr-eyebrow">CHAPEL HILL · CITY WORKSPACE</span><h1>Drain reports<span>.</span></h1><p>Find a concern. Review the evidence.</p></div>
      <button className="cr-button cr-button-primary" onClick={refresh} disabled={refreshing}><RefreshCw size={14} aria-hidden="true" />Refresh reports</button>
    </section>
    <section className="cr-filters" aria-label="Review filters">
      <div className="cr-section-heading"><h2>Find reports</h2><button className="cr-button cr-button-subtle" onClick={resetFilters}>Reset filters</button></div>
      <div className="cr-filter-fields">
      <CitySelect label="Concern type" value={category} onChange={setCategory} icon={<MapPin size={15} />} options={[{value:"all",label:"All concerns",description:"Every problem category"},...Object.entries(categories).map(([value,label])=>({value,label,color:cityIssueColors[value as Incident["issueType"]][2]}))]} />
      <CitySelect label="Community status" value={status} onChange={setStatus} icon={<Layers3 size={15} />} options={[{value:"active",label:"Active reports",description:"Community and moderator review"},{value:"all",label:"All statuses",description:"Include closed reports"},...Object.entries(statuses).map(([value,label])=>({value,label}))]} />
      <label>Search reports<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Description or reference ID" /></label>
      <CitySelect label="Queue order" value={sort} onChange={setSort} icon={<ArrowDown size={15} />} options={[{value:"observations",label:"Latest observation first",description:"Newest submission or follow-up"},{value:"updated",label:"Latest report update first",description:"Newest update, including status changes"}]} />
      </div><div className="cr-filter-toggles">
      <label className="cr-check"><input type="checkbox" checked={multiple} onChange={event => setMultiple(event.target.checked)} />Multiple submissions</label>
      <label className="cr-check"><input type="checkbox" checked={photosOnly} onChange={event => setPhotosOnly(event.target.checked)} />Photo evidence only</label>
      <label className="cr-check"><input type="checkbox" checked={mapAreaOnly} onChange={event => setMapAreaOnly(event.target.checked)} />Only reports in map area</label>
      </div>
    </section>
    <div className="cr-summary" aria-live="polite"><strong>{visible.length} matching loaded reports</strong><span>{incidents.length} loaded · API limit 500{mapAreaOnly ? " · list limited to map area" : ""}</span></div>
    <div className="cr-freshness" role="status"><span title={updatedAt ? `Queue last updated ${timestamp(updatedAt.toISOString())}` : undefined}>{updatedAt ? `Updated ${updatedAt.toLocaleTimeString("en-US", {timeZone:"America/New_York",hour:"numeric",minute:"2-digit",timeZoneName:"short"})}` : "No successful queue update yet"} · {refreshing ? "Refreshing…" : "Auto-refresh 30s while visible"}</span><span>Read-only · Independent prototype</span></div>
    {incidents.some(item=>item.isDemo) && <p className="cr-note cr-demo-notice">Demo records are saved in the database, not actual city complaints.</p>}
    {photosOnly && incidents.some(item => item.hasPhoto === undefined) && <p className="cr-note">Reports with unknown photo availability are excluded from this filter. Update the read API to include photo metadata.</p>}
    {error && <div className="cr-error" role="alert"><strong>{updatedAt ? "Queue may be out of date — refresh failed" : "Reporting API unavailable"}</strong><p>{error}</p><p>Last successful data stays visible. Refresh to retry the database connection; no sample fallback is used.</p></div>}
    <div className="cr-workspace">
      <section className="cr-queue" id="city-queue" aria-label="Report queue">
        <div className="cr-panel-heading"><h2>Review queue</h2><span className="cr-panel-count" aria-label={`${visible.length} matching reports`}>{visible.length}</span></div>
        <div className="cr-queue-items">
        {loading ? <p role="status">Loading reports…</p> : !visible.length ? <div className="cr-empty"><h3>{error ? "No reports loaded" : "No matching reports"}</h3><p>{error ? "Reconnect the reporting API and refresh." : "Try changing your filters or refresh after a report is saved."}</p></div> : visible.map(item => <button key={item.id} className={`cr-card ${item.id === selected?.id ? "cr-selected" : ""}`} style={{"--cr-report-color":cityMarkerStyle(item).color} as CSSProperties} aria-pressed={item.id === selected?.id} onClick={() => setSelectedId(item.id)}>
          <span className="cr-card-top"><strong>{categories[item.issueType]}</strong></span>
          <p>{item.description}</p><span className="cr-card-meta"><span className="cr-status" data-status={item.status}>{statuses[item.status]}</span><span className="cr-count">{item.observationCount} submission{item.observationCount === 1 ? "" : "s"}</span></span>
          <small>Latest observation {timestamp(item.latestObservationAt)}</small>
          <span className="cr-cue">{item.hasPhoto === true ? "Photo evidence available" : item.hasPhoto === false ? "No photo evidence" : "Photo availability unknown"}</span>
        </button>)}
        </div>
      </section>
      <div className="cr-right">
        <section className="cr-map" id="city-map" aria-label="Report locations"><div className="cr-map-heading"><h2>Report map</h2><span>{filtered.length} mapped reports</span>{selected && <a href="#city-evidence" className="cr-text-link">View evidence <ArrowDown size={13} aria-hidden="true" /></a>}</div><div className="cr-map-screen"><CityReviewMap incidents={filtered} onSelect={item => setSelectedId(item.id)} selected={selected} onBounds={setBounds} /></div></section>
        <section className="cr-evidence" id="city-evidence" aria-label="Incident evidence">
          <div className="cr-panel-heading"><h2>Report details</h2>{selected && <button className="cr-button" onClick={() => setSelectedId(undefined)}>Clear selection</button>}</div>
          {!selected ? <div className="cr-evidence-empty"><FileText size={24} aria-hidden="true" /><p>Select a report or map pin to see photos, history, and the evidence packet.</p></div> : <>
            <p className="cr-reference">Reference {selected.id}</p>
            {(detailLoading || detailKey !== selectionKey) && <p role="status">{currentDetail ? "Refreshing evidence…" : "Loading evidence…"}</p>}
            {detailKey === selectionKey && detailError && <div className="cr-error" role="alert"><p>{detailError}</p>{currentDetail && <p>Displayed evidence may be out of date.</p>}<button className="cr-button" onClick={() => setDetailRevision(value => value + 1)}>Retry evidence</button></div>}
            {currentDetail && <>
              <h3 className="cr-report-title">{categories[currentDetail.issueType]}</h3><p>{currentDetail.description}</p>
              {evidenceUpdatedAt && <p className="cr-note">Evidence last loaded {timestamp(evidenceUpdatedAt.toISOString())}{detailStale ? " · STALE" : ""}</p>}
              <dl className="cr-facts"><div><dt>Community status</dt><dd>{statuses[currentDetail.status]}</dd></div><div><dt>Coordinates</dt><dd>{currentDetail.latitude.toFixed(5)}, {currentDetail.longitude.toFixed(5)}</dd></div><div><dt>Submissions</dt><dd>{currentDetail.observationCount} (not unique people)</dd></div><div><dt>Reported</dt><dd>{timestamp(currentDetail.createdAt)}</dd></div></dl>
              <a href={`https://www.openstreetmap.org/?mlat=${currentDetail.latitude}&mlon=${currentDetail.longitude}#map=18/${currentDetail.latitude}/${currentDetail.longitude}`} target="_blank" rel="noreferrer">Open location in map ↗</a>
              <h3>Observation evidence</h3>
              {!currentDetail.observations?.length && <p>No observation evidence available.</p>}
              {currentDetail.observations?.map(observation => <article className="cr-observation" key={observation.id}>
                <small>{timestamp(observation.createdAt)} · {observation.source}</small><p>{observation.description}</p>
                {photoSource(observation.photoUrl) ? <CityEvidencePhoto key={observation.id + photoSource(observation.photoUrl)} src={photoSource(observation.photoUrl)!} isDemo={currentDetail.isDemo} illustrative={observation.source === "demo"} /> : <p className="cr-note">No displayable photo attached.</p>}
                {observation.assessment && <div className="cr-assessment"><strong>AI suggestion — not a verified diagnosis</strong><p>Suggested category: {categories[observation.assessment.suggestedCategory]}</p><p>{observation.assessment.visibleEvidence}</p><small>Uncertainty: {observation.assessment.uncertainty} · {observation.assessment.humanReviewRecommended ? "Human review recommended" : "Human confirmation still required"}</small></div>}
              </article>)}
              <h3>Community history</h3>
              {historyLoading && <p role="status">Loading community history…</p>}
              {historyError ? <p role="status">{historyError}</p> : <ul className="cr-history">{history.map((event, index) => <li key={event.id ?? index}><strong>{eventNames[event.eventType] ?? event.eventType.replaceAll("_", " ")}</strong><small>{timestamp(event.createdAt ?? event.timestamp)} · {event.source ?? "Source unavailable"}</small></li>)}</ul>}
              <PacketPreview key={selectionKey} incident={currentDetail} history={history} evidenceStale={Boolean(error || detailStale)} historyState={historyLoading ? "loading" : historyError ? "unavailable" : "ready"} />
            </>}
          </>}
        </section>
      </div>
    </div>
    <footer className="cr-footer"><div><strong>Clearflow <span>City review workspace</span></strong><p>Independent of the Town of Chapel Hill. Reports do not notify the Town or verify a repair. Submission counts are not unique people or verified priorities. Not an emergency service.</p></div><div><a href="https://www.chapelhillnc.gov/Town-Government/Departments-and-Offices/Public-Works/Stormwater-Management/Flooding-and-Drainage" target="_blank" rel="noreferrer">Official Town reporting resources ↗</a><small>Not Just Groovy by Zdeněk Gromnica / FutureMillennium · <a href={fontLicenseUrl}>CC BY-NC-ND 3.0 · Noncommercial</a></small></div></footer>
  </main>;
}
