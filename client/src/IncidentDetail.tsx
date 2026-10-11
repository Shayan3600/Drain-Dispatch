import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Clock3,
  Eye,
  LoaderCircle,
  MapPin,
  MessageSquarePlus,
  ShieldCheck,
} from "lucide-react";
import Modal from "./Modal";
import { api, date, list, post } from "./api";
import {
  categories,
  statuses,
  type Incident,
  type IncidentEvent,
} from "./types";
const eventLabels: Record<string, string> = {
  incident_created: "Incident created",
  observation_added: "Community observation added",
  status_changed: "Review status updated",
  report_confirmed: "Report location confirmed",
};
function photoSource(value: string) {
  try {
    const apiOrigin = (import.meta as unknown as { env: Record<string, string> }).env.VITE_API_URL;
    const url = new URL(value, apiOrigin || window.location.origin);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
function EvidencePhoto({ value, className, alt }: { value: string; className?: string; alt: string }) {
  const source = photoSource(value);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setFailed(false); setAttempt(0); }, [source]);
  if (!source) return <p className="muted">Photo unavailable.</p>;
  return failed ? <div><p role="status">Photo could not be loaded.</p><button className="button secondary compact" type="button" onClick={() => { setAttempt(current => current + 1); setFailed(false); }}>Retry photo</button></div>
    : <a href={source} target="_blank" rel="noreferrer" aria-label="Open full-size photo"><img key={`${source}:${attempt}`} className={className} src={source} alt={alt} loading="lazy" onError={() => setFailed(true)} /></a>;
}
export default function IncidentDetail({
  incident,
  onClose,
  onChanged,
}: {
  incident: Incident;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState(incident),
    [events, setEvents] = useState<IncidentEvent[]>([]),
    [loading, setLoading] = useState(true),
    [historyLoading, setHistoryLoading] = useState(true),
    [historyError, setHistoryError] = useState(""),
    [error, setError] = useState(""),
    [description, setDescription] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [saving, setSaving] = useState(false),
    [success, setSuccess] = useState(false);
  const request = useRef({ description: "", key: crypto.randomUUID() });
  const evidenceController = useRef<AbortController>(undefined);
  const historyController = useRef<AbortController>(undefined);
  async function loadEvidence() {
    evidenceController.current?.abort();
    const controller = new AbortController();
    evidenceController.current = controller;
    const current = () => !controller.signal.aborted && evidenceController.current === controller;
    setLoading(true);
    setError("");
    try {
      const result = await api<Incident>(`/incidents/${incident.id}`, { signal: controller.signal });
      if (current()) setDetail(result);
    } catch (e) {
      if (current()) setError(e instanceof Error ? e.message : "Report evidence could not be loaded.");
    } finally {
      if (current()) setLoading(false);
      if (evidenceController.current === controller) evidenceController.current = undefined;
    }
  }
  async function loadHistory() {
    historyController.current?.abort();
    const controller = new AbortController();
    historyController.current = controller;
    const current = () => !controller.signal.aborted && historyController.current === controller;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const result = await api<IncidentEvent[] | { events: IncidentEvent[] }>(`/incidents/${incident.id}/history`, { signal: controller.signal });
      if (current()) setEvents(list(result, "events"));
    } catch {
      if (current()) setHistoryError(events.length ? "History could not be refreshed. Showing the last loaded history." : "History could not be loaded.");
    } finally {
      if (current()) setHistoryLoading(false);
      if (historyController.current === controller) historyController.current = undefined;
    }
  }
  async function load() { await Promise.allSettled([loadEvidence(), loadHistory()]); }
  useEffect(() => {
    setDetail(incident);
    setEvents([]);
    void load();
    return () => { evidenceController.current?.abort(); historyController.current?.abort(); };
  }, [incident.id]);
  async function submit() {
    setSaving(true);
    setError("");
    if (request.current.description !== description.trim())
      request.current = {
        description: description.trim(),
        key: crypto.randomUUID(),
      };
    try {
      await post(`/incidents/${incident.id}/observations`, {
        description: description.trim(),
        sameLocationConfirmed: true,
        idempotencyKey: request.current.key,
      });
      setSuccess(true);
      setDescription("");
      setConfirmed(false);
      request.current = { description: "", key: crypto.randomUUID() };
      onChanged();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title="Incident & observations" onClose={onClose} wide>
      <div className="detail-head">
        <span className={`status-badge ${detail.status}`}>
          {statuses[detail.status]}
        </span>
        {detail.isDemo && <span className="demo-badge">Demo incident</span>}
        <span className="reference-short">#{detail.id.slice(0, 8)}</span>
      </div>
      <h3 className="detail-title">{categories[detail.issueType]}</h3>
      <p className="detail-description">{detail.description}</p>
      <div className="detail-metadata">
        <span>
          <MapPin size={15} />
          {detail.latitude.toFixed(5)}, {detail.longitude.toFixed(5)}
        </span>
        <span>
          <Clock3 size={15} />
          {date(detail.createdAt)}
        </span>
        <span>
          <Eye size={15} />
          {detail.observationCount} observation
          {detail.observationCount === 1 ? "" : "s"}
        </span>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button className="text-link" onClick={() => void loadEvidence()}>
            Retry
          </button>
        </div>
      )}
      <div className="detail-columns">
        <section>
          <h4 className="section-title">Community evidence</h4>
          {loading && (
            <p className="loading-inline">
              <LoaderCircle size={17} className="spin" />
              Loading observations…
            </p>
          )}
          {detail.observations?.length ? (
            detail.observations.map((o) => (
              <article key={o.id} className="observation">
                <div className="observation-top">
                  <span className="avatar">
                    <Eye size={16} />
                  </span>
                  <div>
                    <strong>
                      {o.source === "photon" || o.source === "imessage"
                        ? "iMessage observation"
                        : "Community observation"}
                    </strong>
                    <small>{date(o.createdAt)}</small>
                  </div>
                </div>
                <p>{o.description}</p>
                {o.photoUrl && (
                  <EvidencePhoto value={o.photoUrl} className="evidence-photo" alt="Submitted report photo" />
                )}
                {o.assessment && (
                  <p className="ai-note">
                    Photo review · {o.assessment.visibleEvidence}
                    <br />
                    Uncertainty: {o.assessment.uncertainty}
                  </p>
                )}
              </article>
            ))
          ) : !loading ? (
            <p className="muted">No additional observations yet.</p>
          ) : null}
          {detail.photos?.length && (
            <div className="photo-grid">
              {detail.photos.map((photo) => (
                <EvidencePhoto key={photo.id} value={photo.url} alt="Incident photo evidence" />
              ))}
            </div>
          )}
          <h4 className="section-title history-heading">Incident history</h4>
          {historyLoading && <p className="loading-inline" role="status"><LoaderCircle size={17} className="spin" />Loading incident history…</p>}
          {historyError && <div className="notice error" role="alert"><span>{historyError}</span><button className="text-link" type="button" onClick={() => void loadHistory()}>Retry history</button></div>}
          <ol className="history">
            {events.map((event, index) => (
              <li key={event.id || index}>
                <span>
                  {eventLabels[event.eventType] ||
                    event.eventType.replaceAll("_", " ")}
                </span>
                <small>{date(event.createdAt || event.timestamp)}</small>
              </li>
            ))}
          </ol>
          {!historyLoading && !historyError && !events.length && (
            <p className="muted">No history available.</p>
          )}
        </section>
        <section className="follow-up">
          <h4>
            <MessageSquarePlus size={19} />
            Add a follow-up
          </h4>
          <p>Describe what changed at this location.</p>
          {success && (
            <div className="notice success" role="status">
              Your observation was saved.
            </div>
          )}
          <label className="field-label" htmlFor="followup">
            Your observation
          </label>
          <textarea
            id="followup"
            value={description}
            rows={4}
            maxLength={2000}
            onChange={(e) => {
              setDescription(e.target.value);
              setSuccess(false);
            }}
            placeholder="What changed? What can you see?"
          />
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            This observation concerns the same physical location.
          </label>
          <button
            className="button primary full-width"
            disabled={description.trim().length < 5 || !confirmed || saving}
            onClick={() => void submit()}
          >
            {saving ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <MessageSquarePlus size={16} />
            )}
            Add observation
          </button>
          <div className="detail-disclaimer">
            <ShieldCheck size={20} />
            <p>
              Clearflow status does not confirm Town acceptance or repairs.
            </p>
          </div>
          <a
            className="official-link"
            href="https://www.chapelhillnc.gov/Town-Government/Departments-and-Offices/Public-Works/Stormwater-Management/Flooding-and-Drainage"
            target="_blank"
            rel="noreferrer"
          >
            Official Town reporting resources <ArrowUpRight size={16} />
          </a>
        </section>
      </div>
    </Modal>
  );
}
