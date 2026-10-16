import { localDateISO } from "../../../utils/dates.js";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardCard from "../../../components/DashboardCard.jsx";
import { getDisasterEvents, getSituationReport } from "../../../services/api.jsx";
import { generateSituationReportPDF } from "../../../utils/pdfExport.js";
import { exportToCsv } from "../../../utils/exportCsv.js";

/**
 * Phase 20 — Automated Disaster Situation Report.
 * The Administrator picks a disaster event (or a reporting period) and clicks
 * Generate. Every figure comes from reports/situation_report.php, which reads
 * the database at that moment — nothing is typed in or stored.
 */
const NA = "Not available in recorded data";
const show = (v) => (v === null || v === undefined ? <em style={{ color: "var(--color-ink-soft)" }}>{NA}</em> : v);

function Section({ n, title, note, children }) {
  return (
    <div className="card" style={{ marginBottom: 16, breakInside: "avoid" }}>
      <h3 style={{ fontSize: 16, marginTop: 0 }}>{n}. {title}</h3>
      {children}
      {note && <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: "10px 0 0" }}>{note}</p>}
    </div>
  );
}

function KV({ rows }) {
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><td style={{ width: "45%" }}>{k}</td><td><strong>{show(v)}</strong></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Grid({ head, rows, empty }) {
  if (!rows.length) return <div className="empty-state">{empty || NA}</div>;
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const counts = (obj) => Object.entries(obj || {}).map(([k, v]) => `${k}: ${v}`).join(" · ");

export default function SituationReport() {
  const [params] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [mode, setMode] = useState("event");
  const [eventId, setEventId] = useState(params.get("event_id") || "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getDisasterEvents()
      .then((res) => {
        const list = res.data.data || [];
        setEvents(list);
        if (!list.length) setMode("period");
        else if (!eventId) setEventId(String(list[0].event_id));
      })
      .catch(() => setMode("period"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opened from Disaster Events with ?event_id= → generate straight away.
  useEffect(() => {
    if (params.get("event_id")) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    setError("");
    setLoading(true);
    try {
      const p = mode === "event" ? { event_id: eventId || params.get("event_id") } : { date_from: from, date_to: to };
      const res = await getSituationReport(p);
      setData(res.data);
    } catch (err) {
      setData(null);
      setError(err.response?.data?.message || "We couldn't generate the report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    const rows = [];
    const add = (section, metric, value) => rows.push({ section, metric, value: value ?? NA });
    add("Disaster", "Event", data.disaster.event_name); add("Disaster", "Type", data.disaster.disaster_type);
    add("Disaster", "Period", `${data.disaster.start_date} to ${data.disaster.end_date || "ongoing"}`);
    Object.entries(data.reports.by_status).forEach(([k, v]) => add("Reports", k, v));
    Object.entries(data.reports.by_severity).forEach(([k, v]) => add("Reports by severity", k, v));
    add("Households", "Total affected", data.households.total_affected);
    add("Households", "Inside recorded affected areas", data.households.inside_recorded_areas);
    add("Households", "Persons", data.households.persons); add("Households", "Vulnerable persons", data.households.vulnerable_persons);
    Object.entries(data.households.by_purok).forEach(([k, v]) => add("Households by purok", k, v));
    data.affected_areas.list.forEach((a) => add("Affected areas", `${a.area_name} (${a.hazard_type}, ${a.status})`, a.households_inside));
    add("Damage", "Assessed reports", data.damage.assessed_reports);
    add("Damage", "With major damage", data.damage.with_major_damage); add("Damage", "With totally damaged", data.damage.with_totally_damaged);
    add("Evacuation", "Persons in centers", data.evacuation.current_occupancy_persons);
    add("Evacuation", "Available capacity (open centers)", data.evacuation.available_capacity_open_centers);
    add("Evacuation", "Evacuated households", null);
    Object.entries(data.requests.by_status).forEach(([k, v]) => add("Relief requests", k, v));
    data.inventory.list.forEach((i) => add("Inventory", i.item_name, `stock ${i.stock}, reserved ${i.reserved}, available ${i.available}, shortage ${i.shortage}`));
    Object.entries(data.allocations.by_status).forEach(([k, v]) => add("Allocations", k, `${v.count} (qty ${v.quantity})`));
    (data.allocations.emergency_overrides || []).forEach((o) => add("Emergency override", `${o.date} ${o.household}`, `${o.item}; ${o.status}; DSS ${o.dss_at_override}; reason: ${o.reason}`));
    Object.entries(data.distribution.beneficiaries_by_status).forEach(([k, v]) => add("Scheduled beneficiaries", k, v));
    add("SMS", "Accepted by gateway", data.sms.sent); add("SMS", "Queued", data.sms.queued ?? 0); add("SMS", "Failed", data.sms.failed); add("SMS", "Not sent (disabled)", data.sms.not_sent_disabled);
    add("Report", "Generated at", data.generated_at);
    exportToCsv(`situation-report-${localDateISO()}.csv`,
      [{ key: "section", label: "Section" }, { key: "metric", label: "Metric" }, { key: "value", label: "Value" }], rows);
  };

  const d = data;
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Disaster Situation Report</h1>
          <p>Generated automatically from the recorded disaster, household, damage, evacuation, relief, inventory, distribution and SMS data.</p>
        </div>
      </div>

      <div className="card no-print" style={{ marginBottom: 16 }}>
        <div className="form-row filter-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Generate For</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="event" disabled={!events.length}>Disaster event</option>
              <option value="period">Reporting period</option>
            </select>
          </div>
          {mode === "event" ? (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Disaster Event</label>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                {events.map((ev) => <option key={ev.event_id} value={ev.event_id}>{ev.event_name} ({ev.start_date} to {ev.end_date || "ongoing"})</option>)}
              </select>
            </div>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </>
          )}
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={generate} disabled={loading || (mode === "event" ? !eventId : !from || !to)}>
            {loading ? "Generating…" : "Generate Disaster Situation Report"}
          </button>
          {d && <button className="btn btn-secondary" onClick={() => generateSituationReportPDF(d)}>Export PDF</button>}
          {d && <button className="btn btn-ghost" onClick={exportCsv}>Export CSV</button>}
          {d && <button className="btn btn-ghost" onClick={() => window.print()}>Print</button>}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {d && (
        <>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            <DashboardCard label="Disaster Reports" value={d.reports.total} />
            <DashboardCard label="Affected Households" value={d.households.total_affected} tone="accent" />
            <DashboardCard label="Inside Recorded Affected Areas" value={d.households.inside_recorded_areas} />
            <DashboardCard label="Persons in Evacuation Centers" value={d.evacuation.current_occupancy_persons} />
            <DashboardCard label="Relief Requests" value={d.requests.total} />
            <DashboardCard label="Allocations Distributed" value={d.allocations.by_status.Distributed.count} />
          </div>

          <Section n={1} title="Executive Summary" note="Generated automatically from the figures below using fixed sentence rules (not AI).">
            {d.executive_summary.length ? <p style={{ lineHeight: 1.7, margin: 0 }}>{d.executive_summary.join(" ")}</p> : <p>{NA}</p>}
          </Section>

          <Section n={2} title="Disaster Overview" note={d.disaster.note || d.reports.note}>
            <KV rows={[
              ["Disaster / event", d.disaster.event_name], ["Disaster type", d.disaster.disaster_type],
              ["Period", `${d.disaster.start_date} to ${d.disaster.end_date || "ongoing"}`], ["Affected barangay", d.disaster.affected_barangay],
              ["Highest recorded severity", d.disaster.highest_severity], ["Description", d.disaster.description],
              ["Disaster reports (total)", d.reports.total], ["Report status", counts(d.reports.by_status)],
              ["Reports by severity (not rejected)", counts(d.reports.by_severity)], ["Reports by disaster type", counts(d.reports.by_type) || null],
            ]} />
          </Section>

          <Section n={3} title="Affected Area Summary" note={d.affected_areas.note}>
            <Grid head={["Recorded Area", "Hazard", "Status", "Households Inside"]}
              rows={d.affected_areas.list.map((a) => [a.area_name, a.hazard_type, a.status, a.households_inside])}
              empty={d.affected_areas.note} />
          </Section>

          <Section n={4} title="Household Impact" note={d.households.note}>
            <KV rows={[
              ["Total affected households", d.households.total_affected],
              ["  with a non-rejected disaster report", d.households.reported_affected],
              ["  inside a recorded affected area", d.households.inside_recorded_areas],
              ["  inside an area but no report yet", d.households.inside_areas_without_report],
              ["Persons in affected households", d.households.persons],
              ["Households with vulnerable members", d.households.vulnerable_households],
              ["Vulnerable persons", `${d.households.vulnerable_persons} (${counts(d.households.vulnerable_breakdown)})`],
              ["Affected puroks", d.households.affected_puroks.join(", ") || null],
              ["Households by purok", counts(d.households.by_purok) || null],
              ["Affected households without coordinates", d.households.affected_without_coordinates],
            ]} />
          </Section>

          <Section n={5} title="Damage Assessment Summary" note={d.damage.note}>
            <Grid head={["Category", "None", "Minor", "Major", "Totally Damaged"]}
              rows={d.damage.assessed_reports ? Object.entries(d.damage.by_category).map(([k, v]) => [k[0].toUpperCase() + k.slice(1), v.None, v.Minor, v.Major, v["Totally Damaged"]]) : []} />
            <p style={{ margin: "10px 0 0", fontSize: 14 }}>
              Assessed reports: <strong>{d.damage.assessed_reports}</strong> · not yet assessed: <strong>{d.damage.reports_not_assessed}</strong> ·
              with major damage: <strong>{d.damage.with_major_damage}</strong> · with totally damaged: <strong>{d.damage.with_totally_damaged}</strong>
            </p>
          </Section>

          <Section n={6} title="Evacuation Center Summary" note={d.evacuation.note}>
            <Grid head={["Center", "Purok", "Status", "Occupancy / Capacity"]}
              rows={d.evacuation.list.map((c) => [c.name, c.purok, c.status, `${c.occupancy} / ${c.capacity}`])} />
            <KV rows={[
              ["Evacuation centers", d.evacuation.centers], ["Total capacity", d.evacuation.total_capacity],
              ["Current occupancy (persons)", d.evacuation.current_occupancy_persons],
              ["Available capacity in open centers", d.evacuation.available_capacity_open_centers],
              ["Evacuated households", d.evacuation.evacuated_households ?? null],
            ]} />
            <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: "6px 0 0" }}>{d.evacuation.evacuated_households_note}</p>
          </Section>

          <Section n={7} title="Relief Request Summary" note={d.requests.note}>
            <KV rows={[["Total requests", d.requests.total], ["By status", counts(d.requests.by_status)], ["By urgency", counts(d.requests.by_urgency)]]} />
          </Section>

          <Section n={8} title="Inventory and Shortage Summary" note={d.inventory.note}>
            <Grid head={["Item", "Stock", "Reserved", "Available", "Open Request Demand", "Shortage", "Low Stock"]}
              rows={d.inventory.list.map((i) => [i.item_name, i.stock, i.reserved, i.available, i.open_request_demand,
                i.shortage ? <strong style={{ color: "var(--color-red-ink)" }}>{i.shortage} {i.unit}</strong> : 0, i.low_stock ? "Yes" : "—"])} />
          </Section>

          <Section n={9} title="Relief Allocation Summary" note={d.allocations.note}>
            <Grid head={["Status", "Allocations", "Total Quantity"]}
              rows={d.allocations.total ? Object.entries(d.allocations.by_status).map(([k, v]) => [k, v.count, v.quantity]) : []} />
            {d.allocations.total > 0 && <p style={{ margin: "10px 0 0", fontSize: 14 }}>Households with allocations: <strong>{d.allocations.households_with_allocations}</strong>
              {d.allocations.partial_receipts ? <> · partial receipts: <strong>{d.allocations.partial_receipts}</strong></> : null}</p>}
            {d.allocations.emergency_overrides && (
              <div style={{ marginTop: 12 }}>
                <h4 style={{ fontSize: 14, margin: "0 0 6px" }}>Emergency overrides ({d.allocations.emergency_overrides.length})</h4>
                <Grid head={["Date", "Household", "Purok", "Relief", "Status", "DSS at override", "Reason", "Approved by"]}
                  rows={d.allocations.emergency_overrides.map((o) => [o.date, o.household, o.purok, o.item, o.status, o.dss_at_override, o.reason, o.approved_by || "—"])} />
              </div>
            )}
          </Section>

          <Section n={10} title="Distribution Summary" note={d.distribution.note}>
            <KV rows={[
              ["Distribution schedules", d.distribution.schedules], ["Upcoming schedules", d.distribution.upcoming_schedules],
              ["Scheduled beneficiaries", counts(d.distribution.beneficiaries_by_status)],
              ["Allocations distributed directly", d.distribution.direct_allocations_distributed],
              ["Households served", d.distribution.households_served],
              ["Approved allocations awaiting distribution", d.distribution.approved_awaiting_distribution],
              ["of which Ready for Distribution (verified schedule set)", d.distribution.ready_for_distribution ?? "Not available in recorded data"],
            ]} />
          </Section>

          <Section n={11} title="SMS Notification Summary" note={d.sms.note}>
            <KV rows={[
              ["Total SMS recorded", d.sms.total], ["Accepted by gateway (delivery not confirmed)", d.sms.sent], ["Queued", d.sms.queued ?? 0], ["Failed", d.sms.failed],
              ["Not sent — SMS disabled", d.sms.not_sent_disabled], ["Automatic / manual", `${d.sms.automatic} / ${d.sms.manual}`],
              ["By category", counts(d.sms.by_category) || null], ["Pending", d.sms.pending],
            ]} />
            <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: "6px 0 0" }}>{d.sms.pending_note}</p>
          </Section>

          <Section n={12} title="Generated Date and Time">
            <p style={{ margin: 0 }}>{d.generated_at} (reports {d.scope.report_period.from} to {d.scope.report_period.to}; relief activity {d.scope.relief_period.from} to {d.scope.relief_period.to})</p>
          </Section>

          <Section n={13} title="Data Coverage and Sources">
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5 }}>{d.data_sources.map((t) => <li key={t}>{t}</li>)}</ul>
          </Section>
        </>
      )}
    </>
  );
}
