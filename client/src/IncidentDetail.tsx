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
    [error, setError] = useState(""),
    [description, setDescription] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [saving, setSaving] = useState(false),
    [success, setSuccess] = useState(false);
  const request = useRef({ description: "", key: crypto.randomUUID() });
  async function load() {
    setLoading(true);
    try {
      const [d, h] = await Promise.all([
        api<Incident>(`/incidents/${incident.id}`),
        api<IncidentEvent[] | { events: IncidentEvent[] }>(
          `/incidents/${incident.id}/history`,
        ),
      ]);
      setDetail(d);
      setEvents(list(h, "events"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
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
      await load();
      onChanged();
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
          <button className="text-link" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      <div className="detail-columns">
        <section>
          <h4 className="section-title">Community evidence</h4>
          {loading ? (
            <p className="loading-inline">
              <LoaderCircle size={17} className="spin" />
              Loading observations…
            </p>
          ) : detail.observations?.length ? (
            detail.observations.map((o) => (
              <article key={o.id} className="observation">
                <div className="observation-top">
                  <span className="avatar">
                    <Eye size={16} />
                  </span>
                  <div>
                    <strong>
                      {o.source === "photon" || o.source === "imessage"
                        ? "Messaging observation"
                        : "Community observation"}
                    </strong>
                    <small>{date(o.createdAt)}</small>
                  </div>
                </div>
                <p>{o.description}</p>
                {o.photoUrl && (
                  <a href={o.photoUrl} target="_blank" rel="noreferrer">
                    <img
                      className="evidence-photo"
                      src={o.photoUrl}
                      alt="Community submitted photo evidence"
                      loading="lazy"
                    />
                  </a>
                )}
                {o.assessment && (
                  <p className="ai-note">
                    AI assessment · {o.assessment.visibleEvidence}
                    <br />
                    Uncertainty: {o.assessment.uncertainty}
                  </p>
                )}
              </article>
            ))
          ) : (
            <p className="muted">No additional observations yet.</p>
          )}
          {detail.photos?.length && (
            <div className="photo-grid">
              {detail.photos.map((photo) => (
                <a
                  key={photo.id}
                  href={photo.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src={photo.url}
                    alt="Incident photo evidence"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          )}
          <h4 className="section-title history-heading">Incident history</h4>
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
          {!loading && !events.length && (
            <p className="muted">No history available.</p>
          )}
        </section>
        <section className="follow-up">
          <h4>
            <MessageSquarePlus size={19} />
            Add a follow-up
          </h4>
          <p>Share what you can observe safely at this same location.</p>
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
            placeholder="Describe any changes or new visible evidence."
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
              Community and moderator reviews are internal Clearflow
              statuses. They do not confirm municipal acceptance or repair.
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
