/**
 * Phase 21 — relief allocation status as residents and personnel see it.
 *
 * Stored statuses: Pending, Approved, Distributed. "Ready for Distribution"
 * is an Approved allocation for which authorized personnel recorded a verified
 * distribution schedule and location (ready_at). The API returns this as
 * display_status.
 */
export const ALLOCATION_STEPS = ["Pending", "Approved", "Ready for Distribution", "Distributed"];

export const ALLOCATION_STATUS_HELP = {
  Pending: "Your allocation is waiting for approval by the barangay officials.",
  Approved: "Your allocation was approved. You will receive the distribution schedule once it is verified.",
  "Ready for Distribution": "Your relief is ready. Please follow the schedule and location below.",
  Distributed: "This relief was recorded as distributed to your household.",
  Cancelled: "This allocation was cancelled by the barangay. Please contact the barangay office if you have questions.",
};

const BADGE = {
  Pending: "badge-pending",
  Approved: "badge-approved",
  "Ready for Distribution": "badge-ready",
  Distributed: "badge-distributed",
  Cancelled: "badge-rejected",
};

export function allocationDisplayStatus(a) {
  if (!a) return "";
  if (a.display_status) return a.display_status;
  return a.status === "Approved" && a.ready_at ? "Ready for Distribution" : a.status;
}

export function AllocationStatusBadge({ allocation, status }) {
  const s = status || allocationDisplayStatus(allocation);
  return <span className={`badge ${BADGE[s] || ""}`}>{s}</span>;
}

/** "Tue, Oct 13, 2026, 9:00 AM" from a date (YYYY-MM-DD) and optional time (HH:MM[:SS]). */
export function formatSchedule(date, time) {
  if (!date) return "—";
  const d = new Date(`${date}T${time ? time.slice(0, 5) : "00:00"}:00`);
  if (Number.isNaN(d.getTime())) return date;
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return time ? `${day}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : day;
}
