import { openDatabase } from "./database.js";
import { Reporting } from "../services/reporting.js";
const db = await openDatabase(),
  service = new Reporting(db);
for (const [index, input] of [
  {
    latitude: 35.9141,
    longitude: -79.0544,
    description:
      "DEMO: Leaves cover part of the curb drain grate. This is demonstration evidence, not a real report.",
    issueType: "blocked_drain" as const,
  },
  {
    latitude: 35.9097,
    longitude: -79.0505,
    description:
      "DEMO: Standing water observed near a walkway after rain. Cause has not been verified.",
    issueType: "standing_water" as const,
  },
  {
    latitude: 35.9162,
    longitude: -79.0634,
    description:
      "DEMO: Drain cover appears uneven in the demonstration scenario. Requires professional review.",
    issueType: "damaged_drain" as const,
  },
].entries())
  await service.create(
    {
      ...input,
      locationConfirmed: true,
      idempotencyKey: `demo-seed-v1-${index}`,
    },
    "demo",
    undefined,
    true,
  );
console.log(
  "Three explicitly labeled demo incidents ready. Real activity metrics exclude these.",
);
await db.close();
