import { useCallback, useState } from "react";
import usePolling from "../hooks/usePolling.js";
import api from "../services/api.jsx";
import PriorityExplanation from "./PriorityExplanation.jsx";

export default function HouseholdScoreSummary({ householdId }) {
  const [score, setScore] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { const response = await api.get("dashboard/priority_list.php", { params: { household_id: householdId } }); setScore(response.data.data[0] || null); setError(""); }
    catch (e) { setError(e.response?.data?.message || "Could not load current scoring data."); }
  }, [householdId]);
  usePolling(load, { interval: 60000 });
  return <div style={{ marginTop: 20 }}>
    <h3>Current provisional priority</h3>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {score ? <PriorityExplanation p={score} /> : !error && <p>Loading current score…</p>}
  </div>;
}
