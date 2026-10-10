import type { Incident, IncidentEvent } from "./types";

// Synthetic development data only. These records are never written to the API.
export const cityReviewFixtures: Incident[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    latitude: 35.9132, longitude: -79.0558,
    description: "Synthetic example: leaves covering a drain grate.",
    issueType: "blocked_drain", status: "pending_review", isDemo: true,
    createdAt: "2026-10-10T16:00:00Z", updatedAt: "2026-10-10T17:00:00Z",
    observationCount: 2,
    observations: [
      { id: "00000000-0000-4000-8000-000000000012", description: "Synthetic follow-up: leaves remain visible.", source: "web", createdAt: "2026-10-10T17:00:00Z" },
      { id: "00000000-0000-4000-8000-000000000011", description: "Synthetic example: leaves on the grate.", source: "web", createdAt: "2026-10-10T16:00:00Z",
        photoUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='240'%3E%3Crect width='480' height='240' fill='%23d9eeea'/%3E%3Ctext x='20' y='120' font-size='20'%3ESYNTHETIC PHOTO PLACEHOLDER%3C/text%3E%3C/svg%3E",
        assessment: { drainVisible: true, suggestedCategory: "blocked_drain", visibleEvidence: "Synthetic assessment: leaves cover part of the grate.", humanReviewRecommended: true, uncertainty: "high" } },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    latitude: 35.915, longitude: -79.052,
    description: "Synthetic example: standing water reported without a photo.",
    issueType: "standing_water", status: "under_review", isDemo: true,
    createdAt: "2026-10-10T15:00:00Z", updatedAt: "2026-10-10T15:00:00Z",
    observationCount: 1,
    observations: [{ id: "00000000-0000-4000-8000-000000000021", description: "Synthetic example: water beside the curb.", source: "web", createdAt: "2026-10-10T15:00:00Z" }],
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    latitude: 35.911, longitude: -79.059,
    description: "Synthetic example: closed community report, not a verified city repair.",
    issueType: "damaged_drain", status: "closed", isDemo: true,
    createdAt: "2026-10-09T14:00:00Z", updatedAt: "2026-10-10T14:00:00Z",
    observationCount: 1,
    observations: [{ id: "00000000-0000-4000-8000-000000000031", description: "Synthetic example: possible grate damage.", source: "web", createdAt: "2026-10-09T14:00:00Z" }],
  },
];

export function fixtureHistory(incident: Incident): IncidentEvent[] {
  const events: IncidentEvent[] = [{ eventType: "incident_created", source: "web", createdAt: incident.createdAt }];
  for (const observation of incident.observations ?? []) {
    if (observation.createdAt !== incident.createdAt) events.push({ eventType: "observation_added", source: observation.source, createdAt: observation.createdAt });
  }
  if (incident.status === "closed") events.push({ eventType: "status_changed", source: "moderator", createdAt: incident.updatedAt, metadata: { status: "closed", evidence: "Synthetic closure only; no municipal repair verified." } });
  return events.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}
