import { localDateISO } from "../../utils/dates.js";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DataTable from "../../components/DataTable.jsx";
import Modal from "../../components/Modal.jsx";
import PurokSelect from "../../components/PurokSelect.jsx";
import { exportToCsv } from "../../utils/exportCsv.js";
import {
  getHouseholds, addHousehold, updateHousehold, deleteHousehold, getUsers,
  getHouseholdMembers, addHouseholdMember, deleteHouseholdMember, getPriorityList,
} from "../../services/api.jsx";
import binitayanBoundary from "../../data/binitayanBoundary.json";
import { isPointInGeoJson } from "../../utils/pointInPolygon.js";

// Step 5 — same boundary (Step 2) and same point-in-polygon check (Step 4)
// used elsewhere in the app. This is user-feedback only: the PHP backend
// (add_household.php / update_household.php) independently re-checks every
// coordinate before saving, since it cannot trust what the browser sends.
const OUTSIDE_BOUNDARY_MESSAGE = "The coordinates entered are outside Barangay Binitayan or are not valid numbers. Please check the latitude and longitude.";

const EMPTY_FORM = {
  head_of_family: "", purok: "", address: "", number_of_members: 1,
  children_count: 0, seniors_count: 0, pwd_count: 0, pregnant_count: 0,
  medical_needs_count: 0, other_vulnerable_count: 0,
  contact_number: "", latitude: "", longitude: "", user_id: "",
};

const EMPTY_MEMBER = { full_name: "", relationship: "", age: "" };

export default function Households() {
  const [households, setHouseholds] = useState([]);
  const [residents, setResidents] = useState([]);
  const [priorityByHousehold, setPriorityByHousehold] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const [detailRow, setDetailRow] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberForm, setMemberForm] = useState(EMPTY_MEMBER);
  const [membersLoading, setMembersLoading] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [purokFilter, setPurokFilter] = useState("");
  const [minMembers, setMinMembers] = useState("");
  const [maxMembers, setMaxMembers] = useState("");
  const [vulnFilter, setVulnFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  const load = () => {
    setLoading(true);
    const params = {};
    if (search) params.search = search;
    if (purokFilter) params.purok = purokFilter;
    if (minMembers) params.min_members = minMembers;
    if (maxMembers) params.max_members = maxMembers;
    if (vulnFilter) params.vulnerability = vulnFilter;

    Promise.all([getHouseholds(params), getUsers({ role: "resident" }), getPriorityList()])
      .then(([h, u, p]) => {
        setHouseholds(h.data.data);
        setResidents(u.data.data);
        const map = {};
        p.data.data.forEach((row) => { map[row.household_id] = row; });
        setPriorityByHousehold(map);
      })
      .catch(() => setError("We couldn't load the households. Please try again."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [search, purokFilter, minMembers, maxMembers, vulnFilter]);

  const puroks = useMemo(() => {
    const set = new Set(households.map((h) => h.purok).filter(Boolean));
    return Array.from(set).sort();
  }, [households]);

  const displayedHouseholds = useMemo(() => {
    if (!priorityFilter) return households;
    return households.filter((h) => priorityByHousehold[h.household_id]?.priority_level === priorityFilter);
  }, [households, priorityByHousehold, priorityFilter]);

  const openAdd = () => { setForm(EMPTY_FORM); setEditingId(null); setModalOpen(true); };

  const openEdit = (row) => {
    setForm({
      head_of_family: row.head_of_family, purok: row.purok, address: row.address,
      number_of_members: row.number_of_members,
      children_count: row.children_count, seniors_count: row.seniors_count, pwd_count: row.pwd_count,
      pregnant_count: row.pregnant_count, medical_needs_count: row.medical_needs_count,
      other_vulnerable_count: row.other_vulnerable_count,
      contact_number: row.contact_number || "", latitude: row.latitude ?? "", longitude: row.longitude ?? "",
      user_id: row.user_id ?? "",
    });
    setEditingId(row.household_id);
    setModalOpen(true);
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const totalVulnerable = ["children_count", "seniors_count", "pwd_count", "pregnant_count", "medical_needs_count", "other_vulnerable_count"]
    .reduce((sum, key) => sum + (Number(form[key]) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Step 5 — frontend boundary check (feedback only; backend re-validates).
    // Coordinates stay optional: blank lat/lng is left untouched, same as
    // before this step. Only a provided pair that falls outside Binitayan
    // stops submission here.
    const latStr = String(form.latitude ?? "").trim();
    const lngStr = String(form.longitude ?? "").trim();
    if (latStr !== "" && lngStr !== "") {
      const latNum = Number(latStr);
      const lngNum = Number(lngStr);
      if (Number.isNaN(latNum) || Number.isNaN(lngNum) || !isPointInGeoJson(latNum, lngNum, binitayanBoundary)) {
        alert(OUTSIDE_BOUNDARY_MESSAGE);
        return;
      }
    }

    try {
      if (editingId) {
        await updateHousehold({ household_id: editingId, ...form });
      } else {
        await addHousehold(form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't save the household. Please check the details and try again.");
    }
  };

  const handleDelete = async (household_id) => {
    if (!confirm("Delete this household record? Its household members will also be removed. Disaster reports will be kept but no longer linked. This action cannot be undone.")) return;
    try {
      await deleteHousehold(household_id);
      load();
    } catch (err) {
      // Phase 16 — deleting a household with relief/distribution history
      // is now blocked (backend/households/delete_household.php + the
      // households foreign keys), so show that message instead of
      // leaving this as an unhandled rejection.
      alert(err.response?.data?.message || "Could not delete this household.");
    }
  };

  const openDetail = async (row) => {
    setDetailRow(row);
    setMemberForm(EMPTY_MEMBER);
    setMembersLoading(true);
    try {
      const res = await getHouseholdMembers(row.household_id);
      setMembers(res.data.data);
    } finally {
      setMembersLoading(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!memberForm.full_name.trim()) return;
    try {
      await addHouseholdMember({ household_id: detailRow.household_id, ...memberForm });
      setMemberForm(EMPTY_MEMBER);
      const res = await getHouseholdMembers(detailRow.household_id);
      setMembers(res.data.data);
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't add the household member. Please try again.");
    }
  };

  const handleDeleteMember = async (member_id) => {
    if (!confirm("Remove this household member?")) return;
    await deleteHouseholdMember(member_id);
    const res = await getHouseholdMembers(detailRow.household_id);
    setMembers(res.data.data);
  };

  const resetFilters = () => {
    setSearch(""); setPurokFilter(""); setMinMembers(""); setMaxMembers(""); setVulnFilter(""); setPriorityFilter("");
  };

  const handleExportCsv = () => {
    exportToCsv(
      `households-${localDateISO()}.csv`,
      [
        { key: "household_id", label: "Household ID" },
        { key: "head_of_family", label: "Household Head" },
        { key: "purok", label: "Purok" },
        { key: "address", label: "Address" },
        { key: "contact_number", label: "Contact Number" },
        { key: "number_of_members", label: "Household Members" },
        { key: "vulnerable_members", label: "Vulnerable Members" },
        { key: "children_count", label: "Children" },
        { key: "seniors_count", label: "Senior Citizens" },
        { key: "pwd_count", label: "Persons with Disabilities" },
        { key: "pregnant_count", label: "Pregnant" },
        { key: "medical_needs_count", label: "Medical Needs" },
        { key: "other_vulnerable_count", label: "Other Vulnerable" },
        { key: "latitude", label: "Latitude" },
        { key: "longitude", label: "Longitude" },
      ],
      displayedHouseholds
    );
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Household masterlist</h2>
          <p>Manage household records, household members, and vulnerable member information.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={handleExportCsv}>Export CSV</button>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Household</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row filter-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Search by household head, address, or purok</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search households…" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Purok</label>
            <select value={purokFilter} onChange={(e) => setPurokFilter(e.target.value)}>
              <option value="">All Puroks</option>
              {puroks.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Vulnerable Members</label>
            <select value={vulnFilter} onChange={(e) => setVulnFilter(e.target.value)}>
              <option value="">All Households</option>
              <option value="any">Has Vulnerable Members</option>
              <option value="children">Children</option>
              <option value="seniors">Senior Citizens</option>
              <option value="pwd">Persons with Disabilities</option>
              <option value="pregnant">Pregnant Members</option>
              <option value="medical">Medical Needs</option>
              <option value="other">Other Vulnerable Members</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Priority Level</label>
            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="">All</option>
              <option value="Low Priority">Low</option>
              <option value="Moderate Priority">Moderate</option>
              <option value="High Priority">High</option>
              <option value="Critical Priority">Critical</option>
            </select>
          </div>
        </div>
        <div className="form-row filter-row" style={{ marginTop: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Minimum Household Size</label>
            <input type="number" min="0" value={minMembers} onChange={(e) => setMinMembers(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Maximum Household Size</label>
            <input type="number" min="0" value={maxMembers} onChange={(e) => setMaxMembers(e.target.value)} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn btn-ghost" type="button" onClick={resetFilters}>Reset Filters</button>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading households…</div>
        ) : (
          <DataTable
            columns={[
              { key: "household_id", label: "Household ID" },
              { key: "head_of_family", label: "Household Head" },
              { key: "purok", label: "Purok" },
              { key: "number_of_members", label: "Household Members" },
              { key: "vulnerable_members", label: "Vulnerable Members" },
              { key: "priority", label: "Priority Level", render: (r) => {
                const p = priorityByHousehold[r.household_id];
                if (!p) return "—";
                const cls = { "Low Priority": "badge-low", "Moderate Priority": "badge-medium", "High Priority": "badge-high", "Critical Priority": "badge-critical" }[p.priority_level];
                return <span className={`badge ${cls}`}>{p.priority_level}</span>;
              }},
              { key: "actions", label: "Actions", render: (row) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openDetail(row)}>View</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row.household_id)}>Delete</button>
                </div>
              )},
            ]}
            rows={displayedHouseholds}
            emptyText="No households match your search or filters."
          />
        )}
      </div>

      {modalOpen && (
        <Modal title={editingId ? "Edit Household" : "Add Household"} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Household Head</label>
              <input name="head_of_family" value={form.head_of_family} onChange={handleChange} required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Purok</label>
                <PurokSelect name="purok" value={form.purok} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Contact Number (optional)</label>
                <input name="contact_number" value={form.contact_number} onChange={handleChange} />
              </div>
            </div>
            <div className="form-group">
              <label>Address</label>
              <input name="address" value={form.address} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Link to Resident Account (optional)</label>
              <select name="user_id" value={form.user_id} onChange={handleChange}>
                <option value="">Not linked</option>
                {residents.map((r) => (
                  <option key={r.user_id} value={r.user_id}>{r.full_name} ({r.email})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Number of Household Members</label>
              <input type="number" min="1" name="number_of_members" value={form.number_of_members} onChange={handleChange} required />
            </div>

            <p style={{ fontWeight: 600, fontSize: 13.5, margin: "16px 0 8px" }}>Vulnerable Members</p>
            <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: "-4px 0 8px" }}>
              Enter the number of household members in each group.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label>Children</label>
                <input type="number" min="0" name="children_count" value={form.children_count} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Senior Citizens (60 and above)</label>
                <input type="number" min="0" name="seniors_count" value={form.seniors_count} onChange={handleChange} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Persons with Disabilities</label>
                <input type="number" min="0" name="pwd_count" value={form.pwd_count} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Pregnant Members</label>
                <input type="number" min="0" name="pregnant_count" value={form.pregnant_count} onChange={handleChange} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Persons with Medical Needs</label>
                <input type="number" min="0" name="medical_needs_count" value={form.medical_needs_count} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label>Other Vulnerable Members</label>
                <input type="number" min="0" name="other_vulnerable_count" value={form.other_vulnerable_count} onChange={handleChange} />
              </div>
            </div>
            <p style={{ fontSize: 13, color: "var(--color-ink-soft)", marginTop: -6 }}>
              Total vulnerable members: <strong>{totalVulnerable}</strong>
            </p>

            <p style={{ fontWeight: 600, fontSize: 13.5, margin: "16px 0 8px" }}>Location Coordinates (optional)</p>
            <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: "-4px 0 8px" }}>
              Enter both latitude and longitude in decimal degrees. The location must be within Barangay Binitayan.
            </p>
            <div className="form-row">
              <div className="form-group">
                <label>Latitude</label>
                <input name="latitude" value={form.latitude} onChange={handleChange} placeholder="e.g. 13.1545" />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input name="longitude" value={form.longitude} onChange={handleChange} placeholder="e.g. 123.7143" />
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editingId ? "Save Changes" : "Add Household"}</button>
            </div>
          </form>
        </Modal>
      )}

      {detailRow && (
        <Modal title={`Household Details — ${detailRow.head_of_family}`} onClose={() => setDetailRow(null)}>
          <p><strong>Purok:</strong> {detailRow.purok}</p>
          <p><strong>Address:</strong> {detailRow.address}</p>
          <p><strong>Household Members:</strong> {detailRow.number_of_members} &nbsp; <strong>Vulnerable Members:</strong> {detailRow.vulnerable_members}</p>
          <p><strong>Contact Number:</strong> {detailRow.contact_number || "—"}</p>
          <p><strong>Coordinates:</strong> {detailRow.latitude ?? "—"}, {detailRow.longitude ?? "—"}{" "}
            {/* GIS map: view this household's marker, or assign its location by clicking the map. */}
            {detailRow.latitude != null && detailRow.longitude != null
              ? <Link className="btn-text" to={`/admin/map?household=${detailRow.household_id}`}>View on map</Link>
              : <Link className="btn-text" to={`/admin/map?assign=${detailRow.household_id}`}>Assign location on map</Link>}
          </p>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
            {detailRow.children_count > 0 && <span className="badge badge-medium">Children: {detailRow.children_count}</span>}
            {detailRow.seniors_count > 0 && <span className="badge badge-medium">Senior Citizens: {detailRow.seniors_count}</span>}
            {detailRow.pwd_count > 0 && <span className="badge badge-medium">PWD: {detailRow.pwd_count}</span>}
            {detailRow.pregnant_count > 0 && <span className="badge badge-medium">Pregnant: {detailRow.pregnant_count}</span>}
            {detailRow.medical_needs_count > 0 && <span className="badge badge-medium">Medical Needs: {detailRow.medical_needs_count}</span>}
            {detailRow.other_vulnerable_count > 0 && <span className="badge badge-medium">Other Vulnerable: {detailRow.other_vulnerable_count}</span>}
          </div>

          <hr style={{ margin: "14px 0", border: "none", borderTop: "1px solid var(--color-border)" }} />

          <p style={{ fontWeight: 600, marginBottom: 8 }}>Household Members</p>
          {membersLoading ? (
            <div className="loading-text">Loading members…</div>
          ) : (
            <DataTable
              columns={[
                { key: "full_name", label: "Name" },
                { key: "relationship", label: "Relationship", render: (m) => m.relationship || "—" },
                { key: "age", label: "Age", render: (m) => m.age ?? "—" },
                { key: "actions", label: "", render: (m) => (
                  <button className="btn btn-danger btn-sm" onClick={() => handleDeleteMember(m.member_id)}>Remove</button>
                )},
              ]}
              rows={members}
              emptyText="No household members have been added."
            />
          )}

          <form onSubmit={handleAddMember} style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="form-group" style={{ marginBottom: 0, flex: "1 1 140px" }}>
              <label>Name</label>
              <input value={memberForm.full_name} onChange={(e) => setMemberForm({ ...memberForm, full_name: e.target.value })} placeholder="Full name" />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: "1 1 120px" }}>
              <label>Relationship</label>
              <input value={memberForm.relationship} onChange={(e) => setMemberForm({ ...memberForm, relationship: e.target.value })} placeholder="e.g. Spouse" />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: "0 1 80px" }}>
              <label>Age</label>
              <input type="number" min="0" value={memberForm.age} onChange={(e) => setMemberForm({ ...memberForm, age: e.target.value })} />
            </div>
            <button type="submit" className="btn btn-secondary btn-sm">+ Add Member</button>
          </form>
        </Modal>
      )}
    </>
  );
}
