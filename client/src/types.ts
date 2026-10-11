export type IssueType =
  | "blocked_drain"
  | "standing_water"
  | "damaged_drain"
  | "other";
export type Status = "pending_review" | "under_review" | "closed";
export interface Assessment {
  drainVisible: boolean;
  suggestedCategory: IssueType;
  visibleEvidence: string;
  humanReviewRecommended: boolean;
  uncertainty: string;
}
export interface Observation {
  id: string;
  description: string;
  source: string;
  createdAt: string;
  photoUrl?: string;
  assessment?: Assessment;
}
export interface Incident {
  id: string;
  latitude: number;
  longitude: number;
  description: string;
  issueType: IssueType;
  status: Status;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  observationCount: number;
  hasPhoto?: boolean;
  latestObservationAt?: string;
  distanceMeters?: number;
  observations?: Observation[];
  photos?: { id: string; url: string }[];
}
export interface IncidentEvent {
  id?: string;
  eventType: string;
  createdAt?: string;
  timestamp?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}
export interface Stats {
  totalIncidents: number;
  activeIncidents: number;
  closedIncidents: number;
  observationCount: number;
  demoIncidents?: number;
  byCategory: { issueType: IssueType; count: number }[];
  overTime: { date: string; count: number }[];
  repeatedLocations: { latitude: number; longitude: number; count: number }[];
  activityOverTime?: {
    date: string;
    incidents: number;
    observations: number;
    statusChanges: number;
  }[];
  activityPeriod?: {
    bucket: "day";
    timeZone: "UTC";
    days: number;
    includesCurrentDay: boolean;
    startDate?: string;
    endDate?: string;
  };
}
export interface Weather {
  alerts: {
    id: string;
    event: string;
    headline: string;
    description?: string;
    severity?: string;
    expires?: string;
    url?: string;
  }[];
  retrievedAt?: string;
  source?: string;
  unavailable?: boolean;
}
export interface Draft {
  description?: string;
  issueType?: IssueType;
  photoId?: string;
  photoUrl?: string;
  assessment?: Assessment;
  expiresAt?: string;
  confirmedIncidentId?: string | null;
}
export const categories: Record<IssueType, string> = {
  blocked_drain: "Blocked drain",
  standing_water: "Standing water",
  damaged_drain: "Damaged drain",
  other: "Other concern",
};
export const statuses: Record<Status, string> = {
  pending_review: "Community review",
  under_review: "Moderator review",
  closed: "Closed with follow-up",
};
