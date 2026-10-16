import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAutoRefresh } from "../../hooks/usePolling.js";
import DataTable from "../../components/DataTable.jsx";
import MarkReadyModal from "../../components/MarkReadyModal.jsx";
import Modal from "../../components/Modal.jsx";
import { getAllocations, distributeAllocationReceived } from "../../services/api.jsx";
import { AllocationStatusBadge, allocationDisplayStatus, formatSchedule } from "../../config/allocationStatus.jsx";

/**
 * Approved Relief Allocations (Relief Personnel; also used by the
 * Administrator's Relief Allocation page workflow).
 *
 * Phase 21: Approved -> Ready for Distribution (verified schedule + location,
 * automated SMS) -> Distributed (stock deducted once).
 */
export default function AssignedRelief() {
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState({});
  const [showReady, setShowReady] = useState(false);
  const [searchParams] = useSearchParams();
  // Phase 23: the former Distribution History page is the "distributed" view here.
  const [filter, setFilter] = useState(searchParams.get("view") === "distributed" ? "distributed" : "all");

  // Phase 19: load(true) refreshes silently (used by auto-refresh — no spinner, forms untouched).
  const load = (silent = false) => {
    if (silent !== true) setLoading(true);
    getAllocations().then((res) => setAllocations(res.data.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);
  useAutoRefresh(() => load(true), 45000);

  // Phase 25: record the quantity actually handed over (partial receipt needs a remark).
  const [dist, setDist] = useState(null); // { row, received, remarks, error, saving }
  const openDistribute = (row) => { setError(""); setNotice(""); setDist({ row, received: String(row.quantity), remarks: "", error: "", saving: false }); };
  const submitDistribute = async (e) => {
    e.preventDefault();
    setDist((d) => ({ ...d, saving: true, error: "" }));
    try {
      const res = await distributeAllocationReceived(dist.row.allocation_id, Number(dist.received), dist.remarks);
      setDist(null);
      setNotice(res.data.message || "Marked as Distributed.");
      load();
    } catch (err) {
      setDist((d) => ({ ...d, saving: false, error: err.response?.data?.message || "We couldn't mark this allocation as Distributed. Please try again." }));
    }
  };

  const approved = allocations.filter((a) => a.status === "Approved");
  const distributed = allocations.filter((a) => a.status === "Distributed")
    .sort((a, b) => String(b.distributed_at || "").localeCompare(String(a.distributed_at || "")));
  const rows = filter === "distributed" ? distributed : approved.filter((a) => {
    const s = allocationDisplayStatus(a);
    return filter === "all" || (filter === "ready" ? s === "Ready for Distribution" : s === "Approved");
  });
  const selectable = (a) => allocationDisplayStatus(a) === "Approved";
  const chosen = approved.filter((a) => selected[a.allocation_id] && selectable(a));
  const toggle = (id) => setSelected((s) => ({ ...s, [id]: !s[id] }));
  const allSelectable = rows.filter(selectable);
  const allChecked = allSelectable.length > 0 && allSelectable.every((a) => selected[a.allocation_id]);
  const toggleAll = () => {
    const next = { ...selected };
    allSelectable.forEach((a) => { next[a.allocation_id] = !allChecked; });
    setSelected(next);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Relief Allocations</h1>
          <p>
            Approved → <strong>Ready for Distribution</strong> (record the verified schedule and location; each household is
            notified by SMS) → Distributed (deducted from Relief Inventory once).
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="card" style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label htmlFor="ar-filter">Show</label>
          <select id="ar-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All approved ({approved.length})</option>
            <option value="approved">Approved — not yet ready</option>
            <option value="ready">Ready for Distribution</option>
            <option value="distributed">Distributed (history, {distributed.length})</option>
          </select>
        </div>
        <button className="btn btn-primary" disabled={chosen.length === 0} onClick={() => { setError(""); setNotice(""); setShowReady(true); }}>
          Mark Ready for Distribution{chosen.length ? ` (${chosen.length})` : ""}
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading approved allocations…</div>
        ) : (
          <DataTable
            columns={[
              { key: "select", label: (
                <input type="checkbox" aria-label="Select all approved allocations that are not yet ready" checked={allChecked} onChange={toggleAll} disabled={allSelectable.length === 0} />
              ), render: (r) => selectable(r)
                ? <input type="checkbox" aria-label={`Select allocation ${r.allocation_id}`} checked={!!selected[r.allocation_id]} onChange={() => toggle(r.allocation_id)} />
                : null },
              { key: "head_of_family", label: "Household Head" },
              { key: "purok", label: "Purok" },
              { key: "item_name", label: "Item" },
              { key: "quantity", label: "Quantity", render: (r) => `${r.quantity} ${r.unit}` },
              { key: "status", label: "Status", render: (r) => <AllocationStatusBadge allocation={r} /> },
              { key: "ready", label: "Verified Schedule", render: (r) => r.ready_at
                ? <span style={{ fontSize: 13 }}>{formatSchedule(r.ready_schedule_date, r.ready_schedule_time)}<br />{r.ready_location}</span>
                : "—" },
              { key: "actions", label: filter === "distributed" ? "Distributed" : "Actions", render: (row) => (row.status === "Distributed"
                ? <span style={{ fontSize: 13 }}>{String(row.distributed_at || "").slice(0, 16)}<br />{row.distributed_by_name || ""}
                    {row.received_quantity != null && Number(row.received_quantity) !== Number(row.quantity) && <><br />received {row.received_quantity} of {row.quantity}</>}</span>
                : <button className="btn btn-secondary btn-sm" onClick={() => openDistribute(row)}>
                  Mark as Distributed
                </button>
              )},
            ]}
            rows={rows}
            emptyText="There are no approved Relief Allocations waiting for distribution."
          />
        )}
      </div>

      {dist && (
        <Modal title="Record Distribution" onClose={() => setDist(null)}>
          <form onSubmit={submitDistribute}>
            {dist.error && <div className="alert alert-error">{dist.error}</div>}
            <p style={{ fontSize: 13.5, marginTop: 0 }}>
              {dist.row.head_of_family} — {dist.row.quantity} {dist.row.unit} of {dist.row.item_name}. Only the quantity actually handed over is deducted from
              inventory; anything not handed over becomes available again. This cannot be undone.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="ds-qty">Quantity received</label>
                <input id="ds-qty" type="number" min="1" max={dist.row.quantity} step="1" required value={dist.received}
                  onChange={(e) => setDist({ ...dist, received: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="ds-remarks">Remarks {Number(dist.received) < Number(dist.row.quantity) ? "(required for a partial receipt)" : "(optional)"}</label>
              <input id="ds-remarks" value={dist.remarks} maxLength={300} onChange={(e) => setDist({ ...dist, remarks: e.target.value })}
                placeholder="e.g. Only 2 packs left at the site; remainder to follow" required={Number(dist.received) < Number(dist.row.quantity)} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setDist(null)}>Close</button>
              <button type="submit" className="btn btn-primary" disabled={dist.saving}>{dist.saving ? "Saving…" : "Confirm Distribution"}</button>
            </div>
          </form>
        </Modal>
      )}

      {showReady && (
        <MarkReadyModal
          allocations={chosen}
          onClose={() => setShowReady(false)}
          onDone={(msg) => { setShowReady(false); setSelected({}); setNotice(msg); load(); }}
        />
      )}
    </>
  );
}
