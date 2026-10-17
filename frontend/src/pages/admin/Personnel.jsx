import { useEffect, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import Modal from "../../components/Modal.jsx";
import { getUsers, addUser, updateUser, toggleUserStatus, getAllocations } from "../../services/api.jsx";

const EMPTY_FORM = { full_name: "", email: "", password: "", contact_number: "" };

export default function Personnel({ onAccountsChanged }) {
  const [personnel, setPersonnel] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [detailRow, setDetailRow] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([getUsers({ role: "relief_personnel" }), getAllocations()])
      .then(([p, a]) => {
        setPersonnel(p.data.data);
        setAllocations(a.data.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const distributedCountFor = (user_id) =>
    allocations.filter((a) => a.status === "Distributed" && a.distributed_by === user_id).length;

  const openAdd = () => { setForm(EMPTY_FORM); setEditingId(null); setModalOpen(true); };
  const openEdit = (row) => {
    setForm({ full_name: row.full_name, email: row.email, password: "", contact_number: row.contact_number || "", version: row.version });
    setEditingId(row.user_id);
    setModalOpen(true);
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateUser({ user_id: editingId, role: "relief_personnel", ...form });
      } else {
        await addUser({ role: "relief_personnel", ...form });
      }
      setModalOpen(false);
      load();
      onAccountsChanged?.();
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't save this account. Please check the details and try again.");
    }
  };

  const handleToggle = async (row) => {
    const next = row.is_active ? 0 : 1;
    if (!confirm(next ? `Activate ${row.full_name}'s account? This Relief Personnel account will be able to log in again.` : `Deactivate ${row.full_name}'s account? This Relief Personnel account will not be able to log in until the account is activated again.`)) return;
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
          <h2>Relief Personnel</h2>
          <p>Manage Relief Personnel accounts. Relief Personnel distribute approved relief to households and record each distribution.</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Relief Personnel</button>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading relief personnel…</div>
        ) : (
          <DataTable
            columns={[
              { key: "full_name", label: "Name" },
              { key: "email", label: "Email" },
              { key: "contact_number", label: "Contact Number", render: (r) => r.contact_number || "—" },
              { key: "distributed", label: "Distributions Recorded", render: (r) => distributedCountFor(r.user_id) },
              { key: "is_active", label: "Status", render: (r) => (
                <span className={`badge ${r.is_active ? "badge-low" : "badge-rejected"}`}>
                  {r.is_active ? "Active" : "Inactive"}
                </span>
              )},
              { key: "actions", label: "Actions", render: (row) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDetailRow(row)}>View Distributions</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleToggle(row)}>
                    {row.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              )},
            ]}
            rows={personnel}
            emptyText="No relief personnel accounts found."
          />
        )}
      </div>

      {modalOpen && (
        <Modal title={editingId ? "Edit Relief Personnel" : "Add Relief Personnel"} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Full Name</label>
              <input name="full_name" value={form.full_name} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} required />
            </div>
            {!editingId && (
              <div className="form-group">
                <label>Password (at least 6 characters)</label>
                <input type="password" name="password" value={form.password} onChange={handleChange} minLength={6} required />
              </div>
            )}
            <div className="form-group">
              <label>Contact Number (optional)</label>
              <input name="contact_number" value={form.contact_number} onChange={handleChange} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editingId ? "Save Changes" : "Add Relief Personnel"}</button>
            </div>
          </form>
        </Modal>
      )}

      {detailRow && (
        <Modal title={`Distribution Records — ${detailRow.full_name}`} onClose={() => setDetailRow(null)}>
          <p style={{ color: "var(--color-ink-soft)", fontSize: 13.5 }}>
            Relief allocations recorded as distributed by this Relief Personnel account. Allocations
            approved by the Administrator are available to all active Relief Personnel on the
            <strong> Approved Allocations</strong> page.
          </p>
          <DataTable
            columns={[
              { key: "head_of_family", label: "Household Head" },
              { key: "item_name", label: "Relief Item" },
              { key: "quantity", label: "Quantity", render: (r) => `${r.quantity} ${r.unit}` },
              { key: "distributed_at", label: "Distributed On" },
            ]}
            rows={allocations.filter((a) => a.distributed_by === detailRow.user_id)}
            emptyText="No distributions have been recorded for this staff member."
          />
        </Modal>
      )}
    </>
  );
}
