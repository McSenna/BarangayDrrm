import { useEffect, useMemo, useState } from "react";
import { getHouseholds, getPriorityList } from "../services/api.jsx";
import { PRIORITY_BADGE } from "../config/priority.js";

const LEVEL_RANK = { "Critical Priority": 4, "High Priority": 3, "Moderate Priority": 2, "Low Priority": 1, "Pending Assessment": 0, "For Verification": 0 };

export default function BeneficiaryPicker({ selected, onChange }) {
  const [households, setHouseholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  useEffect(() => {
    Promise.all([getHouseholds(), getPriorityList()])
      .then(([h, p]) => {
        const priorityByHousehold = {};
        p.data.data.forEach((row) => { priorityByHousehold[row.household_id] = row; });
        const merged = h.data.data.map((hh) => ({
          ...hh,
          priority_level: priorityByHousehold[hh.household_id]?.priority_level || null,
          priority_score: priorityByHousehold[hh.household_id]?.priority_score ?? null,
        }));
        merged.sort((a, b) => (LEVEL_RANK[b.priority_level] || 0) - (LEVEL_RANK[a.priority_level] || 0));
        setHouseholds(merged);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return households.filter((h) => {
      if (priorityFilter && h.priority_level !== priorityFilter) return false;
      if (search && !h.head_of_family.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [households, search, priorityFilter]);

  const toggle = (household_id) => {
    if (selected.includes(household_id)) {
      onChange(selected.filter((id) => id !== household_id));
    } else {
      onChange([...selected, household_id]);
    }
  };

  const selectAllFiltered = () => {
    const ids = filtered.map((h) => h.household_id);
    onChange(Array.from(new Set([...selected, ...ids])));
  };

  const clearSelection = () => onChange([]);

  if (loading) return <div className="loading-text">Loading households…</div>;

  return (
    <div>
      <div className="form-row filter-row">
        <div className="form-group" style={{ marginBottom: 8 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by Household Head" />
        </div>
        <div className="form-group" style={{ marginBottom: 8 }}>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="">All Priority Levels</option>
            <option value="Critical Priority">Critical</option>
            <option value="High Priority">High</option>
            <option value="Moderate Priority">Moderate</option>
            <option value="Low Priority">Low</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={selectAllFiltered}>Select All Shown</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clearSelection}>Clear Selection</button>
        <span style={{ fontSize: 13, color: "var(--color-ink-soft)", alignSelf: "center" }}>{selected.length} selected</span>
      </div>

      <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table" style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8 }}>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Household Head</th>
              <th>Purok</th>
              <th>Members</th>
              <th>Priority Level</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((h) => (
              <tr key={h.household_id} style={{ cursor: "pointer" }} onClick={() => toggle(h.household_id)}>
                <td><input type="checkbox" checked={selected.includes(h.household_id)} onChange={() => toggle(h.household_id)} style={{ width: "auto" }} /></td>
                <td>{h.head_of_family}</td>
                <td>{h.purok}</td>
                <td>{h.number_of_members}</td>
                <td>{h.priority_level ? <span className={`badge ${PRIORITY_BADGE[h.priority_level]}`}>{h.priority_level}{h.final_score != null ? " (" + h.final_score + "/100)" : ""}</span> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty-state">No households match your search or filter.</div>}
      </div>
    </div>
  );
}
