import { useState } from "react";
import Modal from "./Modal.jsx";
import { completeAllocation } from "../services/api.jsx";

const newKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `k${Date.now()}${Math.random().toString(16).slice(2)}`);

/**
 * Relief Personnel confirm what was actually handed over. Quantities default to the plan and may be lower,
 * never higher. One completion key per dialog: a retry after a network error reuses it, so the server
 * returns the first result instead of deducting stock twice.
 */
export default function CompleteDistributionModal({ allocation, onClose, onCompleted }) {
  const [key] = useState(newKey);
  const [released, setReleased] = useState(() => Object.fromEntries(allocation.items.map((i) => [i.allocation_item_id, String(i.planned_qty)])));
  const [recipient, setRecipient] = useState("");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const problems = allocation.items.map((i) => {
    const v = released[i.allocation_item_id];
    if (!/^\d+$/.test(v ?? "")) return `${i.item_name}: enter a whole number.`;
    if (Number(v) > i.planned_qty) return `${i.item_name}: cannot release more than planned (${i.planned_qty}).`;
    return null;
  }).filter(Boolean);
  const total = allocation.items.reduce((sum, i) => sum + (Number(released[i.allocation_item_id]) || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    if (problems.length || total === 0) { setError(problems[0] || "Release at least one item."); return; }
    setSaving(true); setError("");
    try {
      const res = await completeAllocation(allocation.allocation_id, {
        completion_key: key,
        items: allocation.items.map((i) => ({ allocation_item_id: i.allocation_item_id, released_qty: Number(released[i.allocation_item_id]) })),
        recipient_name: recipient.trim(), remarks: remarks.trim(),
      });
      onCompleted({ ...res.data.data, head_of_family: allocation.head_of_family });
    } catch (err) {
      setError(err.response?.data?.message || "We couldn't complete this distribution. Check your connection and try again — retrying will not deduct stock twice.");
      setSaving(false);
    }
  };

  return (
    <Modal title={`Complete distribution — ${allocation.head_of_family}`} onClose={() => !saving && onClose()}>
      <form onSubmit={submit}>
        <p>Confirm what was actually released. Stock is deducted only when you confirm. You may release less than planned, never more.</p>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: "0 0 12px", minWidth: 0 }}>
          <legend className="sr-only">Released quantities</legend>
          {allocation.items.map((i) => (
            <div className="release-row" key={i.allocation_item_id}>
              <label htmlFor={`release-${i.allocation_item_id}`}>
                <strong>{i.item_name}</strong><br />
                <small>Planned {i.planned_qty} {i.unit} · in stock {i.current_stock ?? "—"}</small>
              </label>
              <input id={`release-${i.allocation_item_id}`} type="number" inputMode="numeric" min={0} max={i.planned_qty} step={1} required
                value={released[i.allocation_item_id]} onChange={(e) => setReleased((r) => ({ ...r, [i.allocation_item_id]: e.target.value }))} />
            </div>
          ))}
          <div className="form-group" style={{ marginTop: 12 }}>
            <label htmlFor="release-recipient">Received by (optional)</label>
            <input id="release-recipient" maxLength={150} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Name of the person who received the relief" />
          </div>
          <div className="form-group">
            <label htmlFor="release-remarks">Remarks (optional)</label>
            <textarea id="release-remarks" rows={2} maxLength={300} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </fieldset>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving || problems.length > 0 || total === 0}>{saving ? "Completing…" : "Confirm and complete"}</button>
        </div>
      </form>
    </Modal>
  );
}
