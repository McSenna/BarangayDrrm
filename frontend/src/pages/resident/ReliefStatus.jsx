import { useCallback, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import usePolling from "../../hooks/usePolling.js";
import { getAllocations } from "../../services/api.jsx";
import {
  ALLOCATION_STEPS, ALLOCATION_STATUS_HELP, AllocationStatusBadge, allocationDisplayStatus, formatSchedule,
} from "../../config/allocationStatus.jsx";

/**
 * Resident — Relief Allocation Status (Phase 21).
 * Only the resident's own household allocations (the API scopes this by the
 * logged-in account). Ready allocations show the verified schedule, location
 * and instructions recorded by authorized personnel.
 */
export default function ReliefStatus() {
  const [allocations, setAllocations] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await getAllocations();
      setAllocations(res.data.data || []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "We couldn't load your relief status. Please try again.");
    } finally {
      setLoaded(true);
    }
  }, []);
  usePolling(load, { interval: 60000 });

  const ready = allocations.filter((a) => allocationDisplayStatus(a) === "Ready for Distribution");
  // Group ready items by their verified schedule so each distribution is shown once.
  const groups = Object.values(ready.reduce((acc, a) => {
    const k = `${a.ready_schedule_date}|${a.ready_schedule_time || ""}|${a.ready_location}|${a.ready_instructions || ""}`;
    (acc[k] ||= { ...a, items: [] }).items.push(a);
    return acc;
  }, {}));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Relief Allocation Status</h1>
          <p>Relief allocated to your household and where it is in the process.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 10, fontSize: 15 }}>How relief allocation works</h3>
        <ol className="relief-steps">
          {ALLOCATION_STEPS.map((s, i) => (
            <li key={s}><span className="step-num">{i + 1}</span>{s}</li>
          ))}
        </ol>
        <p style={{ fontSize: 13, color: "var(--color-ink-soft)", margin: "10px 0 0" }}>
          You receive an SMS on your registered contact number when your relief is Ready for Distribution.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {groups.map((g) => (
        <div key={`${g.ready_schedule_date}-${g.ready_location}-${g.allocation_id}`} className="ready-box">
          <h3>Ready for Distribution</h3>
          <dl>
            <dt>Items</dt>
            <dd>{g.items.map((a) => `${a.item_name} ${a.quantity} ${a.unit}`).join(", ")}</dd>
            <dt>Schedule</dt>
            <dd>{formatSchedule(g.ready_schedule_date, g.ready_schedule_time)}</dd>
            <dt>Location</dt>
            <dd>{g.ready_location}</dd>
            {g.ready_instructions && (<><dt>Instructions</dt><dd>{g.ready_instructions}</dd></>)}
          </dl>
        </div>
      ))}

      <div className="card">
        {!loaded ? (
          <div className="loading-text">Loading relief status…</div>
        ) : (
          <DataTable
            columns={[
              { key: "item_name", label: "Relief Item" },
              { key: "quantity", label: "Quantity", render: (r) => `${r.quantity} ${r.unit}` },
              { key: "allocation_date", label: "Date Allocated" },
              { key: "status", label: "Status", render: (r) => <AllocationStatusBadge allocation={r} /> },
              {
                key: "details", label: "Details",
                render: (r) => {
                  const s = allocationDisplayStatus(r);
                  if (s === "Ready for Distribution") return `${formatSchedule(r.ready_schedule_date, r.ready_schedule_time)} · ${r.ready_location}`;
                  if (s === "Distributed") return r.distributed_at ? `Distributed ${String(r.distributed_at).slice(0, 10)}` : "Distributed";
                  return ALLOCATION_STATUS_HELP[s] || "";
                },
              },
            ]}
            rows={allocations}
            emptyText="No relief has been allocated to your household yet."
          />
        )}
      </div>
    </>
  );
}
