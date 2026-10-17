import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DataTable from "../../components/DataTable.jsx";
import MetricRow from "../../components/ui/MetricRow.jsx";
import { deriveTone } from "../../components/ui/StatValue.jsx";
import usePolling from "../../hooks/usePolling.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { PRIORITY_BADGE } from "../../config/priority.js";
import { purokLabel } from "../../utils/purokLabel.js";
import { getReports, getPriorityList, getHazardAlerts, getAffectedHouseholds } from "../../services/api.jsx";

const SEVERITIES = ["Critical", "High", "Medium", "Low"];
const SEVERITY_BADGE = { Low: "badge-low", Medium: "badge-medium", High: "badge-high", Critical: "badge-critical" };
const STATUS_BADGE = { Pending: "badge-pending", Verified: "badge-verified", Rejected: "badge-rejected" };
const SEVERITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const DAMAGE_KEYS = [["house_damage", "House"], ["infrastructure_damage", "Infra."], ["property_damage", "Property"], ["agricultural_damage", "Agri."]];

function damageSummary(r) {
  if (!Number(r.has_assessment)) return <span style={{ color: "var(--color-ink-soft)" }}>Not Yet Assessed</span>;
  const parts = DAMAGE_KEYS.filter(([k]) => r[k] && r[k] !== "None").map(([k, label]) => `${label} ${r[k]}`);
  return parts.length ? parts.join(", ") : "No Damage — Assessed";
}

/**
 * Hazard Monitoring (Phase 23) — Administrator and Relief Personnel.
 *
 * One page that replaces the former separate weather/hazard and incident
 * dashboards: recorded disaster incidents (pending and verified) with
 * severity, status, the affected household, damage, reported needs and the
 * household's DSS priority; summary figures; filters by type, severity, purok
 * and status; critical incidents highlighted; and the active hazard alerts.
 * Everything shown is recorded data — the system does not predict hazards.
 */
export default function HazardMonitoring() {
  const { user } = useAuth();
  const base = user?.role === "admin" ? "/admin" : user?.role === "field_officer" ? "/field" : "/personnel";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ type: "", severity: "", purok: "", status: "open", q: "" });

  const load = useCallback(async () => {
    const r = await Promise.allSettled([
      getReports(), getPriorityList(), getHazardAlerts({ active_only: "1" }), getAffectedHouseholds({ status: "Active" }),
    ]);
    if (r[0].status !== "fulfilled") {
      setError("We couldn't load the disaster incidents. Please refresh the page.");
      return;
    }
    setError("");
    setData({
      reports: r[0].value.data.data || [],
      priority: r[1].status === "fulfilled" ? r[1].value.data.data || [] : [],
      alerts: r[2].status === "fulfilled" ? (r[2].value.data.data || []).filter((a) => Number(a.is_active) === 1) : [],
      areas: r[3].status === "fulfilled" ? r[3].value.data.summary : null,
    });
  }, []);
  usePolling(load, { interval: 60000 });

  const priorityById = useMemo(() => {
    const m = new Map();
    (data?.priority || []).forEach((p) => m.set(p.household_id, p));
    return m;
  }, [data]);

  const reports = data?.reports || [];
  const types = useMemo(() => Array.from(new Set(reports.map((r) => r.disaster_type).filter(Boolean))).sort(), [reports]);
  const puroks = useMemo(() => Array.from(new Set(reports.map((r) => r.purok).filter(Boolean))).sort(), [reports]);

  const rows = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return reports
      .filter((r) => (filters.status === "open" ? r.status !== "Rejected" : !filters.status || r.status === filters.status))
      .filter((r) => !filters.type || r.disaster_type === filters.type)
      .filter((r) => !filters.severity || r.severity === filters.severity)
      .filter((r) => !filters.purok || r.purok === filters.purok)
      .filter((r) => !q || `${r.reference_no} ${r.head_of_family || ""} ${r.location || ""}`.toLowerCase().includes(q))
      .sort((a, b) => (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
        || (a.status === "Pending" ? -1 : 0) - (b.status === "Pending" ? -1 : 0)
        || String(b.report_date).localeCompare(String(a.report_date)))
      .map((r) => ({ ...r, id: r.report_id }));
  }, [reports, filters]);

  if (!data) return error ? <div className="alert alert-error">{error}</div> : <div className="loading-text">Loading hazard monitoring…</div>;

  const open = reports.filter((r) => r.status !== "Rejected");
  const pending = open.filter((r) => r.status === "Pending");
  const verified = open.filter((r) => r.status === "Verified");
  const critical = open.filter((r) => r.severity === "Critical");
  const high = open.filter((r) => r.severity === "High");
  const affectedHouseholds = new Set(open.map((r) => r.household_id).filter(Boolean)).size;
  const attention = open
    .filter((r) => r.severity === "Critical" || (r.severity === "High" && r.status === "Pending"))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || String(b.report_date).localeCompare(String(a.report_date)))
    .slice(0, 6);
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const filtersOn = filters.type || filters.severity || filters.purok || filters.status !== "open" || filters.q;

  // [label, value, tone] — tone derived from the data (see StatValue).
  const figures = [
    ["Incidents (not rejected)", open.length],
    ["Pending verification", pending.length, deriveTone(pending.length, "pending")],
    ["Verified", verified.length],
    ["Critical / High severity", `${critical.length} / ${high.length}`, critical.length > 0 ? "critical" : high.length > 0 ? "pending" : "ok"],
    ["Affected households", affectedHouseholds],
    ["Active hazard alerts", data.alerts.length, deriveTone(data.alerts.length, "critical")],
  ];
  if (data.areas) {
    figures.push(["Households in recorded affected areas", data.areas.households_in_recorded_affected_areas ?? data.areas.affected_households ?? 0]);
    figures.push(["Households in flood-prone zones (at risk)", data.areas.households_in_flood_prone_zones ?? 0]);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Hazard Monitoring</h1>
          <p>Recorded disaster incidents and affected households, with severity, status, damage, needs and DSS priority. Recorded data only — no forecasting.</p>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <section className="card summary-card" aria-labelledby="hm-summary">
        <h2 id="hm-summary" className="section-title">Monitoring summary</h2>
        <dl className="metric-list metric-grid">
          {figures.map(([label, value, tone]) => (
            <MetricRow key={label} label={label} value={value} tone={tone} />
          ))}
        </dl>
        <div className="summary-actions">
          <Link to={`${base}/map`} className="btn btn-secondary btn-sm">Open Barangay Map</Link>
          {user?.role === "admin" && <Link to="/admin/hazard-alerts" className="btn btn-ghost btn-sm">Manage Hazard Alerts</Link>}
          {user?.role === "admin" && <Link to="/admin/affected-areas" className="btn btn-ghost btn-sm">Flood &amp; Affected Areas</Link>}
        </div>
      </section>

      {attention.length > 0 && (
        <div className="card card-band card-band-red" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, marginTop: 0 }}>Needs attention ({attention.length})</h3>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.7 }}>
            {attention.map((r) => {
              const p = priorityById.get(r.household_id);
              return (
                <li key={r.report_id}>
                  <strong>{r.severity}</strong> · {r.reference_no} · {r.disaster_type} · {r.head_of_family || "No household"}
                  {r.purok ? `, ${purokLabel(r.purok)}` : ""} — {r.status}
                  {r.status === "Pending" ? " (verify the report)" : !Number(r.has_assessment) ? " (record the damage assessment)" : ""}
                  {p?.rank ? ` · DSS rank #${p.rank}` : ""}{" "}
                  <Link to={`${base}/reports?household_id=${r.household_id}`}>Open</Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {data.alerts.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, marginTop: 0 }}>Active hazard alerts</h3>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.7 }}>
            {data.alerts.map((a) => (
              <li key={a.alert_id}>
                <strong>{a.status}</strong> · {a.hazard_type} — {a.title} ({a.affected_purok ? purokLabel(a.affected_purok) : "barangay-wide"})
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: "6px 0 0" }}>Alerts are issued by the Administrator from official advisories.</p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row filter-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="hm-q">Search</label>
            <input id="hm-q" value={filters.q} onChange={set("q")} placeholder="Reference, household or location" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="hm-type">Type</label>
            <select id="hm-type" value={filters.type} onChange={set("type")}>
              <option value="">All types</option>
              {types.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="hm-sev">Severity</label>
            <select id="hm-sev" value={filters.severity} onChange={set("severity")}>
              <option value="">All severities</option>
              {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="hm-purok">Purok</label>
            <select id="hm-purok" value={filters.purok} onChange={set("purok")}>
              <option value="">All puroks</option>
              {puroks.map((p) => <option key={p} value={p}>{purokLabel(p)}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="hm-status">Status</label>
            <select id="hm-status" value={filters.status} onChange={set("status")}>
              <option value="open">Pending + Verified</option>
              <option value="Pending">Pending</option>
              <option value="Verified">Verified</option>
              <option value="Rejected">Rejected</option>
              <option value="">All</option>
            </select>
          </div>
          {filtersOn && (
            <div className="form-group" style={{ marginBottom: 0, alignSelf: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ type: "", severity: "", purok: "", status: "open", q: "" })}>Clear filters</button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15, marginTop: 0 }}>Disaster incidents ({rows.length})</h3>
        <DataTable
          rowClassName={(r) => (r.severity === "Critical" && r.status !== "Rejected" ? "row-critical" : "")}
          columns={[
            { key: "reference_no", label: "Reference", render: (r) => <strong>{r.reference_no || `#${r.report_id}`}</strong> },
            { key: "report_date", label: "Date" },
            { key: "disaster_type", label: "Type" },
            { key: "severity", label: "Severity", render: (r) => <span className={`badge ${SEVERITY_BADGE[r.severity]}`}>{r.severity}</span> },
            { key: "status", label: "Status", render: (r) => <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span> },
            { key: "household", label: "Household / Purok", render: (r) => (r.head_of_family
              ? <span style={{ whiteSpace: "normal" }}>{r.head_of_family}<br /><small>{purokLabel(r.purok)}</small></span> : "—") },
            { key: "damage", label: "Damage", render: (r) => <span style={{ whiteSpace: "normal", fontSize: 13 }}>{damageSummary(r)}</span> },
            { key: "needs", label: "Needs", render: (r) => {
              const p = priorityById.get(r.household_id);
              const cov = p?.unmet_needs?.coverage_percent;
              return (
                <span style={{ whiteSpace: "normal", fontSize: 13 }}>
                  {r.reported_needs ? r.reported_needs.split(",").join(", ") : "—"}
                  {cov != null && <><br /><small>{cov}% of essential needs covered</small></>}
                </span>
              );
            } },
            { key: "priority", label: "DSS Priority", render: (r) => {
              const p = priorityById.get(r.household_id);
              if (!p) return "—";
              return (
                <span>
                  <span className={`badge ${PRIORITY_BADGE[p.priority_level] || "badge-unassessed"}`}>
                    {p.priority_level}{p.final_score != null ? ` (${p.final_score}/100)` : ""}
                  </span>
                  {p.needs_review && <><br /><small>Needs manual review</small></>}
                </span>
              );
            } },
            { key: "actions", label: "", render: (r) => (
              <span style={{ whiteSpace: "nowrap" }}>
                {r.household_id && <Link className="btn btn-ghost btn-sm" to={`${base}/reports?household_id=${r.household_id}`}>Report</Link>}{" "}
                <Link className="btn btn-ghost btn-sm" to={`${base}/map`}>Map</Link>
              </span>
            ) },
          ]}
          rows={rows}
          emptyText={filtersOn ? "No incidents match these filters." : "No disaster incidents have been recorded."}
        />
      </div>
    </>
  );
}
