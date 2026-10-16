import { PRIORITY_BADGE } from "../config/priority.js";

/**
 * Phase 22 — concise explanation of ONE household's DSS result: score (0-100),
 * category, rank, assessment status, the reason behind each criterion's rating,
 * unmet essential needs and any manual-review flags. It explains the result for
 * this household only; it is not a criteria-matrix or weight-configuration view.
 */
export default function PriorityExplanation({ p }) {
  if (!p) return <p>DSS information is not available for this household.</p>;
  if (!p.eligible && p.priority_score == null) {
    return (
      <>
        <p><span className={`badge ${PRIORITY_BADGE["Not Assessed"]}`}>Not Assessed</span></p>
        <p style={{ fontSize: 14 }}>{p.explanation}</p>
        {p.review_reasons?.length > 0 && <ReviewBox reasons={p.review_reasons} />}
      </>
    );
  }
  return (
    <>
      <p style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "0 0 8px" }}>
        <span className={`badge ${PRIORITY_BADGE[p.priority_level] || ""}`}>{p.priority_level}</span>
        <span>Priority score <strong>{p.priority_score}</strong> / 100</span>
        {p.rank != null && <span>· Rank <strong>#{p.rank}</strong> among assessed households</span>}
      </p>
      <p style={{ fontSize: 13.5, margin: "0 0 4px" }}><strong>Assessment:</strong> {p.assessment_status}</p>
      <p style={{ fontSize: 14, margin: "0 0 10px" }}>{p.explanation}</p>
      {p.needs_review && <ReviewBox reasons={p.review_reasons} />}

      <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
        <table style={{ fontSize: 13 }}>
          <thead>
            <tr><th>Why this score</th><th>Rating</th><th style={{ textAlign: "right" }}>Points</th></tr>
          </thead>
          <tbody>
            {(p.criteria || []).map((c) => (
              <tr key={c.key}>
                <td><strong>{c.label}</strong><br /><span style={{ color: "var(--color-ink-soft)" }}>{c.basis}{c.provisional ? " (provisional)" : ""}</span></td>
                <td>{c.rating} / 5</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>{c.contribution}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={2} style={{ fontWeight: 700 }}>Total priority score</td>
              <td style={{ textAlign: "right", fontWeight: 700 }}>{p.priority_score}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {p.unmet_needs?.categories?.length > 0 && (
        <p style={{ fontSize: 13, margin: "10px 0 0" }}>
          <strong>Essential needs covered by allocated / distributed relief ({p.unmet_needs.coverage_percent}%):</strong>{" "}
          {p.unmet_needs.categories.map((c) => `${c.category} ${c.received}/${c.need}`).join(" · ")}
        </p>
      )}
      <p style={{ fontSize: 12, color: "var(--color-ink-soft)", margin: "8px 0 0" }}>
        Calculated {p.calculated_at} from the current records. The score supports the officials' decision; it does not approve relief.
      </p>
    </>
  );
}

function ReviewBox({ reasons }) {
  return (
    <div className="alert alert-warning" style={{ marginBottom: 10 }}>
      <strong>Needs manual review</strong>
      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
        {reasons.map((r) => <li key={r}>{r}</li>)}
      </ul>
    </div>
  );
}
