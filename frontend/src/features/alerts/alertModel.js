/**
 * Active barangay alerts — pure model (no React, no network), shared by the public Home map and the staff
 * Barangay Map. Tested with plain Node: tests/barangay_alerts_model_test.mjs.
 *
 * Source: hazards/alerts/get_active_alerts.php (resident-facing fields only).
 * A failed refresh keeps the last alerts and marks them outdated; it is never read as "no active alerts".
 */

export const DEFAULT_POLL_MS = 15_000;

/** Severity -> label, StatusBadge-style tone and order. Colours: Advisory amber, Warning orange, Critical red. */
export const SEVERITY_META = {
  Critical: { label: "Critical", tone: "critical", rank: 3 },
  Warning: { label: "Warning", tone: "warning", rank: 2 },
  Advisory: { label: "Advisory", tone: "advisory", rank: 1 },
};

/** Older rows may still say Alert / Normal; residents see them as Advisory. */
export function severityOf(value) {
  return SEVERITY_META[value] ? value : "Advisory";
}

/** API alert -> the shape the components use. */
export function normalizeAlert(raw) {
  return {
    id: Number(raw.alert_id),
    title: String(raw.title || ""),
    type: String(raw.hazard_type || "Other"),
    severity: severityOf(raw.severity ?? raw.status),
    description: raw.description || "",
    instructions: raw.instructions || "",
    scope: raw.scope === "puroks" ? "puroks" : "barangay",
    puroks: Array.isArray(raw.puroks) ? raw.puroks.map(String) : [],
    unmappedArea: raw.unmapped_area || null,
    activatedAt: raw.activated_at || null,
    updatedAt: raw.updated_at || null,
  };
}

const rankOf = (a) => SEVERITY_META[a.severity]?.rank || 0;

/** Highest severity first; within one severity, the most recently activated first. */
export function sortAlerts(alerts) {
  return [...alerts].sort((a, b) => rankOf(b) - rankOf(a) || String(b.activatedAt || "").localeCompare(String(a.activatedAt || "")) || b.id - a.id);
}

export function highestSeverity(alerts) {
  return alerts.reduce((best, a) => (!best || rankOf(a) > SEVERITY_META[best].rank ? a.severity : best), null);
}

/** "Entire barangay", "Purok 1, Purok 3", or the stored text of an older non-standard area. */
export function areaLabel(alert) {
  if (alert.scope === "barangay") return "Entire barangay";
  if (alert.puroks.length) return alert.puroks.join(", ");
  return alert.unmappedArea || "Area not specified";
}

/**
 * Areas to draw. `purokNames` are the Puroks with verified map geometry. Each area carries the highest
 * severity among the alerts covering it and every covering alert's id, so overlapping alerts stay reachable.
 * Areas without geometry are returned in `missing` and drawn nowhere.
 * @returns {{ barangay: {severity, ids}|null, puroks: Map<string, {severity, ids}>, missing: {alertId, area}[] }}
 */
export function alertAreas(alerts, purokNames) {
  const known = new Set(purokNames);
  const puroks = new Map();
  const missing = [];
  let barangay = null;
  const add = (cur, a) => {
    if (!cur) return { severity: a.severity, ids: [a.id] };
    return { severity: rankOf(a) > SEVERITY_META[cur.severity].rank ? a.severity : cur.severity, ids: [...cur.ids, a.id] };
  };
  for (const a of alerts) {
    if (a.scope === "barangay") { barangay = add(barangay, a); continue; }
    if (!a.puroks.length) { missing.push({ alertId: a.id, area: a.unmappedArea || "Area not specified" }); continue; }
    for (const p of a.puroks) {
      if (known.has(p)) puroks.set(p, add(puroks.get(p), a));
      else missing.push({ alertId: a.id, area: p });
    }
  }
  return { barangay, puroks, missing };
}

const MANILA = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const MANILA_TIME = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", second: "2-digit" });

/** ISO time -> "Oct 17, 2026, 3:40 PM" in Asia/Manila ("" when missing or invalid). */
export function formatManila(iso) {
  if (!iso) return "";
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : MANILA.format(d);
}

/** Time of day in Asia/Manila, for "last updated" lines. */
export function formatManilaTime(date) {
  return date ? MANILA_TIME.format(date) : "";
}

export const initialAlertsState = { alerts: [], status: "loading", outdated: false, lastSuccessAt: null };

/**
 * success: replace the alerts, clear outdated. failure: keep the last alerts; outdated when there was a
 * success before, otherwise status "error" (nothing to show yet, and never "no active alerts").
 */
export function reduceAlertsState(state, action) {
  if (action.type === "success") {
    return { alerts: sortAlerts((action.alerts || []).map(normalizeAlert)), status: "ready", outdated: false, lastSuccessAt: action.at };
  }
  if (action.type === "failure") {
    return state.lastSuccessAt ? { ...state, outdated: true } : { ...state, status: "error" };
  }
  return state;
}

/** Tells open maps in this browser (any tab) to refresh now, after an administrator changes an alert. */
export const ALERTS_CHANGED_CHANNEL = "barangay-alerts";
export const ALERTS_CHANGED_EVENT = "barangay-alerts:changed";
export function announceAlertsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ALERTS_CHANGED_EVENT));
  try {
    const ch = new BroadcastChannel(ALERTS_CHANGED_CHANNEL);
    ch.postMessage("changed");
    ch.close();
  } catch {
    /* older browsers: other tabs pick the change up at their next refresh */
  }
}
