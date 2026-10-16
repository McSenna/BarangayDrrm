import { localDateISO } from "../../utils/dates.js";
import { useEffect, useMemo, useState } from "react";
import { useAutoRefresh } from "../../hooks/usePolling.js";
import DataTable from "../../components/DataTable.jsx";
import Modal from "../../components/Modal.jsx";
import { exportToCsv } from "../../utils/exportCsv.js";
import MarkReadyModal from "../../components/MarkReadyModal.jsx";
import { AllocationStatusBadge, allocationDisplayStatus, formatSchedule } from "../../config/allocationStatus.jsx";
import {
  getAllocations, createAllocation, approveAllocation, getHouseholds, getItems, getDisasterEvents,
  emergencyOverride, cancelAllocation,
} from "../../services/api.jsx";

const today = () => localDateISO();
const EMPTY_ADD = { household_id: "", item_id: "", quantity: 1, allocation_date: today(), event_id: "", reason: "" };
const EMPTY_OVERRIDE = { household_id: "", item_id: "", quantity: 1, event_id: "", reason: "" };

/** "72 (High Priority) · rank 4" from the DSS snapshot stored at approval (Phase 25). */
function dssAtApproval(r) {
  if (!r.dss_category) return null;
  if (r.dss_score === null || r.dss_score === undefined) return r.dss_category;
  return `${r.dss_score} (${String(r.dss_category).replace(" Priority", "")})${r.dss_rank ? ` · rank ${r.dss_rank}` : ""}`;
}

/**
 * Relief Allocation (Administrator).
 * Pending -> Approved (stock reserved) -> Ready for Distribution (SMS) -> Distributed (stock deducted once).
 * Phase 25: every path uses the same duplicate rule; an approved allocation keeps the DSS
 * decision as it was at approval; an Emergency Override (reason required) serves a household
 * outside the DSS order and is labelled; Pending / Approved allocations can be cancelled
 * with a reason (reserved stock is released). Nothing here deletes records.
 */
export default function ReliefAllocation() {
  const [allocations, setAllocations] = useState([]);
  const [households, setHouseholds] = useState([]);
  const [items, setItems] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [modal, setModal] = useState(null); // "add" | "override" | {cancel: row}
  const [form, setForm] = useState(EMPTY_ADD);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [readyRows, setReadyRows] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = (silent = false) => {
    if (silent !== true) setLoading(true);
    Promise.all([getAllocations(), getHouseholds(), getItems(), getDisasterEvents().catch(() => ({ data: { data: [] } }))])
      .then(([a, h, i, e]) => {
        setAllocations(a.data.data);
        setHouseholds(h.data.data);
        setItems(i.data.data);
        setEvents(e.data.data || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useAutoRefresh(() => load(true), 45000);

  const open = (kind, preset = {}) => {
    setFormError(""); setNotice(""); setError("");
    setForm(kind === "override" ? { ...EMPTY_OVERRIDE, ...preset } : { ...EMPTY_ADD, ...preset });
    setModal(kind);
  };
  const set = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submitAdd = async (e) => {
    e.preventDefault();
    setSaving(true); setFormError("");
    try {
      const res = await createAllocation({ ...form, event_id: form.event_id || null });
      setModal(null); setNotice(res.data.message); load();
    } catch (err) {
      setFormError(err.response?.data?.message || "We couldn't create the Relief Allocation. Please check the details and try again.");
    } finally { setSaving(false); }
  };

  const submitOverride = async (e) => {
    e.preventDefault();
    setSaving(true); setFormError("");
    try {
      const res = await emergencyOverride({ ...form, event_id: form.event_id || null });
      setModal(null); setNotice(res.data.message); load();
    } catch (err) {
      setFormError(err.response?.data?.message || "We couldn't record the emergency override.");
    } finally { setSaving(false); }
  };

  const submitCancel = async (e) => {
    e.preventDefault();
    setSaving(true); setFormError("");
    try {
      const res = await cancelAllocation(modal.cancel.allocation_id, form.reason);
      setModal(null); setNotice(res.data.message); load();
    } catch (err) {
      setFormError(err.response?.data?.message || "We couldn't cancel this allocation.");
    } finally { setSaving(false); }
  };

  const handleApprove = async (id) => {
    setNotice(""); setError("");
    try {
      const res = await approveAllocation(id);
      setNotice(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || "We couldn't approve this Relief Allocation. Please try again.");
    }
    load();
  };

  const counts = useMemo(() => {
    const c = { active: 0, Pending: 0, Approved: 0, "Ready for Distribution": 0, Distributed: 0, Cancelled: 0, override: 0 };
    allocations.forEach((a) => {
      const s = allocationDisplayStatus(a);
      c[s] = (c[s] || 0) + 1;
      if (a.status === "Pending" || a.status === "Approved") c.active += 1;
      if (Number(a.is_emergency_override) === 1) c.override += 1;
    });
    return c;
  }, [allocations]);

  const rows = allocations.filter((a) => {
    if (filter === "all") return true;
    if (filter === "active") return a.status === "Pending" || a.status === "Approved";
    if (filter === "override") return Number(a.is_emergency_override) === 1;
    return allocationDisplayStatus(a) === filter;
  });

  const handleExportCsv = () => {
    exportToCsv(
      `relief-allocations-${today()}.csv`,
      [
        { key: "allocation_id", label: "Allocation ID" },
        { key: "head_of_family", label: "Household" },
        { key: "purok", label: "Purok" },
        { key: "item_name", label: "Item" },
        { key: "quantity", label: "Allocated Quantity" },
        { key: "received_quantity", label: "Received Quantity" },
        { key: "unit", label: "Unit" },
        { key: "display_status", label: "Status" },
        { key: "is_emergency_override", label: "Emergency Override (1 = yes)" },
        { key: "override_reason", label: "Override Reason" },
        { key: "dss_score", label: "DSS Score at Approval" },
        { key: "dss_category", label: "DSS Category at Approval" },
        { key: "dss_rank", label: "DSS Rank at Approval" },
        { key: "dss_model_version", label: "DSS Model" },
        { key: "allocation_date", label: "Allocation Date" },
        { key: "ready_schedule_date", label: "Distribution Date" },
        { key: "ready_location", label: "Distribution Location" },
        { key: "approved_by_name", label: "Approved By" },
        { key: "approved_at", label: "Approved At" },
        { key: "distributed_by_name", label: "Distributed By" },
        { key: "distributed_at", label: "Distributed At" },
        { key: "distribution_remarks", label: "Distribution Remarks" },
        { key: "cancelled_by_name", label: "Cancelled By" },
        { key: "cancelled_at", label: "Cancelled At" },
        { key: "cancel_reason", label: "Cancellation Reason" },
        { key: "recommendation_reason", label: "Recommendation and Approval Notes" },
      ],
      allocations
    );
  };

  const householdOptions = households.map((h) => (
    <option key={h.household_id} value={h.household_id}>{h.head_of_family} — {h.purok}</option>
  ));
  const itemOptions = items.map((i) => (
    <option key={i.item_id} value={i.item_id}>{i.item_name} ({i.quantity} {i.unit} in stock)</option>
  ));
  const eventSelect = (
    <div className="form-group">
      <label htmlFor="al-event">Disaster event (optional)</label>
      <select id="al-event" name="event_id" value={form.event_id} onChange={set}>
        <option value="">— None —</option>
        {events.map((ev) => <option key={ev.event_id} value={ev.event_id}>{ev.event_name} ({ev.status})</option>)}
      </select>
    </div>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Relief Allocation</h1>
          <p>Pending → Approved (stock reserved) → Ready for Distribution (household notified by SMS) → Distributed (stock deducted once). Approval records the household&apos;s DSS score at that moment.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={handleExportCsv}>Export CSV</button>
          <button className="btn btn-secondary" onClick={() => open("override")}>Emergency Override</button>
          <button className="btn btn-primary" onClick={() => open("add")}>+ Add Allocation</button>
        </div>
      </div>

      {notice && <div className="alert alert-success">{notice}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-group" style={{ marginBottom: 0, maxWidth: 360 }}>
          <label htmlFor="al-filter">Show</label>
          <select id="al-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="active">Active — Pending and Approved ({counts.active})</option>
            <option value="Pending">Pending ({counts.Pending})</option>
            <option value="Approved">Approved, not yet ready ({counts.Approved})</option>
            <option value="Ready for Distribution">Ready for Distribution ({counts["Ready for Distribution"]})</option>
            <option value="Distributed">Distributed ({counts.Distributed})</option>
            <option value="Cancelled">Cancelled ({counts.Cancelled})</option>
            <option value="override">Emergency overrides ({counts.override})</option>
            <option value="all">All ({allocations.length})</option>
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading Relief Allocations…</div>
        ) : (
          <DataTable
            columns={[
              { key: "allocation_id", label: "ID" },
              { key: "head_of_family", label: "Household", render: (r) => (
                <span style={{ whiteSpace: "normal" }}>{r.head_of_family}<br /><small>{r.purok}</small></span>
              ) },
              { key: "item_name", label: "Item" },
              { key: "quantity", label: "Quantity", render: (r) => (
                <span>{r.quantity} {r.unit}{r.status === "Distributed" && r.received_quantity != null && Number(r.received_quantity) !== Number(r.quantity)
                  ? <><br /><small>received {r.received_quantity}</small></> : null}</span>
              ) },
              { key: "status", label: "Status", render: (r) => (
                <>
                  <AllocationStatusBadge allocation={r} />
                  {Number(r.is_emergency_override) === 1 && <div><span className="badge badge-critical" style={{ marginTop: 4 }}>Emergency override</span></div>}
                  {r.ready_at && r.status === "Approved" && <div style={{ fontSize: 12, color: "var(--color-ink-soft)", marginTop: 4 }}>{formatSchedule(r.ready_schedule_date, r.ready_schedule_time)} · {r.ready_location}</div>}
                  {r.status === "Cancelled" && <div style={{ fontSize: 12, color: "var(--color-ink-soft)", marginTop: 4, whiteSpace: "normal" }}>{r.cancel_reason}{r.cancelled_by_name ? ` — ${r.cancelled_by_name}` : ""}</div>}
                </>
              ) },
              { key: "dss", label: "DSS at Approval", render: (r) => {
                const d = dssAtApproval(r);
                return (
                  <span style={{ fontSize: 13, whiteSpace: "normal" }}>
                    {d || <span style={{ color: "var(--color-ink-soft)" }}>{r.status === "Pending" ? "recorded on approval" : "not recorded (before Phase 25)"}</span>}
                    {Number(r.is_emergency_override) === 1 && r.override_reason && <><br /><small>Reason: {r.override_reason}</small></>}
                  </span>
                );
              } },
              { key: "approved_by_name", label: "Approved By", render: (r) => r.approved_by_name || "—" },
              { key: "actions", label: "Actions", render: (row) => {
                const s = allocationDisplayStatus(row);
                return (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {row.status === "Pending" && <button className="btn btn-secondary btn-sm" onClick={() => handleApprove(row.allocation_id)}>Approve</button>}
                    {s === "Approved" && <button className="btn btn-ghost btn-sm" onClick={() => { setNotice(""); setReadyRows([row]); }}>Mark Ready</button>}
                    {s === "Ready for Distribution" && <span style={{ color: "var(--color-ink-soft)", fontSize: 12.5 }}>Awaiting distribution</span>}
                    {(row.status === "Pending" || row.status === "Approved") && (
                      <button className="btn btn-ghost btn-sm" onClick={() => { setFormError(""); setNotice(""); setForm({ reason: "" }); setModal({ cancel: row }); }}>Cancel</button>
                    )}
                  </div>
                );
              } },
            ]}
            rows={rows}
            emptyText="No Relief Allocations match this filter."
          />
        )}
      </div>

      {readyRows && (
        <MarkReadyModal
          allocations={readyRows}
          onClose={() => setReadyRows(null)}
          onDone={(msg) => { setReadyRows(null); setNotice(msg); load(); }}
        />
      )}

      {modal === "add" && (
        <Modal title="New Relief Allocation" onClose={() => setModal(null)}>
          <form onSubmit={submitAdd}>
            {formError && <div className="alert alert-error">{formError}</div>}
            <div className="form-group">
              <label htmlFor="al-hh">Household</label>
              <select id="al-hh" name="household_id" value={form.household_id} onChange={set} required>
                <option value="">Select household</option>{householdOptions}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="al-item">Relief Item</label>
              <select id="al-item" name="item_id" value={form.item_id} onChange={set} required>
                <option value="">Select item</option>{itemOptions}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="al-qty">Quantity</label>
                <input id="al-qty" type="number" min="1" step="1" name="quantity" value={form.quantity} onChange={set} required />
              </div>
              <div className="form-group">
                <label htmlFor="al-date">Allocation Date</label>
                <input id="al-date" type="date" name="allocation_date" value={form.allocation_date} onChange={set} required />
              </div>
            </div>
            {eventSelect}
            <div className="form-group">
              <label htmlFor="al-reason">Reason / notes (recommended)</label>
              <input id="al-reason" name="reason" value={form.reason} onChange={set} maxLength={500} placeholder="e.g. Approved relief request at the barangay hall" />
            </div>
            <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: "0 0 8px" }}>
              Saved as Pending; it must be approved. A household cannot have two active allocations of the same item. For a household the DSS does not recommend, use Emergency Override.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Close</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save Allocation"}</button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "override" && (
        <Modal title="Emergency Override" onClose={() => setModal(null)}>
          <form onSubmit={submitOverride}>
            {formError && <div className="alert alert-error">{formError}</div>}
            <p style={{ fontSize: 13.5, marginTop: 0 }}>
              Use this when a household needs relief <strong>now</strong>, whatever its DSS score or assessment status. The allocation is approved
              immediately, <strong>labelled as an emergency override</strong> with your reason, and recorded in the audit log and reports.
              Available stock and the one-allocation-per-item rule still apply. Field responders still follow the barangay&apos;s emergency procedures.
            </p>
            <div className="form-group">
              <label htmlFor="ov-hh">Household</label>
              <select id="ov-hh" name="household_id" value={form.household_id} onChange={set} required>
                <option value="">Select household</option>{householdOptions}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="ov-item">Relief Item</label>
                <select id="ov-item" name="item_id" value={form.item_id} onChange={set} required>
                  <option value="">Select item</option>{itemOptions}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="ov-qty">Quantity</label>
                <input id="ov-qty" type="number" min="1" step="1" name="quantity" value={form.quantity} onChange={set} required />
              </div>
            </div>
            {eventSelect}
            <div className="form-group">
              <label htmlFor="ov-reason">Reason (required)</label>
              <textarea id="ov-reason" name="reason" value={form.reason} onChange={set} required minLength={10} maxLength={500}
                placeholder="What was observed, by whom, and why it cannot wait (e.g. family of 6 without food, roof collapsed; verified by Kagawad on site)" />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Close</button>
              <button type="submit" className="btn btn-primary" disabled={saving || form.reason.trim().length < 10}>{saving ? "Saving…" : "Approve as Emergency Override"}</button>
            </div>
          </form>
        </Modal>
      )}

      {modal && modal.cancel && (
        <Modal title={`Cancel Allocation #${modal.cancel.allocation_id}`} onClose={() => setModal(null)}>
          <form onSubmit={submitCancel}>
            {formError && <div className="alert alert-error">{formError}</div>}
            <p style={{ fontSize: 13.5, marginTop: 0 }}>
              {modal.cancel.quantity} {modal.cancel.unit} of {modal.cancel.item_name} for <strong>{modal.cancel.head_of_family}</strong> ({allocationDisplayStatus(modal.cancel)}).
              {modal.cancel.status === "Approved" ? " The reserved stock will be available again." : ""}
              {modal.cancel.ready_at ? " The household was already told it is ready: please also inform them in person." : ""}
              {" "}The record is kept with your reason.
            </p>
            <div className="form-group">
              <label htmlFor="cx-reason">Reason for cancelling (required)</label>
              <textarea id="cx-reason" name="reason" value={form.reason || ""} onChange={set} required minLength={5} maxLength={500}
                placeholder="e.g. Household relocated outside the barangay; duplicate entry; family could not be reached after 3 visits" />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Keep allocation</button>
              <button type="submit" className="btn btn-danger" disabled={saving || (form.reason || "").trim().length < 5}>{saving ? "Cancelling…" : "Cancel Allocation"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
