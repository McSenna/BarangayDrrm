import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import { localDateISO } from "../utils/dates.js";
import { markAllocationsReady, getEvacuationCenters } from "../services/api.jsx";

/**
 * Phase 21 — "Mark Ready for Distribution" dialog (Administrator and Relief
 * Personnel). Records the VERIFIED distribution schedule and location for
 * the selected Approved allocations. The server then sends one automated
 * notification (in-app + TextBee SMS) per household, after saving.
 *
 * Props: allocations (selected rows), onClose(), onDone(message)
 */
export default function MarkReadyModal({ allocations, onClose, onDone }) {
  const today = new Date();
  const maxDate = new Date(today.getTime() + 60 * 86400000);
  const [form, setForm] = useState({ distribution_date: localDateISO(today), distribution_time: "", location: "", instructions: "" });
  const [confirmed, setConfirmed] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Registered evacuation centers are offered as location suggestions only.
    getEvacuationCenters()
      .then((res) => setSuggestions((res.data.data || []).map((c) => [c.name, c.address].filter(Boolean).join(", "))))
      .catch(() => {});
  }, []);

  const households = new Set(allocations.map((a) => a.household_id)).size;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!confirmed) {
      setError("Please confirm that the schedule and location are verified.");
      return;
    }
    setSaving(true);
    try {
      const res = await markAllocationsReady({
        allocation_ids: allocations.map((a) => Number(a.allocation_id)),
        ...form,
        confirmed: true,
      });
      onDone(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || "We couldn't mark these allocations as Ready for Distribution. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Mark Ready for Distribution" onClose={onClose}>
      <p style={{ fontSize: 14, marginTop: 0 }}>
        {allocations.length} approved allocation(s) for {households} household(s). Each household receives one
        notification (in-app and SMS) with the schedule and location below.
      </p>
      <ul style={{ fontSize: 13, margin: "0 0 12px", paddingLeft: 18, maxHeight: 120, overflowY: "auto" }}>
        {allocations.map((a) => (
          <li key={a.allocation_id}>#{a.allocation_id} {a.head_of_family} — {a.item_name} {a.quantity} {a.unit}</li>
        ))}
      </ul>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={submit}>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="rd-date">Distribution Date</label>
            <input id="rd-date" type="date" value={form.distribution_date} min={localDateISO(today)} max={localDateISO(maxDate)} onChange={set("distribution_date")} required />
          </div>
          <div className="form-group">
            <label htmlFor="rd-time">Time (optional)</label>
            <input id="rd-time" type="time" value={form.distribution_time} onChange={set("distribution_time")} />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="rd-loc">Distribution Location</label>
          <input id="rd-loc" list="rd-loc-list" value={form.location} onChange={set("location")} required minLength={3} maxLength={255} placeholder="e.g. Binitayan Covered Court" />
          <datalist id="rd-loc-list">
            {suggestions.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div className="form-group">
          <label htmlFor="rd-ins">Instructions (optional)</label>
          <textarea id="rd-ins" value={form.instructions} onChange={set("instructions")} maxLength={300} placeholder="e.g. Bring a valid ID. The household head or an authorized member should claim." />
          <small style={{ color: "var(--color-ink-soft)" }}>{form.instructions.length}/300</small>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, margin: "4px 0 12px" }}>
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ width: 16, height: 16, flex: "none", marginTop: 3, padding: 0 }} />
          <span>I confirm this distribution schedule and location are verified. They will be sent to the households by SMS.</span>
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !confirmed}>
            {saving ? "Saving…" : "Mark Ready and Notify"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
