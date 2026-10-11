import type { Incident, IncidentEvent, IssueType, Status } from "./types";
import { cityReviewFixtures, fixtureHistory } from "./cityReviewFixtures";

export interface CityReviewFilters {
  issueType?: IssueType;
  status?: Status;
  // false = real only, true = demo only, omitted = both (matches existing API).
  demo?: boolean;
}
export interface CityReviewData {
  readonly mode: "live" | "fixtures";
  readonly label: string;
  listIncidents(filters?: CityReviewFilters, signal?: AbortSignal): Promise<Incident[]>;
  getIncident(id: string, signal?: AbortSignal): Promise<Incident>;
  getHistory(id: string, signal?: AbortSignal): Promise<IncidentEvent[]>;
}

// Pass the existing api<T> function here. Paths are relative to its /api prefix.
export type CityReadRequest = <T>(path: string, options?: RequestInit) => Promise<T>;
type Options = { mode: "live"; request: CityReadRequest } | { mode: "fixtures"; incidents?: Incident[] };

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
}
function requireArray<T>(value: unknown, endpoint: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Unexpected response from ${endpoint}: expected an array.`);
  return value as T[];
}

export function createCityReviewData(options: Options): CityReviewData {
  if (options.mode === "live") {
    const { request } = options;
    return {
      mode: "live", label: "Connected reporting API",
      async listIncidents(filters = {}, signal) {
        const query = new URLSearchParams();
        if (filters.issueType) query.set("issueType", filters.issueType);
        if (filters.status) query.set("status", filters.status);
        if (filters.demo !== undefined) query.set("demo", String(filters.demo));
        const path = `/incidents${query.size ? `?${query}` : ""}`;
        return requireArray<Incident>(await request<unknown>(path, { signal }), path);
      },
      async getIncident(id, signal) {
        return request<Incident>(`/incidents/${encodeURIComponent(id)}`, { signal });
      },
      async getHistory(id, signal) {
        const path = `/incidents/${encodeURIComponent(id)}/history`;
        return requireArray<IncidentEvent>(await request<unknown>(path, { signal }), path);
      },
    };
  }
  // Clone and force labels even for caller-supplied fixtures. No network writes.
  const incidents = structuredClone(options.incidents ?? cityReviewFixtures).map(item => ({ ...item, isDemo: true }));
  function find(id: string, signal?: AbortSignal) {
    abortIfNeeded(signal);
    const item = incidents.find(incident => incident.id === id);
    if (!item) throw new Error("Synthetic incident not found.");
    return item;
  }
  return {
    mode: "fixtures", label: "Synthetic development data — not live reports",
    async listIncidents(filters = {}, signal) {
      abortIfNeeded(signal);
      return structuredClone(incidents.filter(item =>
        (!filters.issueType || item.issueType === filters.issueType) &&
        (!filters.status || item.status === filters.status) &&
        (filters.demo === undefined || item.isDemo === filters.demo),
      ).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
        .slice(0, 500).map(({ observations: _observations, photos: _photos, ...summary }) => summary));
    },
    async getIncident(id, signal) { return structuredClone(find(id, signal)); },
    async getHistory(id, signal) { return structuredClone(fixtureHistory(find(id, signal))); },
  };
}
