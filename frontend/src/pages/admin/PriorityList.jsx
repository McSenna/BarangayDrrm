import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DataTable from "../../components/DataTable.jsx";
import Modal from "../../components/Modal.jsx";
import PriorityExplanation from "../../components/PriorityExplanation.jsx";
import usePolling from "../../hooks/usePolling.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { PRIORITY_BADGE } from "../../config/priority.js";
import { getPriorityList } from "../../services/api.jsx";

/**
 * Household Priority Assessment (DSS output) — Phase 22 weighted model.
 *
 * Shows, for every household: rank, household and purok, score (0-100),
 * priority category, assessment / verification status, a one-line
 * explanation, a manual-review flag and the calculation time. "View details"
 * opens that household's explanation (and, with permission, its reports).
 * The scoring itself is done only by the PHP backend.
 */
export default function PriorityList() {
  const { user } = useAuth();
  const reportsPath = user?.role === "admin" ? "/admin/reports" : "/personnel/reports";
  const [data, setData] = useState([]);
  const [calculatedAt, setCalculatedAt] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [detailRow, setDetailRow] = useState(null);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const res = await getPriorityList();
      setData(res.data.data || []);
      setCalculatedAt(res.data.calculated_at || null);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "We couldn't calculate the priority list. Please try again.");
    } finally {
      setLoaded(true);
    }
  }, []);
  usePolling(load, { interval: 60000 });

  const rows = useMemo(() => data.filter((r) => {
    if (filter === "review") return r.needs_review;
    if (filter === "assessed") return r.eligible;
    if (filter === "not_assessed") return !r.eligible;
    return true;
  }).map((r) => ({ ...r, id: r.household_id })), [data, filter]);

  const reviewCount = data.filter((r) => r.eligible && r.needs_review).length;
  const notAssessed = data.filter((r) => !r.eligible).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Household Priority Assessment</h1>
          <p>
            Ranked priority of affected households, calculated by the Decision Support System from recorded disaster
            reports, damage assessments, relief received and household records. It supports the officials' review;
            relief is approved only by authorized barangay officials.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {reviewCount > 0 && (
        <div className="alert alert-warning">
          {reviewCount} assessed household(s) need manual review (unverified report, missing damage assessment or incomplete
          household profile). Their scores are shown but should be checked before allocating relief.
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="pl-filter">Show</label>
          <select id="pl-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All households ({data.length})</option>
            <option value="assessed">Assessed and ranked ({data.length - notAssessed})</option>
            <option value="review">Needs manual review ({data.filter((r) => r.needs_review).length})</option>
            <option value="not_assessed">Not assessed ({notAssessed})</option>
          </select>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-ink-soft)" }}>
          Latest calculation: <strong>{calculatedAt || "—"}</strong>
        </p>
      </div>

      <div className="card">
        {!loaded ? (
          <div className="loading-text">Calculating priority scores…</div>
        ) : (
          <DataTable
            columns={[
              { key: "rank", label: "Rank", render: (r) => (r.rank != null ? `#${r.rank}` : "—") },
              { key: "head_of_family", label: "Household", render: (r) => <>{r.head_of_family}<br /><span style={{ fontSize: 12, color: "var(--color-ink-soft)" }}>{r.purok}</span></> },
              { key: "priority_score", label: "Score", render: (r) => (r.priority_score != null ? <strong>{r.priority_score}</strong> : "—") },
              { key: "priority_level", label: "Priority", render: (r) => <span className={`badge ${PRIORITY_BADGE[r.priority_level] || ""}`}>{r.priority_level}</span> },
              { key: "assessment_status", label: "Assessment", render: (r) => (
                <>
                  <span style={{ fontSize: 13 }}>{r.assessment_status}</span>
                  {r.needs_review && <><br /><span className="badge badge-pending">Needs review</span></>}
                </>
              )},
              { key: "explanation", label: "Why", render: (r) => <span style={{ fontSize: 13 }}>{r.explanation}</span> },
              { key: "actions", label: "", render: (row) => (
                <button className="btn btn-ghost btn-sm" onClick={() => setDetailRow(row)}>View details</button>
              )},
            ]}
            rows={rows}
            emptyText="No households match this view."
          />
        )}
      </div>

      {detailRow && (
        <Modal title={`Priority — ${detailRow.head_of_family} (${detailRow.purok})`} onClose={() => setDetailRow(null)}>
          <p style={{ fontSize: 13.5, margin: "0 0 8px" }}>
            {detailRow.number_of_members} member(s), {detailRow.vulnerable_members} vulnerable · Relief status: {detailRow.current_relief_status}
            {detailRow.report_id && <> · Report #{detailRow.report_id} ({detailRow.report_date})</>}
          </p>
          <PriorityExplanation p={detailRow} />
          <div className="modal-actions">
            <Link className="btn btn-ghost" to={`${reportsPath}?household_id=${detailRow.household_id}`}>View reports and damage assessment</Link>
            <button className="btn btn-primary" onClick={() => setDetailRow(null)}>Close</button>
          </div>
        </Modal>
      )}
    </>
  );
}
