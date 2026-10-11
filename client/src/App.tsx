import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCheck,
  ChevronRight,
  CloudSun,
  Droplets,
  Eye,
  Filter,
  Leaf,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Waves,
} from "lucide-react";
import DrainMap from "./DrainMap";
import IncidentDetail from "./IncidentDetail";
import ReportForm from "./ReportForm";
import ActivityTrend from "./ActivityTrend";
import { ClearflowIntro, ClearflowCommunity, ClearflowFooter } from "./Clearflow";
import "./clearflow-theme.css";
import "./clearflow-live.css";
import { api, date, list } from "./api";
import {
  categories,
  statuses,
  type Incident,
  type IssueType,
  type Stats,
  type Status,
  type Weather,
} from "./types";
export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>([]),
    [stats, setStats] = useState<Stats>(),
    [weather, setWeather] = useState<Weather>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [updated, setUpdated] = useState<Date>(),
    [reportOpen, setReportOpen] = useState(false),
    [selected, setSelected] = useState<Incident>(),
    [category, setCategory] = useState("all"),
    [status, setStatus] = useState("active"),
    [query, setQuery] = useState(""),
    [showDemo, setShowDemo] = useState(false),
    [focusedIncident, setFocusedIncident] = useState<Incident>(),
    [revealSavedReport, setRevealSavedReport] = useState(false);
  const draftToken = useMemo(
    () =>
      new URLSearchParams(location.search).get("draft") ||
      location.pathname.match(/^\/confirm\/([^/]+)\/?$/)?.[1] ||
      undefined,
    [],
  );
  const [activeDraft, setActiveDraft] = useState(draftToken);
  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    void api<Weather>("/weather")
      .then(setWeather)
      .catch(() => setWeather(undefined));
    const results = await Promise.allSettled([
      api<Incident[] | { incidents: Incident[] }>("/incidents"),
      api<Stats>("/stats"),
    ]);
    if (results[0].status === "fulfilled") {
      setIncidents(list(results[0].value, "incidents"));
      setError("");
      setUpdated(new Date());
    } else setError(results[0].reason.message);
    if (results[1].status === "fulfilled") setStats(results[1].value);
    else setStats(undefined);
    setLoading(false);
  }, []);
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(true), 30000);
    return () => clearInterval(interval);
  }, [refresh]);
  const filtered = useMemo(
    () =>
      incidents.filter(
        (i) =>
          (showDemo || !i.isDemo) &&
          (category === "all" || i.issueType === category) &&
          (status === "all" ||
            (status === "active"
              ? i.status !== "closed"
              : i.status === status)) &&
          `${i.description} ${categories[i.issueType]} ${i.id}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [incidents, category, status, query, showDemo],
  );
  const metrics = [
    {
      label: "Active incidents",
      value: stats?.activeIncidents,
      icon: Droplets,
      note: "Open reports",
      color: "blue",
    },
    {
      label: "Community observations",
      value: stats?.observationCount,
      icon: Eye,
      note: "Reports and follow-ups",
      color: "green",
    },
    {
      label: "Closed incidents",
      value: stats?.closedIncidents,
      icon: CheckCheck,
      note: "Marked closed",
      color: "teal",
    },
    {
      label: "Total incidents",
      value: stats?.totalIncidents,
      icon: MapPin,
      note: "All statuses",
      color: "amber",
    },
  ];
  const visibleDemos = filtered.filter(incident => incident.isDemo);
  const handleCreated = useCallback((incident: Incident) => {
    setIncidents(current => [incident, ...current.filter(item => item.id !== incident.id)]);
    if (incident.isDemo) setShowDemo(true);
    setQuery("");
    setCategory("all");
    setStatus("all");
    setFocusedIncident(incident);
    setRevealSavedReport(true);
    void refresh();
  }, [refresh]);
  function closeReport() {
    setReportOpen(false);
    if (activeDraft) {
      setActiveDraft(undefined);
      history.replaceState(
        {},
        "",
        location.pathname.startsWith("/confirm/") ? "/" : location.pathname,
      );
    }
    if (revealSavedReport) {
      setRevealSavedReport(false);
      requestAnimationFrame(() => document.getElementById("dashboard")?.scrollIntoView({ block: "start" }));
    }
  }
  return (
    <div className="clearflow-home">
      <a href="#dashboard" className="skip-link">
        Skip to incident dashboard
      </a>
      <ClearflowIntro onReport={() => setReportOpen(true)} />
      <main>
        <div className="main-shell clearflow-live">
          <section
            className="weather-strip"
            aria-label="Official weather context"
          >
            <CloudSun size={24} />
            <div>
              <strong>
                {weather?.alerts?.length
                  ? weather.alerts[0].event
                  : weather && !weather.unavailable
                    ? "Chapel Hill weather"
                    : "Weather unavailable"}
              </strong>
              <span>
                {weather?.alerts?.length
                  ? weather.alerts[0].headline
                  : weather && !weather.unavailable
                    ? "No current rain, flood or thunderstorm alerts for Chapel Hill."
                    : "Check the National Weather Service for current alerts."}
              </span>
            </div>
            <a
              href={weather?.alerts?.[0]?.url || "https://www.weather.gov/rah/"}
              target="_blank"
              rel="noreferrer"
            >
              {weather?.alerts?.length
                ? "Read official alert"
                : "National Weather Service"}
              <ArrowUpRight size={14} />
            </a>
          </section>
          {weather?.alerts?.length ? (
            <div className="notice weather-notice">
              <ShieldCheck size={20} />
              <span>
                Stay out of floodwater and roadways. Follow official weather
                instructions.{" "}
                {weather.alerts.length > 1
                  ? `${weather.alerts.length} active alerts. `
                  : ""}
                Updated{" "}
                {weather.retrievedAt
                  ? new Date(weather.retrievedAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "by NWS"}
                .
              </span>
            </div>
          ) : null}
          <p className="metrics-context">Real reports only · Demo reports are excluded</p>
          <section className="metrics" aria-label="Measured community activity">
            {metrics.map(({ label, value, icon: Icon, note, color }) => (
              <article className="metric-card" key={label}>
                <div className="metric-top">
                  <span>{label}</span>
                  <span className={`metric-icon ${color}`}>
                    <Icon size={19} />
                  </span>
                </div>
                <strong>
                  {value === undefined ? "—" : value.toLocaleString()}
                </strong>
                <small>{note}</small>
              </article>
            ))}
          </section>
          {showDemo && (
            <div className="demo-preview-notice" role="status">
              <span><strong>Demo preview</strong> · {visibleDemos.length} demo reports shown · {visibleDemos.filter(item => item.status !== "closed").length} active · {visibleDemos.filter(item => item.status === "closed").length} closed</span>
              <small>Demo reports are excluded from statistics.</small>
            </div>
          )}
          <section className="dashboard-section" id="dashboard">
            <div className="section-heading">
              <div>
                <span className="eyebrow">CHAPEL HILL REPORTS</span>
                <h2>Community drainage map</h2>
                <p>View reports and add observations.</p>
              </div>
              <div className="live-controls">
                <span className="live-label">
                  <span className={`pulse-dot ${error ? "offline" : ""}`} />
                  {error
                    ? "Connection unavailable"
                    : updated
                      ? "Refreshes every 30 seconds"
                      : "Connecting"}
                </span>
                <button
                  className="button secondary compact"
                  onClick={() => void refresh()}
                  disabled={loading}
                >
                  <RefreshCw size={15} className={loading ? "spin" : ""} />
                  Refresh
                </button>
              </div>
            </div>
            {error && (
              <div className="notice error" role="alert">
                <span>
                  {error}
                </span>
                <button className="text-link" onClick={() => void refresh()}>
                  Try again
                </button>
              </div>
            )}
            <div className="dashboard-panel">
              <div className="map-toolbar">
                <div className="search-field">
                  <Search size={17} />
                  <input
                    aria-label="Search incident descriptions"
                    placeholder="Search the neighborhood…"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setFocusedIncident(undefined); }}
                  />
                </div>
                <label className="filter-select">
                  <Filter size={15} />
                  <select
                    aria-label="Filter by issue type"
                    value={category}
                    onChange={(e) => { setCategory(e.target.value); setFocusedIncident(undefined); }}
                  >
                    <option value="all">All concerns</option>
                    {Object.entries(categories).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <select
                  aria-label="Filter by incident status"
                  value={status}
                  onChange={(e) => { setStatus(e.target.value); setFocusedIncident(undefined); }}
                >
                  <option value="active">Active incidents</option>
                  <option value="all">All statuses</option>
                  {Object.entries(statuses).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="map-and-list">
                <div className="dashboard-map">
                  <DrainMap incidents={filtered} onSelect={setSelected} focus={focusedIncident} />
                  <div className="map-location-label">
                    <MapPin size={14} />
                    {focusedIncident ? "Saved report location" : "Chapel Hill, NC"}
                  </div>
                  <div className="map-legend">
                    <span>
                      <i className="legend-amber" />
                      Drainage concern
                    </span>
                    <span>
                      <i className="legend-blue" />
                      Standing water
                    </span>
                    <span>
                      <i className="legend-green" />
                      Closed
                    </span>
                  </div>
                </div>
                <aside
                  className="incident-list"
                  aria-label="Filtered incidents"
                >
                  <div className="list-heading">
                    <h3>In the neighborhood</h3>
                    <span>{filtered.length}</span>
                  </div>
                  {loading && !updated ? (
                    <div className="list-empty">
                      <LoaderCircle size={28} className="spin" />
                      <strong>Loading reports…</strong>
                    </div>
                  ) : filtered.length ? (
                    filtered.map((i) => (
                      <button
                        key={i.id}
                        className="incident-card"
                        onClick={() => setSelected(i)}
                      >
                        <div className="incident-card-top">
                          <span className={`category-dot ${i.issueType}`}>
                            <Droplets size={15} />
                          </span>
                          <strong>{categories[i.issueType]}</strong>
                          <ChevronRight size={16} />
                        </div>
                        <p>{i.description}</p>
                        <div className="incident-card-bottom">
                          <span className={`status-badge ${i.status}`}>
                            {statuses[i.status as Status]}
                          </span>
                          <span>
                            <Eye size={12} />
                            {i.observationCount}
                          </span>
                        </div>
                        <small>
                          {date(i.createdAt)}
                          {i.isDemo ? " · Demo report" : ""}
                        </small>
                      </button>
                    ))
                  ) : (
                    <div className="list-empty">
                      <span className="empty-icon">
                        <Waves size={30} />
                      </span>
                      <strong>
                        {error
                          ? "Reports unavailable"
                          : incidents.length
                            ? "No matching reports"
                            : "No reports yet"}
                      </strong>
                      <p>
                        {error
                          ? "Try refreshing to load reports."
                          : incidents.length
                            ? "Try another filter."
                            : "Saved reports appear here."}
                      </p>
                      <button
                        className="button secondary compact"
                        onClick={() => setReportOpen(true)}
                      >
                        <Plus size={15} />
                        Add an observation
                      </button>
                    </div>
                  )}
                  <div className="list-footer">
                    <label>
                      <input
                        type="checkbox"
                        checked={showDemo}
                        onChange={(e) => { setShowDemo(e.target.checked); setFocusedIncident(undefined); }}
                      />
                      Include labeled demo reports
                    </label>
                    {showDemo && <p className="demo-summary">{visibleDemos.length} labeled demo reports match these filters. Demo records are excluded from real statistics.</p>}
                  </div>
                </aside>
              </div>
              <div className="dashboard-bottom">
                <span>
                  <ShieldCheck size={14} />
                  Community reports · Human review
                </span>
                <span>
                  {updated
                    ? `Last refreshed ${updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                    : "Waiting for data"}
                </span>
              </div>
            </div>
          </section>
          <section id="impact" className="impact-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  REPORT STATISTICS
                </span>
                <h2>Reporting activity</h2>
                <p>Counts and trends from saved reports.</p>
              </div>
              <span className="data-source">
                <span className="pulse-dot" />
                {stats ? "Live report counts" : "Metrics unavailable"}
              </span>
            </div>
            <div className="analytics-grid">
              <article className="analytics-card">
                <div className="analytics-heading">
                  <h3>Reports by type</h3>
                  <span>By concern type</span>
                </div>
                {Object.entries(categories).map(([key, label]) => {
                  const count = Number(
                      stats?.byCategory?.find(
                        (c) => c.issueType === (key as IssueType),
                      )?.count || 0,
                    ),
                    total = stats?.totalIncidents || 0;
                  return (
                    <div className="category-stat" key={key}>
                      <div>
                        <span>{label}</span>
                        <strong>{stats ? count : "—"}</strong>
                      </div>
                      <div className="bar-track">
                        <i
                          className={key}
                          style={{
                            width: `${total ? (count / total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
                <p className="chart-footnote">
                  Demo records are excluded from these measurements.
                </p>
              </article>
              <article className="analytics-card">
                <div className="analytics-heading">
                  <h3>Incidents over time</h3>
                  <span>Daily incident reports · UTC</span>
                </div>
                {stats?.overTime?.length ? (
                  <div
                    className="timeline-chart"
                    role="img"
                    aria-label={stats.overTime
                      .map((p) => `${date(p.date)}: ${p.count} reports`)
                      .join("; ")}
                  >
                    {stats.overTime.slice(-14).map((p) => (
                      <div className="chart-column" key={p.date}>
                        <span>{p.count}</span>
                        <i
                          style={{
                            height: `${Math.max(4, (Number(p.count) / Math.max(...stats.overTime.map((v) => Number(v.count)), 1)) * 100)}px`,
                          }}
                        />
                        <small>
                          {new Date(p.date).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            timeZone: "UTC",
                          })}
                        </small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="chart-empty">
                    <Waves size={28} />
                    <p>
                      {stats
                        ? "No reports yet."
                        : "Statistics unavailable."}
                    </p>
                  </div>
                )}
                <div className="repeated-note">
                  <RefreshCw size={15} />
                  <span>
                    {stats
                      ? `${stats.repeatedLocations?.length || 0} areas with repeated incident activity`
                      : "Repeated-location data unavailable"}
                  </span>
                </div>
                {!!stats?.repeatedLocations?.length && (
                  <details className="recurring-areas">
                    <summary>Areas with repeated reports</summary>
                    <ul>
                      {stats.repeatedLocations.map((area, index) => (
                        <li key={index}>
                          <span>
                            {Number(area.latitude).toFixed(4)},{" "}
                            {Number(area.longitude).toFixed(4)}
                          </span>
                          <strong>{area.count} incidents</strong>
                        </li>
                      ))}
                    </ul>
                    <p>
                      Grouped by rounded coordinates. Nearby drains can be
                      distinct.
                    </p>
                  </details>
                )}
              </article>
              <article className="waterway-card">
                <div className="waterway-art">
                  <Waves size={42} />
                  <Leaf size={27} />
                </div>
                <span className="eyebrow">STORMWATER</span>
                <h3>
                  Stormwater
                  <br />
                  resources
                </h3>
                <p>
                  Read the Town’s stormwater guidance and reporting information.
                </p>
                <a
                  href="https://www.chapelhillnc.gov/Town-Government/Departments-and-Offices/Public-Works/Stormwater-Management"
                  target="_blank"
                  rel="noreferrer"
                >
                  Town stormwater resources <ArrowUpRight size={15} />
                </a>
              </article>
            </div>
            <ActivityTrend stats={stats} />
          </section>
        </div>
      </main>
      <ClearflowCommunity onReport={() => setReportOpen(true)} />
      <ClearflowFooter />
      {(reportOpen || activeDraft) && (
        <ReportForm
          draftToken={activeDraft}
          onClose={closeReport}
          onCreated={handleCreated}
        />
      )}{" "}
      {selected && (
        <IncidentDetail
          incident={selected}
          onClose={() => setSelected(undefined)}
          onChanged={() => void refresh()}
        />
      )}
    </div>
  );
}
