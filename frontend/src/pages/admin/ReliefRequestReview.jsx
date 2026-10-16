import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DataTable from "../../components/DataTable.jsx";
import { StatusBadge, URGENCY_BADGE } from "../../config/requestStatus.jsx";
import PriorityExplanation from "../../components/PriorityExplanation.jsx";
import { getReliefRequestDetail, startRequestReview, decideReliefRequest, processReliefRequest } from "../../services/api.jsx";

const DECIDABLE = ["Pending", "Under Review", "Approved", "Partially Approved"];

/**
 * Admin — review one relief request (Phase 19).
 * Shows the request next to the household's DSS results (priority score and
 * breakdown, needs estimate, current recommendation), available stock and
 * shortage. The Administrator decides the approved quantity for each item;
 * processing then creates Approved allocations through the existing
 * stock-safe allocation rules.
 */
export default function ReliefRequestReview() {
  const { requestId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [approved, setApproved] = useState({});
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async (resetForm = false) => {
    try {
      const res = await getReliefRequestDetail(requestId);
      const d = res.data.data;
      setData(d);
      if (resetForm) {
        const init = {};
        d.items.forEach((i) => {
          init[i.request_item_id] = i.approved_quantity ?? Math.min(i.requested_quantity, i.available_stock);
        });
        setApproved(init);
        setRemarks(d.request.admin_remarks || "");
      }
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "We couldn't load this relief request.");
    }
  }, [requestId]);

  useEffect(() => { load(true); }, [load]);

  const act = async (label, fn) => {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      const res = await fn();
      setMessage(res.data.message);
      await load(true);
    } catch (err) {
      setError(err.response?.data?.message || "The action could not be completed. Please try again.");
      await load(false);
    } finally {
      setBusy("");
    }
  };

  if (!data) {
    return error ? <div className="alert alert-error">{error}</div> : <div className="loading-text">Loading request…</div>;
  }

  const { request: r, items, report, assessment, dss } = data;
  const canDecide = DECIDABLE.includes(r.status);
  const canProcess = ["Approved", "Partially Approved"].includes(r.status);
  const approvalPayload = items.map((i) => ({ request_item_id: i.request_item_id, approved_quantity: Number(approved[i.request_item_id] ?? 0) }));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Relief Request #{r.request_id}</h1>
          <p>The Decision Support System recommends; the Administrator makes the final decision.</p>
        </div>
        <Link className="btn btn-ghost btn-sm" to="/admin/relief-requests">← Back to Relief Requests</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <div className="panel-row" style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: 20 }}>
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Request</h3>
          <div className="info-grid">
            <div><strong>Status:</strong> <StatusBadge status={r.status} /></div>
            <div><strong>Urgency:</strong> <span className={`badge ${URGENCY_BADGE[r.urgency]}`}>{r.urgency}</span></div>
            <div><strong>Submitted:</strong> {r.created_at}</div>
            <div><strong>Requested by:</strong> {r.requested_by_name || "—"}</div>
            {r.reviewed_by_name && <div><strong>Reviewed by:</strong> {r.reviewed_by_name}</div>}
            {r.processed_by_name && <div><strong>Processed by:</strong> {r.processed_by_name}</div>}
          </div>
          <p style={{ marginTop: 10 }}><strong>Reason:</strong> {r.reason}</p>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Household</h3>
          <div className="info-grid">
            <div><strong>Head:</strong> {r.head_of_family}</div>
            <div><strong>Purok:</strong> {r.purok}</div>
            <div><strong>Members:</strong> {r.number_of_members}</div>
            <div><strong>Vulnerable:</strong> {r.vulnerable_members}</div>
            <div><strong>Contact:</strong> {r.requested_by_contact || r.household_contact || "—"}</div>
            <div><strong>Address:</strong> {r.address}</div>
          </div>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            Children {r.children_count} · Seniors {r.seniors_count} · PWD {r.pwd_count} · Pregnant {r.pregnant_count} · Medical {r.medical_needs_count} · Other {r.other_vulnerable_count}
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Disaster Report &amp; Damage Assessment</h3>
          {report ? (
            <>
              <div className="info-grid">
                <div><strong>Report:</strong> #{report.report_id} — {report.disaster_type}</div>
                <div><strong>Date:</strong> {report.report_date}</div>
                <div><strong>Reported severity:</strong> {report.severity}</div>
                <div><strong>Report status:</strong> {report.status}</div>
              </div>
              {assessment ? (
                <p style={{ fontSize: 13, marginTop: 8 }}>
                  House: {assessment.house_damage} · Infrastructure: {assessment.infrastructure_damage} · Property: {assessment.property_damage} · Agricultural: {assessment.agricultural_damage}
                  <br />Assessor's estimated severity: {assessment.estimated_severity} (recorded for reference; not a DSS scoring factor)
                </p>
              ) : <p style={{ fontSize: 13, marginTop: 8 }}>No damage assessment recorded for this report yet.</p>}
            </>
          ) : <p style={{ fontSize: 14 }}>The resident did not link a disaster report to this request.</p>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Decision Support — Household Priority</h3>
        <PriorityExplanation p={dss ? { ...dss, eligible: dss.priority_score != null } : null} />
        <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: 8 }}>
          The request's urgency and quantities are shown for your review and do not change this score.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 10 }}>Requested Items, DSS Estimates and Stock</h3>
        <DataTable
          columns={[
            { key: "item_name", label: "Item", render: (i) => <>{i.item_name}<br /><span style={{ fontSize: 12, color: "var(--color-ink-soft)" }}>{i.category}</span></> },
            { key: "requested_quantity", label: "Requested", render: (i) => `${i.requested_quantity} ${i.unit}` },
            { key: "dss_needs_estimate", label: "DSS Needs Estimate", render: (i) => <span title={i.dss_needs_rule}>{i.dss_needs_estimate} {i.unit}</span> },
            { key: "dss_recommended_quantity", label: "DSS Recommends Now", render: (i) => (
              <span title={i.dss_recommendation_note}>{i.dss_recommended_quantity === null ? "—" : `${i.dss_recommended_quantity} ${i.unit}`}</span>
            ) },
            { key: "available_stock", label: "Available", render: (i) => `${i.available_stock} ${i.unit}` },
            { key: "shortage", label: "Shortage", render: (i) => (i.shortage > 0 ? <span className="badge badge-critical">{i.shortage} {i.unit}</span> : "None") },
            { key: "approved", label: "Approve Quantity", render: (i) => canDecide ? (
              <input type="number" min="0" max={i.requested_quantity} step="1" style={{ maxWidth: 100 }}
                aria-label={`Approved quantity for ${i.item_name}`}
                value={approved[i.request_item_id] ?? 0}
                onChange={(e) => setApproved({ ...approved, [i.request_item_id]: e.target.value })} />
            ) : (i.approved_quantity === null ? "—" : `${i.approved_quantity} ${i.unit}`) },
            { key: "allocation_status", label: "Allocation", render: (i) => i.allocation_id ? `#${i.allocation_id} ${i.allocation_status}` : (i.open_allocation ? `Open #${i.open_allocation.allocation_id}` : "—") },
          ]}
          rows={items.map((i) => ({ ...i, id: i.request_item_id }))}
        />
        <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: 8 }}>
          Needs estimate = the DSS category rule for this household's size. "DSS Recommends Now" = the recommendation engine's quantity after higher-priority households are served (hover for the reason).
          Available = current stock minus stock already reserved by approved allocations. Stock is reserved only when you process the request.
        </p>
      </div>

      {canDecide && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 10 }}>Decision</h3>
          <div className="form-group">
            <label htmlFor="rq-remarks">Remarks to the resident (required when rejecting)</label>
            <textarea id="rq-remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {r.status === "Pending" && (
              <button className="btn btn-ghost" disabled={!!busy} onClick={() => act("review", () => startRequestReview(r.request_id))}>
                {busy === "review" ? "Saving…" : "Mark Under Review"}
              </button>
            )}
            <button className="btn btn-primary" disabled={!!busy}
              onClick={() => act("approve", () => decideReliefRequest({ request_id: r.request_id, decision: "approve", remarks, items: approvalPayload }))}>
              {busy === "approve" ? "Saving…" : "Save Approval"}
            </button>
            <button className="btn btn-danger" disabled={!!busy}
              onClick={() => window.confirm("Reject this relief request? The resident will be notified with your remarks.")
                && act("reject", () => decideReliefRequest({ request_id: r.request_id, decision: "reject", remarks }))}>
              {busy === "reject" ? "Saving…" : "Reject Request"}
            </button>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: 8 }}>
            Approving every item in full sets the status to Approved; approving less sets it to Partially Approved. You can revise the decision until the request is processed.
          </p>
        </div>
      )}

      {canProcess && (
        <div className="card">
          <h3 style={{ marginBottom: 6 }}>Process into Relief Allocations</h3>
          <p style={{ fontSize: 14 }}>
            Creates one Approved relief allocation per approved item, reserving the stock. Stock is deducted when the relief is distributed.
            If any item no longer has enough available stock, nothing is created.
          </p>
          <button className="btn btn-primary" disabled={!!busy}
            onClick={() => window.confirm("Create relief allocations for the approved quantities?") && act("process", () => processReliefRequest(r.request_id))}>
            {busy === "process" ? "Processing…" : "Create Allocations"}
          </button>
        </div>
      )}
    </>
  );
}
