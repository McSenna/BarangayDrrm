import { useEffect, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import { getInventoryLogs, getItems } from "../../services/api.jsx";

const TYPE_BADGE = {
  "Stock In": "badge-low",
  "Stock Out": "badge-medium",
  "Adjustment": "badge-high",
  "Donation": "badge-low",
};

export default function InventoryLogs() {
  const [logs, setLogs] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [itemFilter, setItemFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = () => {
    setLoading(true);
    const params = {};
    if (itemFilter) params.item_id = itemFilter;
    if (typeFilter) params.log_type = typeFilter;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    getInventoryLogs(params).then((res) => setLogs(res.data.data)).finally(() => setLoading(false));
  };

  useEffect(load, [itemFilter, typeFilter, dateFrom, dateTo]);
  useEffect(() => { getItems().then((res) => setItems(res.data.data)); }, []);

  const resetFilters = () => { setItemFilter(""); setTypeFilter(""); setDateFrom(""); setDateTo(""); };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Inventory Logs</h1>
          <p>Complete history of Stock In, Stock Out, adjustments, and donations for all relief items.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row filter-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Item</label>
            <select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}>
              <option value="">All Items</option>
              {items.map((i) => <option key={i.item_id} value={i.item_id}>{i.item_name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Transaction Type</label>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All Types</option>
              <option>Stock In</option>
              <option>Stock Out</option>
              <option>Adjustment</option>
              <option>Donation</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={resetFilters}>Reset Filters</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading inventory logs…</div>
        ) : (
          <DataTable
            columns={[
              { key: "created_at", label: "Date and Time" },
              { key: "item_name", label: "Item" },
              { key: "log_type", label: "Type", render: (r) => <span className={`badge ${TYPE_BADGE[r.log_type]}`}>{r.log_type}</span> },
              { key: "quantity_change", label: "Change", render: (r) => `${r.quantity_change > 0 ? "+" : ""}${r.quantity_change} ${r.unit}` },
              { key: "resulting_quantity", label: "Balance After", render: (r) => `${r.resulting_quantity} ${r.unit}` },
              { key: "reference", label: "Reference", render: (r) => r.reference || "—" },
              { key: "performed_by_name", label: "Performed By", render: (r) => r.performed_by_name || "—" },
            ]}
            rows={logs}
            emptyText="No inventory transactions match your filters."
          />
        )}
      </div>
    </>
  );
}
