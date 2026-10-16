/**
 * "2 active flood incidents" when all alerts share a type, else "3 active hazard alerts".
 * `typeOf` reads the hazard type: raw API alerts use `hazard_type` (default);
 * the landing adapter's incidents keep it in `title`.
 */
export function summarizeAlerts(alerts = [], typeOf = (a) => a.hazard_type) {
  const count = alerts.length;
  if (count === 0) return "No active hazard alerts";
  const types = [...new Set(alerts.map((a) => String(typeOf(a) || "").trim().toLowerCase()).filter(Boolean))];
  if (types.length === 1) return `${count} active ${types[0]} ${count === 1 ? "incident" : "incidents"}`;
  return `${count} active hazard ${count === 1 ? "alert" : "alerts"}`;
}

/** Visual severity for the barangay status: Critical -> critical; Warning/Alert -> warning; else normal. */
export function hazardSeverity(overallStatus) {
  if (overallStatus === "Critical") return "critical";
  if (overallStatus === "Warning" || overallStatus === "Alert") return "warning";
  return "normal";
}
