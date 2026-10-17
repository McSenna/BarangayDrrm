import { useCallback, useState } from "react";
import usePolling from "../../hooks/usePolling.js";
import { getMyAllocations } from "../../services/api.jsx";
import { ALLOCATION_STATUS_BADGE } from "../../utils/householdAssessment.js";

const STEPS = [
  "A Field Officer visits your household and records the damage.",
  "When the visit is complete, your household becomes Ready for Distribution and you receive an SMS.",
  "Relief Personnel hand over your relief and record it as completed.",
];
const HELP = {
  PENDING_ASSESSMENT: "Waiting for a Field Officer to visit your household.",
  ASSESSMENT_IN_PROGRESS: "A Field Officer has started recording your household visit.",
  READY_FOR_DISTRIBUTION: "Your relief is ready. Please wait for the barangay to hand it over, or contact the barangay office.",
  COMPLETED: "Your relief was handed over.",
  CANCELLED: "This allocation was cancelled by the barangay.",
};

/** Resident — their own household's relief allocation rounds (the API returns nothing else). */
export default function ReliefStatus() {
  const [rounds, setRounds] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await getMyAllocations();
      setRounds(res.data.data || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "We couldn't load your relief status. Please try again.");
    } finally { setLoaded(true); }
  }, []);
  usePolling(load, { interval: 60000 });

  const [current, ...earlier] = rounds;
  const items = (r) => r.items.map((i) => `${r.status === "COMPLETED" ? i.released_qty ?? 0 : i.planned_qty} ${i.unit} ${i.item_name}`).join(", ");

  return (
    <>
      <div className="page-header"><div>
        <h1>Relief Allocation Status</h1>
        <p>Where your household's relief is in the process.</p>
      </div></div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 10, fontSize: 15 }}>How relief allocation works</h3>
        <ol className="relief-steps">{STEPS.map((s, i) => <li key={s}><span className="step-num">{i + 1}</span>{s}</li>)}</ol>
      </div>

      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {!loaded ? <div className="loading-text" role="status">Loading your relief status…</div> : !current ? (
        <div className="card"><p>Your household has no relief allocation yet. If your household was affected, contact the barangay office.</p></div>
      ) : (
        <div className="card" style={{ marginBottom: 20 }} aria-live="polite">
          <p><span className={`badge ${ALLOCATION_STATUS_BADGE[current.status]}`}>{current.status_label}</span></p>
          <p>{HELP[current.status]}</p>
          {current.items.length > 0 && <p><strong>{current.status === "COMPLETED" ? "Received" : "Planned"}:</strong> {items(current)}</p>}
          {current.ready_at && <p><strong>Ready since:</strong> {current.ready_at}</p>}
          {current.completed_at && <p><strong>Completed:</strong> {current.completed_at}</p>}
          {current.cancel_reason && <p><strong>Reason:</strong> {current.cancel_reason}</p>}
        </div>
      )}

      {earlier.length > 0 && <div className="card">
        <h3 style={{ fontSize: 15 }}>Earlier rounds</h3>
        <ul>{earlier.map((r) => <li key={r.allocation_id}>Round {r.round_no}: {r.status_label}{r.items.length ? ` — ${items(r)}` : ""}</li>)}</ul>
      </div>}
    </>
  );
}
