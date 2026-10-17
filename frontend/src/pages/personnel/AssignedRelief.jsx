import { useCallback, useEffect, useState } from "react";
import { useAutoRefresh } from "../../hooks/usePolling.js";
import DataTable from "../../components/DataTable.jsx";
import PurokSelect from "../../components/PurokSelect.jsx";
import Modal from "../../components/Modal.jsx";
import CompleteDistributionModal from "../../components/CompleteDistributionModal.jsx";
import { PRIORITY_BADGE } from "../../config/priority.js";
import { damageLabel } from "../../utils/householdAssessment.js";
import { purokLabel } from "../../utils/purokLabel.js";
import { getReadyAllocations } from "../../services/api.jsx";

const PRIORITIES = ["Critical Priority", "High Priority", "Moderate Priority", "Low Priority"];
const COMPONENTS = [["flood_zone", "Flood zone", 40], ["household_size", "Household size", 20], ["vulnerable_members", "Vulnerable members", 20], ["damage", "Damage", 20]];

/**
 * Ready for Distribution (Relief Personnel). The server returns only Ready allocations in the user's Purok,
 * highest final score first, then the longest-waiting. Completing one is the only step that deducts stock.
 */
export default function AssignedRelief() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [purok, setPurok] = useState("");
  const [priority, setPriority] = useState("");
  const [detail, setDetail] = useState(null);
  const [completing, setCompleting] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await getReadyAllocations({ q: q.trim() || undefined, purok: purok || undefined, priority: priority || undefined });
      setRows(res.data.data || []);
      setError("");
    } catch (err) {
      if (!silent) setError(err.response?.data?.message || "We couldn't load the Ready for Distribution list. Please try again.");
    } finally { setLoading(false); }
  }, [q, purok, priority]);
  useEffect(() => { const t = setTimeout(() => load(), 250); return () => clearTimeout(t); }, [load]);
  useAutoRefresh(() => { if (!completing) load(true); }, 45000);

  const completed = (allocation) => {
    setCompleting(null);
    const left = allocation.items.map((i) => `${i.item_name} ${i.remaining_stock ?? "—"} ${i.unit}`).join(", ");
    setNotice(`Distribution completed for ${allocation.head_of_family}. Remaining stock: ${left}.`);
    load(true);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Ready for Distribution</h1>
          <p>Households whose field visit is complete, highest priority first. Confirm what you hand over to complete a distribution; stock is deducted only then.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => load()} disabled={loading}>Refresh</button>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row">
          <div className="form-group"><label htmlFor="ready-search">Search</label>
            <input id="ready-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Household head, household ID or Purok" /></div>
          <div className="form-group"><label htmlFor="ready-purok">Purok</label>
            <PurokSelect id="ready-purok" value={purok} onChange={(e) => setPurok(e.target.value)} allowEmpty emptyLabel="All Puroks" /></div>
          <div className="form-group"><label htmlFor="ready-priority">Priority</label>
            <select id="ready-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">All priorities</option>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select></div>
        </div>
      </div>

      <div className="card">
        {loading ? <div className="loading-text" role="status">Loading Ready for Distribution…</div> : <>
          <ul className="ready-cards" aria-label="Ready for Distribution">
            {rows.length === 0 && <li>No households are Ready for Distribution right now.</li>}
            {rows.map((r) => <li key={r.allocation_id} className="ready-card">
              <div className="ready-card-head">
                <div><strong>{r.head_of_family}</strong><br /><small>{purokLabel(r.purok)} · ID {r.household_id}</small></div>
                <div className="ready-card-score"><strong>{r.ready_score} / 100</strong><br /><span className={`badge ${PRIORITY_BADGE[r.ready_priority] || "badge-pending"}`}>{r.ready_priority}</span></div>
              </div>
              <small>{COMPONENTS.map(([k, label, max]) => `${label} ${r.breakdown?.[k] ?? "—"}/${max}`).join(" · ")}</small>
              <ul className="ready-items">{r.items.map((i) => <li key={i.allocation_item_id}>{i.planned_qty} {i.unit} {i.item_name}</li>)}</ul>
              <small>Assessed by {r.assessed_by_name || "—"} · visit {r.field_visit_date || "—"}</small>
              <div className="form-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setDetail(r)}>View</button>
                <button className="btn btn-primary btn-sm" onClick={() => { setNotice(""); setCompleting(r); }}>Complete distribution</button>
              </div>
            </li>)}
          </ul>
          <div className="ready-table"><DataTable rows={rows.map((r) => ({ ...r, id: r.allocation_id }))} emptyText="No households are Ready for Distribution right now."
            columns={[
              { key: "household", label: "Household", render: (r) => <>{r.head_of_family}<br /><small>{purokLabel(r.purok)} · ID {r.household_id}</small></> },
              { key: "ready_score", label: "Score", render: (r) => <><strong>{r.ready_score} / 100</strong><br /><span className={`badge ${PRIORITY_BADGE[r.ready_priority] || "badge-pending"}`}>{r.ready_priority}</span></> },
              { key: "breakdown", label: "Breakdown", render: (r) => <small style={{ whiteSpace: "normal" }}>{COMPONENTS.map(([k, label, max]) => `${label} ${r.breakdown?.[k] ?? "—"}/${max}`).join(" · ")}</small> },
              { key: "items", label: "Planned items", render: (r) => <ul className="ready-items">{r.items.map((i) => <li key={i.allocation_item_id}>{i.planned_qty} {i.unit} {i.item_name}</li>)}</ul> },
              { key: "assessed", label: "Assessed by", render: (r) => <>{r.assessed_by_name || "—"}<br /><small>Visit {r.field_visit_date || "—"}</small></> },
              { key: "action", label: "Action", render: (r) => <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setDetail(r)}>View</button>
                <button className="btn btn-primary btn-sm" onClick={() => { setNotice(""); setCompleting(r); }}>Complete distribution</button>
              </div> },
            ]} /></div>
        </>}
      </div>

      {detail && (
        <Modal title={`Ready for distribution — ${detail.head_of_family}`} onClose={() => setDetail(null)}>
          <p><span className={`badge ${PRIORITY_BADGE[detail.ready_priority] || "badge-pending"}`}>{detail.ready_priority}</span> <strong>{detail.ready_score} / 100</strong> · Ready since {detail.ready_at}</p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Score at Ready">
            <table><thead><tr><th>Criterion</th><th>Points</th></tr></thead>
              <tbody>{COMPONENTS.map(([k, label, max]) => <tr key={k}><th scope="row">{label}{k === "damage" && detail.damage_classification ? ` (${damageLabel(detail.damage_classification)})` : ""}</th><td>{detail.breakdown?.[k] ?? "—"} / {max}</td></tr>)}</tbody>
            </table>
          </div>
          <p><strong>Field Officer:</strong> {detail.assessed_by_name || "—"} · <strong>Visit:</strong> {detail.field_visit_date || "—"}</p>
          <h4>Planned items</h4>
          <ul className="ready-items">{detail.items.map((i) => <li key={i.allocation_item_id}>{i.planned_qty} {i.unit} {i.item_name} <small>(in stock {i.current_stock ?? "—"})</small></li>)}</ul>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setDetail(null)}>Close</button>
            <button className="btn btn-primary" onClick={() => { setCompleting(detail); setDetail(null); }}>Complete distribution</button>
          </div>
        </Modal>
      )}
      {completing && <CompleteDistributionModal allocation={completing} onClose={() => setCompleting(null)} onCompleted={completed} />}
    </>
  );
}
