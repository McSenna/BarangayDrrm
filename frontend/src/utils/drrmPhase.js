export const DRRM_PHASES = ["Prevention", "Preparedness", "Response", "Recovery"];

/**
 * The current DRRM phase, derived from live data (no phase is stored):
 *   Response      any active hazard alert
 *   Recovery      no active alerts, but relief is still moving: allocations
 *                 pending or approved (not yet distributed), or evacuees
 *                 still in centers
 *   Preparedness  otherwise (normal operations)
 * Prevention is never selected automatically.
 *
 * `hazard` is the public hazard status; `stats` the admin dashboard statistics.
 */
export function deriveDrrmPhase({ hazard, stats }) {
  const w = stats?.workflow || {};
  const activeAlerts = hazard?.active_alerts?.length ?? w.active_alerts?.length ?? 0;
  if (activeAlerts > 0 || (hazard && hazard.overall_status && hazard.overall_status !== "Normal")) return "Response";

  const alloc = w.allocations_by_status || {};
  const openAllocations = Number(alloc.Pending || 0) + Number(alloc.Approved || 0);
  const evacuees = Number(w.evacuation?.occupancy || 0);
  if (openAllocations > 0 || evacuees > 0) return "Recovery";

  return "Preparedness";
}
