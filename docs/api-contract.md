# Implemented API contract

All JSON uses camelCase. Errors have {error:{code,message}}; validation errors also include fields. Input UUIDs, coordinates, descriptions and enums are validated. Optional absent draft fields are omitted rather than serialized as NULL. Public serializers exclude message/phone identifiers and routing details.

Issue types: blocked_drain, standing_water, damaged_drain, other. Statuses: pending_review, under_review, closed (internal community/moderator statuses).

Incident: {id,latitude,longitude,description,issueType,status,isDemo,createdAt,updatedAt,observationCount}. Timestamps are ISO JSON strings. Observation: {id,description,source,createdAt,photoUrl?,assessment?}. Assessment: {drainVisible:boolean,suggestedCategory,visibleEvidence,humanReviewRecommended:boolean,uncertainty:'low'|'medium'|'high'}.

## Public endpoints

- GET /api/health: {ok,databaseMode,timeSeriesEnabled,capabilities:{gemini,photon,storage},prototype}. Configured capabilities do not prove live connectivity.
- GET /api/incidents: array of up to 500 incidents; query issueType, status, demo=true|false.
- GET /api/incidents/nearby?latitude=&longitude=&issueType=: same-category active candidates updated within 30 days and within 30m, with distanceMeters. Never merges automatically.
- GET /api/incidents/:id: incident plus observations.
- POST /api/incidents: {description,issueType,latitude,longitude,locationConfirmed:true,photoId?,idempotencyKey} → 201 incident. Description 5–2000 characters; idempotencyKey 8–150 characters. Identical retry returns original incident; changed payload with same key returns 409.
- POST /api/incidents/:id/observations: {description,photoId?,sameLocationConfirmed:true,idempotencyKey} → 201 {id,incidentId}. Identical retry does not add evidence twice.
- GET /api/incidents/:id/history: array {id,eventType,source,createdAt,metadata}.
- POST /api/uploads: multipart field **photo**, one JPEG/PNG/WebP ≤8MB and ≤25MP. Real bytes are decoded and re-encoded without EXIF/GPS metadata. → 201 {id,url,storage} only after persistence.
- POST /api/analyze: {photoId} → validated Assessment, persisted with photo; 503 for unavailable/failed Gemini. Does not create an incident or infer location.
- GET /api/stats: {totalIncidents,activeIncidents,closedIncidents,observationCount,byCategory:[{issueType,count}],overTime:[{date,count}],repeatedLocations:[{latitude,longitude,count}],databaseMode,timeSeriesEnabled,participationMeasure}. Excludes demo incidents/observations/events; trends count incident creation, not people. Repeated coordinates represent approximate clusters.
- GET /api/report-drafts/:token: {id,description,issueType,photoId?,photoUrl?,assessment?,expiresAt,confirmedIncidentId}; no-store; 410 after expiration.
- POST /api/report-drafts/:token/confirm: report body plus optional existingIncidentId and mandatory sameLocationConfirmed:true when matching. Single transaction, row lock, optional replaced uploaded photo, and single-use confirmation. Returns persisted incident; repeat confirmation returns original incident. Links expire after one hour.
- GET /api/weather: {alerts:[{id,event,headline,description,severity,expires,url}],source,retrievedAt,coverage,available}. Cached NWS rain/flood/thunderstorm alerts for Chapel Hill center. Failure returns 503 with available:false; no prediction or emergency dispatch.

## Protected endpoints

Moderator Bearer token: MODERATOR_TOKEN (independent of worker token).

- PATCH /api/incidents/:id/status: {status,evidence}; evidence 10–2000 characters. Transaction records status history and event, plus notifications only for consenting subscribers. Repeating current status creates no new event. Evidence is moderator-provided, not verified municipal response.

Worker Bearer token: WORKER_TOKEN, at least 24 characters and stable across API/worker restarts.

- POST /api/report-drafts: {description,issueType,photoId?,sourceMessageId} → 201 {token,expiresInSeconds}. Token hashes persist; repeat source ID retains its draft.
- POST /api/worker/messages: {id,senderId,chatId?,text,photoBase64?} → {responseText}. SDK identity is private; provider retry receipts are HMAC-keyed. Photo bytes use central image services. Only direct-message chat IDs support follow-ups.
- GET /api/worker/followups: {followups:[{id,chatId,responseText,leaseToken}]}; private, consent-checked, leased for two minutes, up to ten entries.
- POST /api/worker/followups/:id/authorize: {leaseToken} → {authorized}; rechecks consent and lease immediately before provider send.
- POST /api/worker/followups/:id/ack: {leaseToken} → {acknowledged} after successful send. Failures retry after lease expiration. STOP cancels pending leases; an already-sent/in-flight message cannot be recalled.

Public JSON bodies are limited to 64KB; authenticated provider photo requests allow 12MB. Rate limits apply to API traffic and a tighter limit applies to upload/AI operations. CORS allows exact configured client origins. No municipal submission integration exists.
