import { useEffect, useRef, useState } from "react";
import { ChevronDown, Layers, LocateFixed, Maximize } from "lucide-react";
import { AlertLegendItems } from "../../features/alerts/ActiveAlertsPanel.jsx";

/** Map toolbar (top-left over the map): whole-barangay view, My Location, layers. */
export function MapToolbar({ onOverview, onMyLocation, locating, layers, onToggleLayer, counts, incidentStatus, onIncidentStatus, markerAccent, onMarkerAccent }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const LAYER_ROWS = [
    ["zones", "Purok flood-zone designation"],
    ["hazards", `Active barangay alerts (${counts.alerts})`],
    ["evacuation", `Evacuation centers (${counts.centers})`],
    ["areas", `Recorded affected areas (${counts.areas})`],
    ["incidents", `Disaster incidents (${counts.incidents} mapped)`],
    ["heat", "Priority visualization"],
  ];

  return (
    <div className="gis-toolbar">
      <button type="button" className="gis-tool" onClick={onOverview}>
        <Maximize aria-hidden="true" size={15} strokeWidth={2.25} /><span>Whole barangay</span>
      </button>
      <button type="button" className="gis-tool" onClick={onMyLocation} disabled={locating}>
        <LocateFixed aria-hidden="true" size={15} strokeWidth={2.25} /><span>{locating ? "Locating…" : "My location"}</span>
      </button>
      <div className="gis-layers" ref={wrapRef}>
        <button type="button" className="gis-tool" aria-expanded={open} aria-controls="gis-layer-menu" onClick={() => setOpen((o) => !o)}>
          <Layers aria-hidden="true" size={15} strokeWidth={2.25} /><span>Layers</span>
          <ChevronDown aria-hidden="true" size={14} strokeWidth={2.5} className="gis-chev" />
        </button>
        {open && (
          <div id="gis-layer-menu" className="gis-layer-menu" role="group" aria-label="Map layers">
            {LAYER_ROWS.map(([key, label]) => (
              <label key={key} className="gis-check-row">
                <input type="checkbox" checked={layers[key] !== false && !!layers[key]} onChange={() => onToggleLayer(key)} />
                {label}
              </label>
            ))}
            {layers.incidents && (
              <div className="gis-menu-field">
                <label htmlFor="gis-inc-status">Incident status</label>
                <select id="gis-inc-status" value={incidentStatus} onChange={(e) => onIncidentStatus(e.target.value)}>
                  <option value="open">Pending + Verified</option>
                  <option value="Pending">Pending only</option>
                  <option value="Verified">Verified only</option>
                  <option value="Rejected">Rejected only</option>
                  <option value="all">All</option>
                </select>
              </div>
            )}
            <div className="gis-menu-field">
              <label htmlFor="gis-accent">Household marker dot</label>
              <select id="gis-accent" value={markerAccent} onChange={(e) => onMarkerAccent(e.target.value)}>
                <option value="priority">DSS priority level</option>
                <option value="purok">Purok colour</option>
                <option value="none">None</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Map key: a bar along the bottom edge of the map frame, so it never covers a household or a Purok. */
export function MapLegend({ layers }) {
  return (
    <ul className="gis-legend" role="list" aria-label="Map legend">
      {layers.zones !== false && <>
        <li><i className="gis-key gis-key--flood" aria-hidden="true" />Designated flood-prone zone</li>
        <li><i className="gis-key gis-key--neutral" aria-hidden="true" />Not currently designated</li>
        <li><i className="gis-key gis-key--excluded" aria-hidden="true" />Excluded area (Daraga Public Cemetery)</li>
      </>}
      <li><i className="gis-key gis-key--boundary" aria-hidden="true" />Barangay boundary</li>
      <li><span className="gis-house gis-key-house" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg></span>Registered household</li>
      <li><span className="gis-house is-review gis-key-house" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg></span>Location needs review</li>
      {layers.hazards && <AlertLegendItems />}
      {layers.areas && <li><i className="gis-key gis-key--area" aria-hidden="true" />In a recorded affected area</li>}
      {layers.evacuation && <li><span className="map-pin map-pin-evac gis-key-pin" aria-hidden="true">E</span>Evacuation center</li>}
      {layers.incidents && <li><span className="map-pin map-pin-incident gis-key-pin gis-key-incident" aria-hidden="true">!</span>Disaster incident</li>}
    </ul>
  );
}

/** Shown across the top of the map while a location is being picked. */
export function AssignBanner({ household, onCancel }) {
  return (
    <div className="gis-assign-banner" role="status">
      <span>Click the location of <strong>{household.head_of_family}</strong>'s house inside the barangay</span>
      <button type="button" className="gis-banner-cancel" onClick={onCancel}>Cancel <kbd>Esc</kbd></button>
    </div>
  );
}
