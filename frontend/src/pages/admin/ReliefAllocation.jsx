import { useCallback, useEffect, useMemo, useState } from "react";
import { useAutoRefresh } from "../../hooks/usePolling.js";
import DataTable from "../../components/DataTable.jsx";
import Modal from "../../components/Modal.jsx";
import { PRIORITY_BADGE } from "../../config/priority.js";
import { ALLOCATION_STATUS_LABELS, ALLOCATION_STATUS_BADGE, damageLabel } from "../../utils/householdAssessment.js";
import { purokLabel } from "../../utils/purokLabel.js";
import {
  getAllocations, getAllocationHistory, reopenAllocation, cancelAllocation, adjustPlanned, startAllocationRound,
  getReliefPackages, createReliefPackage, setStandardPackage, getItems, getSystemSettings,
} from "../../services/api.jsx";

const OPEN = ["PENDING_ASSESSMENT", "ASSESSMENT_IN_PROGRESS", "READY_FOR_DISTRIBUTION"];
const TABS = [
  ["open", "Open"], ["READY_FOR_DISTRIBUTION", "Ready"], ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"], ["all", "All rounds"], ["legacy", "Historical"],
];
const message = (err, fallback) => err.response?.data?.message || fallback;

/** Score cell: the snapshot the allocation carries (at Ready / at completion) next to today's recalculated score. */
function ScoreCell({ r }) {
  const snapshot = r.status === "COMPLETED" ? { label: "At completion", score: r.completed_score, priority: r.completed_priority }
    : r.ready_score != null ? { label: "At Ready", score: r.ready_score, priority: r.ready_priority } : null;
  const c = r.current;
  return <div style={{ whiteSpace: "normal" }}>
    {snapshot && <div><small>{snapshot.label}</small> <strong>{snapshot.score ?? "—"} / 100</strong> <span className={`badge ${PRIORITY_BADGE[snapshot.priority] || "badge-pending"}`}>{snapshot.priority}</span></div>}
    {c && <div><small>Current</small> {c.final_score != null ? <strong>{c.final_score} / 100</strong> : <span>{c.automatic_subtotal ?? "—"} / 80 so far</span>} <span className={`badge ${PRIORITY_BADGE[c.priority_level] || "badge-pending"}`}>{c.priority_level}</span></div>}
  </div>;
}

/** Choose (or create) the one standard relief package every Ready household is planned to receive. */
function StandardPackage({ onChanged }) {
  const [packages, setPackages] = useState([]);
  const [standardId, setStandardId] = useState("");
  const [choice, setChoice] = useState("");
  const [items, setItems] = useState([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ package_name: "", lines: [{ item_id: "", quantity: 1 }] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, s] = await Promise.all([getReliefPackages(), getSystemSettings()]);
      setPackages(p.data.data || []);
      const id = String(s.data.data?.standard_relief_package_id || "");
      setStandardId(id); setChoice(id);
    } catch (err) { setError(message(err, "We couldn't load relief packages.")); }
    finally { setLoaded(true); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const current = packages.find((p) => String(p.package_id) === standardId);
  const usable = packages.filter((p) => Number(p.is_active) === 1 && (p.items || []).length > 0);

  const use = async (id) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await setStandardPackage(Number(id));
      setNotice(res.data.data.promoted ? `Standard package set. ${res.data.data.promoted} waiting household(s) are now Ready for Distribution.` : "Standard package set.");
      await load(); onChanged();
    } catch (err) { setError(message(err, "We couldn't set the standard package.")); }
    finally { setBusy(false); }
  };
  const openCreate = async () => {
    setCreating(true);
    if (!items.length) { try { setItems((await getItems()).data.data || []); } catch { setError("We couldn't load inventory items."); } }
  };
  const create = async (e) => {
    e.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const lines = draft.lines.filter((l) => l.item_id).map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity) }));
      await createReliefPackage({ package_name: draft.package_name.trim(), description: "", items: lines });
      setCreating(false); setDraft({ package_name: "", lines: [{ item_id: "", quantity: 1 }] });
      setNotice("Package created. Choose it below to make it the standard package.");
      await load();
    } catch (err) { setError(message(err, "We couldn't create the package.")); }
    finally { setBusy(false); }
  };

  return <section className="card" aria-labelledby="std-pkg" style={{ marginBottom: 16 }}>
    <h2 id="std-pkg" style={{ fontSize: 16, margin: "0 0 6px" }}>Standard relief package</h2>
    <p style={{ margin: "0 0 10px" }}>Every household that becomes Ready for Distribution is planned this package. Changing it affects households that become Ready afterwards.</p>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}
    {!loaded ? <p role="status">Loading the standard package…</p> : current ? <p><strong>{current.package_name}:</strong> {(current.items || []).map((i) => `${i.quantity} ${i.unit} ${i.item_name}`).join(", ")}</p>
      : <div className="alert alert-warning"><strong>No standard package is set.</strong> Submitted field visits wait until you choose one.</div>}
    <div className="form-row" style={{ alignItems: "end" }}>
      <div className="form-group"><label htmlFor="std-choice">Package</label>
        <select id="std-choice" value={choice} onChange={(e) => setChoice(e.target.value)} disabled={busy}>
          <option value="">Select an active package with items</option>
          {usable.map((p) => <option key={p.package_id} value={p.package_id}>{p.package_name}</option>)}
        </select></div>
      <div className="form-group"><button className="btn btn-primary" disabled={busy || !choice || choice === standardId} onClick={() => use(choice)}>Use as standard package</button></div>
      <div className="form-group"><button className="btn btn-ghost" disabled={busy} onClick={openCreate}>New package</button></div>
    </div>
    {creating && <Modal title="New relief package" onClose={() => !busy && setCreating(false)}>
      <form onSubmit={create}>
        <div className="form-group"><label htmlFor="pkg-name">Package name</label><input id="pkg-name" required maxLength={150} value={draft.package_name} onChange={(e) => setDraft((d) => ({ ...d, package_name: e.target.value }))} /></div>
        {draft.lines.map((l, idx) => <div className="form-row" key={idx}>
          <div className="form-group"><label htmlFor={`pkg-item-${idx}`}>Item</label>
            <select id={`pkg-item-${idx}`} value={l.item_id} required={idx === 0} onChange={(e) => setDraft((d) => ({ ...d, lines: d.lines.map((x, j) => j === idx ? { ...x, item_id: e.target.value } : x) }))}>
              <option value="">Select item</option>{items.map((i) => <option key={i.item_id} value={i.item_id}>{i.item_name} ({i.unit})</option>)}
            </select></div>
          <div className="form-group"><label htmlFor={`pkg-qty-${idx}`}>Quantity per household</label>
            <input id={`pkg-qty-${idx}`} type="number" min={1} step={1} required value={l.quantity} onChange={(e) => setDraft((d) => ({ ...d, lines: d.lines.map((x, j) => j === idx ? { ...x, quantity: e.target.value } : x) }))} /></div>
        </div>)}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, { item_id: "", quantity: 1 }] }))}>Add item</button>
        <div className="modal-actions"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setCreating(false)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Create package"}</button></div>
      </form>
    </Modal>}
  </section>;
}

/**
 * Relief Allocation (Administrator oversight). Rounds move Pending Assessment → Assessment in Progress →
 * Ready for Distribution (automatic after the field visit) → Completed (Relief Personnel). The administrator
 * re-opens or cancels Ready rounds, raises planned quantities, starts new rounds and reviews the audit trail.
 */
export default function ReliefAllocation() {
  const [data, setData] = useState({ allocations: [], legacy: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("open");
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState(null); // { kind: 'reopen'|'cancel'|'adjust'|'history', row, ... }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setData((await getAllocations()).data.data); setError(""); }
    catch (err) { if (!silent) setError(message(err, "We couldn't load allocations.")); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => { if (!dialog) load(true); }, 60000);

  const openHouseholds = useMemo(() => new Set(data.allocations.filter((a) => OPEN.includes(a.status)).map((a) => a.household_id)), [data]);
  const term = q.trim().toLowerCase();
  const match = (r) => !term || `${r.head_of_family} ${r.purok} ${r.household_id}`.toLowerCase().includes(term);
  const rows = data.allocations.filter((r) => (tab === "all" || (tab === "open" ? OPEN.includes(r.status) : r.status === tab)) && match(r));
  const count = (s) => data.allocations.filter((a) => (s === "open" ? OPEN.includes(a.status) : a.status === s)).length;

  const run = async (fn, done) => {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); setDialog(null); setNotice(done); await load(true); }
    catch (err) { setDialog((d) => d && { ...d, error: message(err, "That action could not be completed.") }); }
    finally { setBusy(false); }
  };
  const openHistory = async (row) => {
    setDialog({ kind: "history", row, entries: null });
    try { const res = await getAllocationHistory(row.allocation_id); setDialog((d) => d && { ...d, entries: res.data.data }); }
    catch (err) { setDialog((d) => d && { ...d, error: message(err, "We couldn't load the history."), entries: [] }); }
  };
  const newRound = (row) => run(() => startAllocationRound(row.household_id), `New allocation round started for ${row.head_of_family}.`);

  const columns = [
    { key: "household", label: "Household", render: (r) => <>{r.head_of_family}<br /><small>{purokLabel(r.purok)} · round {r.round_no}</small></> },
    { key: "status", label: "Status", render: (r) => <span className={`badge ${ALLOCATION_STATUS_BADGE[r.status]}`}>{ALLOCATION_STATUS_LABELS[r.status]}</span> },
    { key: "score", label: "Score", render: (r) => <ScoreCell r={r} /> },
    { key: "visit", label: "Field visit", render: (r) => <small style={{ whiteSpace: "normal" }}>{r.assessed_by_name || "Not assigned"}<br />{r.field_visit_date || "Not Yet Assessed"}{r.damage_classification ? ` · ${damageLabel(r.damage_classification)}` : ""}</small> },
    { key: "items", label: "Items", render: (r) => r.items.length ? <ul className="ready-items">{r.items.map((i) => <li key={i.allocation_item_id}>{r.status === "COMPLETED" ? `${i.released_qty ?? 0} of ${i.planned_qty}` : i.planned_qty} {i.unit} {i.item_name}</li>)}</ul> : "—" },
    { key: "actions", label: "Actions", render: (r) => <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {r.status === "READY_FOR_DISTRIBUTION" && <>
        <button className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: "reopen", row: r, reason: "" })}>Re-open</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: "adjust", row: r, reason: "", qty: Object.fromEntries(r.items.map((i) => [i.item_id, String(i.planned_qty)])) })}>Adjust plan</button>
        <button className="btn btn-danger btn-sm" onClick={() => setDialog({ kind: "cancel", row: r, reason: "" })}>Cancel</button>
      </>}
      {["COMPLETED", "CANCELLED"].includes(r.status) && !openHouseholds.has(r.household_id) && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => newRound(r)}>Start new round</button>}
      <button className="btn btn-ghost btn-sm" onClick={() => openHistory(r)}>History</button>
    </div> },
  ];

  const reasonDialog = (d, title, verb, action, done) => <Modal title={`${title} — ${d.row.head_of_family}`} onClose={() => !busy && setDialog(null)}>
    <form onSubmit={(e) => { e.preventDefault(); run(() => action(d), done); }}>
      {d.error && <div className="alert alert-error" role="alert">{d.error}</div>}
      {d.kind === "adjust" && d.row.items.map((i) => <div className="release-row" key={i.allocation_item_id}>
        <label htmlFor={`adj-${i.allocation_item_id}`}><strong>{i.item_name}</strong><br /><small>Planned {i.planned_qty} {i.unit} — can only be raised</small></label>
        <input id={`adj-${i.allocation_item_id}`} type="number" min={i.planned_qty} step={1} required value={d.qty[i.item_id]} onChange={(e) => setDialog((x) => ({ ...x, qty: { ...x.qty, [i.item_id]: e.target.value } }))} />
      </div>)}
      {d.kind === "reopen" && <p>The household leaves the Ready list, its planned items are cleared and the Field Officer can edit the visit again.</p>}
      {d.kind === "cancel" && <p>The household leaves the Ready list. No stock was deducted. You can start a new round afterwards.</p>}
      <div className="form-group" style={{ marginTop: 12 }}><label htmlFor="dlg-reason">Reason (required)</label>
        <textarea id="dlg-reason" rows={3} required minLength={3} maxLength={500} value={d.reason} onChange={(e) => setDialog((x) => ({ ...x, reason: e.target.value }))} /></div>
      <div className="modal-actions"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDialog(null)}>Back</button>
        <button type="submit" className={`btn ${d.kind === "cancel" ? "btn-danger" : "btn-primary"}`} disabled={busy}>{busy ? "Saving…" : verb}</button></div>
    </form>
  </Modal>;

  return <>
    <div className="page-header"><div>
      <h1>Relief Allocation</h1>
      <p>Households become Ready for Distribution automatically when the assigned Field Officer submits a complete visit. Relief Personnel complete each distribution; stock is deducted only then.</p>
    </div><button className="btn btn-ghost" onClick={() => load()} disabled={loading}>Refresh</button></div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}

    <StandardPackage onChanged={() => load(true)} />

    <div className="card" style={{ marginBottom: 16 }}>
      <div role="tablist" aria-label="Allocation status" className="seg-tabs">
        {TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className="seg-tab" onClick={() => setTab(key)}>
          {label}{key === "legacy" ? ` (${data.legacy.length})` : key === "all" ? ` (${data.allocations.length})` : ` (${count(key)})`}
        </button>)}
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}><label htmlFor="alloc-search">Search</label>
        <input id="alloc-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Household head, household ID or Purok" /></div>
    </div>

    <div className="card">
      {loading ? <div className="loading-text" role="status">Loading allocations…</div> : tab === "legacy" ? (
        <DataTable rows={data.legacy.filter(match).map((l) => ({ ...l, id: `l${l.allocation_id}` }))} emptyText="No historical allocations."
          columns={[
            { key: "head_of_family", label: "Household", render: (l) => <>{l.head_of_family}<br /><small>{purokLabel(l.purok)}</small></> },
            { key: "item_name", label: "Item", render: (l) => `${l.quantity} ${l.unit || ""} ${l.item_name || ""}` },
            { key: "status", label: "Status", render: (l) => <><span className="badge badge-unassessed">Historical</span> {l.status}</> },
            { key: "dss_score", label: "Score at approval", render: (l) => l.dss_score != null ? `${l.dss_score} (${l.dss_category}) · ${l.dss_model_version || ""}` : l.dss_category || "—" },
            { key: "date", label: "Date", render: (l) => l.distributed_at || l.allocation_date },
            { key: "note", label: "Note", render: (l) => l.cancel_reason || "—" },
          ]} />
      ) : <DataTable rows={rows.map((r) => ({ ...r, id: r.allocation_id }))} columns={columns} emptyText="No allocations in this view." />}
    </div>

    {dialog?.kind === "reopen" && reasonDialog(dialog, "Re-open allocation", "Re-open", (d) => reopenAllocation(d.row.allocation_id, d.reason.trim()), "Allocation re-opened. It is no longer on the Ready list.")}
    {dialog?.kind === "cancel" && reasonDialog(dialog, "Cancel allocation", "Cancel allocation", (d) => cancelAllocation(d.row.allocation_id, d.reason.trim()), "Allocation cancelled.")}
    {dialog?.kind === "adjust" && reasonDialog(dialog, "Adjust planned quantities", "Save plan", (d) => adjustPlanned(d.row.allocation_id, Object.fromEntries(Object.entries(d.qty).map(([k, v]) => [k, Number(v)])), d.reason.trim()), "Planned quantities updated.")}
    {dialog?.kind === "history" && <Modal title={`History — ${dialog.row.head_of_family} (round ${dialog.row.round_no})`} onClose={() => setDialog(null)}>
      {dialog.error && <div className="alert alert-error" role="alert">{dialog.error}</div>}
      {!dialog.entries ? <p role="status">Loading history…</p> : <ol style={{ paddingLeft: 18 }}>{dialog.entries.map((h) => <li key={h.history_id} style={{ marginBottom: 8 }}>
        <strong>{h.action.replace(/_/g, " ")}</strong>{h.from_status || h.to_status ? ` · ${ALLOCATION_STATUS_LABELS[h.from_status] || "—"} → ${ALLOCATION_STATUS_LABELS[h.to_status] || "—"}` : ""}<br />
        <small>{h.created_at} · {h.user_name || "System"}{h.user_role ? ` (${h.user_role})` : ""}{h.ip_address ? ` · ${h.ip_address}` : ""}</small>
        {h.reason && <div><small>Reason: {h.reason}</small></div>}
      </li>)}</ol>}
      <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setDialog(null)}>Close</button></div>
    </Modal>}
  </>;
}
