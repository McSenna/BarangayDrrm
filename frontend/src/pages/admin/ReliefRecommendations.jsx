import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { purokLabel } from "../../utils/purokLabel.js";
import { getReliefRecommendations, approveRecommendation, rejectRecommendation, restoreRecommendation, getReliefRequests } from "../../services/api.jsx";

const LEVEL_BADGE = {
  "Low Priority": "badge-low",
  "Moderate Priority": "badge-medium",
  "High Priority": "badge-high",
  "Critical Priority": "badge-critical",
};

export default function ReliefRecommendations() {
  const [households, setHouseholds] = useState([]);
  const [itemSummary, setItemSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  // Rejections are saved on the server (relief_recommendation_rejections) and
  // returned separately, so rejected rows never come back as new recommendations.
  const [rejected, setRejected] = useState([]);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState(null); // `${household_id}-${item_id}` while an action is in flight
  // Admin-edited approval quantities, keyed like busyKey. Rows the admin hasn't
  // touched use the system recommendation. Stored as the raw input text so
  // invalid entries can be shown and explained instead of silently coerced.
  const [approvalQty, setApprovalQty] = useState({});
  // Phase 19: open relief requests, shown next to the DSS recommendation for
  // the same household (information only — the DSS score is unchanged).
  const [openRequests, setOpenRequests] = useState({});
  // Phase 25: optional sharing mode (preview), coverage of both modes, and households to assess first.
  const [mode, setMode] = useState("full_need");
  const [coverage, setCoverage] = useState(null);
  const [assessFirst, setAssessFirst] = useState([]);

  // All stock figures come from the server (relief_recommendations.php);
  // this page only displays them.
  const load = (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    getReliefRecommendations(mode)
      .then((res) => {
        setHouseholds(res.data.data || []);
        setItemSummary(res.data.item_summary || []);
        setRejected(res.data.rejected || []);
        setCoverage(res.data.coverage_preview || null);
        setAssessFirst(res.data.assess_first || []);
      })
      .catch(() => setError("We couldn't load the Relief Recommendations. Please refresh the page or try again later."))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(), [mode]);
  useEffect(() => {
    getReliefRequests({ status: "open" })
      .then((res) => {
        const byHousehold = {};
        (res.data.data || []).forEach((r) => { byHousehold[r.household_id] = r; });
        setOpenRequests(byHousehold);
      })
      .catch(() => {});
  }, []);

  const visibleHouseholds = households.filter((h) => h.recommendations.length > 0);

  const shortageItems = itemSummary.filter((i) => i.shortage > 0);

  // Item-level "Available" from the server (current stock − already committed).
  // The admin may approve up to this amount; the server re-checks it on approval.
  const availableByItem = {};
  itemSummary.forEach((i) => { availableByItem[i.item_id] = i.available; });

  const approvalValue = (key, item) =>
    approvalQty[key] !== undefined ? approvalQty[key] : String(item.quantity_to_allocate);

  // Client-side check for immediate feedback only — approve_recommendation.php validates again.
  const approvalError = (value, item) => {
    const text = String(value).trim();
    if (text === "") return "Enter a quantity to approve.";
    if (!/^\d+$/.test(text)) return "Enter a whole number (for example, 5).";
    const qty = Number(text);
    if (qty <= 0) return "Enter at least 1. To skip this item, select Reject.";
    const max = availableByItem[item.item_id];
    if (max !== undefined && qty > max) return `Only ${max} ${item.unit} available. Enter ${max} or less.`;
    return null;
  };

  const removeRecommendation = (household_id, item_id) => {
    setHouseholds((prev) =>
      prev
        .map((h) => h.household_id === household_id
          ? { ...h, recommendations: h.recommendations.filter((r) => r.item_id !== item_id) }
          : h
        )
        .filter((h) => h.recommendations.length > 0)
    );
  };

  const handleApprove = async (household, item) => {
    const key = `${household.household_id}-${item.item_id}`;
    setBusyKey(key);
    try {
      await approveRecommendation({
        household_id: household.household_id,
        item_id: item.item_id,
        quantity: Number(approvalValue(key, item).trim()),
        reason: item.reason,
        mode,
      });
      removeRecommendation(household.household_id, item.item_id);
      setApprovalQty((prev) => { const next = { ...prev }; delete next[key]; return next; });
      // Approving commits stock, so refresh the server-side stock pool and shortages.
      load(false);
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't approve this recommendation. The page has been refreshed with current stock figures; please review and try again.");
      // Stock may have changed since the page loaded (e.g. another admin approved) — refresh from the server.
      load(false);
    } finally {
      setBusyKey(null);
    }
  };

  const handleReject = async (household, item) => {
    const key = `${household.household_id}-${item.item_id}`;
    setBusyKey(key);
    try {
      await rejectRecommendation({ household_id: household.household_id, item_id: item.item_id });
      removeRecommendation(household.household_id, item.item_id);
      // The rejected need no longer uses stock, so refresh the stock pool and the rejected list.
      load(false);
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't reject this recommendation. Please try again.");
    } finally {
      setBusyKey(null);
    }
  };

  const handleRestore = async (row) => {
    const key = `restore-${row.household_id}-${row.item_id}`;
    setBusyKey(key);
    try {
      await restoreRecommendation({ household_id: row.household_id, item_id: row.item_id });
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't restore this recommendation. Please try again.");
    } finally {
      setBusyKey(null);
      load(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Relief Recommendations</h1>
          <p>The Decision Support System provides relief recommendations based on household priority and available stock. Each recommendation requires the Administrator's review and approval.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, fontSize: 13, color: "var(--color-ink-soft)" }}>
        <p style={{ margin: "0 0 6px" }}>
          <strong>Estimated relief needs.</strong> Every assessed household is listed, highest Priority Score first
          (Low Priority households last, so they receive what is left after higher priorities). A low score never makes a household ineligible.
          Households that cannot be scored yet are listed under <em>Assess first</em>. The needed quantity of each relief item is estimated by category: Food, 1 unit
          per 2 household members; Water, 3 units per member; Hygiene, 1 unit per household; Shelter, 1 unit per 3
          members; Medical, 1 unit if the household has vulnerable members; other categories, 1 unit per household.
        </p>
        <p style={{ margin: "0 0 6px" }}>
          <strong>Inventory availability and shortage.</strong> Available stock (current stock minus quantities approved
          but not yet distributed) is assigned in priority order. Any need that the available stock cannot cover is
          shown as a Shortage.
        </p>
        <p style={{ margin: 0 }}>
          <strong>Administrator approval.</strong> The System Recommendation is a suggestion only. You may adjust the
          Quantity to Approve (a whole number, up to the available stock) before approving. Approving creates a Relief
          Allocation with Approved status; stock is deducted only when Relief Personnel record the distribution.
          Reject records your decision: the recommendation moves to Rejected Recommendations, no longer uses available
          stock, and stays rejected until you restore it.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-row filter-row" style={{ alignItems: "flex-end" }}>
          <div className="form-group" style={{ marginBottom: 0, maxWidth: 420 }}>
            <label htmlFor="rec-mode">Sharing mode when stock is scarce</label>
            <select id="rec-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="full_need">Full need in priority order (current policy)</option>
              <option value="minimum_share">Minimum share first, then top-up (optional — for review)</option>
            </select>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: "8px 0 10px" }}>
          <strong>Full need:</strong> each household in rank order receives its whole estimated need before the next.{" "}
          <strong>Minimum share first:</strong> every household in rank order first receives 1 unit, then remaining stock tops households up in rank order.
          Neither mode can exceed available stock. The sharing policy must be approved by the barangay DRRM and social welfare officers before it is used.
        </p>
        {coverage && (
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
            <table>
              <thead>
                <tr><th>Item</th><th>Available</th><th>Households needing</th><th>Reached — full need</th><th>Reached — minimum share</th><th>Fully covered — full need</th><th>Fully covered — minimum share</th></tr>
              </thead>
              <tbody>
                {(coverage.full_need || []).map((f) => {
                  const m = (coverage.minimum_share || []).find((x) => x.item_id === f.item_id) || {};
                  return (
                    <tr key={f.item_id}>
                      <td>{f.item_name}</td>
                      <td>{f.available} {f.unit}</td>
                      <td>{f.households_requesting}</td>
                      <td>{f.households_reached}</td>
                      <td><strong>{m.households_reached ?? "—"}</strong></td>
                      <td>{f.households_fully_covered}</td>
                      <td>{m.households_fully_covered ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {assessFirst.length > 0 && (
        <div className="card card-band" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginTop: 0 }}>Assess first ({assessFirst.length})</h3>
          <p style={{ fontSize: 13, color: "var(--color-ink-soft)", marginTop: 0 }}>
            These households have no usable assessment yet, so the DSS cannot score them. They are not excluded: record an assessment
            (Disaster Reports → Record Report), or use <Link to="/admin/allocations">Emergency Override</Link> if relief is urgently needed.
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, columns: 2 }}>
            {assessFirst.slice(0, 60).map((h) => <li key={h.household_id}>{h.head_of_family} — {purokLabel(h.purok)}</li>)}
          </ul>
          {assessFirst.length > 60 && <p style={{ fontSize: 12.5 }}>…and {assessFirst.length - 60} more.</p>}
        </div>
      )}

      {!loading && itemSummary.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 6 }}>Relief Inventory Availability and Shortage</h3>
          <p style={{ fontSize: 13, color: "var(--color-ink-soft)", marginTop: 0 }}>
            Available is the current stock minus quantities already approved but not yet distributed.
            Shortage is the quantity still needed after all available stock is used.
            {shortageItems.length > 0
              ? ` ${shortageItems.length} item(s) do not have enough available stock to meet the needs of all listed households.`
              : " Available stock is enough for all listed households."}
          </p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Current Stock</th>
                  <th>Approved, Not Yet Distributed</th>
                  <th>Available</th>
                  <th>Total Needed</th>
                  <th>Total Recommended</th>
                  <th>Shortage</th>
                </tr>
              </thead>
              <tbody>
                {itemSummary.map((i) => (
                  <tr key={i.item_id}>
                    <td>{i.item_name}</td>
                    <td>{i.current_stock} {i.unit}</td>
                    <td>{i.already_committed} {i.unit}</td>
                    <td>{i.available} {i.unit}</td>
                    <td>{i.total_requested} {i.unit}</td>
                    <td>{i.total_recommended} {i.unit}</td>
                    <td>
                      {i.shortage > 0
                        ? <span className="badge badge-critical">Shortage: {i.shortage} {i.unit}</span>
                        : <span style={{ color: "var(--color-ink-soft)" }}>None</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-text">Preparing Relief Recommendations…</div>
      ) : visibleHouseholds.length === 0 ? (
        <div className="card"><div className="empty-state">There are no Relief Recommendations at this time. No assessed household has an unallocated relief need.</div></div>
      ) : (
        visibleHouseholds.map((h) => (
          <div className="card" key={h.household_id} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              <div>
                <strong>{h.head_of_family}</strong> — {purokLabel(h.purok)}
                <span style={{ color: "var(--color-ink-soft)", fontSize: 13, marginLeft: 8 }}>
                  {h.number_of_members} household members, {h.vulnerable_members} vulnerable members
                </span>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {h.total_shortage > 0 && (
                  <span className="badge badge-critical">Shortage: {h.total_shortage} unit(s) not covered</span>
                )}
                <span className={`badge ${LEVEL_BADGE[h.priority_level]}`}>{h.priority_level} (Priority Score: {h.priority_score}/100{h.rank ? `, rank #${h.rank}` : ""})</span>{h.needs_review && <span className="badge badge-pending" style={{ marginLeft: 6 }}>Needs review</span>}
              </div>
            </div>
            {openRequests[h.household_id] && (
              <div className="alert alert-warning" style={{ marginBottom: 10 }}>
                This household has an open relief request (#{openRequests[h.household_id].request_id}, {openRequests[h.household_id].status},{" "}
                {openRequests[h.household_id].urgency} urgency): {openRequests[h.household_id].items_summary}.{" "}
                <Link to={`/admin/relief-requests/${openRequests[h.household_id].request_id}`}>Review the request</Link>
              </div>
            )}

            <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Needed</th>
                    <th>System Recommendation</th>
                    <th>Shortage</th>
                    <th>Quantity to Approve</th>
                    <th>Basis for Recommendation</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {h.recommendations.map((item) => {
                    const key = `${h.household_id}-${item.item_id}`;
                    const value = approvalValue(key, item);
                    const qtyError = approvalError(value, item);
                    const modified = !qtyError && Number(value.trim()) !== item.quantity_to_allocate;
                    return (
                      <tr key={key}>
                        <td>{item.item_name}</td>
                        <td>{item.category}</td>
                        <td>{item.requested_quantity ?? item.recommended_quantity} {item.unit}</td>
                        <td>{item.quantity_to_allocate} {item.unit}</td>
                        <td>
                          {item.shortage > 0
                            ? <span className="badge badge-critical">Shortage: {item.shortage} {item.unit}</span>
                            : <span style={{ color: "var(--color-ink-soft)" }}>—</span>}
                        </td>
                        <td style={{ whiteSpace: "normal", minWidth: 130 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              max={availableByItem[item.item_id]}
                              inputMode="numeric"
                              aria-label={`Quantity to approve for ${item.item_name}`}
                              value={value}
                              onChange={(e) => setApprovalQty((prev) => ({ ...prev, [key]: e.target.value }))}
                              disabled={busyKey === key}
                              style={{ width: 80 }}
                            />
                            <span style={{ fontSize: 12.5 }}>{item.unit}</span>
                          </div>
                          {qtyError ? (
                            <div className="text-danger" style={{ fontSize: 12, marginTop: 4 }}>{qtyError}</div>
                          ) : (
                            <div style={{ color: "var(--color-ink-soft)", fontSize: 12, marginTop: 4 }}>
                              {modified ? `Changed from recommended ${item.quantity_to_allocate} · ` : ""}
                              up to {availableByItem[item.item_id] ?? "—"} available
                            </div>
                          )}
                        </td>
                        <td style={{ whiteSpace: "normal", maxWidth: 280 }}>{item.reason}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              className="btn btn-secondary btn-sm"
                              disabled={busyKey === key || qtyError !== null}
                              title={qtyError || undefined}
                              onClick={() => handleApprove(h, item)}
                            >
                              Approve
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={busyKey === key}
                              onClick={() => handleReject(h, item)}
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {!loading && rejected.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 6 }}>Rejected Recommendations ({rejected.length})</h3>
          <p style={{ fontSize: 13, color: "var(--color-ink-soft)", marginTop: 0 }}>
            These recommendations were rejected by an Administrator and are not included in the list or the stock
            calculation above. Restore a recommendation to have the system evaluate it again.
          </p>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
            <table>
              <thead>
                <tr>
                  <th>Household Head</th>
                  <th>Purok</th>
                  <th>Relief Item</th>
                  <th>Rejected By</th>
                  <th>Rejected On</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rejected.map((r) => (
                  <tr key={`${r.household_id}-${r.item_id}`}>
                    <td>{r.head_of_family}</td>
                    <td>{r.purok}</td>
                    <td>{r.item_name}</td>
                    <td>{r.rejected_by_name || "—"}</td>
                    <td>{r.rejected_at}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busyKey === `restore-${r.household_id}-${r.item_id}`}
                        onClick={() => handleRestore(r)}
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
