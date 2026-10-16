import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import { getAuditLogs } from "../../services/api.jsx";

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = () => {
    setLoading(true);
    const params = {};
    if (search) params.search = search;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    getAuditLogs(params).then((res) => setLogs(res.data.data)).finally(() => setLoading(false));
  };

  useEffect(load, [search, dateFrom, dateTo]);

  const resetFilters = () => { setSearch(""); setDateFrom(""); setDateTo(""); };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Audit Logs</h1>
          <p>A record of actions taken in the system, including data changes, approvals, and account changes.</p>
        </div>
        <Link to="/admin/login-history" className="btn btn-ghost">Login History</Link>
      </div>

      <div className="card" style={{ marginBottom: 16, fontSize: 13, color: "var(--color-ink-soft)" }}>
        The Audit Log records key system actions, such as household record changes, disaster report
        verification, relief allocation approval, inventory transactions, and user account changes.
        Use the search and date filters to review specific records.
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row filter-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Search (action or details)</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. household, allocation, verified…" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Date From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Date To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={resetFilters}>Reset Filters</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading audit logs…</div>
        ) : (
          <DataTable
            columns={[
              { key: "created_at", label: "Date and Time" },
              { key: "user_name", label: "User", render: (r) => r.user_name ? `${r.user_name} (${r.user_role})` : "System / Deleted Account" },
              { key: "action", label: "Action" },
              { key: "details", label: "Details", render: (r) => (
                <span style={{ maxWidth: 320, display: "inline-block", whiteSpace: "normal" }}>{r.details || "—"}</span>
              )},
            ]}
            rows={logs}
            emptyText="No audit log entries match your search or filters."
          />
        )}
      </div>
    </>
  );
}
