import { MAP_COLORS } from "../../theme/mapTokens.js";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import BarangayMap from "../../components/BarangayMap.jsx";
import DataTable from "../../components/DataTable.jsx";
import DashboardCard from "../../components/DashboardCard.jsx";
import {
  getDisasterEvents, getAffectedAreas, getAffectedHouseholds, saveAffectedArea, setAffectedAreaStatus, deleteAffectedArea,
} from "../../services/api.jsx";
import { purokLabel } from "../../utils/purokLabel.js";

/**
 * Phase 20 — Administrator-recorded affected / flood areas.
 *
 * The system does NOT predict floods. The Administrator records the affected
 * area (click points on the map, or paste GeoJSON). The SERVER then checks every
 * household's recorded coordinates with point-in-polygon and lists the
 * households inside. Being inside an area does not change the DSS score.
 *
 * Phase 23 — two area types:
 *   Recorded Affected Area — tied to a disaster event (what actually happened);
 *   Flood-Prone Zone       — reference geography from verified barangay/MDRRMO
 *                            data, no event needed. NOT active flooding.
 */
const FLOOD_PRONE = "Flood-Prone Zone";
const HAZARDS = ["Flood", "Typhoon", "Landslide", "General Emergency"];
const PRIORITY_BADGE = { "Low Priority": "badge-low", "Moderate Priority": "badge-medium", "High Priority": "badge-high", "Critical Priority": "badge-critical" };
const EMPTY_FORM = { area_name: "", hazard_type: "Flood", description: "" };

export default function AffectedAreas() {
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState(params.get("event_id") || "");
  // "event" = Recorded Affected Areas of one disaster event; "flood" = Flood-Prone Zones (reference).
  const [view, setView] = useState(params.get("view") === "flood" ? "flood" : "event");
  const [areas, setAreas] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Recording a new area
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const [useGeoJson, setUseGeoJson] = useState(false);
  const [geoText, setGeoText] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getDisasterEvents()
      .then((res) => {
        const list = res.data.data || [];
        setEvents(list);
        if (!eventId && list.length) setEventId(String((list.find((e) => e.status === "Active") || list[0]).event_id));
        if (!list.length) setLoading(false);
      })
      .catch((err) => { setError(err.response?.data?.message || "We couldn't load the disaster events."); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = () => {
    if (view === "event" && !eventId) return;
    setLoading(true);
    const q = view === "flood" ? { area_type: FLOOD_PRONE } : { event_id: eventId, area_type: "Recorded Affected Area" };
    Promise.all([getAffectedAreas({ ...q, status: "all" }), getAffectedHouseholds({ ...q, status: "Active" })])
      .then(([a, h]) => { setAreas(a.data.data || []); setResult(h.data); setError(""); })
      .catch((err) => setError(err.response?.data?.message || "We couldn't load the affected areas."))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (view === "flood") setParams({ view: "flood" }, { replace: true });
    else if (eventId) setParams({ event_id: eventId }, { replace: true });
    cancelDrawing();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, view]);

  const insideByArea = useMemo(() => {
    const m = {};
    (result?.areas || []).forEach((a) => { m[a.area_id] = a.households_inside; });
    return m;
  }, [result]);

  const mapAreas = areas.map((a) => ({ ...a, households_inside: a.status === "Active" ? insideByArea[a.area_id] : undefined }));
  const mapHouseholds = [...(result?.inside || []), ...(result?.outside || [])];
  const affectedInfo = useMemo(() => new Map((result?.inside || []).map((h) => [h.household_id, h])), [result]);

  const startDrawing = () => { setDrawing(true); setPoints([]); setGeoText(""); setForm(EMPTY_FORM); setNotice(""); setError(""); };
  const cancelDrawing = () => { setDrawing(false); setPoints([]); setGeoText(""); };

  const saveArea = async (e) => {
    e.preventDefault();
    setError("");
    let geojson;
    if (useGeoJson) {
      try { geojson = JSON.parse(geoText); } catch { setError("The GeoJSON text is not valid JSON."); return; }
    } else {
      if (points.length < 3) { setError("Click at least 3 points on the map around the affected area."); return; }
      geojson = { type: "Polygon", coordinates: [[...points.map((p) => [p.lng, p.lat]), [points[0].lng, points[0].lat]]] };
    }
    setSaving(true);
    try {
      const res = await saveAffectedArea(view === "flood"
        ? { ...form, area_type: FLOOD_PRONE, event_id: null, geojson }
        : { ...form, area_type: "Recorded Affected Area", event_id: Number(eventId), geojson });
      setNotice(res.data.message);
      cancelDrawing();
      load();
    } catch (err) {
      setError(err.response?.data?.message || "We couldn't save the area. Please check it and try again.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (a) => {
    const next = a.status === "Active" ? "Resolved" : "Active";
    try { const res = await setAffectedAreaStatus(a.area_id, next); setNotice(res.data.message); load(); }
    catch (err) { setError(err.response?.data?.message || "We couldn't update the area."); }
  };
  const remove = async (a) => {
    if (!confirm(`Delete the recorded area "${a.area_name}"? Households are not changed.`)) return;
    try { const res = await deleteAffectedArea(a.area_id); setNotice(res.data.message); load(); }
    catch (err) { setError(err.response?.data?.message || "We couldn't delete the area."); }
  };

  const s = result?.summary;
  const selectedEvent = events.find((e) => String(e.event_id) === String(eventId));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Flood &amp; Affected Areas</h1>
          <p>Record the affected area of a disaster event, or a verified flood-prone zone. The server then identifies the households whose saved coordinates are inside it.</p>
        </div>
        {(view === "flood" || eventId) && !drawing && (
          <button className="btn btn-primary" onClick={startDrawing}>{view === "flood" ? "+ Record Flood-Prone Zone" : "+ Record Affected Area"}</button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row filter-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="aa-view">Show</label>
            <select id="aa-view" value={view} onChange={(e) => setView(e.target.value)}>
              <option value="event">Recorded affected areas (by disaster event)</option>
              <option value="flood">Flood-prone zones (reference — not active flooding)</option>
            </select>
          </div>
          {view === "event" && <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Disaster Event</label>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
              {!events.length && <option value="">No events yet</option>}
              {events.map((ev) => <option key={ev.event_id} value={ev.event_id}>{ev.event_name} ({ev.status})</option>)}
            </select>
          </div>}
        </div>
        {view === "flood" && (
          <p style={{ fontSize: 13, margin: "10px 0 0" }}>
            <strong>Flood-prone zones</strong> are reference areas from verified barangay or MDRRMO hazard data. A household inside one is
            <strong> at risk</strong>, not confirmed flooded. Record a zone only when reliable geographic data is available.
          </p>
        )}
        {view === "event" && !events.length && !loading && (
          <p style={{ marginBottom: 0 }}>No disaster event has been recorded. <Link to="/admin/disaster-events">Add a disaster event first</Link>.</p>
        )}
        <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: "10px 0 0" }}>
          Areas are recorded by the Administrator from field reports or official advisories. The system does not predict flooding.
          Households without recorded coordinates cannot be placed inside or outside an area and are listed separately.
        </p>
      </div>

      {drawing && (
        <div className="card card-band card-band-red" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, marginTop: 0 }}>{view === "flood" ? "Record Flood-Prone Zone (reference data)" : `Record Affected Area — ${selectedEvent?.event_name || ""}`}</h3>
          <form onSubmit={saveArea}>
            <div className="form-row">
              <div className="form-group">
                <label>Area Name</label>
                <input value={form.area_name} onChange={(e) => setForm({ ...form, area_name: e.target.value })} placeholder="e.g. Flood-affected zone along the river" required maxLength={150} />
              </div>
              <div className="form-group">
                <label>Hazard Type</label>
                <select value={form.hazard_type} onChange={(e) => setForm({ ...form, hazard_type: e.target.value })}>
                  {HAZARDS.map((h) => <option key={h}>{h}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Description / Source</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Flood extent confirmed by the BDRRM team on site" />
            </div>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={useGeoJson} onChange={(e) => setUseGeoJson(e.target.checked)} />
              Paste GeoJSON instead of clicking on the map
            </label>
            {useGeoJson ? (
              <div className="form-group">
                <label>GeoJSON (Polygon or MultiPolygon, [longitude, latitude])</label>
                <textarea rows={5} value={geoText} onChange={(e) => setGeoText(e.target.value)} placeholder='{"type":"Polygon","coordinates":[[[123.714,13.155],[123.716,13.155],[123.716,13.157],[123.714,13.155]]]}' style={{ fontFamily: "monospace", fontSize: 12 }} />
              </div>
            ) : (
              <p style={{ fontSize: 13 }}>
                <strong>Click the map</strong> to add the corners of the affected area in order (at least 3). Points: <strong>{points.length}</strong>{" "}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPoints(points.slice(0, -1))} disabled={!points.length}>Undo last point</button>{" "}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPoints([])} disabled={!points.length}>Clear</button>
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={cancelDrawing}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : "Save Area and Identify Households"}</button>
            </div>
          </form>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
        {loading ? <div className="loading-text" style={{ padding: 16 }}>Loading map…</div> : (
          <BarangayMap
            households={mapHouseholds}
            affectedAreas={mapAreas}
            affectedInfo={affectedInfo}
            showAreaMembership
            drawPoints={drawing && !useGeoJson ? points : null}
            onMapClick={drawing && !useGeoJson ? (p) => setPoints((prev) => [...prev, p]) : null}
            height="520px"
          />
        )}
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="map-legend" style={{ marginTop: 0 }}>
          <span><span aria-hidden="true" style={{ display: "inline-block", width: 18, height: 12, background: `color-mix(in srgb, ${MAP_COLORS.areaFill} 30%, transparent)`, border: `2px solid ${MAP_COLORS.area}`, verticalAlign: "middle", marginRight: 4 }} />Recorded affected area (active)</span>
          <span><span aria-hidden="true" style={{ display: "inline-block", width: 18, height: 12, background: `color-mix(in srgb, ${MAP_COLORS.floodProneFill} 15%, transparent)`, border: `2px dotted ${MAP_COLORS.floodProne}`, verticalAlign: "middle", marginRight: 4 }} />Flood-prone zone (reference — not active flooding)</span>
          <span><span aria-hidden="true" style={{ display: "inline-block", width: 18, height: 12, background: `color-mix(in srgb, ${MAP_COLORS.resolvedFill} 25%, transparent)`, border: `2px dashed ${MAP_COLORS.resolved}`, verticalAlign: "middle", marginRight: 4 }} />Resolved area</span>
          <span><span aria-hidden="true" style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", border: `4px solid ${MAP_COLORS.area}`, verticalAlign: "middle", marginRight: 4 }} />Household inside an active recorded area</span>
          <span><span aria-hidden="true" style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", border: `3px dotted ${MAP_COLORS.floodProne}`, verticalAlign: "middle", marginRight: 4 }} />Household inside a flood-prone zone (at risk)</span>
        </div>
      </div>

      {s && (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <DashboardCard label={view === "flood" ? "Active Flood-Prone Zones" : "Active Affected Areas"} value={s.areas} />
          <DashboardCard label={view === "flood" ? "Households at Risk (inside)" : "Affected Households (inside)"} value={s.affected_households} tone="accent" />
          <DashboardCard label="Outside These Areas" value={s.outside_households} />
          <DashboardCard label="Households Without Coordinates" value={s.households_without_coordinates} />
          <DashboardCard label="Persons Inside (Vulnerable)" value={`${s.affected_persons} (${s.affected_vulnerable_persons})`} />
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, marginTop: 0 }}>Recorded Areas ({areas.length})</h3>
        <DataTable
          columns={[
            { key: "area_name", label: "Area", render: (a) => <strong>{a.area_name}</strong> },
            { key: "hazard_type", label: "Hazard" },
            { key: "status", label: "Status", render: (a) => <span className={`badge ${a.status === "Active" ? "badge-high" : "badge-low"}`}>{a.status}</span> },
            { key: "inside", label: "Households Inside", render: (a) => (a.status === "Active" ? insideByArea[a.area_id] ?? 0 : "— (resolved)") },
            { key: "vertex_count", label: "Points" },
            { key: "created", label: "Recorded", render: (a) => `${a.created_at}${a.created_by_name ? ` by ${a.created_by_name}` : ""}` },
            { key: "description", label: "Description / Source", render: (a) => <span style={{ whiteSpace: "normal" }}>{a.description || "—"}</span> },
            { key: "actions", label: "", render: (a) => (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => toggleStatus(a)}>{a.status === "Active" ? "Resolve" : "Reactivate"}</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(a)}>Delete</button>
              </div>
            ) },
          ]}
          rows={areas}
          emptyText={view === "flood" ? "No flood-prone zone has been recorded. Record one only from verified hazard data." : "No affected area has been recorded for this event yet."}
        />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, marginTop: 0 }}>{view === "flood" ? "Households Inside Flood-Prone Zones (at risk)" : "Households Inside Active Affected Areas"} ({result?.inside?.length || 0})</h3>
        <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: 0 }}>{s?.method} The priority shown is the existing DSS score; being inside an area does not change it.</p>
        <DataTable
          columns={[
            { key: "head_of_family", label: "Household Head", render: (h) => <strong>{h.head_of_family}</strong> },
            { key: "purok", label: "Purok", render: (h) => purokLabel(h.purok) },
            { key: "address", label: "Address", render: (h) => <span style={{ whiteSpace: "normal" }}>{h.address}</span> },
            { key: "areas", label: "Inside Area", render: (h) => h.areas.map((a) => `${a.area_name} (${a.hazard_type})`).join(", ") },
            { key: "coords", label: "Coordinates", render: (h) => `${h.latitude.toFixed(5)}, ${h.longitude.toFixed(5)}` },
            { key: "members", label: "Members (Vulnerable)", render: (h) => `${h.number_of_members} (${h.vulnerable_members})` },
            { key: "report", label: "Disaster Report", render: (h) => (h.report ? `${h.report.disaster_type}, ${h.report.severity} (${h.report.status})` : "No report") },
            { key: "priority", label: "Priority (DSS)", render: (h) => (h.priority_level ? <span className={`badge ${PRIORITY_BADGE[h.priority_level]}`}>{h.priority_level}{h.priority_score != null ? ` (${h.priority_score})` : ""}</span> : "—") },
            { key: "request", label: "Relief Request", render: (h) => (h.request ? `#${h.request.request_id} ${h.request.status}` : "None") },
          ]}
          rows={result?.inside || []}
          emptyText="No household with recorded coordinates is inside an active affected area."
        />
      </div>

      {result?.missing_coordinates?.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 15, marginTop: 0 }}>Households Without Coordinates ({result.missing_coordinates.length})</h3>
          <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", marginTop: 0 }}>Not included in the geographic check. Set their location on the Barangay Map (“Set location”).</p>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5 }}>
            {result.missing_coordinates.map((h) => <li key={h.household_id}>{h.head_of_family} — {purokLabel(h.purok)}, {h.address}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}
