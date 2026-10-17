// Active barangay alerts — pure frontend model (frontend/src/features/alerts/alertModel.js): severity order,
// area labels, map areas from Purok geometry, Manila time, and the refresh state (a failed refresh keeps the
// last alerts and is never read as "no active alerts").
// Usage: node tests/barangay_alerts_model_test.mjs
import { pathToFileURL, fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const m = await import(pathToFileURL(join(root, "frontend/src/features/alerts/alertModel.js")).href);
let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + msg); };

const raw = (id, severity, scope, puroks = [], extra = {}) => ({
  alert_id: id, title: `Alert ${id}`, hazard_type: "Flood", severity, description: "d", instructions: "i",
  scope, puroks, unmapped_area: null, activated_at: `2026-10-17T1${id}:00:00+08:00`, updated_at: null, ...extra,
});

// Severity
ok(m.severityOf("Critical") === "Critical" && m.severityOf("Warning") === "Warning" && m.severityOf("Advisory") === "Advisory", "known severities kept");
ok(m.severityOf("Alert") === "Advisory" && m.severityOf("Normal") === "Advisory" && m.severityOf(undefined) === "Advisory", "older Alert/Normal read as Advisory");
ok(m.SEVERITY_META.Critical.rank > m.SEVERITY_META.Warning.rank && m.SEVERITY_META.Warning.rank > m.SEVERITY_META.Advisory.rank, "Critical > Warning > Advisory");
const list = [raw(1, "Advisory", "barangay"), raw(2, "Critical", "puroks", ["Purok 1"]), raw(3, "Warning", "puroks", ["Purok 1", "Purok 3"])].map(m.normalizeAlert);
ok(m.highestSeverity(list) === "Critical" && m.highestSeverity([]) === null, "highest severity, null when none");
ok(m.sortAlerts(list).map((a) => a.id).join() === "2,3,1", "sorted highest severity first");
ok(list[0].id === 1 && list[1].puroks.length === 1 && list[2].type === "Flood", "normalizeAlert maps id, puroks, type");

// Area labels
ok(m.areaLabel(list[0]) === "Entire barangay", "barangay-wide label");
ok(m.areaLabel(list[2]) === "Purok 1, Purok 3", "selected puroks label");
ok(m.areaLabel(m.normalizeAlert(raw(4, "Warning", "puroks", [], { unmapped_area: "Riverside" }))) === "Riverside", "older non-standard area shown as text");

// Map areas: highest severity per Purok, every alert id kept, missing geometry reported
const areas = m.alertAreas(list, ["Purok 1", "Purok 2", "Purok 3"]);
ok(areas.barangay && areas.barangay.severity === "Advisory" && areas.barangay.ids.join() === "1", "barangay-wide area");
ok(areas.puroks.get("Purok 1").severity === "Critical" && areas.puroks.get("Purok 1").ids.sort().join() === "2,3", "overlap: highest severity drawn, both alerts kept");
ok(areas.puroks.get("Purok 3").severity === "Warning" && !areas.puroks.has("Purok 2"), "only affected puroks highlighted");
const gap = m.alertAreas([m.normalizeAlert(raw(5, "Warning", "puroks", ["Purok 7"])), m.normalizeAlert(raw(6, "Advisory", "puroks", [], { unmapped_area: "Riverside" }))], ["Purok 1"]);
ok(gap.puroks.size === 0 && gap.missing.map((x) => x.area).join() === "Purok 7,Riverside", "no geometry -> listed as missing, not drawn");

// Manila time
ok(/3:40/.test(m.formatManila("2026-10-17T15:40:00+08:00")) && /Oct/.test(m.formatManila("2026-10-17T15:40:00+08:00")), "Manila time 3:40 PM");
ok(/3:40/.test(m.formatManila("2026-10-17T07:40:00Z")), "UTC input shown in Manila time");
ok(m.formatManila(null) === "", "no time -> empty");

// Refresh state
let s = m.initialAlertsState;
ok(s.status === "loading" && s.alerts.length === 0, "starts loading");
s = m.reduceAlertsState(s, { type: "failure", at: new Date("2026-10-17T07:00:00Z") });
ok(s.status === "error" && s.lastSuccessAt === null, "first load failing is an error, not 'no alerts'");
const t1 = new Date("2026-10-17T07:01:00Z");
s = m.reduceAlertsState(s, { type: "success", alerts: [raw(1, "Warning", "barangay")], at: t1 });
ok(s.status === "ready" && !s.outdated && s.alerts.length === 1 && s.lastSuccessAt === t1, "success stores alerts and time");
s = m.reduceAlertsState(s, { type: "failure", at: new Date("2026-10-17T07:02:00Z") });
ok(s.status === "ready" && s.outdated && s.alerts.length === 1 && s.lastSuccessAt === t1, "failed refresh keeps last alerts, marks outdated");
s = m.reduceAlertsState(s, { type: "success", alerts: [], at: new Date("2026-10-17T07:03:00Z") });
ok(s.alerts.length === 0 && !s.outdated && s.status === "ready", "only a successful empty response clears alerts");
ok(m.DEFAULT_POLL_MS === 15000, "default refresh about every 15 seconds");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
