import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DataTable from "../../components/DataTable.jsx";
import Modal from "../../components/Modal.jsx";
import { getDisasterEvents, saveDisasterEvent, setDisasterEventStatus, getDisasterTypes } from "../../services/api.jsx";

/**
 * Phase 20 — Disaster Events. A named disaster (e.g. a typhoon) with its period.
 * The automated Situation Report and the recorded Affected Areas are grouped by
 * event. Disaster reports are not re-linked: an event covers the reports dated
 * inside its period.
 */
const EMPTY = { event_id: null, event_name: "", disaster_type: "", start_date: "", end_date: "", description: "" };

export default function DisasterEvents() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () => {
    setLoading(true);
    getDisasterEvents()
      .then((res) => { setEvents(res.data.data || []); setError(""); })
      .catch((err) => setError(err.response?.data?.message || "We couldn't load the disaster events. Please refresh the page."))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    getDisasterTypes({ active_only: 1 }).then((res) => setTypes((res.data.data || []).filter((t) => Number(t.is_active ?? 1) === 1))).catch(() => {});
  }, []);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setFormError("");
    try {
      const res = await saveDisasterEvent(form);
      setNotice(res.data.message);
      setForm(null);
      load();
    } catch (err) {
      setFormError(err.response?.data?.message || "We couldn't save the event. Please try again.");
    }
  };

  const toggleStatus = async (ev) => {
    const next = ev.status === "Active" ? "Closed" : "Active";
    if (!confirm(`Mark "${ev.event_name}" as ${next}?`)) return;
    try {
      const res = await setDisasterEventStatus(ev.event_id, next);
      setNotice(res.data.message);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "We couldn't update the event.");
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Disaster Events</h1>
          <p>Record each disaster (for example, a typhoon) and its period. The Situation Report and the recorded Affected Areas are grouped by event.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setFormError(""); setForm({ ...EMPTY }); }}>+ Add Disaster Event</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading disaster events…</div>
        ) : (
          <DataTable
            columns={[
              { key: "event_name", label: "Event", render: (r) => <strong>{r.event_name}</strong> },
              { key: "disaster_type", label: "Disaster Type" },
              { key: "period", label: "Period", render: (r) => `${r.start_date} to ${r.end_date || "ongoing"}` },
              { key: "reports_in_period", label: "Reports in Period" },
              { key: "areas", label: "Affected Areas", render: (r) => `${r.active_area_count} active / ${r.area_count} recorded` },
              { key: "status", label: "Status", render: (r) => <span className={`badge ${r.status === "Active" ? "badge-high" : "badge-low"}`}>{r.status}</span> },
              { key: "actions", label: "", render: (r) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/admin/analytics/situation-report?event_id=${r.event_id}`)}>Situation Report</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/admin/affected-areas?event_id=${r.event_id}`)}>Affected Areas</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setFormError(""); setForm({ ...EMPTY, ...r, end_date: r.end_date || "", description: r.description || "" }); }}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleStatus(r)}>{r.status === "Active" ? "Close" : "Reopen"}</button>
                </div>
              ) },
            ]}
            rows={events}
            emptyText="No disaster event has been recorded yet. Click + Add Disaster Event."
          />
        )}
      </div>

      {form && (
        <Modal title={form.event_id ? "Edit Disaster Event" : "Add Disaster Event"} onClose={() => setForm(null)}>
          <form onSubmit={submit}>
            {formError && <div className="alert alert-error">{formError}</div>}
            <div className="form-group">
              <label>Event Name</label>
              <input name="event_name" value={form.event_name} onChange={onChange} placeholder="e.g. Typhoon Kristine 2026" required maxLength={150} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Disaster Type</label>
                <select name="disaster_type" value={form.disaster_type} onChange={onChange} required>
                  <option value="">Select…</option>
                  {types.map((t) => <option key={t.type_id} value={t.type_name}>{t.type_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Start Date</label>
                <input type="date" name="start_date" value={form.start_date} onChange={onChange} required />
              </div>
              <div className="form-group">
                <label>End Date (blank = ongoing)</label>
                <input type="date" name="end_date" value={form.end_date} onChange={onChange} />
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea name="description" value={form.description} onChange={onChange} placeholder="What happened, affected areas, notes" />
            </div>
            <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)" }}>
              Disaster reports dated inside this period are included in the event's Situation Report.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
