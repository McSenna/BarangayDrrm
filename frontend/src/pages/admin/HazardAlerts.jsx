import { useEffect, useState } from "react";
import { useAutoRefresh } from "../../hooks/usePolling.js";
import { purokLabel } from "../../utils/purokLabel.js";
import { useNavigate } from "react-router-dom";
import DataTable from "../../components/DataTable.jsx";
import Modal from "../../components/Modal.jsx";
import PurokSelect from "../../components/PurokSelect.jsx";
import { getHazardAlerts, addHazardAlert, updateHazardStatus, resolveHazardAlert, deleteHazardAlert } from "../../services/api.jsx";

const HAZARD_TYPE_CATEGORY = {
  Flood: "Disaster Alert",
  Typhoon: "Disaster Alert",
  Landslide: "Disaster Alert",
  "General Emergency": "Emergency Warning",
};

const HAZARD_TYPES = ["Flood", "Typhoon", "Landslide", "General Emergency"];
const STATUS_LEVELS = ["Normal", "Alert", "Warning", "Critical"];
const STATUS_BADGE = { Normal: "badge-low", Alert: "badge-medium", Warning: "badge-attention", Critical: "badge-critical" };

const EMPTY_FORM = { hazard_type: "Flood", status: "Alert", title: "", description: "", affected_purok: "" };

export default function HazardAlerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [statusModal, setStatusModal] = useState(null);
  const [newStatus, setNewStatus] = useState("Alert");

  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("1");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Phase 19: load(true) refreshes silently (used by auto-refresh — no spinner, forms untouched).
  const load = (silent = false) => {
    if (silent !== true) setLoading(true);
    const params = {};
    if (typeFilter) params.hazard_type = typeFilter;
    if (statusFilter) params.status = statusFilter;
    if (activeFilter !== "") params.active_only = activeFilter;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    getHazardAlerts(params).then((res) => setAlerts(res.data.data)).finally(() => setLoading(false));
  };

  useEffect(load, [typeFilter, statusFilter, activeFilter, dateFrom, dateTo]);
  useAutoRefresh(() => load(true), 45000);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await addHazardAlert(form);
      setModalOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't issue the hazard alert. Please try again.");
    }
  };

  const openStatusModal = (row) => { setStatusModal(row); setNewStatus(row.status); };

  const handleStatusUpdate = async (e) => {
    e.preventDefault();
    await updateHazardStatus(statusModal.alert_id, newStatus);
    setStatusModal(null);
    load();
  };

  const handleResolve = async (alert_id) => {
    if (!confirm("Resolve this hazard alert? It will move to history and will no longer be included in the priority assessment.")) return;
    await resolveHazardAlert(alert_id);
    load();
  };

  const handleDelete = async (alert_id) => {
    if (!confirm("Delete this hazard alert? This action cannot be undone.")) return;
    await deleteHazardAlert(alert_id);
    load();
  };

  const resetFilters = () => {
    setTypeFilter(""); setStatusFilter(""); setActiveFilter("1"); setDateFrom(""); setDateTo("");
  };

  const handleNotify = (row) => {
    navigate("/admin/send-sms", {
      state: {
        category: HAZARD_TYPE_CATEGORY[row.hazard_type] || "Emergency Warning",
        message: `BARANGAY BINITAYAN — ${row.hazard_type.toUpperCase()} (${row.status}): ${row.title}. ${row.description || ""}`.trim(),
        recipient_mode: "household",
      },
    });
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Hazard Alerts</h1>
          <p>Issue and manage Hazard Alerts. Active alerts are included in the household priority assessment.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>+ Issue Hazard Alert</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row filter-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Hazard Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All</option>
              {HAZARD_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              {STATUS_LEVELS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Show</label>
            <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
              <option value="1">Active Only</option>
              <option value="0">Resolved (History)</option>
              <option value="">All</option>
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
          <div className="loading-text">Loading hazard alerts…</div>
        ) : (
          <DataTable
            columns={[
              { key: "hazard_type", label: "Type" },
              { key: "title", label: "Title" },
              { key: "affected_purok", label: "Area", render: (r) => r.affected_purok ? purokLabel(r.affected_purok) : "Barangay-wide" },
              { key: "status", label: "Status", render: (r) => <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span> },
              { key: "is_active", label: "Alert State", render: (r) => r.is_active ? <span className="badge badge-medium">Active</span> : <span className="badge badge-low">Resolved</span> },
              { key: "issued_by_name", label: "Issued By", render: (r) => r.issued_by_name || "—" },
              { key: "issued_at", label: "Date Issued" },
              { key: "actions", label: "Actions", render: (row) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {row.is_active && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => openStatusModal(row)}>Update Status</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleResolve(row.alert_id)}>Resolve</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleNotify(row)}>Send SMS</button>
                    </>
                  )}
                  {!row.is_active && (
                    <span style={{ fontSize: 12.5, color: "var(--color-ink-soft)" }}>
                      Resolved by {row.resolved_by_name || "—"}
                    </span>
                  )}
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row.alert_id)}>Delete</button>
                </div>
              )},
            ]}
            rows={alerts}
            emptyText="No hazard alerts match your filters."
          />
        )}
      </div>

      {modalOpen && (
        <Modal title="Issue Hazard Alert" onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Hazard Type</label>
                <select name="hazard_type" value={form.hazard_type} onChange={handleChange}>
                  {HAZARD_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Initial Status</label>
                <select name="status" value={form.status} onChange={handleChange}>
                  {STATUS_LEVELS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Title</label>
              <input name="title" value={form.title} onChange={handleChange} placeholder="e.g. Rising water level along Binitayan River" required />
            </div>
            <div className="form-group">
              <label>Affected Purok (optional)</label>
              <PurokSelect name="affected_purok" value={form.affected_purok} onChange={handleChange} allowEmpty emptyLabel="Barangay-wide (all puroks)" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea name="description" value={form.description} onChange={handleChange} placeholder="Details for residents" />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Issue Hazard Alert</button>
            </div>
          </form>
        </Modal>
      )}

      {statusModal && (
        <Modal title={`Update Status — ${statusModal.title}`} onClose={() => setStatusModal(null)}>
          <form onSubmit={handleStatusUpdate}>
            <div className="form-group">
              <label>New Status</label>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                {STATUS_LEVELS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)" }}>
              Raise or lower the alert level (Alert, Warning, Critical) as the situation changes.
              Once the hazard has passed, use Resolve instead.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setStatusModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Update Status</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
