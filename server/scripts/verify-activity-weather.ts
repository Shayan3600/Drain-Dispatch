import pg from "pg";
import { resolveDatabaseConfig } from "../src/config.js";
import type { Database } from "../src/db/database.js";
import { Reporting } from "../src/services/reporting.js";

const result: Record<string,boolean|number|string> = {};
let client: pg.Client | undefined;
try {
  const configuration = resolveDatabaseConfig(process.env);
  if (!configuration) throw new Error("Cloud configuration required");
  client = new pg.Client({...configuration,connectionTimeoutMillis:10000});
  await client.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL TIME ZONE 'America/Los_Angeles'");
  const timescale = (await client.query("SELECT 1 FROM pg_extension WHERE extname='timescaledb'")).rows.length > 0;
  if (timescale) {
    const boundary = (await client.query("SELECT time_bucket('1 day',TIMESTAMPTZ '2026-10-10 00:00:01+00',timezone => 'UTC') = TIMESTAMPTZ '2026-10-10 00:00:00+00' correct")).rows[0];
    result.cloudBucketBoundaryUsesUtc = boundary.correct === true;
  }
  const connection = client;
  const database: Database = {mode:"postgresql",timescale,query:(sql,params)=>connection.query(sql,params),transaction:fn=>fn({query:(sql,params)=>connection.query(sql,params)}),close:()=>connection.end()};
  const stats = await new Reporting(database).stats();
  result.cloudActivityQuerySucceeded = true;
  result.timescaleBucketsUsed = stats.timeSeriesEnabled;
  result.utcThirtyDayWindow = stats.activityPeriod.timeZone === "UTC" && stats.activityPeriod.days === 30 && stats.activityPeriod.startDate.endsWith("T00:00:00.000Z") && stats.activityPeriod.endDate.endsWith("T00:00:00.000Z");
  result.realObservationTotal = stats.observationCount;
  result.activityBucketCount = stats.activityOverTime.length;
  result.validActivityCounts = stats.activityOverTime.every(row => [row.incidents,row.observations,row.statusChanges].every(count => Number.isInteger(count) && count >= 0));
  const reference = (await client.query("SELECT count(*)::int count FROM observations o JOIN incidents i ON i.id=o.incident_id WHERE NOT i.is_demo AND o.created_at >= $1::timestamptz AND o.created_at <= now()",[stats.activityPeriod.startDate])).rows[0].count;
  result.observationBucketsMatchRealRows = stats.activityOverTime.reduce((total,row)=>total+row.observations,0) === reference;
  await client.query("ROLLBACK");
} catch { result.cloudActivityQuerySucceeded = false; process.exitCode = 1; }
finally { try { await client?.end(); } catch { process.exitCode = 1; } }
try {
  const response = await fetch("http://localhost:3001/api/weather",{signal:AbortSignal.timeout(12000)});
  const weather = await response.json() as {available?:boolean;source?:string;coverage?:string;alerts?:unknown[];retrievedAt?:string;error?:{code?:string}};
  result.weatherHttpStatus = response.status;
  result.weatherOfficialSource = weather.source === "National Weather Service";
  result.weatherAvailable = weather.available === true;
  result.weatherAlertArray = Array.isArray(weather.alerts);
  result.weatherAlertCount = Array.isArray(weather.alerts) ? weather.alerts.length : 0;
  result.weatherHonestFallback = response.status === 503 && weather.available === false && weather.error?.code === "WEATHER_UNAVAILABLE";
  result.weatherCoverageDisclosed = weather.coverage === "Chapel Hill center; not a forecast for each incident";
  result.weatherRetrievalTimestamp = typeof weather.retrievedAt === "string" && Number.isFinite(Date.parse(weather.retrievedAt));
  result.weatherRecentlyRetrieved = result.weatherRetrievalTimestamp === true && Date.now()-Date.parse(weather.retrievedAt!) >= 0 && Date.now()-Date.parse(weather.retrievedAt!) <= 310000;
} catch { result.weatherEndpointReachable = false; }
console.log(JSON.stringify(result));
