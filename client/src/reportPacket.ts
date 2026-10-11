import { categories, statuses, type Incident, type IncidentEvent } from "./types";

export const officialReportingUrl = "https://www.chapelhillnc.gov/Town-Government/Departments-and-Offices/Public-Works/Stormwater-Management/Flooding-and-Drainage";
export interface PacketOptions {
  evidenceStale?: boolean;
  includePhotoLinks?: boolean;
  photoBaseUrl?: string;
  historyState?: "ready" | "loading" | "unavailable";
}

function time(value?: string) {
  const parsed = value ? new Date(value) : undefined;
  return parsed && Number.isFinite(parsed.getTime()) ? `${parsed.toISOString()} (UTC)` : "Date unavailable";
}
function publicPhotoLink(value: string | undefined, base?: string) {
  if (!value) return undefined;
  try {
    const url = base ? new URL(value, base) : new URL(value);
    // Export ordinary public image links, not embedded data or credentialed links.
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || /report-drafts/i.test(url.pathname)) return undefined;
    return url.href;
  } catch { return undefined; }
}

// Allowlist public fields. Never serialize whole records or event metadata.
// Descriptions are submitted text: users should check them for personal details.
export function formatReportPacket(incident: Incident, history: IncidentEvent[] = [], options: PacketOptions = {}): string {
  const lines = [
    "Clearflow — community evidence packet",
    ...(options.evidenceStale ? ["STALE SNAPSHOT — a refresh failed; verify current evidence before using this packet."] : []),
    ...(incident.isDemo ? ["DEMO / TEST REPORT — excluded from real community metrics"] : []),
    `Reference: ${incident.id}`,
    `Reported category: ${categories[incident.issueType]}`,
    `Community status: ${statuses[incident.status]}`,
    `Coordinates: ${incident.latitude.toFixed(5)}, ${incident.longitude.toFixed(5)}`,
    `Map: https://www.openstreetmap.org/?mlat=${incident.latitude}&mlon=${incident.longitude}#map=18/${incident.latitude}/${incident.longitude}`,
    `Reported: ${time(incident.createdAt)}`,
    `Report updated: ${time(incident.updatedAt)}`,
    `Observation submissions: ${incident.observationCount} (not unique people)`,
    "", "Reporter description:", incident.description,
    "", "Observation evidence:",
  ];
  const observations = [...(incident.observations ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  if (!observations.length) lines.push("No observation details available.");
  for (const observation of observations) {
    lines.push("", `Observation ${observation.id} — ${time(observation.createdAt)}`, `Source: ${observation.source}`, observation.description);
    if (observation.assessment) {
      const assessment = observation.assessment;
      lines.push("AI suggestion — not a verified diagnosis:", `Suggested category: ${categories[assessment.suggestedCategory]}`, `Visible evidence: ${assessment.visibleEvidence}`, `Uncertainty: ${assessment.uncertainty}`, "Human confirmation required.");
    }
    if (options.includePhotoLinks) {
      const link = publicPhotoLink(observation.photoUrl, options.photoBaseUrl);
      lines.push(link ? `Public photo: ${link}` : observation.photoUrl ? "Photo link omitted: embedded, credentialed or non-public link format." : "No photo attached.");
    }
  }
  lines.push("", options.includePhotoLinks ? "Photo links: explicitly included where eligible." : "Photo links: excluded by default.", "", "Community history:");
  if (options.historyState === "loading") lines.push("History is still loading; this packet may be incomplete.");
  else if (options.historyState === "unavailable") lines.push("History unavailable; no municipal activity should be inferred.");
  else {
    const events = [...history].sort((a, b) => (a.createdAt ?? a.timestamp ?? "").localeCompare(b.createdAt ?? b.timestamp ?? "") || (a.id ?? "").localeCompare(b.id ?? ""));
    const names: Record<string, string> = { incident_created: "Report created", observation_added: "Observation added", status_changed: "Community status changed" };
    for (const event of events) lines.push(`${time(event.createdAt ?? event.timestamp)} — ${names[event.eventType] ?? "Community event"}`);
    if (!events.length) lines.push("No history events available.");
  }
  lines.push("", "This is community evidence, not an official city work order or verified hazard assessment.", "Municipal receipt, inspection and repair have not been verified. A closed community report does not confirm a city repair.", "Copying this packet does not submit or notify anyone. Review submitted text and photos for personal information before sharing.", `Official Town reporting resources: ${officialReportingUrl}`, "Not an emergency service.");
  return lines.join("\n");
}
