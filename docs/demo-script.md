# Two-minute judging demo

0:00–0:25: Explain the drain-observation coordination problem with a real photograph. Do not claim every obstruction causes flooding.

0:25–0:45: Send a real drain photograph with a REPORT caption in the configured Spectrum conversation. Human text reporting is verified. Claim live photo reporting only after its verification; keep a clearly labeled recorded backup for provider latency.

0:45–1:10: Show structured Gemini evidence, uncertainty and editable findings; confirm location on the map.

1:10–1:30: Open the persisted report, show its photograph, refresh, and add a second observation after explicitly choosing the same physical drain. Show the updated count/history. If using simulated contributors, identify them as such.

1:30–1:45: Show measured dashboard counts/time trends and official NWS context. Tiger Data cloud TLS, event hypertable and time_bucket queries are verified. Synthetic demos are excluded from real metrics.

1:45–2:00: Explain coordination and official reporting pathways. DrainDispatch is a student prototype, not a municipal or emergency service.

Recorded backup and rehearsal remain pending until the live workflow is verified.

## Spoken run of show

**0:00–0:18 — The problem.** “A resident notices leaves covering a drain. A photograph is useful, but a scattered message does not tell the neighborhood what has already been reported. DrainDispatch turns that observation into a shared record.”

**0:18–0:35 — Real messaging.** Send the photograph in the configured private iMessage conversation. “This is an actual Photon Spectrum message. Both text and photo transport have been verified on an iPhone.”

**0:35–0:55 — Visible evidence.** Show the reply and photograph. “Gemini describes visible evidence and returns a category and uncertainty. These are editable suggestions. We sanitize the image, remove its location metadata, and store the photograph in Cloudinary.”

**0:55–1:15 — Confirm and persist.** Review the location and open the saved incident. “A photo does not establish GPS. The resident explicitly confirms the location before publishing. Tiger Data persists the incident, photograph association, observation and event history. Refreshing the dashboard retains the evidence.”

**1:15–1:35 — Coordinate.** Show a nearby candidate and explicit same-drain choice. “Nearby drains can be different drains. We suggest candidates, then ask for confirmation. Another observation extends the existing record, while retries do not create duplicate evidence.”

**1:35–1:50 — Environmental context.** Show the activity table and weather strip. “Timescale daily queries track observations and internal review changes in UTC. Synthetic tests stay out of real metrics. Official National Weather Service alerts add context without inventing flood predictions.”

**1:50–2:00 — Close.** “DrainDispatch connects observations to evidence and follow-up. The official Town link supports the next step; our community status does not claim a municipal repair.”

## Operator checklist

- Verify the API, private worker and temporary HTTPS session before judging; an ended tunnel invalidates its host even if the private token has time remaining.
- Use a reporter-approved JPEG/PNG/WebP without identifying people. For HEIC, use a JPEG/PNG screenshot or Most Compatible capture. Stay in a safe place.
- Keep confirmation links and provider conversations off shared source/logs. Never project a terminal containing private configuration.
- Use RESUME in the same private conversation when a test URL changes; the saved photograph and findings do not need another upload. Opening a confirmed report should inspect it, not re-submit it.
- Show labeled test records through the demo option. Explain that real metric cards exclude them; never relabel synthetic reports to make counts look larger.
- For two-contributor evidence, state that the cloud probe used two simulated identities unless two humans actually performed the live step. No claim of municipal participation.
- Keep a local screenshot backup in docs/screenshots and rehearse with a stopwatch. Phone recording and narrated two-minute backup remain owner-operated steps; do not claim they exist before recording.
- Close the temporary session when the owner/judges finish or its announced safety deadline expires. Durable hosting requires a separate deployment.
