# Clearflow release review

This review applies to `development/clearflow-preview`. Production remains unchanged. Prior live sponsor verification is recorded in `integration-status.md`; local tests do not repeat that live acceptance.

## Fixes in this preview

- Employee evidence keeps the full photograph visible, opens the original image in a separate tab and supports retry after a failed load. Reference photographs retain provenance and watermarks. Actual submitted test photographs are distinguished from illustrative reference images.
- Real reports and labeled demos have separate duplicate suggestions and confirmation targets. Explicit observations on a selected demo incident remain available.
- Incoming group messages are rejected before attachment processing or report creation, keeping private confirmation replies in direct conversations.
- Attachment downloads have a total deadline and cancellation, so a stalled photo cannot hold the serial message worker indefinitely.
- A temporary draft-read failure offers retry without losing form input. An expired or invalid draft still requires recovery through the originating conversation.
- Map incident loading and statistics are independent. Evidence remains visible when history is unavailable; failed reads can be retried.

## Before promoting the preview

1. Review community and employee pages on desktop Brave and an iPhone. The automated browser suite uses synthetic data and intercepts external map tiles.
2. Apply additive migrations with the approved production release. Preserve existing records, pending drafts and cached receipts; never reset the database.
3. After promotion, repeat a private iPhone photo report, location confirmation, saved-image/map check and sender-scoped RESUME using the durable HTTPS URL.
4. Verify a consented status notification and a controlled worker/API restart against the hosted services. Delivery is at least once; STOP cannot recall a message already in flight.
5. Repeat source, public-build and outgoing-history secret scans before publishing or deploying. Configure secrets only in the hosting platform's dedicated settings.

## Remaining product and operational limits

- **Employee access:** the login is explicitly a read-only demo entry. Real employee accounts, role assignment and municipal authorization are not implemented. Protected moderation and worker APIs retain separate server authorization.
- **Municipal workflow:** packets and the Town reporting link help prepare a submission. Clearflow does not file automatically or verify municipal acceptance, inspection or repair.
- **Map and matching:** markers are community-submitted locations. Nearby suggestions use distance/category/age, not verified drain identities. A municipal infrastructure layer and authoritative asset identifiers remain future work.
- **Analytics:** counts describe incidents, observations and status events, not unique people, hazard severity or independently verified repairs. The employee queue has a bounded result set; city-scale use needs pagination.
- **Weather:** official alerts cover the Chapel Hill center and can be unavailable. Per-location forecasts and flood prediction are not implemented.
- **Photos:** JPEG, PNG and WebP are supported; this runtime cannot decode HEIC. Abandoned-upload retention and deletion need an operating policy and cleanup job. Reused reference photographs are illustrative, not independent evidence of multiple locations.
- **Assets:** supplied images and font credits retain their stated provenance. Third-party commercial-use rights are not independently established by including an asset in this repository.
- **Competition:** a recorded fallback, final rehearsal and current prize eligibility are still team acceptance items. Do not present automated tests or reference images as fresh live sponsor proof.

Public exports omit messaging identities and private draft capabilities. Draft lookup stores token hashes, while privileged idempotency receipts can cache the private reply text; database access and backups must therefore remain private.
