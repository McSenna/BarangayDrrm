import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DataTable from "../../components/DataTable.jsx";
import Modal from "../../components/Modal.jsx";
import HouseholdScoreSummary from "../../components/HouseholdScoreSummary.jsx";
import usePolling from "../../hooks/usePolling.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { PRIORITY_BADGE } from "../../config/priority.js";
import { getPriorityList, BASE_URL } from "../../services/api.jsx";
export default function PriorityList() {
  const { user } = useAuth();
  const base = user?.role === "admin" ? "/admin" : user?.role === "field_officer" ? "/field" : "/personnel";
  const [data, setData] = useState([]);
  const [calculatedAt, setCalculatedAt] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [detailRow, setDetailRow] = useState(null);
  const [filter, setFilter] = useState("all");
  const load = useCallback(async () => {
    try { const res = await getPriorityList(); setData(res.data.data || []); setCalculatedAt(res.data.calculated_at); setError(""); }
    catch (e) { setError(e.response?.data?.message || "Could not calculate the current priorities."); }
    finally { setLoaded(true); }
  }, []);
  usePolling(load, { interval: 60000 });
  const rows = useMemo(() => data.filter(r => filter === "all" || (filter === "complete" ? r.score_complete : filter === "incomplete" ? !r.score_complete : r.needs_review)).map(r => ({ ...r, id: r.household_id })), [data, filter]);
  const incomplete = data.filter(r => !r.score_complete).length;
  const points = value => value == null ? "For Verification" : value;
  return <>
    <div className="page-header"><div><h1>Household Priority Assessment</h1><p>Scores use the recorded Purok flood zone, recorded household counts and the Field Officer's damage classification. Before the visit only the automatic subtotal (out of 80) exists; the final score is out of 100.</p></div></div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    <details className="card" style={{ marginBottom: 16 }}><summary>Criteria and exact priority ranges</summary>
      <p>Inside designated flood zone: 40; outside: 20. Unknown or unverified locations have no points yet.</p>
      <p>Verified household size, including the head: 7+ people: 20; 5–6: 15; 3–4: 10; 1–2: 5.</p>
      <p>Recorded vulnerable people: 3+: 20; 2: 15; 1: 10; 0: 0. A person in multiple categories counts once.</p>
      <p>Household damage from the submitted field visit: Destroyed / uninhabitable 20; Severely damaged 15; Partially damaged 10; Minor damage 5; No damage 0. Not yet assessed is never 0.</p>
      <p>0–40: Low; 41–60: Moderate; 61–80: High; 81–100: Critical. Final scores rank from highest to lowest; ties share a rank. Households without a submitted visit show Pending Assessment; missing data shows For Verification — neither is ranked as Low.</p>
    </details>
    {incomplete > 0 && <div className="alert alert-warning">{incomplete} household(s) need source-data corrections. They have incomplete scores and are not classified as Low Priority.</div>}
    <div className="card" style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap", marginBottom: 16 }}>
      <div className="form-group" style={{ marginBottom: 0 }}><label htmlFor="pl-filter">Show</label><select id="pl-filter" value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">All households ({data.length})</option><option value="complete">Complete final scores ({data.length - incomplete})</option><option value="incomplete">Missing or invalid data ({incomplete})</option><option value="review">All review flags</option>
      </select></div>
      <button className="btn btn-ghost" onClick={load}>Refresh scores</button>
      <a className="btn btn-secondary" href={BASE_URL + "dashboard/priority_list.php?export=csv"}>Export current priorities CSV</a>
      <span className="users-help">Calculated: {calculatedAt || "—"}</span>
    </div>
    <div className="card">{!loaded ? <p>Calculating current priorities…</p> : <DataTable columns={[
      { key: "rank", label: "Rank", render: r => <span style={{ whiteSpace: "normal" }}>{r.rank == null ? "Unranked — verify" : "#" + r.rank}</span> },
      { key: "head_of_family", label: "Household", render: r => <>{r.head_of_family}<br /><small>{r.purok}</small></> },
      { key: "final_score", label: "Score", render: r => <><strong>{r.final_score != null ? `${r.final_score} / 100` : `${r.automatic_subtotal ?? "—"} / 80 so far`}</strong><br /><span className={"badge " + (PRIORITY_BADGE[r.priority_level] || "badge-pending")}>{r.priority_level}</span></> },
      { key: "criteria", label: "Criteria", render: r => <div style={{ whiteSpace: "normal", minWidth: 180, maxWidth: 240 }}>
        <div>{r.flood_classification_label}: <strong>{points(r.score_breakdown?.flood_zone)} / 40</strong></div>
        <div>{r.number_of_members ?? "Unknown"} members: <strong>{points(r.score_breakdown?.household_size)} / 20</strong></div>
        <div>{r.vulnerable_members ?? "Unknown"} vulnerable people: <strong>{points(r.score_breakdown?.vulnerable_members)} / 20</strong></div>
        <div>{r.damage?.label ?? "Damage: Not Yet Assessed"}: <strong>{r.score_breakdown?.damage ?? "—"} / 20</strong></div>
      </div> },
      { key: "assessment_status", label: "Damage assessment / visit", render: r => <div style={{ whiteSpace: "normal", maxWidth: 180 }}>{r.assessment_status}<br /><small>{r.damage_assessment_status}<br />{r.assigned_field_officer_name || "Not assigned"} · {r.field_visit_date || "No visit yet"}</small></div> },
      { key: "actions", label: "Details", render: r => <button className="btn btn-ghost btn-sm" onClick={() => setDetailRow(r)}>View breakdown</button> },
    ]} rows={rows} emptyText="No households match this view." />}</div>
    {detailRow && <Modal title={"Current priority — " + detailRow.head_of_family} onClose={() => { setDetailRow(null); load(); }}>
      <HouseholdScoreSummary householdId={detailRow.household_id} />
      <div className="modal-actions"><Link className="btn btn-ghost" to={base + "/reports?household_id=" + detailRow.household_id}>View reports</Link><button className="btn btn-primary" onClick={() => { setDetailRow(null); load(); }}>Close</button></div>
    </Modal>}
  </>;
}

