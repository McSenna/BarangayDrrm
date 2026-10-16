import { localDateISO } from "../../utils/dates.js";
import { useEffect, useState } from "react";
import { useAutoRefresh } from "../../hooks/usePolling.js";
import { Link, useSearchParams } from "react-router-dom";
import DataTable from "../../components/DataTable.jsx";
import InventoryReconciliation from "../../components/InventoryReconciliation.jsx";
import Modal from "../../components/Modal.jsx";
import { exportToCsv } from "../../utils/exportCsv.js";
import { useSettings } from "../../context/SettingsContext.jsx";
import { getItems, addItem, updateItem, deleteItem, stockIn, stockOut, adjustQuantity, getInventoryCategories } from "../../services/api.jsx";

// Fallback list; the real list is fetched from System Settings > Inventory Settings (Phase 14).
const FALLBACK_CATEGORIES = ["Food", "Water", "Hygiene", "Medical", "Shelter", "Other"];

const EMPTY_FORM = { item_name: "", category: "Food", quantity: 0, unit: "pcs", minimum_level: 10, expiration_date: "" };

export default function Inventory() {
  const { settings } = useSettings();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [stockModal, setStockModal] = useState(null); // { item, mode: 'in'|'out' }
  const [stockQty, setStockQty] = useState(1);
  const [stockRef, setStockRef] = useState("");
  const [adjustModal, setAdjustModal] = useState(null); // item
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchParams] = useSearchParams();
  const [stockFilter, setStockFilter] = useState(searchParams.get("filter") === "low" ? "low" : "all");
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);

  // Phase 19: load(true) refreshes silently (used by auto-refresh — no spinner, forms untouched).
  const load = (silent = false) => {
    if (silent !== true) setLoading(true);
    getItems().then((res) => setItems(res.data.data)).finally(() => setLoading(false));
  };

  useEffect(load, []);
  useAutoRefresh(() => load(true), 45000);

  useEffect(() => {
    getInventoryCategories({ active_only: 0 }) // include inactive so old items still filter/display correctly
      .then((res) => {
        const names = res.data.data.map((c) => c.category_name);
        if (names.length > 0) setCategories(names);
      })
      .catch(() => {}); // keep the fallback list on error
  }, []);

  // New items start with the defaults saved in Inventory Settings (falls back to pcs / 10).
  const newItemForm = () => {
    const level = parseInt(settings?.default_minimum_level, 10);
    const unit = String(settings?.default_unit ?? "").trim();
    return {
      ...EMPTY_FORM,
      unit: unit || EMPTY_FORM.unit,
      minimum_level: Number.isFinite(level) && level >= 0 ? level : EMPTY_FORM.minimum_level,
    };
  };
  const openAdd = () => { setForm(newItemForm()); setEditingId(null); setModalOpen(true); };
  const openEdit = (row) => {
    setForm({
      item_name: row.item_name, category: row.category, quantity: row.quantity,
      unit: row.unit, minimum_level: row.minimum_level, expiration_date: row.expiration_date || "",
    });
    setEditingId(row.item_id);
    setModalOpen(true);
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await updateItem({ item_id: editingId, ...form });
      } else {
        await addItem(form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't save the relief item. Please try again.");
    }
  };

  const handleDelete = async (item_id) => {
    if (!confirm("Delete this relief item? This action cannot be undone.")) return;
    try {
      await deleteItem(item_id);
      load();
    } catch (err) {
      // Phase 16 — deleting an item with transaction/distribution history
      // is now blocked (backend/inventory/delete_item.php + the
      // relief_items foreign keys), so show that message instead of
      // leaving this as an unhandled rejection.
      alert(err.response?.data?.message || "We couldn't delete the relief item. Please try again.");
    }
  };

  const handleStockSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { item_id: stockModal.item.item_id, quantity: Number(stockQty), reference: stockRef };
      if (stockModal.mode === "in") await stockIn(payload);
      else await stockOut(payload);
      setStockModal(null);
      setStockQty(1);
      setStockRef("");
      load();
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't update the stock. Please check the quantity and try again.");
    }
  };

  const openAdjust = (item) => {
    setAdjustModal(item);
    setAdjustQty(item.quantity);
    setAdjustReason("");
  };

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    try {
      await adjustQuantity({ item_id: adjustModal.item_id, new_quantity: Number(adjustQty), reason: adjustReason });
      setAdjustModal(null);
      load();
    } catch (err) {
      alert(err.response?.data?.message || "We couldn't save the quantity adjustment. Please try again.");
    }
  };

  // Phase 23: the former Low Stock page is now a filter here (?filter=low keeps old links working).
  const displayedItems = items
    .filter((i) => !categoryFilter || i.category === categoryFilter)
    .filter((i) => stockFilter !== "low" || i.low_stock);

  const handleExportCsv = () => {
    exportToCsv(
      `inventory-${localDateISO()}.csv`,
      [
        { key: "item_id", label: "Item ID" },
        { key: "item_name", label: "Item Name" },
        { key: "category", label: "Category" },
        { key: "quantity", label: "Quantity" },
        { key: "unit", label: "Unit" },
        { key: "minimum_level", label: "Minimum Level" },
        { key: "expiration_date", label: "Expiration Date" },
        { key: "low_stock", label: "Low Stock" },
      ],
      displayedItems.map((i) => ({ ...i, low_stock: i.low_stock ? "Yes" : "No" }))
    );
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Relief Inventory</h1>
          <p>Relief stock that supports allocation: what is in stock, what is reserved for approved allocations, and what is still available. Use Stock In for deliveries and donations.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to="/admin/inventory/logs" className="btn btn-ghost">Stock History</Link>
          <button className="btn btn-ghost" onClick={handleExportCsv}>Export CSV</button>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Relief Item</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="form-group" style={{ marginBottom: 0, maxWidth: 240 }}>
          <label>Filter by Category</label>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0, maxWidth: 240 }}>
          <label htmlFor="inv-stock">Stock level</label>
          <select id="inv-stock" value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}>
            <option value="all">All items</option>
            <option value="low">Low stock only ({items.filter((i) => i.low_stock).length})</option>
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading inventory…</div>
        ) : (
          <DataTable
            columns={[
              { key: "item_id", label: "ID" },
              { key: "item_name", label: "Item" },
              { key: "category", label: "Category" },
              { key: "quantity", label: "In Stock", render: (r) => `${r.quantity} ${r.unit}` },
              { key: "committed_quantity", label: "Reserved", render: (r) => Number(r.committed_quantity || 0) },
              { key: "available", label: "Available", render: (r) => <strong>{Math.max(0, Number(r.quantity) - Number(r.committed_quantity || 0))}</strong> },
              { key: "minimum_level", label: "Minimum Level" },
              { key: "expiration_date", label: "Expiration Date", render: (r) => r.expiration_date || "—" },
              { key: "status", label: "Status", render: (r) => r.low_stock
                  ? <span className="badge badge-critical">Low Stock</span>
                  : <span className="badge badge-low">In Stock</span> },
              { key: "actions", label: "Actions", render: (row) => (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setStockModal({ item: row, mode: "in" })}>Stock In</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setStockModal({ item: row, mode: "out" })}>Stock Out</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openAdjust(row)}>Adjust</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(row.item_id)}>Delete</button>
                </div>
              )},
            ]}
            rows={displayedItems}
            emptyText="No relief items found."
          />
        )}
      </div>

      {modalOpen && (
        <Modal title={editingId ? "Edit Relief Item" : "Add Relief Item"} onClose={() => setModalOpen(false)}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Item Name</label>
              <input name="item_name" value={form.item_name} onChange={handleChange} required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Category</label>
                <select name="category" value={form.category} onChange={handleChange} required>
                  {categories.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Unit</label>
                <input name="unit" value={form.unit} onChange={handleChange} placeholder="e.g. pcs, sack, liter, kit" required />
              </div>
            </div>
            {!editingId && (
              <div className="form-group">
                <label>Initial Quantity</label>
                <input type="number" min="0" name="quantity" value={form.quantity} onChange={handleChange} required />
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label>Minimum Stock Level</label>
                <input type="number" min="0" name="minimum_level" value={form.minimum_level} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Expiration Date (optional)</label>
                <input type="date" name="expiration_date" value={form.expiration_date} onChange={handleChange} />
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{editingId ? "Save Changes" : "Add Item"}</button>
            </div>
          </form>
        </Modal>
      )}

      {stockModal && (
        <Modal title={`${stockModal.mode === "in" ? "Stock In" : "Stock Out"}: ${stockModal.item.item_name}`} onClose={() => setStockModal(null)}>
          <form onSubmit={handleStockSubmit}>
            <p style={{ color: "var(--color-ink-soft)", fontSize: 14 }}>
              Current quantity: <strong>{stockModal.item.quantity} {stockModal.item.unit}</strong>
            </p>
            {stockModal.mode === "out" && Number(stockModal.item.committed_quantity) > 0 && (
              <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>
                Reserved for approved allocations (not yet distributed): {stockModal.item.committed_quantity} {stockModal.item.unit}.
                Available to remove: <strong>{Math.max(0, stockModal.item.quantity - stockModal.item.committed_quantity)} {stockModal.item.unit}</strong>
              </p>
            )}
            <div className="form-group">
              <label>Quantity to {stockModal.mode === "in" ? "Add" : "Remove"}</label>
              <input type="number" min="1" value={stockQty} onChange={(e) => setStockQty(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Reference or Remarks (optional)</label>
              <input value={stockRef} onChange={(e) => setStockRef(e.target.value)} placeholder={stockModal.mode === "in" ? "e.g. Delivery from the municipal government" : "e.g. Damaged or expired items removed"} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setStockModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {adjustModal && (
        <Modal title={`Adjust Quantity: ${adjustModal.item_name}`} onClose={() => setAdjustModal(null)}>
          <form onSubmit={handleAdjustSubmit}>
            <p style={{ color: "var(--color-ink-soft)", fontSize: 14 }}>
              Use this only to correct the recorded quantity after a physical count. For regular stock
              received or removed, use Stock In or Stock Out so the inventory history stays accurate.
            </p>
            <p style={{ fontSize: 14 }}>
              Current quantity on record: <strong>{adjustModal.quantity} {adjustModal.unit}</strong>
            </p>
            {Number(adjustModal.committed_quantity) > 0 && (
              <p style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>
                {adjustModal.committed_quantity} {adjustModal.unit} are reserved for approved allocations that have not been
                distributed yet, so the quantity cannot be lowered below this amount.
              </p>
            )}
            <div className="form-group">
              <label>Actual Quantity (from physical count)</label>
              <input type="number" min="0" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Reason for Adjustment</label>
              <input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="e.g. Physical count correction, damaged goods removed" required />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setAdjustModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Adjustment</button>
            </div>
          </form>
        </Modal>
      )}
      <InventoryReconciliation />
    </>
  );
}
