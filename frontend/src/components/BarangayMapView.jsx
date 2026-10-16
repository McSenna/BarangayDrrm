import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import GisMap from "./gis/GisMap.jsx";
import { GisSummary, PurokBreakdown, LocationReview } from "./gis/GisPanels.jsx";
import { HouseholdRail, AssignPanel } from "./gis/GisRail.jsx";
import { MapToolbar, MapLegend, AssignBanner } from "./gis/GisChrome.jsx";
import { insideBarangay } from "./gis/gisGeometry.js";
import "./gis/gis.css";
import usePolling from "../hooks/usePolling.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  getHouseholds, getPriorityList, getEvacuationCenters, getHazardAlerts, getAffectedHouseholds, getReports,
  updateHouseholdCoordinates, getPurokClassification,
} from "../services/api.jsx";
import { STANDARD_PUROKS } from "../utils/purokBoundaries.js";
import { purokKey } from "../utils/purokLabel.js";
import { FLOOD_DESIGNATION_NOTE } from "../config/floodZones.js";

// Browser Geolocation errors, in plain words (the raw browser text is never shown).
const GEO_ERROR_MESSAGES = {
  1: "Location permission was denied. Allow location access in your browser to use My location.",
  2: "We couldn't determine your current location. Please try again.",
  3: "The location request timed out. Please try again.",
};

const hasCoords = (h) => h.latitude !== null && h.latitude !== undefined && h.longitude !== null && h.longitude !== undefined;
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/**
 * Barangay Binitayan — GIS Household & Flood-Prone Zone Map (Administrator and
 * Relief Personnel). Every registered household is accounted for: mapped ones
 * appear as house markers, unmapped ones in the list with "Assign location".
 * Flood status, Purok checks and all counts come from the server
 * (households/purok_classification.php); household details from
 * get_households.php and the DSS priority list. Data refreshes every 60 s.
 */
export default function BarangayMapView() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "relief_personnel";
  const [params, setParams] = useSearchParams();

  const [households, setHouseholds] = useState([]);
  const [gis, setGis] = useState(null); // classification response: flood_summary, per_purok, ...
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [search, setSearch] = useState("");
  const [purok, setPurok] = useState("");
  const [zone, setZone] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [focus, setFocus] = useState(null);
  const [assign, setAssign] = useState(null); // { household, point, error }
  const [saving, setSaving] = useState(false);
  const mapFrameRef = useRef(null);

  // Optional layers (existing map functions, kept behind the Layers menu).
  const [layers, setLayers] = useState({ zones: true, hazards: true, evacuation: true, areas: true, incidents: false, heat: false });
  const [markerAccent, setMarkerAccent] = useState("priority");
  const [incidentStatus, setIncidentStatus] = useState("open");
  const [reports, setReports] = useState([]);
  const [centers, setCenters] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [areaResult, setAreaResult] = useState(null);
  const [myLocation, setMyLocation] = useState(null);
  const [locating, setLocating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [h, c, p] = await Promise.all([
        getHouseholds(),
        getPurokClassification(),
        getPriorityList().catch(() => null), // the map still works without DSS priorities
      ]);
      const cls = new Map((c.data.households || []).map((r) => [r.household_id, r]));
      const pri = new Map((p?.data?.data || []).map((r) => [r.household_id, r]));
      const merged = (h.data.data || []).map((hh) => {
        const id = Number(hh.household_id);
        const k = cls.get(id) || {};
        const d = pri.get(id) || pri.get(hh.household_id) || {};
        return {
          ...hh,
          household_id: id,
          number_of_members: num(hh.number_of_members),
          vulnerable_members: num(hh.vulnerable_members),
          latitude: num(hh.latitude),
          longitude: num(hh.longitude),
          flood_status: k.flood_status || (hasCoords({ latitude: num(hh.latitude), longitude: num(hh.longitude) }) ? "unverified" : "unmapped"),
          location_status: k.status,
          location_note: k.note,
          spatial_purok: k.spatial_purok ?? null,
          needs_review: !!k.needs_review,
          priority_level: d.priority_level,
          priority_score: d.priority_score,
          latest_severity: d.latest_severity,
          latest_report_status: d.latest_report_status,
        };
      });
      setHouseholds(merged);
      setGis(c.data);
      setError("");
    } catch (err) {
      setError(err.response?.status === 403
        ? "You do not have permission to view household locations."
        : "We couldn't load the household map data. Check your connection; the page will try again automatically.");
    } finally {
      setLoading(false);
    }
  }, []);
  const { refresh } = usePolling(load, { interval: 60000 });

  useEffect(() => {
    // Extra layers load on their own, so a failure never hides the households.
    getEvacuationCenters().then((res) => setCenters(res.data.data || [])).catch(() => {});
    getReports().then((res) => setReports(res.data.data || [])).catch(() => {});
    getHazardAlerts({ active_only: "1" }).then((res) => setActiveAlerts((res.data.data || []).filter((a) => Number(a.is_active) === 1))).catch(() => {});
    getAffectedHouseholds({ status: "Active" }).then((res) => setAreaResult(res.data)).catch(() => setAreaResult(null));
  }, []);

  const affectedInfo = useMemo(() => (areaResult ? new Map((areaResult.inside || []).map((h) => [Number(h.household_id), h])) : null), [areaResult]);
  const hazardPurokKeys = useMemo(() => new Set(activeAlerts.filter((a) => a.affected_purok).map((a) => purokKey(a.affected_purok))), [activeAlerts]);
  const barangayWideHazard = activeAlerts.some((a) => !a.affected_purok);
  const incidents = useMemo(() => reports
    .filter((r) => (incidentStatus === "open" ? r.status !== "Rejected" : incidentStatus === "all" ? true : r.status === incidentStatus))
    .filter((r) => !purok || purokKey(r.purok) === purok)
    .map((r) => {
      const own = r.latitude !== null && r.latitude !== undefined && r.latitude !== "";
      return { ...r, latitude: own ? r.latitude : r.household_latitude ?? null, longitude: own ? r.longitude : r.household_longitude ?? null, coordinates_source: own ? "report" : "household" };
    })
    .filter((r) => r.latitude !== null && r.latitude !== undefined), [reports, incidentStatus, purok]);

  const purokStats = useMemo(() => new Map((gis?.per_purok || []).map((r) => [r.purok, r])), [gis]);
  const extraPuroks = gis?.other_stored_puroks?.registered || 0;

  // ---- filtering: affects only what is shown, never the records
  const rows = useMemo(() => {
    const raw = search.trim().toLowerCase();
    const idOnly = /^#\d+$/.test(raw);
    const q = raw.replace(/^#/, "");
    const list = households.filter((h) => {
      if (purok === "__other" ? STANDARD_PUROKS.includes(purokKey(h.purok)) : purok && purokKey(h.purok) !== purok) return false;
      if (zone === "mapped" && !hasCoords(h)) return false;
      if (zone === "unmapped" && hasCoords(h)) return false;
      if (zone === "review" && !(h.needs_review && hasCoords(h))) return false;
      if (["flood_prone", "not_designated", "unverified"].includes(zone) && h.flood_status !== zone) return false;
      if (idOnly) return String(h.household_id) === q;
      if (q) {
        const hay = [h.head_of_family, h.address, h.purok, h.member_names, h.resident_account_name].map((v) => String(v || "").toLowerCase());
        if (String(h.household_id) !== q && !hay.some((v) => v.includes(q))) return false;
      }
      return true;
    });
    // An exact household ID match goes first.
    return /^\d+$/.test(q) ? [...list.filter((h) => String(h.household_id) === q), ...list.filter((h) => String(h.household_id) !== q)] : list;
  }, [households, search, purok, zone]);
  const mapRows = useMemo(() => rows.filter(hasCoords), [rows]);
  const reviewRows = useMemo(() => households.filter((h) => h.needs_review && hasCoords(h)), [households]);

  // ---- selection and focus
  const handleSelect = useCallback((id, closingId) => {
    if (id === null) setSelectedId((cur) => (cur === closingId ? null : cur));
    else setSelectedId(id);
  }, []);
  const scrollMapIntoView = () => {
    const el = mapFrameRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.5) el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  const locate = (h) => {
    if (!hasCoords(h)) return;
    setSelectedId(h.household_id);
    setFocus({ type: "household", lat: h.latitude, lng: h.longitude, _t: Date.now() });
    scrollMapIntoView();
  };
  const startAssign = useCallback((h) => {
    setNotice("");
    setSelectedId(null);
    setAssign({ household: h, point: null, error: "" });
    setFocus(hasCoords(h) ? { type: "household", lat: h.latitude, lng: h.longitude, _t: Date.now() } : { type: "overview", _t: Date.now() });
  }, []);
  const pickFromList = (h) => {
    if (hasCoords(h)) locate(h);
    else if (canEdit) startAssign(h);
  };
  const pickPurok = (name) => {
    setPurok((cur) => (cur === name ? "" : name));
    setFocus(purok === name ? { type: "overview", _t: Date.now() } : { type: "purok", name, _t: Date.now() });
    scrollMapIntoView();
  };
  const resetFilters = () => {
    setSearch(""); setPurok(""); setZone("");
    setFocus({ type: "overview", _t: Date.now() });
  };

  // Deep links from the Households page: ?household=ID (locate) or ?assign=ID.
  useEffect(() => {
    if (loading || households.length === 0) return;
    const hid = Number(params.get("household") || params.get("assign"));
    if (!hid) return;
    const h = households.find((x) => x.household_id === hid);
    if (h) {
      if (params.get("assign") && canEdit) startAssign(h);
      else if (hasCoords(h)) locate(h);
      else setZone("unmapped");
    }
    const next = new URLSearchParams(params);
    next.delete("household"); next.delete("assign");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, households.length]);

  // ---- assigning a location
  const cancelAssign = useCallback(() => setAssign(null), []);
  const saveAssign = async (pt) => {
    if (!insideBarangay(pt.lat, pt.lng)) {
      setAssign((a) => ({ ...a, error: "That point is outside Barangay Binitayan." }));
      return;
    }
    setSaving(true);
    const h = assign.household;
    try {
      const res = await updateHouseholdCoordinates(h.household_id, pt.lat.toFixed(7), pt.lng.toFixed(7));
      await refresh();
      getAffectedHouseholds({ status: "Active" }).then((r) => setAreaResult(r.data)).catch(() => {});
      setAssign(null);
      setNotice(res.data.message || "Map location saved.");
      setSelectedId(h.household_id);
      setFocus({ type: "household", lat: Number(res.data.latitude ?? pt.lat), lng: Number(res.data.longitude ?? pt.lng), _t: Date.now() });
    } catch (err) {
      setAssign((a) => ({ ...a, error: err.response?.data?.message || "We couldn't save the location. Please try again." }));
    } finally {
      setSaving(false);
    }
  };

  const handleMyLocation = () => {
    setNotice("");
    if (!("geolocation" in navigator)) { setError("This browser does not support My location."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        setLocating(false);
        setMyLocation({ lat, lng, accuracy, _t: Date.now() });
        if (insideBarangay(lat, lng)) setFocus({ type: "household", lat, lng, _t: Date.now() });
        else setNotice("Your current location is outside Barangay Binitayan, so the map stays on the barangay.");
      },
      (err) => { setLocating(false); setError(GEO_ERROR_MESSAGES[err.code] || "We couldn't determine your current location."); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const summary = gis?.flood_summary;
  const unverified = summary?.unverified || 0;

  return (
    <div className="gis-page">
      <GisSummary summary={summary} zone={zone} loading={loading} onZone={(z) => { setZone(z); if (z === "") setFocus({ type: "overview", _t: Date.now() }); }} />
      {unverified > 0 && (
        <p className="gis-ledger-note">
          {unverified} mapped {unverified === 1 ? "household" : "households"} could not be placed in a single Purok designation (between Purok boundaries, on an edge between a flood-prone and an undesignated Purok, or outside the barangay), so the flood status is <strong>unverified</strong>.{" "}
          <button type="button" className="btn-text" onClick={() => setZone("unverified")}>Show them</button>
        </p>
      )}

      <div className={`gis-workspace${assign ? " is-assigning" : ""}`}>
        <div className="gis-frame" ref={mapFrameRef} role="region" aria-label="Map of Barangay Binitayan with household locations and Purok flood-zone designations">
          {loading && households.length === 0 ? (
            <div className="gis-loading" role="status">Loading the barangay map…</div>
          ) : (
            <GisMap
              households={mapRows}
              selectedId={selectedId}
              onSelect={handleSelect}
              focus={focus}
              purokStats={purokStats}
              selectedPurok={purok === "__other" ? "" : purok}
              onZoomPurok={(name) => setFocus({ type: "purok", name, _t: Date.now() })}
              onFilterPurok={(name) => { setPurok(name); setFocus({ type: "purok", name, _t: Date.now() }); }}
              canEdit={canEdit}
              onAssign={startAssign}
              assign={assign}
              onAssignPick={(point) => setAssign((a) => (a ? { ...a, point, error: "" } : a))}
              onAssignReject={() => setAssign((a) => (a ? { ...a, error: "That point is outside Barangay Binitayan. Click inside the outlined area." } : a))}
              markerAccent={markerAccent}
              layers={layers}
              incidents={incidents}
              affectedAreas={areaResult?.areas || []}
              affectedInfo={affectedInfo}
              centers={centers}
              hazardPurokKeys={hazardPurokKeys}
              barangayWideHazard={layers.hazards && barangayWideHazard}
              myLocation={myLocation}
            />
          )}
          {!assign && (
            <MapToolbar
              onOverview={() => { setSelectedId(null); setFocus({ type: "overview", _t: Date.now() }); }}
              onMyLocation={handleMyLocation}
              locating={locating}
              layers={layers}
              onToggleLayer={(k) => setLayers((l) => ({ ...l, [k]: !l[k] }))}
              counts={{ alerts: activeAlerts.length, centers: centers.length, areas: areaResult?.areas?.length || 0, incidents: incidents.length }}
              incidentStatus={incidentStatus}
              onIncidentStatus={setIncidentStatus}
              markerAccent={markerAccent}
              onMarkerAccent={setMarkerAccent}
            />
          )}
          {assign && <AssignBanner household={assign.household} onCancel={cancelAssign} />}
          <MapLegend layers={layers} />
        </div>

        <div className="gis-side">
          {assign && <AssignPanel assign={assign} onPoint={(point) => setAssign((a) => ({ ...a, point, error: "" }))} onCancel={cancelAssign} onSave={saveAssign} saving={saving} />}
          <HouseholdRail
            rows={rows}
            total={households.length}
            search={search} onSearch={setSearch}
            purok={purok} onPurok={(p) => { setPurok(p); setFocus(p && p !== "__other" ? { type: "purok", name: p, _t: Date.now() } : { type: "overview", _t: Date.now() }); }}
            zone={zone} onZone={setZone}
            extraPuroks={extraPuroks}
            onReset={resetFilters}
            selectedId={selectedId}
            onPick={pickFromList}
            canEdit={canEdit}
            onAssign={startAssign}
          />
        </div>
      </div>

      <div className="gis-lower">
        <PurokBreakdown rows={gis?.per_purok || []} other={gis?.other_stored_puroks} selectedPurok={purok} onPick={pickPurok} />
        <LocationReview rows={reviewRows} canEdit={canEdit} onLocate={locate} onAssign={startAssign} />
      </div>

      <section className="gis-sources" aria-labelledby="gis-sources-title">
        <h2 id="gis-sources-title">About this map's data</h2>
        <ul role="list">
          <li>{FLOOD_DESIGNATION_NOTE}</li>
          <li>Barangay boundary: PSA PSGC boundary data (2023). Purok boundaries: candidate boundaries supplied by the project team and checked for structure — not an official survey. Part of the barangay is not inside any Purok boundary; households there show “Location unverified”.</li>
          <li>Households appear on the map only at coordinates recorded for them. None are placed automatically; unmapped households stay in the list until a location is assigned.</li>
        </ul>
      </section>
    </div>
  );
}
