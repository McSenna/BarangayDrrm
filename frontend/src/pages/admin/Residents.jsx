import { useEffect, useState } from "react";
import { purokLabel } from "../../utils/purokLabel.js";
import DataTable from "../../components/DataTable.jsx";
import Modal from "../../components/Modal.jsx";
import { getUsers, getUser, toggleUserStatus, getHouseholds, linkHouseholdResident } from "../../services/api.jsx";

export default function Residents() {
  const [residents, setResidents] = useState([]);
  const [households, setHouseholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [linkFilter, setLinkFilter] = useState(""); // "", "linked", "unlinked"

  const [profileUser, setProfileUser] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const [linkModal, setLinkModal] = useState(null); // resident row
  const [selectedHousehold, setSelectedHousehold] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      getUsers({ role: "resident", search, status: statusFilter }),
      getHouseholds(),
    ])
      .then(([u, h]) => {
        setResidents(u.data.data);
        setHouseholds(h.data.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [search, statusFilter]);

  const householdByUserId = {};
  households.forEach((h) => { if (h.user_id) householdByUserId[h.user_id] = h; });

  const filteredResidents = residents.filter((r) => {
    if (linkFilter === "linked") return !!householdByUserId[r.user_id];
    if (linkFilter === "unlinked") return !householdByUserId[r.user_id];
    return true;
  });

  const openProfile = async (row) => {
    setProfileLoading(true);
    setProfileUser({ full_name: row.full_name }); // placeholder while loading
    try {
      const res = await getUser(row.user_id);
      setProfileUser(res.data.data);
    } catch {
      setProfileUser(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const openLink = (row) => {
    const existing = householdByUserId[row.user_id];
    setSelectedHousehold(existing ? existing.household_id : "");
    setLinkModal(row);
  };

  const handleLinkSubmit = async (e) => {
    e.preventDefault();
    try {
      // Unlink any household currently linked to this resident that isn't the newly selected one
      const existing = householdByUserId[linkModal.user_id];
      if (existing && String(existing.household_id) !== String(selectedHousehold)) {
        await linkHouseholdResident(existing.household_id, null);
      }
      if (selectedHousehold) {
        await linkHouseholdResident(selectedHousehold, linkModal.user_id);
      }
      setLinkModal(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't update the household link. Please try again.");
    }
  };

  const handleToggle = async (row) => {
    const next = row.is_active ? 0 : 1;
    if (!confirm(next ? `Activate ${row.full_name}'s account? This Resident will be able to log in again.` : `Deactivate ${row.full_name}'s account? This Resident will not be able to log in until the account is activated again.`)) return;
    try {
      await toggleUserStatus(row.user_id, next);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "Could not update account status.");
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Resident Management</h1>
          <p>View, search, and manage resident accounts and their household links.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row filter-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Search by name or email</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search residents…" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Household Link</label>
            <select value={linkFilter} onChange={(e) => setLinkFilter(e.target.value)}>
              <option value="">All</option>
              <option value="linked">Linked</option>
              <option value="unlinked">Not Linked</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading residents…</div>
        ) : (
          <DataTable
            columns={[
              { key: "full_name", label: "Name" },
              { key: "email", label: "Email" },
              { key: "contact_number", label: "Contact Number", render: (r) => r.contact_number || "—" },
              { key: "household", label: "Household", render: (r) => {
                const h = householdByUserId[r.user_id];
                return h ? `${h.head_of_family} (${purokLabel(h.purok)})` : <span style={{ color: "var(--color-ink-soft)" }}>Not linked</span>;
              }},
              { key: "is_active", label: "Status", render: (r) => (
                <span className={`badge ${r.is_active ? "badge-low" : "badge-rejected"}`}>
                  {r.is_active ? "Active" : "Inactive"}
                </span>
              )},
              { key: "actions", label: "Actions", render: (row) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openProfile(row)}>View Profile</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openLink(row)}>Link Household</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleToggle(row)}>
                    {row.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              )},
            ]}
            rows={filteredResidents}
            emptyText="No residents match your search or filters."
          />
        )}
      </div>

      {profileUser && (
        <Modal title="Resident Profile" onClose={() => setProfileUser(null)}>
          {profileLoading ? (
            <div className="loading-text">Loading profile…</div>
          ) : (
            <>
              <p><strong>Name:</strong> {profileUser.full_name}</p>
              <p><strong>Email:</strong> {profileUser.email}</p>
              <p><strong>Contact Number:</strong> {profileUser.contact_number || "—"}</p>
              <p><strong>Status:</strong> {profileUser.is_active ? "Active" : "Inactive"}</p>
              <p><strong>Disaster Reports Submitted:</strong> {profileUser.disaster_report_count}</p>
              <hr style={{ margin: "14px 0", border: "none", borderTop: "1px solid var(--color-border)" }} />
              {profileUser.household ? (
                <>
                  <p style={{ fontWeight: 600, marginBottom: 6 }}>Linked Household</p>
                  <p><strong>Household Head:</strong> {profileUser.household.head_of_family}</p>
                  <p><strong>Purok:</strong> {profileUser.household.purok}</p>
                  <p><strong>Household Members:</strong> {profileUser.household.number_of_members} (Vulnerable Members: {profileUser.household.vulnerable_members})</p>
                </>
              ) : (
                <p style={{ color: "var(--color-ink-soft)" }}>This Resident is not linked to a household.</p>
              )}
            </>
          )}
        </Modal>
      )}

      {linkModal && (
        <Modal title={`Link Household — ${linkModal.full_name}`} onClose={() => setLinkModal(null)}>
          <form onSubmit={handleLinkSubmit}>
            <div className="form-group">
              <label>Household</label>
              <select value={selectedHousehold} onChange={(e) => setSelectedHousehold(e.target.value)}>
                <option value="">Not linked (remove link)</option>
                {households.map((h) => (
                  <option key={h.household_id} value={h.household_id}>
                    {h.head_of_family} — Purok {h.purok}
                    {h.user_id && h.user_id !== linkModal.user_id ? " (linked to another Resident; saving will replace that link)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setLinkModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
