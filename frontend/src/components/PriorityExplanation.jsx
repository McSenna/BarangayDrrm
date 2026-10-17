import { PRIORITY_BADGE } from "../config/priority.js";
import { ALLOCATION_STATUS_LABELS } from "../utils/householdAssessment.js";

/**
 * One household's score as the server calculated it: four components, the automatic subtotal (/80) and,
 * once the field visit is submitted, the final score (/100) and priority. Missing data is never shown as 0.
 */
export default function PriorityExplanation({ p }) {
  if (!p) return <p>Priority information is unavailable.</p>;
  const final = p.final_score ?? null;
  return <section aria-label="Score breakdown">
    <p style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span className={"badge " + (PRIORITY_BADGE[p.priority_level] || "badge-pending")}>{p.priority_level}</span>
      <span>Automatic subtotal: <strong>{p.automatic_subtotal ?? "For Verification"}</strong>{p.automatic_subtotal != null && " / 80"}</span>
      <span>Final score: <strong>{final ?? "Pending Assessment"}</strong>{final != null && " / 100"}</span>
      {p.rank != null && <span>Rank #{p.rank} · equal scores share a rank</span>}
    </p>
    <p><strong>Damage assessment:</strong> {p.assessment_status || "Not Yet Assessed"}
      {p.allocation_status && <> · <strong>Allocation:</strong> {ALLOCATION_STATUS_LABELS[p.allocation_status] || p.allocation_status}</>}</p>
    <p><strong>Field Officer:</strong> {p.assigned_field_officer_name || "Not assigned"} · <strong>Actual visit:</strong> {p.field_visit_date || "Not Yet Assessed"}</p>
    {p.review_reasons?.length > 0 && <div className="alert alert-warning"><strong>For Verification</strong><ul>{p.review_reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Score criteria">
      <table><thead><tr><th>Criterion</th><th>Source</th><th>Points</th></tr></thead>
        <tbody>{(p.criteria || []).map(c => <tr key={c.key}><th scope="row">{c.label}</th><td>{c.basis}</td>
          <td>{c.contribution ?? (c.key === "damage" ? "Not Yet Assessed" : "For Verification")} / {c.max_points}</td></tr>)}
          <tr><th scope="row" colSpan={2}>Automatic subtotal (maximum 80)</th><td><strong>{p.automatic_subtotal ?? "For Verification"}</strong></td></tr>
          <tr><th scope="row" colSpan={2}>Final score (maximum 100)</th><td><strong>{final ?? "Pending Assessment"}</strong></td></tr>
        </tbody></table>
    </div>
    <p className="users-help">The final score and priority exist only after the assigned Field Officer submits the visit. A high score never releases relief by itself; Relief Personnel complete each distribution.</p>
    <p className="users-help">Calculated {p.calculated_at || "from current records"}. Scoring rule: {p.model_version}.</p>
  </section>;
}
