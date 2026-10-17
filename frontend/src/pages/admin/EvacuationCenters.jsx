import { useCallback, useState } from "react";
import DataTable from "../../components/DataTable.jsx";
import DashboardCard from "../../components/DashboardCard.jsx";
import Modal from "../../components/Modal.jsx";
import PurokSelect from "../../components/PurokSelect.jsx";
import OccupancyBar from "../../components/OccupancyBar.jsx";
import BarangayMap from "../../components/BarangayMap.jsx";
import usePolling from "../../hooks/usePolling.js";
import { EVAC_STATUS_BADGE } from "../../config/evacStatus.js";
import {
  getEvacuationCenters, saveEvacuationCenter, updateEvacuationOccupancy, setEvacuationStatus,
  deleteEvacuationCenter, getEvacuationLogs,
} from "../../services/api.jsx";

const EMPTY = { name: "", address: "", purok: "", latitude: "", longitude: "", capacity: "", current_occupancy: 0, status: "Closed", facilities: "", contact_person: "", contact_number: "" };

/**
 * Admin — Evacuation Centers (Phase 19). Add/edit/delete centers, update
 * occupancy (never above capacity), open/close centers and optionally notify
 * residents. Counts people only; individual evacuees are not tracked.
 */
export default function EvacuationCenters() {
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(null);       // add/edit modal
  const [formError, setFormError] = useState("");
  const [occTarget, setOccTarget] = useState(null);
  const [occValue, setOccValue] = useState("");
  const [occRemarks, setOccRemarks] = useState("");
  const [statusTarget, setStatusTarget] = useState(null);
  const [notify, setNotify] = useState({ notify_residents: false, send_sms: false });
  const [logs, setLogs] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getEvacuationCenters();
      setRows(res.data.data);
      setTotals(res.data.totals);
      setError("");
    } catch {
      setError("We couldn't load the evacuation centers. Please refresh the page.");
    }
  }, []);
  const { refresh } = usePolling(load, { interval: 45000 });

  const run = async (fn, after) => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fn();
      setMessage(res.data.message);
      after?.();
      refresh();
      return true;
    } catch (err) {
      return err.response?.data?.message || "The action could not be completed. Please try again.";
    } finally {
      setBusy(false);
    }
  };

  const saveForm = async (e) => {
    e.preventDefault();
    setFormError("");
    const result = await run(() => saveEvacuationCenter(form), () => setForm(null));
    if (result !== true) setFormError(result);
  };

  const saveOccupancy = async (e) => {
    e.preventDefault();
    setFormError("");
    const result = await run(() => updateEvacuationOccupancy({ center_id: occTarget.center_id, current_occupancy: Number(occValue), remarks: occRemarks }), () => setOccTarget(null));
    if (result !== true) setFormError(result);
  };

  const saveStatus = async (e) => {
    e.preventDefault();
    setFormError("");
    const target = statusTarget.status === "Closed" ? "Open" : "Closed";
    const result = await run(() => setEvacuationStatus({ center_id: statusTarget.center_id, status: target, ...notify }), () => setStatusTarget(null));
    if (result !== true) setFormError(result);
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.name}? Its occupancy history will also be deleted.`)) return;
    const result = await run(() => deleteEvacuationCenter(c.center_id));
    if (result !== true) setError(result);
  };

  const openLogs = async (c) => {
    try {
      const res = await getEvacuationLogs(c.center_id);
      setLogs({ center: c, rows: res.data.data });
    } catch {
      setError("We couldn't load the history.");
    }
  };

  const f = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Evacuation Centers</h1>
          <p>Manage evacuation centers, their capacity and current occupancy. Residents can see open centers, capacity, facilities and location.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => { setFormError(""); setForm({ ...EMPTY }); }}>+ Add Evacuation Center</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {totals && (
        <div className="stat-grid">
          <DashboardCard label="Evacuation Centers" value={totals.centers} />
          <DashboardCard label="Open" value={totals.open} tone="accent" />
          <DashboardCard label="Full" value={totals.full} tone={totals.full ? "warn" : ""} />
          <DashboardCard label="Current Evacuees" value={totals.occupancy} />
          <DashboardCard label="Capacity of Open/Full Centers" value={totals.capacity_open} />
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <DataTable
          columns={[
            { key: "name", label: "Center", render: (c) => <>{c.name}<br /><span style={{ fontSize: 12, color: "var(--color-ink-soft)" }}>{c.address} · {c.purok}</span></> },
            { key: "status", label: "Status", render: (c) => <span className={`badge ${EVAC_STATUS_BADGE[c.status]}`}>{c.status}</span> },
            { key: "occupancy", label: "Occupancy", render: (c) => <OccupancyBar occupancy={c.current_occupancy} capacity={c.capacity} /> },
            { key: "facilities", label: "Facilities", render: (c) => c.facilities || "—" },
            { key: "contact", label: "Contact", render: (c) => c.contact_person ? `${c.contact_person}${c.contact_number ? ` · ${c.contact_number}` : ""}` : "—" },
            { key: "map", label: "Map", render: (c) => (c.latitude ? "Yes" : <span style={{ color: "var(--color-ink-soft)" }}>No location</span>) },
            { key: "actions", label: "", render: (c) => (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn btn-ghost btn-sm" disabled={c.status === "Closed"}
                  onClick={() => { setFormError(""); setOccTarget(c); setOccValue(String(c.current_occupancy)); setOccRemarks(""); }}>Occupancy</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setFormError(""); setNotify({ notify_residents: false, send_sms: false }); setStatusTarget(c); }}>
                  {c.status === "Closed" ? "Open" : "Close"}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setFormError(""); setForm({ ...EMPTY, ...c, latitude: c.latitude ?? "", longitude: c.longitude ?? "", facilities: c.facilities ?? "", contact_person: c.contact_person ?? "", contact_number: c.contact_number ?? "" }); }}>Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={() => openLogs(c)}>History</button>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(c)}>Delete</button>
              </div>
            ) },
          ]}
          rows={rows.map((r) => ({ ...r, id: r.center_id }))}
          emptyText="No evacuation centers have been added yet."
        />
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 10 }}>Map</h3>
        <BarangayMap households={[]} evacuationCenters={rows} height="420px" />
        <div className="map-legend">
          <span><span className="map-pin map-pin-evac">E</span>Open</span>
          <span><span className="map-pin map-pin-evac map-pin-full">E</span>Full</span>
          <span><span className="map-pin map-pin-evac map-pin-closed">E</span>Closed</span>
        </div>
      </div>

      {form && (
        <Modal title={form.center_id ? "Edit Evacuation Center" : "Add Evacuation Center"} onClose={() => setForm(null)}>
          {formError && <div className="alert alert-error">{formError}</div>}
          <form onSubmit={saveForm}>
            <div className="form-group"><label htmlFor="ec-name">Center name</label><input id="ec-name" value={form.name} onChange={f("name")} required maxLength={150} /></div>
            <div className="form-row">
              <div className="form-group"><label htmlFor="ec-address">Address / location</label><input id="ec-address" value={form.address} onChange={f("address")} required maxLength={255} /></div>
              <div className="form-group"><label htmlFor="ec-purok">Purok</label><PurokSelect id="ec-purok" value={form.purok} onChange={f("purok")} required /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label htmlFor="ec-lat">Latitude (optional)</label><input id="ec-lat" value={form.latitude} onChange={f("latitude")} placeholder="e.g. 13.1562" /></div>
              <div className="form-group"><label htmlFor="ec-lng">Longitude (optional)</label><input id="ec-lng" value={form.longitude} onChange={f("longitude")} placeholder="e.g. 123.7164" /></div>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: -4 }}>Coordinates must be inside Barangay Binitayan. Without them the center is listed but not shown on the map.</p>
            <div className="form-row">
              <div className="form-group"><label htmlFor="ec-cap">Capacity (persons)</label><input id="ec-cap" type="number" min="1" step="1" value={form.capacity} onChange={f("capacity")} required /></div>
              {!form.center_id && (
                <>
                  <div className="form-group"><label htmlFor="ec-occ">Current occupancy</label><input id="ec-occ" type="number" min="0" step="1" value={form.current_occupancy} onChange={f("current_occupancy")} /></div>
                  <div className="form-group"><label htmlFor="ec-status">Initial status</label>
                    <select id="ec-status" value={form.status} onChange={f("status")}><option>Closed</option><option>Open</option></select></div>
                </>
              )}
            </div>
            <div className="form-group"><label htmlFor="ec-fac">Facilities</label><textarea id="ec-fac" rows={2} value={form.facilities} onChange={f("facilities")} placeholder="e.g. Toilets, potable water, first aid, generator" /></div>
            <div className="form-row">
              <div className="form-group"><label htmlFor="ec-cp">Contact person</label><input id="ec-cp" value={form.contact_person} onChange={f("contact_person")} /></div>
              <div className="form-group"><label htmlFor="ec-cn">Contact number</label><input id="ec-cn" value={form.contact_number} onChange={f("contact_number")} /></div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        </Modal>
      )}

      {occTarget && (
        <Modal title={`Update Occupancy — ${occTarget.name}`} onClose={() => setOccTarget(null)}>
          {formError && <div className="alert alert-error">{formError}</div>}
          <form onSubmit={saveOccupancy}>
            <div className="form-group">
              <label htmlFor="ec-occ2">Current occupancy (0 to {occTarget.capacity})</label>
              <input id="ec-occ2" type="number" min="0" max={occTarget.capacity} step="1" value={occValue} onChange={(e) => setOccValue(e.target.value)} required />
            </div>
            <div className="form-group"><label htmlFor="ec-occr">Remarks (optional)</label><input id="ec-occr" value={occRemarks} onChange={(e) => setOccRemarks(e.target.value)} maxLength={255} /></div>
            <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)" }}>An open center becomes Full automatically when it reaches capacity.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setOccTarget(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
            </div>
          </form>
        </Modal>
      )}

      {statusTarget && (
        <Modal title={`${statusTarget.status === "Closed" ? "Open" : "Close"} ${statusTarget.name}`} onClose={() => setStatusTarget(null)}>
          {formError && <div className="alert alert-error">{formError}</div>}
          <form onSubmit={saveStatus}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={notify.notify_residents} onChange={(e) => setNotify({ notify_residents: e.target.checked, send_sms: e.target.checked && notify.send_sms })} />
              Notify all residents in the system (in-app)
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, opacity: notify.notify_residents ? 1 : 0.5 }}>
              <input type="checkbox" style={{ width: "auto" }} disabled={!notify.notify_residents} checked={notify.send_sms} onChange={(e) => setNotify({ ...notify, send_sms: e.target.checked })} />
              Also send an SMS to residents with a mobile number (httpSMS)
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setStatusTarget(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{statusTarget.status === "Closed" ? "Open Center" : "Close Center"}</button>
            </div>
          </form>
        </Modal>
      )}

      {logs && (
        <Modal title={`History — ${logs.center.name}`} onClose={() => setLogs(null)}>
          <DataTable
            columns={[
              { key: "changed_at", label: "When", render: (l) => l.changed_at?.slice(0, 16) },
              { key: "occ", label: "Occupancy", render: (l) => `${l.previous_occupancy ?? "—"} → ${l.new_occupancy}` },
              { key: "status", label: "Status", render: (l) => `${l.previous_status ?? "—"} → ${l.new_status}` },
              { key: "remarks", label: "Remarks", render: (l) => l.remarks || "—" },
              { key: "changed_by_name", label: "By", render: (l) => l.changed_by_name || "—" },
            ]}
            rows={logs.rows.map((l) => ({ ...l, id: l.log_id }))}
            emptyText="No changes recorded yet."
          />
        </Modal>
      )}
    </>
  );
}

