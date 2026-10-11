import { createHash } from "node:crypto";
import type { Database } from "./database.js";
import { cityReferencePhotos } from "./cityReferencePhotos.js";

const namespace = "city-showcase-v1";
export const showcaseCategories = ["blocked_drain", "standing_water", "damaged_drain", "other"] as const;
const statuses = ["pending_review", "under_review", "closed"] as const;
const zones = [
  { name: "Central Chapel Hill", lat: 35.9132, lon: -79.0558 },
  { name: "North Chapel Hill", lat: 35.9432, lon: -79.0558 },
  { name: "East Chapel Hill", lat: 35.9132, lon: -79.0158 },
  { name: "South Chapel Hill", lat: 35.8832, lon: -79.0558 },
  { name: "West Chapel Hill", lat: 35.9132, lon: -79.0958 },
  { name: "Northeast edge", lat: 35.9502, lon: -79.0118 },
];
const concerns = [
  "Leaves partially cover a curb-drain grate; extent of blockage unverified.",
  "Water pools beside a walkway after rain; drainage cause unverified.",
  "A drain grate appears uneven; structural condition requires professional review.",
  "Loose debris sits beside a runoff channel; impact on drainage is uncertain.",
];
function id(key: string) {
  const hex = createHash("sha256").update(`${namespace}:${key}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export interface ShowcasePhoto { filename: string; category: typeof showcaseCategories[number]; label: string; referenceFilename?: string }

/** Local-only deterministic, additive fixtures. Never calls AI, messaging, or city workflows. */
export async function seedCityShowcase(db: Database, anchor = new Date(), options: { referencePhotos?: boolean } = {}) {
  if (db.mode !== "local-postgresql") throw new Error("City showcase refuses non-local databases.");
  if (!Number.isFinite(anchor.getTime())) throw new Error("Invalid demo timestamp.");
  const photos: ShowcasePhoto[] = [];
  const anchorTime = Math.floor(anchor.getTime()/3600000)*3600000;
  await db.transaction(async c => {
    for (let categoryIndex=0; categoryIndex<showcaseCategories.length; categoryIndex++) {
      for (let statusIndex=0; statusIndex<statuses.length; statusIndex++) {
        for (let variant=0; variant<4; variant++) {
          const index = categoryIndex*12+statusIndex*4+variant;
          const reference = `CITY DEMO ${String(index+1).padStart(2,"0")}`;
          const makePhoto = (observation: number): ShowcasePhoto => {
            const category = showcaseCategories[categoryIndex];
            const candidates = options.referencePhotos ? cityReferencePhotos.filter(photo => photo.category === category) : [];
            // Cycle within the matching concern only. Reuse is illustrative, not independent evidence.
            const photo = candidates.length ? candidates[(statusIndex*4+(variant===0 ? 0 : observation+1))%candidates.length] : undefined;
            return {filename:photo?.filename ?? `${namespace}-${String(index+1).padStart(2,"0")}-${observation+1}.svg`,category,label:`${reference} / submission ${observation+1}`,referenceFilename:photo?.filename};
          };
          const incidentId = id(`incident:${index}`);
          const existing = await c.query("SELECT is_demo,description FROM incidents WHERE id=$1",[incidentId]);
          if (existing.rows.length && (!existing.rows[0].is_demo || !existing.rows[0].description.startsWith(reference))) {
            throw new Error("Demo ID collision: existing records were not changed.");
          }
          // Preserve the entire saved scenario on reruns, including its original dates.
          if (existing.rows.length) {
            if (variant%2===0) for (let observation=0; observation<=variant; observation++) {
              const photo = makePhoto(observation);
              const saved = await c.query("SELECT url FROM photos WHERE id=$1",[id(`photo:${index}:${observation}`)]);
              if (saved.rows[0]?.url !== `/uploads/${photo.filename}`) throw new Error("Existing demo uses a different photo set. Start a fresh local showcase instead.");
              photos.push(photo);
            }
            continue;
          }
          const zone = zones[index%zones.length];
          const latitude = zone.lat+(Math.floor(index/6)%4-1.5)*0.002;
          const longitude = zone.lon+(variant-1.5)*0.002;
          const issueType = showcaseCategories[categoryIndex];
          const status = statuses[statusIndex];
          const submissionCount = statusIndex===1 && variant===3 ? 5 : statusIndex===2 && variant===2 ? 6 : statusIndex===2 && variant===3 ? 8 : variant+1;
          const hasPhoto = variant%2===0;
          const created = anchorTime-((index*7)%42)*86400000-8*3600000-variant*1800000;
          const latestObservation = created+(submissionCount-1)*3600000;
          // Later community-status events make update-order differ from observation-order.
          const updated = latestObservation+statusIndex*2*3600000;
          const description = `${reference} — ${zone.name}: ${concerns[categoryIndex]} Synthetic scenario and approximate coordinates, not an actual complaint.`;
          await c.query(`INSERT INTO incidents(id,latitude,longitude,description,issue_type,status,is_demo,created_at,updated_at)
            VALUES($1,$2,$3,$4,$5,$6,true,$7,$8) ON CONFLICT(id) DO NOTHING`,
          [incidentId,latitude,longitude,description,issueType,status,new Date(created),new Date(updated)]);
          for (let observation=0; observation<submissionCount; observation++) {
            const observationId = id(`observation:${index}:${observation}`);
            const at = new Date(created+observation*3600000);
            const photoId = hasPhoto && observation<=variant ? id(`photo:${index}:${observation}`) : null;
            const photo = photoId ? makePhoto(observation) : undefined;
            if (photoId) {
              const filename = photo!.filename;
              photos.push(photo!);
              await c.query(`INSERT INTO photos(id,url,storage_key,mime_type,created_at)
                VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`,
              [photoId,`/uploads/${filename}`,`demo:${filename}`,photo!.referenceFilename ? "image/png" : "image/svg+xml",at]);
            }
            const referencePhoto = cityReferencePhotos.find(item=>item.filename===photo?.referenceFilename);
            const photoDescription = referencePhoto
              ? `User-supplied reference photograph: ${referencePhoto.description} Original location and capture date unknown. Reused for illustrative demo scenarios; not evidence of this location, submission, or a change over time.`
              : photoId ? "Attached image is a labelled illustration, not a photograph." : "No photo attached.";
            await c.query(`INSERT INTO observations(id,incident_id,description,source,photo_id,created_at)
              VALUES($1,$2,$3,'demo',$4,$5) ON CONFLICT(id) DO NOTHING`,
            [observationId,incidentId,`${reference}: synthetic ${observation===0 ? "initial observation" : `follow-up ${observation}`} — ${observation%2===0 ? "scenario condition remains visible" : "extent uncertain; further human review needed"}. ${photoDescription} No resident, official inspection, or repair is implied.`,photoId,at]);
            await c.query(`INSERT INTO incident_events(id,incident_id,event_type,source,metadata,occurred_at)
              VALUES($1,$2,$3,'demo',$4,$5) ON CONFLICT(id,occurred_at) DO NOTHING`,
            [id(`event:${index}:observation:${observation}`),incidentId,observation===0 ? "incident_created" : "observation_added",JSON.stringify({demo:true,scenario:reference}),at]);
          }
          for (let change=1; change<=statusIndex; change++) {
            const at = new Date(latestObservation+change*2*3600000);
            const previousStatus = statuses[change-1];
            const nextStatus = statuses[change];
            const evidence = `${reference}: synthetic community ${nextStatus==="closed" ? "closure" : "review"} only. No municipal receipt, inspection, or repair is verified.`;
            await c.query(`INSERT INTO moderation_history(id,incident_id,previous_status,new_status,actor,evidence,created_at)
              VALUES($1,$2,$3,$4,'synthetic_demo_moderator',$5,$6) ON CONFLICT(id) DO NOTHING`,
            [id(`moderation:${index}:${change}`),incidentId,previousStatus,nextStatus,evidence,at]);
            await c.query(`INSERT INTO incident_events(id,incident_id,event_type,source,metadata,occurred_at)
              VALUES($1,$2,'status_changed','demo',$3,$4) ON CONFLICT(id,occurred_at) DO NOTHING`,
            [id(`event:${index}:status:${change}`),incidentId,JSON.stringify({demo:true,previousStatus,status:nextStatus,evidence}),at]);
          }
        }
      }
    }
  });
  return { reports:48, observations:152, photos, historyEvents:200, statusChanges:48 };
}

/** Code-drawn, visibly synthetic image; not evidence of a real drain or location. */
export function showcaseIllustration(photo: ShowcasePhoto) {
  const accents = { blocked_drain:"#b97831", standing_water:"#428ec0", damaged_drain:"#c16d5a", other:"#729281" };
  const accent = accents[photo.category];
  const title = photo.category.replaceAll("_"," ").toUpperCase();
  const overlay = photo.category==="standing_water"
    ? '<ellipse cx="400" cy="270" rx="200" ry="70" fill="#80bedd" opacity="0.8"/>'
    : photo.category==="blocked_drain" ? '<g fill="#bba35a"><ellipse cx="285" cy="225" rx="45" ry="20" transform="rotate(22 285 225)"/><ellipse cx="390" cy="255" rx="55" ry="22" transform="rotate(-20 390 255)"/><ellipse cx="490" cy="230" rx="40" ry="20"/></g>'
    : photo.category==="damaged_drain" ? '<path d="M365 185l55 50-35 25 50 55" stroke="#e39578" stroke-width="12" fill="none"/>'
    : '<g fill="#9aaf8d"><circle cx="530" cy="235" r="20"/><circle cx="560" cy="270" r="25"/><circle cx="530" cy="290" r="12"/></g>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><rect width="800" height="450" fill="#eef5f3"/><rect width="800" height="95" fill="${accent}"/><text x="30" y="38" fill="white" font-family="sans-serif" font-size="23" font-weight="bold">DEMO / SYNTHETIC ILLUSTRATION</text><text x="30" y="73" fill="white" font-family="sans-serif" font-size="18">${photo.label}</text><path d="M40 350h720" stroke="#c5d0cb" stroke-width="50"/><rect x="240" y="170" width="320" height="145" rx="12" fill="#586966"/>${[0,1,2,3,4,5,6].map(i=>`<rect x="${260+i*42}" y="185" width="17" height="115" rx="5" fill="#a7b7b0"/>`).join("")}${overlay}<text x="30" y="135" font-family="sans-serif" font-size="20" fill="#304c46">${title} — test scenario only</text><text x="30" y="414" font-family="sans-serif" font-size="18" fill="#304c46">Not a photograph. No actual complaint, hazard, or city repair implied.</text></svg>`;
}
