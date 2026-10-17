import { useEffect, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import Modal from "../../components/Modal.jsx";
import PurokSelect from "../../components/PurokSelect.jsx";
import { getUsers, addUser, updateUser, toggleUserStatus, getAllocations } from "../../services/api.jsx";

const EMPTY_FORM = { full_name: "", email: "", password: "", contact_number: "", assigned_purok: "" };

/** One row per released item: completed workflow allocations plus historical per-item distributions. */
function distributionRecords({ allocations = [], legacy = [] }) {
  const completed = allocations.flatMap((a) => a.items.filter((i) => i.released_qty > 0).map((i) => ({
    key: `w${a.allocation_id}-${i.allocation_item_id}`, head_of_family: a.head_of_family, item_name: i.item_name,
    quantity: i.released_qty, unit: i.unit, distributed_at: a.completed_at, distributed_by: Number(a.completed_by),
  })));
  const historical = legacy.filter((l) => l.status === "Distributed").map((l) => ({
    key: `l${l.allocation_id}`, head_of_family: l.head_of_family, item_name: l.item_name,
    quantity: Number(l.quantity), unit: l.unit, distributed_at: l.distributed_at, distributed_by: Number(l.distributed_by),
  }));
  return [...completed, ...historical];
}

export default function Personnel({ onAccountsChanged, accountRole = "relief_personnel" }) {
  const isFieldOfficer = accountRole === "field_officer";
  const singular = isFieldOfficer ? "Field Officer" : "Relief Personnel";
  const plural = isFieldOfficer ? "Field Officers" : "Relief Personnel";
  const [personnel, setPersonnel] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [detailRow, setDetailRow] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([getUsers({ role: accountRole }), isFieldOfficer ? Promise.resolve({ data: { data: { allocations: [], legacy: [] } } }) : getAllocations({ status: "COMPLETED" })])
      .then(([p, a]) => {
        setPersonnel(p.data.data);
        setAllocations(distributionRecords(a.data.data));
      })
      .catch(() => setError(`We couldn't load ${plural.toLowerCase()}. Please try again.`))
      .finally(() => setLoading(false));
  };

  useEffect(load, [accountRole]);

  const distributedCountFor = (user_id) => allocations.filter((a) => a.distributed_by === Number(user_id)).length;

  const openAdd = () => { setForm(EMPTY_FORM); setEditingId(null); setModalOpen(true); };
  const openEdit = (row) => {
    setForm({ full_name: row.full_name, email: row.email, password: "", contact_number: row.contact_number || "", assigned_purok: row.assigned_purok || "", version: row.version });
    setEditingId(row.user_id);
    setModalOpen(true);
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateUser({ user_id: editingId, role: accountRole, ...form });
      } else {
        await addUser({ role: accountRole, ...form });
      }
      setModalOpen(false);
      load();
      onAccountsChanged?.();
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't save this account. Please check the details and try again.");
    } finally { setSaving(false); }
  };

  const handleToggle = async (row) => {
    const next = row.is_active ? 0 : 1;
    if (!confirm(next ? `Activate ${row.full_name}'s ${singular} account? They will be able to log in again.` : `Deactivate ${row.full_name}'s ${singular} account? They will not be able to log in until reactivated.`)) return;
    try {
      await toggleUserStatus(row.user_id, next, row.version);
      load();
      onAccountsChanged?.();
    } catch (err) {
      alert(err.response?.data?.message || "Could not update account status.");
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h2>{plural}</h2>
          <p>{isFieldOfficer ? "Assign each field officer a Purok. Their household records, reports and assessments are restricted to that Purok." : "Assign each relief officer a Purok. They can view households and manage relief distribution only within that Purok."}</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add {singular}</button>
      </div>

      {error && <div className="alert alert-error" role="alert">{error} <button className="btn btn-ghost" onClick={load}>Retry</button></div>}
      <div className="card">
        {loading ? (
          <div className="loading-text">Loading {plural.toLowerCase()}…</div>
        ) : (
          <DataTable
            columns={[
              { key: "full_name", label: "Name" },
              { key: "email", label: "Email" },
              { key: "contact_number", label: "Contact Number", render: (r) => r.contact_number || "—" },
              { key: "assigned_purok", label: "Assigned Purok", render: (r) => r.assigned_purok || "Needs assignment" },
              ...(!isFieldOfficer ? [{ key: "distributed", label: "Distributions Recorded", render: (r) => distributedCountFor(r.user_id) }] : []),
              { key: "is_active", label: "Status", render: (r) => (
                <span className={`badge ${r.is_active ? "badge-low" : "badge-rejected"}`}>
                  {r.is_active ? "Active" : "Inactive"}
                </span>
              )},
              { key: "actions", label: "Actions", render: (row) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {!isFieldOfficer && <button className="btn btn-ghost btn-sm" onClick={() => setDetailRow(row)}>View Distributions</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleToggle(row)}>
                    {row.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              )},
            ]}
            rows={personnel}
            emptyText={`No ${plural.toLowerCase()} accounts found.`}
          />
        )}
      </div>

      {modalOpen && (
        <Modal title={`${editingId ? "Edit" : "Add"} ${singular}`} onClose={() => { if (!saving) setModalOpen(false); }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor={`${accountRole}-full-name`}>Full Name</label>
              <input id={`${accountRole}-full-name`} name="full_name" value={form.full_name} maxLength={150} onChange={handleChange} required disabled={saving} />
            </div>
            <div className="form-group">
              <label htmlFor={`${accountRole}-email`}>Email</label>
              <input id={`${accountRole}-email`} type="email" name="email" value={form.email} maxLength={150} onChange={handleChange} required disabled={saving} />
            </div>
            {!editingId && (
              <div className="form-group">
                <label htmlFor={`${accountRole}-password`}>Password (at least 6 characters)</label>
                <input id={`${accountRole}-password`} type="password" name="password" value={form.password} onChange={handleChange} minLength={6} maxLength={72} required disabled={saving} />
              </div>
            )}
            <div className="form-group">
              <label htmlFor={`${accountRole}-contact`}>Contact Number (optional)</label>
              <input id={`${accountRole}-contact`} name="contact_number" value={form.contact_number} maxLength={20} onChange={handleChange} disabled={saving} />
            </div>
            <div className="form-group">
              <label htmlFor="staff-assigned-purok">Assigned Purok</label>
              <PurokSelect id="staff-assigned-purok" name="assigned_purok" value={form.assigned_purok} onChange={handleChange} required disabled={saving} />
              <p className="users-help">This officer can access household and relief records only within the selected Purok. Changing it also changes access for their current session.</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : editingId ? "Save Changes" : `Add ${singular}`}</button>
            </div>
          </form>
        </Modal>
      )}

      {detailRow && (
        <Modal title={`Distribution Records — ${detailRow.full_name}`} onClose={() => setDetailRow(null)}>
          <p style={{ color: "var(--color-ink-soft)", fontSize: 13.5 }}>
            Relief released by this Relief Personnel account: completed allocations (one row per item) and
            earlier per-item distributions. Households become Ready for Distribution after their field visit
            and appear on the <strong>Ready for Distribution</strong> page.
          </p>
          <DataTable
            columns={[
              { key: "head_of_family", label: "Household Head" },
              { key: "item_name", label: "Relief Item" },
              { key: "quantity", label: "Quantity", render: (r) => `${r.quantity} ${r.unit}` },
              { key: "distributed_at", label: "Distributed On" },
            ]}
            rows={allocations.filter((a) => a.distributed_by === Number(detailRow.user_id))}
            emptyText="No distributions have been recorded for this staff member."
          />
        </Modal>
      )}
    </>
  );
}
