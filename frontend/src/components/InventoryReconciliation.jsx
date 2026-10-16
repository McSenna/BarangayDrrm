import { useState } from "react";
import { getInventoryReconciliation } from "../services/api.jsx";

/**
 * Phase 25 — inventory reconciliation: stock balance vs. stock ledger vs. allocations
 * (reserved, received in distributions, cancelled). Read-only; recommendations are never counted.
 */
export default function InventoryReconciliation() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    getInventoryReconciliation().then((r) => setData(r.data)).catch(() => setError("We couldn't load the reconciliation."));
  };
  const toggle = () => { if (!open) load(); setOpen(!open); };
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>Stock Reconciliation</h3>
        <button className="btn btn-ghost btn-sm" onClick={toggle} aria-expanded={open}>{open ? "Hide" : "Check stock against the ledger and allocations"}</button>
      </div>
      {open && error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
      {open && data && (
        <>
          <p style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>
            {data.method} {data.summary.items_with_differences === 0
              ? "All items reconcile."
              : <strong>{data.summary.items_with_differences} item(s) show a difference — see the notes.</strong>}
          </p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
            <table>
              <thead>
                <tr><th>Item</th><th>Stock</th><th>Ledger balance</th><th>Received in (Stock In)</th><th>Out — distributions</th><th>Out — other</th>
                  <th>Reserved (Approved)</th><th>Available</th><th>Distributed (received)</th><th>Cancelled</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.item_id}>
                    <td>{r.item_name}</td>
                    <td>{r.stock} {r.unit}</td>
                    <td>{r.ledger_balance}</td>
                    <td>{r.received_in}</td>
                    <td>{r.stock_out_distribution}</td>
                    <td>{r.stock_out_other}</td>
                    <td>{r.reserved}</td>
                    <td>{r.available}</td>
                    <td>{r.distributed_received}{r.shortfall_from_partial_receipts > 0 ? ` (of ${r.distributed_allocated} allocated)` : ""}</td>
                    <td>{r.cancelled_count ? `${r.cancelled_count} (${r.cancelled} ${r.unit})` : "—"}</td>
                    <td style={{ whiteSpace: "normal", minWidth: 180 }}>
                      {r.reconciled ? <span className="badge badge-low">Reconciled</span> : <><span className="badge badge-critical">Check</span><br /><small>{r.notes.join(" ")}</small></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
