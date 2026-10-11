import { MessageCircle, RefreshCw } from "lucide-react";
import type { Stats } from "./types";

const shortDate = (value: string) => new Date(value).toLocaleDateString([], {
  month: "short", day: "numeric", timeZone: "UTC",
});

export default function ActivityTrend({ stats }: { stats?: Stats }) {
  const available = Array.isArray(stats?.activityOverTime);
  const period = stats?.activityPeriod;
  let days = stats?.activityOverTime ?? [];
  // Fill genuinely empty calendar buckets only when the API supplies its UTC window.
  if (period?.startDate && period.endDate) {
    const indexed = new Map(days.map(day => [day.date.slice(0, 10), day]));
    const start = new Date(period.startDate).getTime();
    const end = new Date(period.endDate).getTime();
    days = [];
    for (let time = start; time <= end && days.length < 366; time += 86_400_000) {
      const date = new Date(time).toISOString();
      days.push(indexed.get(date.slice(0, 10)) ?? {
        date, incidents: 0, observations: 0, statusChanges: 0,
      });
    }
  }
  const recent = days.slice(-7);
  const totalObservations = days.reduce((sum, day) => sum + Number(day.observations), 0);
  const totalStatusChanges = days.reduce((sum, day) => sum + Number(day.statusChanges), 0);
  const maximum = Math.max(1, ...recent.flatMap(day => [Number(day.observations), Number(day.statusChanges)]));
  const periodLabel = period ? `Past ${period.days} UTC days` : "Available activity history";
  return (
    <article className="analytics-card activity-card" aria-labelledby="activity-title">
      <div className="activity-heading">
        <div>
          <span className="eyebrow">A SHARED RECORD, OVER TIME</span>
          <h3 id="activity-title">Observation & review activity</h3>
          <p>New evidence and internal review updates, counted from the database.</p>
        </div>
        <div className="activity-totals" aria-label={periodLabel}>
          <span><MessageCircle size={16} /><strong>{available ? totalObservations : "—"}</strong> observations</span>
          <span><RefreshCw size={16} /><strong>{available ? totalStatusChanges : "—"}</strong> review updates</span>
          <small>{periodLabel}{period?.includesCurrentDay ? " · today is partial" : ""}</small>
        </div>
      </div>
      {available && recent.length ? (
        <>
          <div className="activity-chart-top">
            <span>{period?.endDate ? "Latest 7 calendar days · UTC" : "Latest reported days · UTC"}</span>
            <div className="activity-legend"><span><i />Observations</span><span><i />Review updates</span></div>
          </div>
          <div className="activity-chart" role="img" aria-label={recent.map(day => `${shortDate(day.date)} UTC: ${day.observations} observations, ${day.statusChanges} review updates`).join("; ")}>
            {recent.map(day => (
              <div className="activity-day" key={day.date} title={`${shortDate(day.date)} UTC · ${day.observations} observations · ${day.statusChanges} review updates`}>
                <div className="activity-bars">
                  <div className="activity-series"><span>{day.observations}</span><i style={{ height: `${Number(day.observations) / maximum * 100}px` }} /></div>
                  <div className="activity-series review-series"><span>{day.statusChanges}</span><i style={{ height: `${Number(day.statusChanges) / maximum * 100}px` }} /></div>
                </div>
                <small>{shortDate(day.date)}</small>
              </div>
            ))}
          </div>
          <details className="activity-data">
            <summary>View daily activity counts</summary>
            <div className="activity-table-wrap">
              <table>
                <caption>{periodLabel} · demo records excluded</caption>
                <thead><tr><th scope="col">Date (UTC)</th><th scope="col">Incidents</th><th scope="col">Observations</th><th scope="col">Review updates</th></tr></thead>
                <tbody>{days.map(day => <tr key={day.date}><th scope="row">{shortDate(day.date)}</th><td>{day.incidents}</td><td>{day.observations}</td><td>{day.statusChanges}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <div className="activity-empty"><MessageCircle size={22} /><p>{available ? "Your first observations and review updates will start this trend." : "The activity trend is unavailable right now."}</p></div>
      )}
      <p className="chart-footnote">Observations include initial reports and follow-ups. Review updates record internal status changes. These counts do not measure repairs or flood prevention. Demo records are excluded.</p>
    </article>
  );
}
