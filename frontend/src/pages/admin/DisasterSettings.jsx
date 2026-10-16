import { useEffect, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import Modal from "../../components/Modal.jsx";
import { getDisasterTypes, addDisasterType, updateDisasterType, deleteDisasterType } from "../../services/api.jsx";

const SEVERITY_REFERENCE = [
  { level: "Low", score: 1 },
  { level: "Medium", score: 2 },
  { level: "High", score: 3 },
  { level: "Critical", score: 4 },
];

const STATUS_REFERENCE = [
  { status: "Pending", meaning: "Submitted by a Resident and waiting for Administrator review. Adds 1 point to the priority score." },
  { status: "Verified", meaning: "Reviewed and confirmed by an Administrator. Adds 2 points to the priority score." },
  { status: "Rejected", meaning: "Reviewed and found invalid or a duplicate. Not counted in the priority score." },
];

export default function DisasterSettings() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    getDisasterTypes({ active_only: 0 }).then((res) => setTypes(res.data.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openAdd = () => { setEditing(null); setName(""); setError(null); setModalOpen(true); };
  const openEdit = (row) => { setEditing(row); setName(row.type_name); setError(null); setModalOpen(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await updateDisasterType({ type_id: editing.type_id, type_name: name, is_active: editing.is_active });
      } else {
        await addDisasterType({ type_name: name });
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "We couldn't save the disaster type. Please try again.");
    }
  };

  const toggleActive = async (row) => {
    await updateDisasterType({ type_id: row.type_id, type_name: row.type_name, is_active: row.is_active ? 0 : 1 });
    load();
  };

  const handleDelete = async (row) => {
    if (!confirm(`Delete the disaster type "${row.type_name}"? A disaster type used by existing disaster reports cannot be deleted; deactivate it instead.`)) return;
    try {
      await deleteDisasterType(row.type_id);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't delete the disaster type. Please try again.");
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Disaster Settings</h1>
          <p>Manage the disaster types Residents can select when submitting a disaster report. Severity levels and report statuses are fixed and shown below for reference.</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Disaster Type</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        {loading ? (
          <div className="loading-text">Loading disaster types…</div>
        ) : (
          <DataTable
            columns={[
              { key: "type_name", label: "Disaster Type" },
              { key: "is_active", label: "Status", render: (r) => r.is_active ? <span className="badge badge-low">Active</span> : <span className="badge badge-medium">Inactive</span> },
              { key: "actions", label: "Actions", render: (row) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>Edit</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(row)}>
                    {row.is_active ? "Deactivate" : "Activate"}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row)}>Delete</button>
                </div>
              )},
            ]}
            rows={types}
            emptyText="No disaster types have been added."
          />
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Severity Levels (Reference)</h3>
        <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: -8 }}>
          These values are fixed because the Decision Support System uses them in the priority score.
          The severity of each household's highest-severity disaster report adds 1 to 4 points.
        </p>
        <DataTable
          columns={[
            { key: "level", label: "Severity" },
            { key: "score", label: "Priority Score Points" },
          ]}
          rows={SEVERITY_REFERENCE}
        />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Report Statuses (Reference)</h3>
        <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: -8 }}>
          These statuses are fixed because they are used in disaster report verification and in the priority score.
        </p>
        <DataTable
          columns={[
            { key: "status", label: "Status" },
            { key: "meaning", label: "Description" },
          ]}
          rows={STATUS_REFERENCE}
        />
      </div>

      {modalOpen && (
        <Modal title={editing ? "Edit Disaster Type" : "Add Disaster Type"} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Disaster Type Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            {error && <p style={{ color: "var(--color-danger, crimson)", fontSize: 13 }}>{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editing ? "Save Changes" : "Add Disaster Type"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
