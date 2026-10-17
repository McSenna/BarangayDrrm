// Public landing page data adapter (frontend/src/features/landing/mappers.js):
// alert levels for all three states, evacuation colour thresholds, tel: links,
// advisory steps per level, and weather freshness.
// Usage: node tests/landing_adapter_test.mjs
import { pathToFileURL, fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const m = await import(pathToFileURL(join(root, "frontend/src/features/landing/mappers.js")).href);
let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + msg); };

// Alert levels (all three states).
ok(m.toAlertLevel("Critical") === "critical", "Critical -> critical");
ok(m.toAlertLevel("Warning") === "warning" && m.toAlertLevel("Alert") === "warning", "Warning/Alert -> warning");
ok(m.toAlertLevel("Normal") === "normal" && m.toAlertLevel(undefined) === "normal", "Normal/missing -> normal");

const settings = {
  public_advisory_steps: "Move up.\n\nEvacuate.\n",
  public_advisory_steps_warning: "Stay alert.",
  public_preparedness_tips: "Register.\nGo-bag.",
  contact_phone: "0917 123 4567",
  barangay_address: "Barangay Hall",
};
const raw = (overall, alerts) => ({ overall_status: overall, active_alerts: alerts });
const crit = m.mapHazardStatus(raw("Critical", [
  { alert_id: 2, hazard_type: "Flood", status: "Critical", title: "Rising water", affected_purok: "7" },
  { alert_id: 3, hazard_type: "Landslide", status: "Warning", title: "Slope", affected_purok: null },
]), settings);
ok(crit.level === "critical" && crit.incidents.length === 2, "critical status maps both incidents");
ok(crit.incidents[0].purok === "Purok 7" && crit.incidents[1].purok === "Barangay-wide", "purok labels (\"7\" -> Purok 7, none -> Barangay-wide)");
ok(crit.incidents[0].type === "flood" && crit.incidents[1].type === "landslide", "incident types from hazard_type");
ok(JSON.stringify(crit.advisorySteps) === '["Move up.","Evacuate."]', "critical uses public_advisory_steps, blank lines dropped");
ok(m.mapHazardStatus(raw("Alert", []), settings).advisorySteps[0] === "Stay alert.", "warning uses public_advisory_steps_warning");
ok(m.mapHazardStatus(raw("Normal", []), settings).advisorySteps.length === 2, "normal uses public_preparedness_tips");

// Evacuation thresholds: > 50% free green, 20-50% orange, < 20% red + nearly full.
ok(m.evacuationTone({ capacity: 50, occupied: 18 }).tone === "ok", "32/50 free (64%) -> green");
ok(m.evacuationTone({ capacity: 100, occupied: 50 }).tone === "pending", "50% free -> orange");
ok(m.evacuationTone({ capacity: 100, occupied: 80 }).tone === "pending", "20% free -> orange");
const nearly = m.evacuationTone({ capacity: 50, occupied: 44 });
ok(nearly.tone === "critical" && nearly.nearlyFull && nearly.free === 6, "6/50 free (12%) -> red, nearly full");
ok(m.evacuationTone({ capacity: 10, occupied: 12 }).free === 0, "over capacity never shows negative space");

// tel: links and public config.
ok(m.telHref("0917 123-4567") === "tel:09171234567", "tel: strips spaces and dashes");
ok(m.telHref("+63 917 123 4567") === "tel:+639171234567", "tel: keeps a leading +");
ok(m.mapPublicConfig(settings).hotline === "0917 123 4567", "hotline comes from contact_phone");

// Weather freshness: only a reading from the last 24 h counts as "now".
const now = new Date("2026-10-16T10:00:00+08:00");
ok(m.mapWeather({ log_date: "2026-10-16", log_time: "08:00:00", temperature: "27.5" }, now).isRecent, "2 h old reading is recent");
ok(!m.mapWeather({ log_date: "2026-09-30", log_time: "09:00:00" }, now).isRecent, "16-day-old reading is not 'now'");
ok(m.mapWeather(null, now) === null, "no reading -> null");

// Phase 33 barangay alerts: Advisory severity, several Puroks per alert, neutral empty-state copy.
ok(m.toAlertLevel("Advisory") === "warning", "Advisory -> warning (never 'normal' while an alert is active)");
const multi = m.mapHazardStatus(raw("Advisory", [
  { alert_id: 7, hazard_type: "Fire", status: "Advisory", severity: "Advisory", title: "Grass fire", affected_purok: "Purok 1, Purok 3", scope: "puroks", puroks: ["Purok 1", "Purok 3"] },
  { alert_id: 8, hazard_type: "Earthquake", status: "Warning", severity: "Warning", title: "Aftershocks", affected_purok: null, scope: "barangay", puroks: [] },
]), settings);
ok(multi.level === "warning" && multi.incidents[0].purok === "Purok 1, Purok 3" && multi.incidents[1].purok === "Barangay-wide", "several Puroks listed; barangay-wide scope");
ok(multi.incidents[0].type === "fire" && multi.incidents[0].severity === "medium" && multi.incidents[1].severity === "high", "Advisory -> medium, Warning -> high");
ok(m.NO_ALERTS_TITLE === "No active barangay alerts" && !/clear|safe/i.test(m.NO_ALERTS_TITLE), "no-alert title is neutral (not 'all clear' or 'safe')");

console.log(`\nLANDING ADAPTER TEST: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
