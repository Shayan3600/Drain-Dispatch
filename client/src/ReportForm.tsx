import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ImagePlus,
  LocateFixed,
  MapPin,
  ShieldCheck,
  Sparkles,
  Upload,
  LoaderCircle,
} from "lucide-react";
import Modal from "./Modal";
import DrainMap from "./DrainMap";
import { api, list, post } from "./api";
import {
  categories,
  type Assessment,
  type Draft,
  type Incident,
  type IssueType,
} from "./types";
export default function ReportForm({
  onClose,
  onCreated,
  draftToken,
}: {
  onClose: () => void;
  onCreated: (incident: Incident) => void;
  draftToken?: string;
}) {
  const [step, setStep] = useState(0),
    [description, setDescription] = useState(""),
    [issueType, setIssueType] = useState<IssueType>("blocked_drain");
  const [position, setPosition] = useState<[number, number]>(),
    [confirmed, setConfirmed] = useState(false),
    [photoId, setPhotoId] = useState<string>(),
    [photoUrl, setPhotoUrl] = useState<string>();
  const [assessment, setAssessment] = useState<Assessment>(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [nearby, setNearby] = useState<Incident[]>([]),
    [match, setMatch] = useState<Incident>(),
    [sameLocation, setSameLocation] = useState(false),
    [result, setResult] = useState<Incident>();
  const [draftLoading, setDraftLoading] = useState(Boolean(draftToken)),
    [draftInvalid, setDraftInvalid] = useState(false),
    [alreadySaved, setAlreadySaved] = useState(false);
  const [nearbyState, setNearbyState] = useState<
      "idle" | "loading" | "ready" | "error"
    >("idle"),
    [nearbyRetry, setNearbyRetry] = useState(0);
  const idempotency = useRef({ key: crypto.randomUUID(), payload: "" });
  useEffect(() => {
    if (!draftToken) return;
    api<Draft>(`/report-drafts/${encodeURIComponent(draftToken)}`)
      .then(async (d) => {
        if (d.confirmedIncidentId) {
          const saved = await api<Incident>(`/incidents/${d.confirmedIncidentId}`);
          setAlreadySaved(true);
          setResult(saved);
          onCreated(saved);
          return;
        }
        setDescription(d.description || "");
        setIssueType(
          d.issueType || d.assessment?.suggestedCategory || "blocked_drain",
        );
        setPhotoId(d.photoId ?? undefined);
        setPhotoUrl(d.photoUrl ?? undefined);
        setAssessment(d.assessment ?? undefined);
      })
      .catch((e) => {
        setError(e.message);
        setDraftInvalid(true);
      })
      .finally(() => setDraftLoading(false));
  }, [draftToken, onCreated]);
  useEffect(() => {
    setConfirmed(false);
    setMatch(undefined);
    setSameLocation(false);
    if (!position) {
      setNearby([]);
      setNearbyState("idle");
      return;
    }
    let active = true;
    setNearbyState("loading");
    const timer = setTimeout(() => {
      api<Incident[] | { incidents: Incident[] }>(
        `/incidents/nearby?latitude=${position[0]}&longitude=${position[1]}&issueType=${issueType}`,
      )
        .then((d) => {
          if (active) {
            setNearby(list(d, "incidents"));
            setNearbyState("ready");
          }
        })
        .catch(() => {
          if (active) {
            setNearby([]);
            setNearbyState("error");
          }
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [position, issueType, nearbyRetry]);
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 8 * 1024 * 1024
    ) {
      setError(
        "Choose a JPEG, PNG, or WebP image under 8 MB. For iPhone HEIC, send a JPEG/PNG screenshot or take a new photo using Camera > Formats > Most Compatible.",
      );
      return;
    }
    setBusy("Uploading photo");
    try {
      const form = new FormData();
      form.append("photo", file);
      const photo = await api<{ id: string; url: string }>("/uploads", {
        method: "POST",
        body: form,
      });
      setPhotoId(photo.id);
      setPhotoUrl(photo.url);
      setAssessment(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function analyze() {
    setBusy("Reviewing visible evidence");
    setError("");
    try {
      const a = await post<Assessment>("/analyze", { photoId });
      setAssessment(a);
      setIssueType(a.suggestedCategory);
      if (a.visibleEvidence) setDescription(a.visibleEvidence);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function pick(p: [number, number]) {
    setError("");
    setPosition(p);
  }
  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError(
        "Location is unavailable. Select a point on the map or enter coordinates.",
      );
      return;
    }
    setBusy("Finding your location");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        pick([p.coords.latitude, p.coords.longitude]);
        setBusy("");
      },
      () => {
        setError(
          "Location access was unavailable. You can select the location on the map.",
        );
        setBusy("");
      },
      { timeout: 10000 },
    );
  }
  async function submit() {
    if (
      !position ||
      !confirmed ||
      description.trim().length < 5 ||
      (match && !sameLocation) ||
      draftInvalid
    )
      return;
    setBusy("Saving your observation");
    setError("");
    const payload = {
      description: description.trim(),
      issueType,
      latitude: position[0],
      longitude: position[1],
      locationConfirmed: true,
      photoId,
      existingIncidentId: match?.id,
      sameLocationConfirmed: match ? true : undefined,
    };
    const signature = JSON.stringify(payload);
    if (idempotency.current.payload !== signature)
      idempotency.current = { payload: signature, key: crypto.randomUUID() };
    try {
      let incident: Incident;
      if (match && !draftToken) {
        await post(`/incidents/${match.id}/observations`, {
          description: description.trim(),
          photoId,
          sameLocationConfirmed: true,
          idempotencyKey: idempotency.current.key,
        });
        incident = await api<Incident>(`/incidents/${match.id}`);
      } else {
        incident = await post<Incident>(
          draftToken
            ? `/report-drafts/${encodeURIComponent(draftToken)}/confirm`
            : "/incidents",
          { ...payload, idempotencyKey: idempotency.current.key },
        );
      }
      setResult(incident);
      onCreated(incident);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const canNext =
    step === 0
      ? description.trim().length >= 5 && !draftLoading && !draftInvalid
      : !!position &&
        confirmed &&
        nearbyState === "ready" &&
        (!match || sameLocation);
  return (
    <Modal
      title={
        result
          ? alreadySaved ? "Report already saved" : "Observation received"
          : draftToken
            ? "Confirm your message report"
            : "Report a drainage concern"
      }
      onClose={onClose}
      wide
    >
      {result ? (
        <div className="success-state">
          <div className="success-icon">
            <CheckCircle2 size={44} />
          </div>
          <h3>{alreadySaved ? "Your report is already on the map." : "Report saved."}</h3>
          <p>
            {alreadySaved ? "View your report on the dashboard." : <>Your{" "}
            {match
              ? "observation has been added to the existing incident"
              : "report is on the map"}
            .</>}
          </p>
          <div className="reference">
            REPORT REFERENCE <strong>{result.id}</strong>
          </div>
          <p className="muted">
            To contact the Town, use its official reporting form.
          </p>
          <a
            className="button secondary"
            href="https://www.chapelhillnc.gov/residentreporter"
            target="_blank"
            rel="noreferrer"
          >
            Visit official reporting <ArrowRight size={16} />
          </a>
          <button className="button primary" onClick={onClose}>
            Back to the dashboard
          </button>
        </div>
      ) : (
        <>
          <div className="steps">
            {["What you see", "Where it is", "Review & submit"].map(
              (label, index) => (
                <span
                  className={
                    index === step ? "current" : index < step ? "complete" : ""
                  }
                  key={label}
                >
                  <i>{index < step ? <Check size={13} /> : index + 1}</i>
                  {label}
                </span>
              ),
            )}
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {draftLoading ? (
            <div className="loading-inline">
              <LoaderCircle className="spin" />
              Loading your draft…
            </div>
          ) : (
            <>
              {step === 0 && (
                <div className="report-grid">
                  <div>
                    <label className="field-label" htmlFor="description">
                      Describe what you noticed <span>Required</span>
                    </label>
                    <textarea
                      id="description"
                      rows={5}
                      placeholder="For example: leaves are covering the drain grate near the sidewalk."
                      value={description}
                      maxLength={2000}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                    <small className="muted">
                      Describe visible evidence. Avoid names, phone numbers,
                      faces, and license plates.
                    </small>
                    <label className="field-label" htmlFor="issueType">
                      Type of concern
                    </label>
                    <select
                      id="issueType"
                      value={issueType}
                      onChange={(e) =>
                        setIssueType(e.target.value as IssueType)
                      }
                    >
                      {Object.entries(categories).map(([key, label]) => (
                        <option value={key} key={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {assessment && (
                      <div className="assessment">
                        <h4>
                          <Sparkles size={16} /> Gemini photo review
                        </h4>
                        <p>
                          {assessment.drainVisible
                            ? "A drain is visible."
                            : "A drain was not clearly identified."}{" "}
                          {assessment.visibleEvidence}
                        </p>
                        <small>
                          Uncertainty: {assessment.uncertainty}.{" "}
                          {assessment.humanReviewRecommended
                            ? "Human review recommended."
                            : ""}
                        </small>
                        <p className="muted">
                          Edit the findings if needed. Confirm only what you observed.
                        </p>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="upload-box" htmlFor="photo">
                      {photoUrl ? (
                        <img src={photoUrl} alt="Uploaded drainage evidence" />
                      ) : (
                        <>
                          <ImagePlus size={32} />
                          <strong>Add a photograph</strong>
                          <span>Optional · JPG, PNG, WebP · up to 8 MB</span>
                        </>
                      )}
                      <span className="upload-caption">
                        <Upload size={14} />
                        {photoUrl ? "Replace photograph" : "Choose a photo"}
                      </span>
                    </label>
                    <input
                      id="photo"
                      className="visually-hidden"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        void upload(file);
                      }}
                      disabled={!!busy}
                    />
                    <button
                      className="button secondary full-width"
                      disabled={!photoId || !!busy}
                      onClick={() => void analyze()}
                    >
                      <Sparkles size={16} />
                      Review photo with Gemini
                    </button>
                    <p className="photo-note">
                      Photo findings cannot confirm the location or cause of flooding.
                    </p>
                    <details className="photo-note photo-help">
                      <summary>Using an iPhone photo?</summary>
                      <p>
                        JPEG and PNG screenshots work here. For new JPEG photos,
                        open Settings → Camera → Formats → Most Compatible.
                        Existing HEIC files need conversion before upload.
                        {" "}
                        <a href="https://support.apple.com/116944" target="_blank" rel="noreferrer">
                          Apple photo format guide
                        </a>
                      </p>
                    </details>
                  </div>
                </div>
              )}
              {step === 1 && (
                <div className="location-stage">
                  <div className="section-intro">
                    <div>
                      <h3>Place the pin where you observed the concern.</h3>
                      <p>
                        Mark the drain or standing water you observed.
                      </p>
                    </div>
                    <button
                      className="button secondary"
                      onClick={locate}
                      disabled={!!busy}
                    >
                      <LocateFixed size={16} />
                      Use my location
                    </button>
                  </div>
                  <DrainMap
                    incidents={nearby}
                    onPick={pick}
                    position={position}
                    small
                  />
                  <div className="coordinate-fields">
                    <label>
                      Latitude
                      <input
                        type="number"
                        step="any"
                        min="-90"
                        max="90"
                        value={position?.[0] ?? ""}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (e.target.value && n >= -90 && n <= 90)
                            pick([n, position?.[1] ?? -79.0558]);
                        }}
                      />
                    </label>
                    <label>
                      Longitude
                      <input
                        type="number"
                        step="any"
                        min="-180"
                        max="180"
                        value={position?.[1] ?? ""}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (e.target.value && n >= -180 && n <= 180)
                            pick([position?.[0] ?? 35.9132, n]);
                        }}
                      />
                    </label>
                  </div>
                  {nearbyState === "loading" && (
                    <p className="loading-inline">
                      <LoaderCircle className="spin" size={15} />
                      Checking nearby reports…
                    </p>
                  )}
                  {nearbyState === "error" && (
                    <div className="notice error" role="alert">
                      <span>
                        Nearby reports could not be checked. Retry before
                        submitting.
                      </span>
                      <button
                        className="text-link"
                        onClick={() => setNearbyRetry((n) => n + 1)}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      disabled={!position}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I confirm the pin marks the physical location I observed.
                  </label>
                  {nearby.length > 0 && (
                    <div className="nearby">
                      <h4>
                        <MapPin size={16} />
                        Could this be the same location?
                      </h4>
                      <p>
                        Nearby reports are suggestions. Two drains can be close
                        together.
                      </p>
                      {nearby.map((i) => (
                        <label
                          className={`candidate ${match?.id === i.id ? "selected" : ""}`}
                          key={i.id}
                        >
                          <input
                            type="radio"
                            name="duplicate"
                            checked={match?.id === i.id}
                            onChange={() => {
                              setMatch(i);
                              setSameLocation(false);
                            }}
                          />
                          <span>
                            <strong>{categories[i.issueType]}</strong>
                            <small>{i.description}</small>
                          </span>
                          <b>{Math.round(i.distanceMeters || 0)} m</b>
                        </label>
                      ))}
                      <label className="candidate">
                        <input
                          type="radio"
                          name="duplicate"
                          checked={!match}
                          onChange={() => {
                            setMatch(undefined);
                            setSameLocation(false);
                          }}
                        />
                        <strong>
                          This is a different concern. Create a new incident.
                        </strong>
                      </label>
                      {match && (
                        <label className="check-label">
                          <input
                            type="checkbox"
                            checked={sameLocation}
                            onChange={(e) => setSameLocation(e.target.checked)}
                          />
                          I confirm this existing report concerns the same
                          physical location.
                        </label>
                      )}
                    </div>
                  )}
                </div>
              )}
              {step === 2 && (
                <div className="review-stage">
                  <div className="review-icon">
                    <ShieldCheck size={30} />
                  </div>
                  <h3>
                    {match
                      ? "Add evidence to an existing incident"
                      : "Review your report"}
                  </h3>
                  <p className="muted">
                    Check your details before making this observation public.
                  </p>
                  <dl className="review-details">
                    <dt>Concern</dt>
                    <dd>{categories[issueType]}</dd>
                    <dt>Observation</dt>
                    <dd>{description}</dd>
                    <dt>Confirmed location</dt>
                    <dd>
                      {position?.[0].toFixed(6)}, {position?.[1].toFixed(6)}
                    </dd>
                    <dt>Submission</dt>
                    <dd>
                      {match
                        ? `Observation for ${match.id.slice(0, 8)}`
                        : "New incident · pending review"}
                    </dd>
                    <dt>Photo evidence</dt>
                    <dd>
                      {photoId ? "Uploaded and attached" : "No photo attached"}
                    </dd>
                  </dl>
                  <div className="notice">
                    <ShieldCheck size={18} />
                    <span>
                      Stay out of roadways, drains and floodwater. Leave maintenance to trained crews.
                    </span>
                  </div>
                  <p className="photo-note">
                    This community report does not automatically notify the Town
                    and is not an emergency service.
                  </p>
                </div>
              )}
            </>
          )}
          <div className="modal-actions">
            <button
              className="button text-button"
              onClick={() => (step ? setStep(step - 1) : onClose())}
              disabled={!!busy}
            >
              {step ? <ArrowLeft size={16} /> : null}
              {step ? "Back" : "Cancel"}
            </button>
            {busy ? (
              <span className="loading-inline">
                <LoaderCircle size={17} className="spin" />
                {busy}…
              </span>
            ) : (
              <button
                className="button primary"
                disabled={step < 2 ? !canNext : !confirmed}
                onClick={() => (step < 2 ? setStep(step + 1) : void submit())}
              >
                {step === 2 ? "Submit observation" : "Continue"}
                {step === 2 ? <Check size={16} /> : <ArrowRight size={16} />}
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
