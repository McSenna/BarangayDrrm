/** Badge classes for relief request status and urgency (reuses the existing badge styles). */
export const REQUEST_STATUS_BADGE = {
  Pending: "badge-pending",
  "Under Review": "badge-medium",
  Approved: "badge-verified",
  "Partially Approved": "badge-high",
  Rejected: "badge-rejected",
  Allocated: "badge-low",
  Distributed: "badge-verified",
};

export const URGENCY_BADGE = { Low: "badge-low", Medium: "badge-medium", High: "badge-high", Critical: "badge-critical" };

export const REQUEST_STATUS_HELP = {
  Pending: "Waiting for the Barangay Administrator to review it.",
  "Under Review": "The Barangay Administrator is reviewing your request.",
  Approved: "Approved in full. The barangay will allocate your relief.",
  "Partially Approved": "Approved in part. See the approved quantity for each item.",
  Rejected: "Not approved. See the Administrator's remarks.",
  Allocated: "Relief has been reserved for your household and is waiting to be distributed.",
  Distributed: "Your relief has been distributed. You can send feedback.",
};

export function StatusBadge({ status }) {
  return <span className={`badge ${REQUEST_STATUS_BADGE[status] || "badge-pending"}`}>{status}</span>;
}
