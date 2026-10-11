import { useEffect, useMemo, useState } from "react";
import DrainMap from "./DrainMap";
import PacketPreview from "./PacketPreview";
import { api } from "./api";
import { createCityReviewData } from "./cityReviewData";
import { categories, statuses, type Incident, type IncidentEvent } from "./types";
import "./city-review.css";

function timestamp(value?: string) {
  const time = value ? new Date(value) : undefined;
  return time && Number.isFinite(time.getTime())
    ? time.toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })
    : "Date unavailable";
}
function photoSource(value?: string, synthetic = false) {
  if (!value) return undefined;
  if (synthetic && value.startsWith("data:image/svg+xml,")) return value;
  try {
    // Uploaded image paths may belong to a separately hosted API.
    const apiOrigin = (import.meta as unknown as { env: Record<string, string> }).env.VITE_API_URL;
    const url = new URL(value, apiOrigin || window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}
const eventNames: Record<string, string> = {
  incident_created: "Report created", observation_added: "Observation added", status_changed: "Community status changed",
};

export default function CityReview() {
  const [mode, setMode] = useState<"live" | "fixtures">("live");
  const data = useMemo(() => mode === "fixtures"
    ? createCityReviewData({ mode: "fixtures" })
    : createCityReviewData({ mode: "live", request: api }), [mode]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("active");
  const [query, setQuery] = useState("");
  const [multiple, setMultiple] = useState(false);
  const [includeDemo, setIncludeDemo] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<Incident>();
  const [history, setHistory] = useState<IncidentEvent[]>([]);
  const [detailKey, setDetailKey] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setIncidents([]);
    void data.listIncidents({ demo: mode === "fixtures" ? true : includeDemo ? undefined : false }, controller.signal)
      .then(items => { if (!controller.signal.aborted) setIncidents(items); })
      .catch(reason => { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "Reports could not be loaded."); setSelectedId(undefined); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [data, mode, includeDemo, revision]);

  const visible = useMemo(() => incidents.filter(item =>
    (category === "all" || item.issueType === category) &&
    (status === "all" || (status === "active" ? item.status !== "closed" : item.status === status)) &&
    (!multiple || item.observationCount >= 2) &&
    (!query.trim() || `${item.id} ${item.description} ${categories[item.issueType]}`.toLowerCase().includes(query.trim().toLowerCase())),
  ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)), [incidents, category, status, multiple, query]);
  const selected = visible.find(item => item.id === selectedId);
  const selectionKey = selected ? `${mode}:${selected.id}:${revision}:${includeDemo}` : "";

  useEffect(() => {
    if (!selectedId || !selectionKey) return;
    const controller = new AbortController();
    setDetail(undefined); setHistory([]); setDetailKey(selectionKey);
    setDetailLoading(true); setDetailError(""); setHistoryError("");
    setHistoryLoading(true);
    void data.getIncident(selectedId, controller.signal)
      .then(item => { if (!controller.signal.aborted) setDetail(item); })
      .catch(reason => { if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : "Evidence could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    void data.getHistory(selectedId, controller.signal)
      .then(items => { if (!controller.signal.aborted) setHistory(items); })
      .catch(() => { if (!controller.signal.aborted) setHistoryError("History is unavailable. The report evidence can still be reviewed."); })
      .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [data, selectedId, selectionKey]);

  const currentDetail = detailKey === selectionKey ? detail : undefined;
  function changeMode(next: "live" | "fixtures") {
    setSelectedId(undefined); setIncidents([]); setMode(next);
    setCategory("all"); setStatus("active"); setQuery(""); setMultiple(false); setIncludeDemo(false);
  }
  return <main className="city-review">
    <header className="cr-header">
      <div><a href="/" className="cr-brand">DrainDispatch</a><span className="cr-eyebrow">CITY REVIEW · PUBLIC PROTOTYPE</span><h1>From reports to a clearer picture.</h1><p>Review community evidence in one place. Read-only; independent of the Town of Chapel Hill.</p></div>
      <a href="/" className="cr-button">Community dashboard</a>
    </header>
    <section className="cr-source" aria-label="Data source">
      <div><strong>{data.label}</strong><p>{mode === "fixtures" ? "All reports, coordinates, photos and findings here are synthetic illustrations." : "Existing public reports only. This view does not authenticate city officials."}</p></div>
      <div className="cr-actions"><button className="cr-button" aria-pressed={mode === "live"} onClick={() => changeMode("live")}>Live API</button><button className="cr-button" aria-pressed={mode === "fixtures"} onClick={() => changeMode("fixtures")}>Use sample reports</button><button className="cr-button" onClick={() => setRevision(value => value + 1)} disabled={loading}>Refresh</button></div>
    </section>
    <section className="cr-filters" aria-label="Review filters">
      <label>Concern type<select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All concerns</option>{Object.entries(categories).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      <label>Community status<select value={status} onChange={event => setStatus(event.target.value)}><option value="active">Active reports</option><option value="all">All statuses</option>{Object.entries(statuses).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      <label>Search reports<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Description or reference ID" /></label>
      <label className="cr-check"><input type="checkbox" checked={multiple} onChange={event => setMultiple(event.target.checked)} />Multiple submissions</label>
      {mode === "live" && <label className="cr-check"><input type="checkbox" checked={includeDemo} onChange={event => { setSelectedId(undefined); setIncludeDemo(event.target.checked); }} />Include demo reports</label>}
    </section>
    <div className="cr-summary" aria-live="polite"><strong>{visible.length} matching loaded reports</strong><span>{incidents.length} loaded · API limit 500 · newest report update first</span></div>
    <p className="cr-note">Submission counts are not unique people. Review cues are not verified hazards or municipal priorities.</p>
    {error && <div className="cr-error" role="alert"><strong>Reporting API unavailable</strong><p>{error}</p><p>Retry or explicitly select sample reports. No synthetic fallback is used.</p></div>}
    <div className="cr-workspace">
      <section className="cr-queue" aria-label="Report queue">
        <h2>Review queue</h2>
        {loading ? <p role="status">Loading reports…</p> : !visible.length ? <div className="cr-empty"><h3>{error ? "No reports loaded" : "No matching reports"}</h3><p>{error ? "Reconnect the API or choose sample mode." : "Try changing your filters or refresh after a report is saved."}</p></div> : visible.map(item => <button key={item.id} className={`cr-card ${item.id === selected?.id ? "cr-selected" : ""}`} aria-pressed={item.id === selected?.id} onClick={() => setSelectedId(item.id)}>
          <span className="cr-card-top"><strong>{categories[item.issueType]}</strong>{item.isDemo && <span className="cr-demo">DEMO</span>}</span>
          <p>{item.description}</p><span className="cr-status">{statuses[item.status]}</span><span className="cr-count">{item.observationCount} submission{item.observationCount === 1 ? "" : "s"}</span>
          <small>Updated {timestamp(item.updatedAt)}</small>
          {item.observationCount >= 2 && <span className="cr-cue">Multiple observations attached</span>}
          {item.issueType === "damaged_drain" && <span className="cr-cue">Damage reported — unverified</span>}
        </button>)}
      </section>
      <div className="cr-right">
        <section className="cr-map" aria-label="Report locations"><DrainMap incidents={visible} onSelect={item => setSelectedId(item.id)} position={selected ? [selected.latitude, selected.longitude] : undefined} /></section>
        <section className="cr-evidence" aria-label="Incident evidence">
          <div className="cr-panel-heading"><h2>Evidence panel</h2>{selected && <button className="cr-button" onClick={() => setSelectedId(undefined)}>Clear selection</button>}</div>
          {!selected ? <p>Select a report or map marker to inspect its evidence.</p> : <>
            <p className="cr-reference">Reference {selected.id}</p>
            {(detailLoading || detailKey !== selectionKey) && <p role="status">Loading evidence…</p>}
            {detailKey === selectionKey && detailError && <div className="cr-error" role="alert"><p>{detailError}</p><button className="cr-button" onClick={() => setRevision(value => value + 1)}>Retry evidence</button></div>}
            {currentDetail && <>
              <h3>{categories[currentDetail.issueType]} {currentDetail.isDemo && <span className="cr-demo">SYNTHETIC DEMO</span>}</h3><p>{currentDetail.description}</p>
              <dl className="cr-facts"><div><dt>Community status</dt><dd>{statuses[currentDetail.status]}</dd></div><div><dt>Coordinates</dt><dd>{currentDetail.latitude.toFixed(5)}, {currentDetail.longitude.toFixed(5)}</dd></div><div><dt>Submissions</dt><dd>{currentDetail.observationCount} (not unique people)</dd></div><div><dt>Reported</dt><dd>{timestamp(currentDetail.createdAt)}</dd></div></dl>
              <a href={`https://www.openstreetmap.org/?mlat=${currentDetail.latitude}&mlon=${currentDetail.longitude}#map=18/${currentDetail.latitude}/${currentDetail.longitude}`} target="_blank" rel="noreferrer">Open location in map ↗</a>
              <h3>Observation evidence</h3>
              {!currentDetail.observations?.length && <p>No observation evidence available.</p>}
              {currentDetail.observations?.map(observation => <article className="cr-observation" key={observation.id}>
                <small>{timestamp(observation.createdAt)} · {observation.source}</small><p>{observation.description}</p>
                {photoSource(observation.photoUrl, mode === "fixtures") ? <figure><img src={photoSource(observation.photoUrl, mode === "fixtures")} alt={mode === "fixtures" ? "Synthetic evidence placeholder, not a real drain photograph" : "Submitted drainage observation"} onError={event => { event.currentTarget.hidden = true; event.currentTarget.nextElementSibling?.removeAttribute("hidden"); }} /><figcaption hidden>Photo could not be loaded.</figcaption></figure> : <p className="cr-note">No displayable photo attached.</p>}
                {observation.assessment && <div className="cr-assessment"><strong>{mode === "fixtures" ? "Synthetic AI example" : "AI suggestion — not a verified diagnosis"}</strong><p>Suggested category: {categories[observation.assessment.suggestedCategory]}</p><p>{observation.assessment.visibleEvidence}</p><small>Uncertainty: {observation.assessment.uncertainty} · {observation.assessment.humanReviewRecommended ? "Human review recommended" : "Human confirmation still required"}</small></div>}
              </article>)}
              <h3>Community history</h3>
              {historyLoading && <p role="status">Loading community history…</p>}
              {historyError ? <p role="status">{historyError}</p> : <ul className="cr-history">{history.map((event, index) => <li key={event.id ?? index}><strong>{eventNames[event.eventType] ?? event.eventType.replaceAll("_", " ")}</strong><small>{timestamp(event.createdAt ?? event.timestamp)} · {event.source ?? "Source unavailable"}</small></li>)}</ul>}
              <PacketPreview key={selectionKey} incident={currentDetail} history={history} historyState={historyLoading ? "loading" : historyError ? "unavailable" : "ready"} />
            </>}
          </>}
        </section>
      </div>
    </div>
    <footer className="cr-footer"><p>Community reports do not automatically notify the Town. A closed report does not verify a municipal repair. Not an emergency service.</p><a href="https://www.chapelhillnc.gov/Town-Government/Departments-and-Offices/Public-Works/Stormwater-Management/Flooding-and-Drainage" target="_blank" rel="noreferrer">Official Town reporting resources ↗</a></footer>
  </main>;
}
