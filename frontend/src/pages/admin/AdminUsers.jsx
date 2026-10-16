import { useEffect, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import Modal from "../../components/Modal.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { getUsers, addUser, updateUser, deleteUser, toggleUserStatus } from "../../services/api.jsx";

const EMPTY_FORM = { full_name: "", email: "", password: "", contact_number: "" };

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = () => {
    setLoading(true);
    getUsers({ role: "admin" })
      .then((res) => setAdmins(res.data.data))
      .catch(() => setError("We couldn't load the administrator accounts. Please try again."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = () => { setForm(EMPTY_FORM); setEditingId(null); setModalOpen(true); };
  const openEdit = (row) => {
    setForm({ full_name: row.full_name, email: row.email, password: "", contact_number: row.contact_number || "" });
    setEditingId(row.user_id);
    setModalOpen(true);
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateUser({ user_id: editingId, role: "admin", ...form });
      } else {
        await addUser({ role: "admin", ...form });
      }
      setModalOpen(false);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't save this account. Please check the details and try again.");
    }
  };

  const handleDelete = async (user_id) => {
    if (!confirm("Delete this Administrator account? This action cannot be undone.")) return;
    try {
      await deleteUser(user_id);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't delete this account. Please try again.");
    }
  };

  const handleToggle = async (row) => {
    const next = row.is_active ? 0 : 1;
    if (!confirm(next ? `Activate ${row.full_name}'s account? This user will be able to log in again.` : `Deactivate ${row.full_name}'s account? This user will not be able to log in until the account is activated again.`)) return;
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
          <h1>Administrator Accounts</h1>
          <p>Manage Administrator accounts. Administrators have full access to all system features.</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Administrator</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading administrators…</div>
        ) : (
          <DataTable
            columns={[
              { key: "full_name", label: "Name" },
              { key: "email", label: "Email" },
              { key: "contact_number", label: "Contact Number", render: (r) => r.contact_number || "—" },
              { key: "is_active", label: "Status", render: (r) => (
                <span className={`badge ${r.is_active ? "badge-low" : "badge-rejected"}`}>
                  {r.is_active ? "Active" : "Inactive"}
                </span>
              )},
              { key: "actions", label: "Actions", render: (row) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>Edit</button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleToggle(row)}
                    disabled={row.user_id === currentUser.user_id}
                    title={row.user_id === currentUser.user_id ? "You cannot deactivate your own account." : ""}
                  >
                    {row.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(row.user_id)}
                    disabled={row.user_id === currentUser.user_id}
                  >
                    Delete
                  </button>
                </div>
              )},
            ]}
            rows={admins}
            emptyText="No administrator accounts found."
          />
        )}
      </div>

      {modalOpen && (
        <Modal title={editingId ? "Edit Administrator" : "Add Administrator"} onClose={() => setModalOpen(false)}>
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
              <button type="submit" className="btn btn-primary">{editingId ? "Save Changes" : "Add Administrator"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
