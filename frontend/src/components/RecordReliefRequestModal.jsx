import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal.jsx";
import { createReliefRequest, getHouseholds, getItems, getReports } from "../services/api.jsx";

const EMPTY_LINE = { item_id: "", quantity: 1 };

/**
 * Phase 21 — the Administrator records a household's relief request
 * (residents no longer submit requests). The request then follows the
 * existing review -> approval -> allocation workflow.
 */
export default function RecordReliefRequestModal({ onClose, onDone }) {
  const [households, setHouseholds] = useState([]);
  const [items, setItems] = useState([]);
  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ household_id: "", urgency: "Medium", reason: "", report_id: "" });
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getHouseholds().then((r) => setHouseholds(r.data.data || [])).catch(() => {});
    getItems().then((r) => setItems(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setReports([]);
    setForm((f) => ({ ...f, report_id: "" }));
    if (!form.household_id) return;
    getReports({ household_id: form.household_id })
      .then((r) => setReports((r.data.data || []).filter((x) => x.status !== "Rejected")))
      .catch(() => {});
  }, [form.household_id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q ? households.filter((h) => `${h.head_of_family} ${h.purok}`.toLowerCase().includes(q)) : households).slice(0, 200);
  }, [households, search]);
  const chosenIds = lines.map((l) => String(l.item_id)).filter(Boolean);
  const setLine = (i, k, v) => setLines(lines.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    const payload = {
      household_id: Number(form.household_id),
      urgency: form.urgency,
      reason: form.reason.trim(),
      report_id: form.report_id || null,
      items: lines.filter((l) => l.item_id).map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity) })),
    };
    if (!payload.household_id) return setError("Please select the household.");
    if (payload.items.length === 0) return setError("Please add at least one relief item.");
    if (payload.items.some((l) => !Number.isInteger(l.quantity) || l.quantity < 1)) return setError("Quantities must be whole numbers of at least 1.");
    setSaving(true);
    try {
      const res = await createReliefRequest(payload);
      onDone(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || "We couldn't record the relief request. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Record Relief Request" onClose={onClose}>
      {error && <div className="alert alert-error">{error}</div>}
      <form onSubmit={submit}>
        <div className="form-group">
          <label htmlFor="rq-search">Household</label>
          <input id="rq-search" placeholder="Search by head of family or purok…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="Select household" style={{ marginTop: 8 }} value={form.household_id} onChange={(e) => setForm({ ...form, household_id: e.target.value })} required>
            <option value="">— Select a household —</option>
            {filtered.map((h) => <option key={h.household_id} value={h.household_id}>{h.head_of_family} — {h.purok}</option>)}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="rq-urgency">Urgency</label>
            <select id="rq-urgency" value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })}>
              <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="rq-report">Related disaster report (optional)</label>
            <select id="rq-report" value={form.report_id} onChange={(e) => setForm({ ...form, report_id: e.target.value })}>
              <option value="">None</option>
              {reports.map((r) => <option key={r.report_id} value={r.report_id}>#{r.report_id} — {r.disaster_type}, {r.report_date} ({r.status})</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Requested relief items</label>
          {lines.map((line, i) => (
            <div key={i} className="form-row" style={{ alignItems: "flex-end" }}>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <select aria-label={`Relief item ${i + 1}`} value={line.item_id} onChange={(e) => setLine(i, "item_id", e.target.value)}>
                  <option value="">Select item</option>
                  {items.filter((it) => String(it.item_id) === String(line.item_id) || !chosenIds.includes(String(it.item_id)))
                    .map((it) => <option key={it.item_id} value={it.item_id}>{it.item_name} ({it.unit})</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 8, maxWidth: 120 }}>
                <input aria-label={`Quantity ${i + 1}`} type="number" min="1" step="1" value={line.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} />
              </div>
              <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}
                onClick={() => setLines(lines.length === 1 ? [{ ...EMPTY_LINE }] : lines.filter((_, idx) => idx !== i))}>Remove</button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines([...lines, { ...EMPTY_LINE }])} disabled={lines.length >= 20}>+ Add another item</button>
        </div>
        <div className="form-group">
          <label htmlFor="rq-reason">Reason / details</label>
          <textarea id="rq-reason" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="e.g. Field assessment: house flooded, no food supply for 2 days." required minLength={10} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Record Request"}</button>
        </div>
      </form>
    </Modal>
  );
}
