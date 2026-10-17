/**
 * Status pill. Pass `tone` directly, or pass `status` and the tone is looked
 * up from the stored status text, so a record shows the same colour on every page.
 *
 * Tones (each pairing is WCAG AA):
 *   critical  solid red, white text      — Critical severity/priority, shortages, failures
 *   high      red tint, red text         — High severity
 *   attention solid orange, navy text    — hazard Warning level
 *   warning   orange tint, orange-ink    — pending, medium, needs review
 *   ok        green tint, green-ink      — verified, approved, delivered, low
 *   danger    red tint, red text         — rejected, cancelled, inactive
 *   ready     navy, white text           — ready for distribution
 *   neutral   white, outlined, muted     — not assessed, disabled, closed
 */
const TONE_CLASS = {
  critical: "badge-critical",
  high: "badge-high",
  attention: "badge-attention",
  warning: "badge-medium",
  ok: "badge-low",
  danger: "badge-rejected",
  ready: "badge-ready",
  neutral: "badge-unassessed",
};

export const STATUS_TONE = {
  // Severity / priority / urgency
  Critical: "critical",
  "Critical Priority": "critical",
  High: "high",
  "High Priority": "high",
  Medium: "warning",
  Moderate: "warning",
  "Moderate Priority": "warning",
  Low: "ok",
  "Low Priority": "ok",
  "Not Assessed": "neutral",
  "For Verification": "warning",
  "Pending Assessment": "neutral",
  // Hazard alert levels
  Normal: "ok",
  Alert: "warning",
  Warning: "attention",
  // Workflow
  Pending: "warning",
  "Under Review": "warning",
  Queued: "warning",
  Verified: "ok",
  Approved: "ok",
  "Partially Approved": "high",
  Allocated: "ok",
  Distributed: "ok",
  Delivered: "ok",
  Sent: "ok",
  "Accepted by Gateway": "ok",
  Success: "ok",
  Resolved: "ok",
  Open: "ok",
  Active: "ok",
  Enabled: "ok",
  "Ready for Distribution": "ready",
  "Assessment in Progress": "warning",
  Completed: "ok",
  Rejected: "danger",
  Cancelled: "danger",
  Inactive: "danger",
  Failed: "critical",
  Full: "high",
  Closed: "neutral",
  Disabled: "neutral",
};

export function toneForStatus(status) {
  return STATUS_TONE[status] || "neutral";
}

export function badgeClass(tone) {
  return `badge ${TONE_CLASS[tone] || TONE_CLASS.neutral}`;
}

export default function StatusBadge({ tone, status, icon: Icon, className = "", children }) {
  const t = tone || toneForStatus(status);
  return (
    <span className={`${badgeClass(t)}${className ? ` ${className}` : ""}`}>
      {Icon && <Icon aria-hidden="true" size={12} strokeWidth={2.5} />}
      {children ?? status}
    </span>
  );
}
