import { useEffect, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import { getLoginHistory } from "../../services/api.jsx";

export default function LoginHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = () => {
    setLoading(true);
    const params = {};
    if (search) params.search = search;
    if (status) params.status = status;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    getLoginHistory(params).then((res) => setHistory(res.data.data)).finally(() => setLoading(false));
  };

  useEffect(load, [search, status, dateFrom, dateTo]);

  const resetFilters = () => { setSearch(""); setStatus(""); setDateFrom(""); setDateTo(""); };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Login History</h1>
          <p>A record of successful and failed login attempts, including logout times.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row filter-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Search (name or email)</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option>Success</option>
              <option>Failed</option>
            </select>
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
          <div className="loading-text">Loading login history…</div>
        ) : (
          <DataTable
            columns={[
              { key: "user_name", label: "User", render: (r) => r.user_name ? `${r.user_name} (${r.user_role})` : "—" },
              { key: "email_attempted", label: "Email Entered" },
              { key: "login_at", label: "Login Time" },
              { key: "logout_at", label: "Logout Time", render: (r) => r.logout_at || "—" },
              { key: "login_status", label: "Status", render: (r) => (
                <span className={`badge ${r.login_status === "Success" ? "badge-low" : "badge-rejected"}`}>{r.login_status}</span>
              )},
              { key: "failure_reason", label: "Failure Reason", render: (r) => r.failure_reason || "—" },
              { key: "ip_address", label: "IP Address", render: (r) => r.ip_address || "—" },
            ]}
            rows={history}
            emptyText="No login records match your search or filters."
          />
        )}
      </div>
    </>
  );
}
