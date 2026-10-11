import type { Incident, IncidentEvent, IssueType, Status } from "./types";

export interface CityReviewFilters { issueType?: IssueType; status?: Status; demo?: boolean }
export interface CityReviewData {
  readonly mode: "live";
  readonly label: string;
  listIncidents(filters?: CityReviewFilters, signal?: AbortSignal): Promise<Incident[]>;
  getIncident(id: string, signal?: AbortSignal): Promise<Incident>;
  getHistory(id: string, signal?: AbortSignal): Promise<IncidentEvent[]>;
}
export type CityReadRequest = <T>(path: string, options?: RequestInit) => Promise<T>;
function requireArray<T>(value: unknown, endpoint: string): T[] {
  if (!Array.isArray(value)) throw new Error(`Unexpected response from ${endpoint}: expected an array.`);
  return value as T[];
}
// One source of truth: saved API/database records. No built-in sample mode or fallback.
export function createCityReviewData({request}: {mode:"live";request:CityReadRequest}): CityReviewData {
  return {
    mode:"live",label:"Database-backed reports",
    async listIncidents(filters={},signal) {
      const query=new URLSearchParams({sort:"updated"});
      if(filters.issueType)query.set("issueType",filters.issueType);
      if(filters.status)query.set("status",filters.status);
      if(filters.demo!==undefined)query.set("demo",String(filters.demo));
      const path=`/incidents?${query}`;
      return requireArray<Incident>(await request<unknown>(path,{signal}),path);
    },
    async getIncident(id,signal) { return request<Incident>(`/incidents/${encodeURIComponent(id)}`,{signal}); },
    async getHistory(id,signal) {
      const path=`/incidents/${encodeURIComponent(id)}/history`;
      return requireArray<IncidentEvent>(await request<unknown>(path,{signal}),path);
    },
  };
}
