# Photograph and storage validation

Verified October 10, 2026. These are four deliberately chosen public reference photographs, not a measured accuracy benchmark or confirmation of local drainage conditions. No reference image was submitted as a real community incident.

## Reference sources and attribution

| Reference | Source and credit | License | Visual inspection |
| --- | --- | --- | --- |
| Leaves blocking an outfall | [Leaf collection: storm sewer outfall clogged with leaves](https://www.usgs.gov/media/images/leaf-collection-storm-sewer-outfall-clogged-leaves), U.S. Geological Survey, Upper Midwest Water Science Center | Public domain, explicitly identified on the USGS source page | Concrete drainage pipe with an accumulation of fallen leaves and organic debris |
| Mostly clear street grate | [Storm Drain Dryden.JPG](https://commons.wikimedia.org/wiki/File:Storm_Drain_Dryden.JPG), Michelle Arseneault; requested attribution: Dhscommtech at English Wikipedia | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | Most grate openings remain visible; a few leaves are present |
| Roadway puddle | [Street Puddle.jpg](https://commons.wikimedia.org/wiki/File:Street_Puddle.jpg), Federico Conti | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | Standing water near a curb and crosswalk; no visible drain |
| Unrelated photograph | [Orange-Whole-&-Split.jpg](https://commons.wikimedia.org/wiki/File:Orange-Whole-%26-Split.jpg), Evan-Amos | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | Whole and cut oranges on a white background |

Each image was inspected before sending it to Gemini; no recognizable people, license plates, or private identifying details were observed. Original downloads and local assessment records are confined to ignored `.tmp/live-fixtures/`; media is not committed. The application sanitizer rotates/resizes as needed, removes EXIF/GPS metadata, and re-encodes to JPEG before analysis. Any shared derivative of the Commons images must preserve attribution, identify these changes, and use the same or a compatible license. Source authors do not endorse DrainDispatch.

## Live Gemini results

The configured and source fallback model is `gemini-3.1-flash-lite`. The official project model inventory supported `generateContent` for this model. A direct HTTP request on the USGS photo returned a valid assessment in approximately 15.5 seconds. The application service also completed all four references with its strict output schema and bounded 60-second deadline:

| Reference | Drain visible | Suggested category | Human review recommended | Reported uncertainty |
| --- | --- | --- | --- | --- |
| Leaves blocking an outfall | Yes | `blocked_drain` | No | Low |
| Mostly clear street grate | Yes | `other` | No | Low |
| Roadway puddle | No | `standing_water` | No | Low |
| Unrelated oranges | No | `other` | Yes | Low |

The first Flash Lite batch completed the grate and puddle; the blocked-outfall and unrelated requests failed, then each completed on one separate bounded retry. The earlier `gemini-3.8-flash` configuration passed the synthetic unrelated fixture but timed out on photographic evaluation, including a direct 20-second probe and an application 60-second attempt. A `gemini-2.5-flash` direct probe returned HTTP 404 despite appearing in the inventory. These results motivated the model change; they do not establish uninterrupted provider availability. AI text remains an editable suggestion, and a report can proceed with a manually entered observation if analysis fails.

## Live Cloudinary results

The opt-in `server/src/services/images.live-check.ts` verified authenticated access, sanitized upload, persistent HTTPS delivery, byte-for-byte round trip, JPEG output, metadata removal, and successful cleanup of only the newly created test asset. It used a generated geometric fixture; no claim of photographic assessment follows from that fixture. Cloudinary identifiers, delivery URLs, credentials and raw provider errors were excluded from output. The four public photographic Gemini checks did not create additional Cloudinary assets.

A separate real-photo API integration check uploaded the licensed USGS photograph through `/api/uploads`, verified its Cloudinary HTTPS delivery as JPEG with EXIF/XMP/IPTC removed, and verified the photo row in the connected Tiger Data PostgreSQL database. `/api/analyze` returned a strict valid `blocked_drain` assessment with a visible drain, and the assessment was persisted on that photo row. The check then removed exactly its freshly created, unreferenced photo row and Cloudinary asset; both cleanup operations succeeded. It created no incident or report draft.

The subsequent owner-operated iPhone session verified the actual Photon photograph, completed reply send, persisted Gemini assessment, Cloudinary metadata-free JPEG delivery, confirmed Tiger Data incident/photo observation and loaded dashboard image/findings/history. [Verification evidence](verification-evidence.md) distinguishes this transport proof from the public-reference API probes. The owner reported a working image and upload; a prematurely closed temporary tunnel prevented their final dashboard inspection and was restored without deleting any photo, assessment or report.

## iPhone formats

The installed Windows sharp 0.35.5/libvips 8.18.7 binary advertises HEIF input only for `.avif`; it does not include the HEVC codec needed for HEIC. [Sharp's official output documentation](https://sharp.pixelplumbing.com/api-output/#heif) requires a custom libvips build for HEIC, and its [installation guide](https://sharp.pixelplumbing.com/install/) says global libvips is unsupported on Windows. Do not interpret a `heif` format entry as demonstrated HEIC support. Web and messaging ingestion therefore continue to accept still JPEG, PNG, and WebP images, capped at 8 MB and 25 megapixels before decoding.

For the real iPhone test, use a JPEG or PNG screenshot, or take a new photograph after selecting Settings → Camera → Formats → Most Compatible. [Apple documents that new captures then use JPEG](https://support.apple.com/116944). Messages may automatically convert an incompatible format, but that behavior is not a guarantee that this worker can decode HEIC. The application provides explicit compatibility guidance when unsupported files are rejected; no HEIC success has been claimed or simulated.

Cloudinary uses public HTTPS delivery. The metadata is removed before upload, but anyone who receives a photograph's delivery URL can view it. A pending draft token protects access to the draft itself; it does not make Cloudinary media private. A real phone photo should exclude people and identifying details that the reporter does not intend to share. Photo upload can precede incident confirmation, and abandoned uploads currently have no scheduled deletion.

## Automated validation

`server/src/services/images.test.ts` verifies strict assessment parsing, rejection of malformed/extra/unsupported fields, mandatory correction of blocked/damaged claims without a visible drain, safe provider error translation, byte-based format validation, metadata removal and orientation correction, resize limits, rejected forged/oversized payloads, missing credentials, and persistent local development storage with production rejection. Successful test execution does not replace the live service evidence above.
