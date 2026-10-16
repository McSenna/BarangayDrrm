import { useEffect, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import { getPurokValues, applyPurokMapping } from "../../services/api.jsx";

/**
 * Purok Cleanup (Phase 19). Lists every purok value stored in households,
 * hazard alerts and evacuation centers. Non-standard values (e.g. "3",
 * "Demo-3") are NOT changed automatically — the Administrator chooses the
 * standard purok for each one and confirms.
 */
export default function PurokCleanup() {
  const [rows, setRows] = useState([]);
  const [standard, setStandard] = useState([]);
  const [targets, setTargets] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState("");

  const load = () => {
    setLoading(true);
    getPurokValues()
      .then((res) => {
        setRows(res.data.data);
        setStandard(res.data.standard_puroks);
        const initial = {};
        res.data.data.forEach((r) => { if (!r.is_standard) initial[r.value] = r.suggested || ""; });
        setTargets(initial);
      })
      .catch(() => setError("We couldn't load the purok values. Please refresh the page."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const apply = async (oldValue) => {
    const newValue = targets[oldValue];
    if (!newValue) return;
    const total = rows.find((r) => r.value === oldValue);
    const count = total ? total.households + total.hazard_alerts + total.evacuation_centers : 0;
    if (!window.confirm(`Replace "${oldValue}" with "${newValue}" in ${count} record(s)? This cannot be undone automatically.`)) return;
    setBusy(oldValue);
    setError("");
    setSuccess("");
    try {
      const res = await applyPurokMapping(oldValue, newValue);
      setSuccess(res.data.message);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "We couldn't update the purok values. Please try again.");
    } finally {
      setBusy("");
    }
  };

  const nonStandard = rows.filter((r) => !r.is_standard);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Purok Cleanup</h1>
          <p>
            New records must use a standard purok ({standard.join(", ")}). Older records may still use other spellings.
            The Decision Support System matches hazard alerts to households by purok, so map each old value to the
            correct standard purok. Nothing is changed until you confirm.
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>Values That Need Review ({nonStandard.length})</h3>
        {loading ? <div className="loading-text">Loading…</div> : (
          <DataTable
            columns={[
              { key: "value", label: "Stored Value", render: (r) => <strong>{r.value || "(empty)"}</strong> },
              { key: "households", label: "Households" },
              { key: "hazard_alerts", label: "Hazard Alerts" },
              { key: "evacuation_centers", label: "Evacuation Centers" },
              { key: "target", label: "Replace With", render: (r) => (
                <select value={targets[r.value] || ""} onChange={(e) => setTargets({ ...targets, [r.value]: e.target.value })}>
                  <option value="">Choose standard purok</option>
                  {standard.map((p) => <option key={p} value={p}>{p}{r.suggested === p ? " (suggested)" : ""}</option>)}
                </select>
              ) },
              { key: "action", label: "", render: (r) => (
                <button className="btn btn-primary btn-sm" disabled={!targets[r.value] || busy === r.value} onClick={() => apply(r.value)}>
                  {busy === r.value ? "Applying…" : "Apply"}
                </button>
              ) },
            ]}
            rows={nonStandard}
            emptyText="All stored purok values already use the standard list."
          />
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Standard Values in Use</h3>
        <DataTable
          columns={[
            { key: "value", label: "Purok" },
            { key: "households", label: "Households" },
            { key: "hazard_alerts", label: "Hazard Alerts" },
            { key: "evacuation_centers", label: "Evacuation Centers" },
          ]}
          rows={rows.filter((r) => r.is_standard)}
          emptyText="No records use the standard purok values yet."
        />
      </div>
    </>
  );
}
