import { useEffect, useRef, useState } from "react";
import { Check, House, MapPin, RotateCcw, Search, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import { FLOOD_STATUS, floodDesignation } from "../../config/floodZones.js";
import { STANDARD_PUROKS } from "../../utils/purokBoundaries.js";
import { purokKey, purokLabel } from "../../utils/purokLabel.js";
import { insideBarangay, puroksAt } from "./gisGeometry.js";

export const ZONE_FILTERS = [
  ["", "All households"],
  ["mapped", "Mapped only"],
  ["flood_prone", "In flood-prone zones"],
  ["not_designated", "Not currently designated"],
  ["unverified", "Location unverified"],
  ["review", "Needs location review"],
  ["unmapped", "Unmapped households"],
];

const PAGE = 150;

/** Search, Purok and zone filters, and the matching households (mapped and unmapped). */
export function HouseholdRail({
  rows, total, search, onSearch, purok, onPurok, zone, onZone, extraPuroks, onReset,
  selectedId, onPick, canEdit, onAssign,
}) {
  const { user } = useAuth();
  const assignedPurok = ["field_officer", "relief_personnel"].includes(user?.role) ? user.assigned_purok : null;
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [search, purok, zone]);
  const filtered = search.trim() !== "" || purok !== "" || zone !== "";
  return (
    <aside className="gis-rail" aria-label="Households">
      <div className="gis-rail-controls">
        <div className="gis-search">
          <Search aria-hidden="true" size={16} strokeWidth={2.25} />
          <label htmlFor="gis-search" className="sr-only">Search households</label>
          <input id="gis-search" type="search" value={search} onChange={(e) => onSearch(e.target.value)}
            placeholder="Name, address, Purok, or #ID" autoComplete="off" />
        </div>
        <div className="gis-filter-row">
          <div>
            <label htmlFor="gis-purok">Purok</label>
            <select id="gis-purok" value={purok} onChange={(e) => onPurok(e.target.value)}>
              <option value="">{assignedPurok || "All Puroks"}</option>
              {STANDARD_PUROKS.filter((p) => !assignedPurok || p === assignedPurok).map((p) => (
                <option key={p} value={p}>{p}{floodDesignation(p) === "flood_prone" ? " — flood-prone" : ""}</option>
              ))}
              {extraPuroks > 0 && <option value="__other">Other stored values ({extraPuroks})</option>}
            </select>
          </div>
          <div>
            <label htmlFor="gis-zone">Zone status</label>
            <select id="gis-zone" value={zone} onChange={(e) => onZone(e.target.value)}>
              {ZONE_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="gis-rail-meta" role="status">
          <span><strong>{rows.length}</strong> of {total} households</span>
          {filtered && (
            <button type="button" className="btn-text gis-reset" onClick={onReset}>
              <RotateCcw aria-hidden="true" size={13} strokeWidth={2.5} />Reset filters
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="gis-empty">{filtered ? "No households match these filters." : "No households are registered yet."}</p>
      ) : (
        <ul className="gis-list" role="list">
          {rows.slice(0, shown).map((h) => {
            const mapped = h.latitude != null && h.longitude != null;
            const fs = FLOOD_STATUS[h.flood_status] || FLOOD_STATUS.unverified;
            return (
              <li key={h.household_id}>
                <button type="button" className={`gis-item${selectedId === h.household_id ? " is-selected" : ""}`}
                  aria-current={selectedId === h.household_id ? "true" : undefined}
                  onClick={() => onPick(h)}>
                  <span className={`gis-item-glyph${mapped ? "" : " is-unmapped"}`} aria-hidden="true"><House size={15} strokeWidth={2.25} /></span>
                  <span className="gis-item-text">
                    <span className="gis-item-name">{h.head_of_family}</span>
                    <span className="gis-item-meta">#{h.household_id} · {h.purok ? purokLabel(h.purok) : "No Purok"} · {h.number_of_members} {Number(h.number_of_members) === 1 ? "member" : "members"}</span>
                  </span>
                  <span className="gis-item-status">
                    <StatusBadge tone={fs.badge}>{mapped ? fs.label : "No location"}</StatusBadge>
                    {h.needs_review && mapped && <span className="gis-item-flag">Review</span>}
                  </span>
                </button>
                {!mapped && canEdit && (
                  <button type="button" className="btn btn-ghost btn-sm gis-item-assign" onClick={() => onAssign(h)}>
                    <MapPin aria-hidden="true" size={14} strokeWidth={2.25} />Assign location
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > shown && (
        <button type="button" className="btn btn-ghost btn-sm gis-more" onClick={() => setShown((n) => n + PAGE)}>
          Show {Math.min(PAGE, rows.length - shown)} more of {rows.length - shown}
        </button>
      )}
    </aside>
  );
}

const fmt = (n) => Number(n).toFixed(7);

/**
 * Assign / move a household's map location: click the map (or type the
 * values), check the preview, confirm, save. The server validates the point
 * against the barangay boundary again and audit-logs the change.
 */
export function AssignPanel({ assign, onPoint, onCancel, onSave, saving }) {
  const h = assign.household;
  const pt = assign.point;
  const [confirming, setConfirming] = useState(false);
  const [manual, setManual] = useState({ lat: "", lng: "" });
  const [manualError, setManualError] = useState("");
  const headingRef = useRef(null);

  useEffect(() => { setConfirming(false); }, [pt]);
  useEffect(() => { headingRef.current?.focus(); }, [h.household_id]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !saving) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  const hadLocation = h.latitude != null && h.longitude != null;
  const inPuroks = pt ? puroksAt(pt.lat, pt.lng) : [];
  const geoPurok = inPuroks.length === 1 ? inPuroks[0] : null;
  const designation = geoPurok ? floodDesignation(geoPurok) : null;
  const storedDiffers = geoPurok && h.purok && floodDesignation(h.purok) !== null && purokKey(h.purok) !== geoPurok;

  const previewManual = (e) => {
    e.preventDefault();
    const lat = Number(String(manual.lat).trim());
    const lng = Number(String(manual.lng).trim());
    if (String(manual.lat).trim() === "" || String(manual.lng).trim() === "" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setManualError("Enter both latitude and longitude as decimal numbers, for example 13.1562 and 123.7145.");
      return;
    }
    if (!insideBarangay(lat, lng)) {
      setManualError("That point is outside Barangay Binitayan. Check the values or click the map instead.");
      return;
    }
    setManualError("");
    onPoint({ lat, lng });
  };

  return (
    <section className="card-band card-band-orange gis-assign" aria-labelledby="gis-assign-title">
      <div className="gis-assign-head">
        <h2 id="gis-assign-title" className="gis-assign-title" tabIndex={-1} ref={headingRef}>
          {hadLocation ? "Move location" : "Assign location"}
        </h2>
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Cancel and keep the current location" disabled={saving}>
          <X size={18} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>
      <p className="gis-assign-who"><strong>{h.head_of_family}</strong> · Household #{h.household_id} · {purokLabel(h.purok)}</p>
      <p className="gis-assign-current">
        Current location: {hadLocation ? <span className="gis-num">{fmt(h.latitude)}, {fmt(h.longitude)}</span> : "none recorded"}
      </p>

      {!pt ? (
        <p className="gis-assign-step">Click the household's actual position on the map. Only points inside Barangay Binitayan are accepted.</p>
      ) : (
        <div className="gis-assign-preview" role="status">
          <p className="gis-assign-label">New location</p>
          <p className="gis-num gis-assign-coords">{fmt(pt.lat)}, {fmt(pt.lng)}</p>
          <ul className="gis-checks" role="list">
            <li><Check aria-hidden="true" size={14} strokeWidth={3} />Inside Barangay Binitayan</li>
            <li>
              {geoPurok ? <Check aria-hidden="true" size={14} strokeWidth={3} /> : <span className="gis-check-warn" aria-hidden="true">!</span>}
              {geoPurok ? `Inside ${geoPurok} — ${designation === "flood_prone" ? "flood-prone zone" : "not currently designated"}`
                : inPuroks.length > 1 ? `Inside two Purok boundaries (${inPuroks.join(", ")}) — flood status will be unverified`
                : "Not inside any Purok boundary — flood status will be unverified"}
            </li>
            {storedDiffers && (
              <li className="is-warn"><span className="gis-check-warn" aria-hidden="true">!</span>The record says {purokLabel(h.purok)}. The location will be flagged for review; the stored Purok is not changed.</li>
            )}
          </ul>
          {!confirming ? (
            <div className="gis-assign-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={saving}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setConfirming(true)}>Review and save</button>
            </div>
          ) : (
            <div className="gis-confirm" role="group" aria-label="Confirm the new location">
              <p>
                Save this location for <strong>{h.head_of_family}</strong>?{" "}
                {hadLocation ? <>It replaces <span className="gis-num">{fmt(h.latitude)}, {fmt(h.longitude)}</span>.</> : null}{" "}
                The change is recorded in the audit log.
              </p>
              <div className="gis-assign-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={saving}>Back</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onSave(pt)} disabled={saving} autoFocus>
                  {saving ? "Saving…" : "Confirm and save"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {assign.error && <p className="gis-assign-error" role="alert">{assign.error}</p>}

      <details className="gis-manual">
        <summary>Enter coordinates instead</summary>
        <form onSubmit={previewManual} noValidate>
          <div className="gis-manual-row">
            <div>
              <label htmlFor="gis-lat">Latitude</label>
              <input id="gis-lat" inputMode="decimal" value={manual.lat} onChange={(e) => setManual({ ...manual, lat: e.target.value })} placeholder="13.1562500" />
            </div>
            <div>
              <label htmlFor="gis-lng">Longitude</label>
              <input id="gis-lng" inputMode="decimal" value={manual.lng} onChange={(e) => setManual({ ...manual, lng: e.target.value })} placeholder="123.7144696" />
            </div>
          </div>
          {manualError && <p className="gis-assign-error" role="alert">{manualError}</p>}
          <button type="submit" className="btn btn-ghost btn-sm">Preview on map</button>
        </form>
      </details>
    </section>
  );
}
