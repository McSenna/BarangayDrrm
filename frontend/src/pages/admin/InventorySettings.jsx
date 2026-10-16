import { useEffect, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import Modal from "../../components/Modal.jsx";
import { useSettings } from "../../context/SettingsContext.jsx";
import {
  getInventoryCategories, addInventoryCategory, updateInventoryCategory, deleteInventoryCategory,
  updateSystemSettings,
} from "../../services/api.jsx";

export default function InventorySettings() {
  const { settings, loading: settingsLoading, refresh: refreshSettings } = useSettings();

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // category row or null
  const [name, setName] = useState("");
  const [error, setError] = useState(null);

  const [defaults, setDefaults] = useState({ default_minimum_level: "10", default_unit: "pcs" });
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsMsg, setDefaultsMsg] = useState(null);

  const load = () => {
    setLoading(true);
    getInventoryCategories({ active_only: 0 }).then((res) => setCategories(res.data.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    if (!settingsLoading) {
      setDefaults({
        default_minimum_level: settings.default_minimum_level ?? "10",
        default_unit: settings.default_unit ?? "pcs",
      });
    }
  }, [settingsLoading, settings]);

  const openAdd = () => { setEditing(null); setName(""); setError(null); setModalOpen(true); };
  const openEdit = (row) => { setEditing(row); setName(row.category_name); setError(null); setModalOpen(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await updateInventoryCategory({ category_id: editing.category_id, category_name: name, is_active: editing.is_active });
      } else {
        await addInventoryCategory({ category_name: name });
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || "We couldn't save the category. Please try again.");
    }
  };

  const toggleActive = async (row) => {
    await updateInventoryCategory({ category_id: row.category_id, category_name: row.category_name, is_active: row.is_active ? 0 : 1 });
    load();
  };

  const handleDelete = async (row) => {
    if (!confirm(`Delete the category "${row.category_name}"? A category used by relief items cannot be deleted; deactivate it instead.`)) return;
    try {
      await deleteInventoryCategory(row.category_id);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't delete the category. Please try again.");
    }
  };

  const handleDefaultsSubmit = async (e) => {
    e.preventDefault();
    setSavingDefaults(true);
    setDefaultsMsg(null);
    try {
      const res = await updateSystemSettings(defaults);
      setDefaultsMsg({ type: "success", text: res.data.message || "Defaults updated." });
      refreshSettings();
    } catch (err) {
      setDefaultsMsg({ type: "error", text: err.response?.data?.message || "We couldn't save the default values. Please try again." });
    } finally {
      setSavingDefaults(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Inventory Settings</h1>
          <p>Manage relief item categories and the default minimum stock level and unit for new relief items.</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Category</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        {loading ? (
          <div className="loading-text">Loading categories…</div>
        ) : (
          <DataTable
            columns={[
              { key: "category_name", label: "Category" },
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
            rows={categories}
            emptyText="No relief item categories have been added."
          />
        )}
      </div>

      <div className="card" style={{ maxWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}>Defaults for New Relief Items</h3>
        <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: -8 }}>
          These values are filled in automatically on the Add Relief Item form. You can change them for each item.
        </p>
        <form onSubmit={handleDefaultsSubmit}>
          <div className="form-group">
            <label>Default Minimum Stock Level</label>
            <input
              type="number" min="0"
              value={defaults.default_minimum_level}
              onChange={(e) => setDefaults({ ...defaults, default_minimum_level: e.target.value })}
            />
          </div>
          <div className="form-group">
            <label>Default Unit</label>
            <input
              value={defaults.default_unit}
              onChange={(e) => setDefaults({ ...defaults, default_unit: e.target.value })}
              placeholder="e.g. pcs"
            />
          </div>
          {defaultsMsg && (
            <p style={{ color: defaultsMsg.type === "success" ? "var(--color-success, green)" : "var(--color-danger, crimson)", fontSize: 13 }}>
              {defaultsMsg.text}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={savingDefaults}>
            {savingDefaults ? "Saving…" : "Save Defaults"}
          </button>
        </form>
      </div>

      {modalOpen && (
        <Modal title={editing ? "Edit Category" : "Add Category"} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Category Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            {error && <p style={{ color: "var(--color-danger, crimson)", fontSize: 13 }}>{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editing ? "Save Changes" : "Add Category"}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
