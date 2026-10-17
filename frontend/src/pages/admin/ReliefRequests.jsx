import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import DataTable from "../../components/DataTable.jsx";
import DashboardCard from "../../components/DashboardCard.jsx";
import PurokSelect from "../../components/PurokSelect.jsx";
import usePolling from "../../hooks/usePolling.js";
import { StatusBadge, URGENCY_BADGE } from "../../config/requestStatus.jsx";
import { getReliefRequests } from "../../services/api.jsx";
import RecordReliefRequestModal from "../../components/RecordReliefRequestModal.jsx";
import { PRIORITY_BADGE } from "../../config/priority.js";

const STATUSES = ["Pending", "Under Review", "Approved", "Partially Approved", "Allocated", "Distributed", "Rejected"];

/**
 * Admin — Relief Requests list (Phase 19). Shows each request with the
 * household's current DSS priority next to it. Auto-refreshes every 30 s.
 */
export default function AdminReliefRequests() {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [filters, setFilters] = useState({ status: "open", urgency: "", purok: "", search: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showRecord, setShowRecord] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await getReliefRequests(params);
      setRows(res.data.data);
      setCounts(res.data.status_counts || {});
      setError("");
    } catch {
      setError("We couldn't load the relief requests. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }, [filters]);
  const { refresh } = usePolling(load, { interval: 30000 });

  const awaiting = (counts.Pending || 0) + (counts["Under Review"] || 0);
  const toProcess = (counts.Approved || 0) + (counts["Partially Approved"] || 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Relief Requests</h1>
          <p>Relief requests recorded for households by the barangay office. The household's DSS priority is shown alongside each request to support your review; it is not changed by the request.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setNotice(""); setShowRecord(true); }}>+ Record Relief Request</button>
      </div>

      {notice && <div className="alert alert-success">{notice}</div>}
      {showRecord && (
        <RecordReliefRequestModal
          onClose={() => setShowRecord(false)}
          onDone={(msg) => { setShowRecord(false); setNotice(msg); refresh(); }}
        />
      )}

      <div className="stat-grid">
        <DashboardCard label="Awaiting Review" value={awaiting} tone={awaiting ? "warn" : ""} />
        <DashboardCard label="Approved, Not Yet Allocated" value={toProcess} tone="accent" />
        <DashboardCard label="Allocated (Awaiting Distribution)" value={counts.Allocated || 0} />
        <DashboardCard label="Distributed" value={counts.Distributed || 0} />
        <DashboardCard label="Rejected" value={counts.Rejected || 0} />
      </div>

      <div className="card">
        <div className="filter-row">
          <div className="form-group">
            <label htmlFor="rq-status">Status</label>
            <select id="rq-status" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="open">All open requests</option>
              <option value="">All requests</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="rq-urgency">Urgency</label>
            <select id="rq-urgency" value={filters.urgency} onChange={(e) => setFilters({ ...filters, urgency: e.target.value })}>
              <option value="">Any</option>
              <option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="rq-purok">Purok</label>
            <PurokSelect id="rq-purok" value={filters.purok} onChange={(e) => setFilters({ ...filters, purok: e.target.value })} allowEmpty emptyLabel="All puroks" />
          </div>
          <div className="form-group">
            <label htmlFor="rq-search">Search</label>
            <input id="rq-search" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Household head, resident or reason" />
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {loading ? <div className="loading-text">Loading…</div> : (
          <DataTable
            columns={[
              { key: "request_id", label: "Request", render: (r) => `#${r.request_id}` },
              { key: "head_of_family", label: "Household", render: (r) => <>{r.head_of_family}<br /><span style={{ fontSize: 12, color: "var(--color-ink-soft)" }}>{r.purok} · {r.number_of_members} members</span></> },
              { key: "requested_by_name", label: "Requested By", render: (r) => r.requested_by_name || "—" },
              { key: "items_summary", label: "Items" },
              { key: "urgency", label: "Urgency", render: (r) => <span className={`badge ${URGENCY_BADGE[r.urgency]}`}>{r.urgency}</span> },
              { key: "priority_level", label: "DSS Priority", render: (r) => r.priority_level
                ? <><span className={`badge ${PRIORITY_BADGE[r.priority_level]}`}>{r.priority_level}</span> {r.priority_score != null && <span style={{ fontSize: 12 }}>({r.priority_score})</span>}</>
                : "—" },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
              { key: "created_at", label: "Submitted", render: (r) => r.created_at?.slice(0, 16) },
              { key: "actions", label: "", render: (r) => <Link className="btn btn-primary btn-sm" to={`/admin/relief-requests/${r.request_id}`}>Review</Link> },
            ]}
            rows={rows}
            emptyText="No relief requests match these filters."
          />
        )}
      </div>
    </>
  );
}
