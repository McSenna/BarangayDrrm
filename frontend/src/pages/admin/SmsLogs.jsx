import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import { getSmsLogs, getSmsStatus, retrySms } from "../../services/api.jsx";

// Phase 25: honest statuses. "Accepted by Gateway" = Semaphore accepted the request; it does NOT
// confirm the phone received it. "Delivered" is shown only when the provider confirms delivery
// (not available from the current Semaphore integration). Legacy "Sent" rows mean the same as accepted.
const STATUS_BADGE = { Sent: "badge-low", "Accepted by Gateway": "badge-low", Delivered: "badge-verified", Queued: "badge-pending", Failed: "badge-critical", "Not Configured": "badge-medium" };
const STATUS_LABEL = { Sent: "Accepted by gateway (legacy “Sent”)", "Accepted by Gateway": "Accepted by gateway", Delivered: "Delivered (confirmed)", Queued: "Queued — not sent yet" };
const ACCEPTED = ["Sent", "Accepted by Gateway", "Delivered"];

const CATEGORIES = [
  "General", "Emergency Warning", "Disaster Alert", "Evacuation Warning",
  "Relief Distribution Announcement", "Distribution Schedule", "Beneficiary Notification", "Relief Availability",
  // Phase 19/20 automatic notifications
  "Report Status Update", "Relief Request Update", "Relief Allocation Update", "Distribution Schedule Change", "Delivery Completed", "Evacuation Center Update",
];

export default function SmsLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [recipientType, setRecipientType] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Phase 20 — SMS on/off status (no secrets) and retry feedback
  const [smsStatus, setSmsStatus] = useState(null);
  const [notice, setNotice] = useState(null);
  useEffect(() => { getSmsStatus().then((res) => setSmsStatus(res.data)).catch(() => {}); }, []);

  const handleRetry = async (row) => {
    if (!confirm(`Send this SMS again to ${row.recipient_number}? The same log entry will be updated.`)) return;
    try {
      const res = await retrySms(row.sms_id);
      setNotice({ ok: res.data.success, text: res.data.message });
    } catch (err) {
      setNotice({ ok: false, text: err.response?.data?.message || "We couldn't retry this SMS." });
    }
    load();
  };

  const load = () => {
    setLoading(true);
    const params = {};
    if (search) params.search = search;
    if (recipientType) params.recipient_type = recipientType;
    if (category) params.category = category;
    if (status) params.status = status;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    getSmsLogs(params).then((res) => setLogs(res.data.data)).finally(() => setLoading(false));
  };

  useEffect(load, [search, recipientType, category, status, dateFrom, dateTo]);

  const resetFilters = () => {
    setSearch(""); setRecipientType(""); setCategory(""); setStatus(""); setDateFrom(""); setDateTo("");
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>SMS Logs</h1>
          <p style={{ marginBottom: 6 }}><strong>No network?</strong> SMS cannot reach phones without signal. Queued or failed messages stay here to resend later;
            meanwhile tell households through purok leaders, the evacuation center or the distribution point (manual notification).</p>
          <p>History of every SMS — the automatic Ready-for-Distribution notifications and any manual notices — with recipient, message, event, date and time, status and the provider's response. Failed messages can be retried.</p>
        </div>
        <Link to="/admin/send-sms" className="btn btn-ghost">Send a manual notice</Link>
      </div>

      {smsStatus && !smsStatus.enabled && (
        <div className="alert alert-error"><strong>SMS notifications are currently disabled.</strong> Automatic and manual messages are recorded here as "Not Configured" and nothing is sent.</div>
      )}
      {notice && <div className={`alert ${notice.ok ? "alert-success" : "alert-error"}`}>{notice.text}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row filter-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Search</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, number, or message" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Recipient Type</label>
            <select value={recipientType} onChange={(e) => setRecipientType(e.target.value)}>
              <option value="">All</option>
              <option>Resident</option>
              <option>Relief Personnel</option>
              <option>Household</option>
              <option>Custom</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="Queued">Queued</option>
              <option value="Accepted by Gateway">Accepted by gateway</option>
              <option value="Sent">Accepted by gateway (legacy “Sent”)</option>
              <option value="Delivered">Delivered (confirmed)</option>
              <option>Failed</option>
              <option>Not Configured</option>
            </select>
          </div>
        </div>
        <div className="form-row filter-row" style={{ marginTop: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={resetFilters}>Reset Filters</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading SMS logs…</div>
        ) : (
          <DataTable
            columns={[
              { key: "sent_at", label: "Date and Time", render: (r) => <span style={{ whiteSpace: "nowrap" }}>{r.sent_at}</span> },
              { key: "recipient", label: "Recipient", render: (r) => (
                <div style={{ minWidth: 150 }}>
                  <strong>{r.recipient_name || "—"}</strong>
                  <div style={{ fontSize: 12.5 }}>{r.recipient_number}</div>
                  <div style={{ fontSize: 11.5, color: "var(--color-ink-soft)" }}>{r.recipient_type}</div>
                </div>
              ) },
              { key: "category", label: "Category / Trigger", render: (r) => (
                <div style={{ minWidth: 150 }}>
                  {r.category}
                  <div style={{ fontSize: 11.5, color: "var(--color-ink-soft)" }} title={r.event_key || ""}>
                    {r.event_key
                      ? `Automatic${r.event_type ? `: ${r.event_type}` : ""}${r.allocation_id ? ` (allocation #${r.allocation_id})` : r.request_id ? ` (request #${r.request_id})` : ""}`
                      : "Manual"}
                  </div>
                </div>
              ) },
              { key: "message", label: "Message", render: (r) => (
                <div style={{ minWidth: 220, maxWidth: 330, whiteSpace: "normal", fontSize: 13 }}>{r.message}</div>
              ) },
              { key: "status", label: "Status / Provider Response", render: (r) => (
                <div style={{ minWidth: 150, maxWidth: 220, whiteSpace: "normal" }}>
                  <span className={`badge ${STATUS_BADGE[r.status] || ""}`}>{STATUS_LABEL[r.status] || r.status}</span>
                  {Number(r.attempts) > 1 && <span style={{ fontSize: 11.5, color: "var(--color-ink-soft)" }}> · {r.attempts} attempts</span>}
                  <div style={{ fontSize: 12, color: "var(--color-ink-soft)", marginTop: 4 }}>
                    {ACCEPTED.includes(r.status) ? `${r.provider_message_id ? `Provider ID ${r.provider_message_id}. ` : ""}Accepted by Semaphore; delivery to the phone is not confirmed.`
                      : r.status === "Queued" ? "Waiting to be sent (the sending request may have been interrupted)."
                      : r.status === "Not Configured" ? "SMS was disabled — nothing was sent." : (r.error_message || "")}
                  </div>
                  {!ACCEPTED.includes(r.status) && smsStatus?.enabled && (
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => handleRetry(r)}>{r.status === "Queued" ? "Send now" : "Retry"}</button>
                  )}
                </div>
              ) },
              { key: "sent_by_name", label: "Sent By", render: (r) => r.sent_by_name || "—" },
            ]}
            rows={logs}
            emptyText="No SMS messages match your filters."
          />
        )}
      </div>
    </>
  );
}
