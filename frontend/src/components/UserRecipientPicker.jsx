import { useEffect, useMemo, useState } from "react";
import { getUsers } from "../services/api.jsx";

export default function UserRecipientPicker({ role, selected, onChange }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    getUsers({ role, status: "active" }).then((res) => setUsers(res.data.data)).finally(() => setLoading(false));
  }, [role]);

  const filtered = useMemo(() => {
    if (!search) return users;
    return users.filter((u) => u.full_name.toLowerCase().includes(search.toLowerCase()));
  }, [users, search]);

  const selectableIds = filtered.filter((u) => u.contact_number).map((u) => u.user_id);

  const toggle = (user_id) => {
    if (selected.includes(user_id)) {
      onChange(selected.filter((id) => id !== user_id));
    } else {
      onChange([...selected, user_id]);
    }
  };

  const selectAllFiltered = () => onChange(Array.from(new Set([...selected, ...selectableIds])));
  const clearSelection = () => onChange([]);

  if (loading) return <div className="loading-text">Loading recipients…</div>;

  return (
    <div>
      <div className="form-group" style={{ marginBottom: 8 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={selectAllFiltered}>Select All</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clearSelection}>Clear Selection</button>
        <span style={{ fontSize: 13, color: "var(--color-ink-soft)", alignSelf: "center" }}>{selected.length} selected</span>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table" style={{ maxHeight: 280, overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: 8 }}>
        <table>
          <thead>
            <tr><th></th><th>Name</th><th>Contact Number</th></tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const hasNumber = !!u.contact_number;
              return (
                <tr
                  key={u.user_id}
                  // Unavailable rows (no number) use the muted text color instead of 50%
                  // opacity, which made them unreadable (3.4:1). Still marked by the
                  // disabled checkbox, not-allowed cursor and "No contact number".
                  style={{ cursor: hasNumber ? "pointer" : "not-allowed", color: hasNumber ? undefined : "var(--color-ink-soft)" }}
                  onClick={() => hasNumber && toggle(u.user_id)}
                >
                  <td><input type="checkbox" checked={selected.includes(u.user_id)} disabled={!hasNumber} onChange={() => toggle(u.user_id)} style={{ width: "auto" }} /></td>
                  <td>{u.full_name}</td>
                  <td>{u.contact_number || <span style={{ color: "var(--color-danger)" }}>No number on file</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty-state">No users match your search.</div>}
      </div>
    </div>
  );
}
