import { Circle, CircleMarker, GeoJSON, Marker, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";
import { purokLabel } from "../../utils/purokLabel.js";
import { MAP_COLORS, INCIDENT_COLORS } from "../../theme/mapTokens.js";

/**
 * Map layers shared by the staff maps (components/BarangayMap.jsx and the GIS
 * map in components/gis/GisMap.jsx): evacuation centers, distribution sites,
 * recorded disaster incidents, recorded affected / flood-prone areas and the
 * browser-only "My Location" point. Moved here unchanged from BarangayMap.jsx
 * so both maps draw them the same way.
 */

// Phase 19 — symbol markers for non-household layers (CSS-only icons, no image files).
const EVAC_ICON = (status) => L.divIcon({
  className: "",
  html: `<span class="map-pin map-pin-evac map-pin-${String(status).toLowerCase()}" aria-hidden="true">E</span>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -12],
});
const SITE_ICON = L.divIcon({
  className: "",
  html: '<span class="map-pin map-pin-site" aria-hidden="true">D</span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

// Phase 20 — Administrator-recorded affected / flood areas.
export const AREA_STYLE = { color: MAP_COLORS.area, weight: 2, fillColor: MAP_COLORS.areaFill, fillOpacity: 0.22, dashArray: null };
export const AREA_RESOLVED_STYLE = { color: MAP_COLORS.resolved, weight: 2, fillColor: MAP_COLORS.resolvedFill, fillOpacity: 0.12, dashArray: "6 4" };
// Phase 23 — Flood-Prone Zones are reference geography (NOT active flooding): dotted amber outline, light fill.
export const FLOOD_PRONE_STYLE = { color: MAP_COLORS.floodProne, weight: 2, fillColor: MAP_COLORS.floodProneFill, fillOpacity: 0.1, dashArray: "2 6" };
export const isFloodProne = (a) => a?.area_type === "Flood-Prone Zone";

// Phase 23 — recorded disaster incidents (square pins, colour by severity).
const INCIDENT_ICON = (severity, status) => L.divIcon({
  className: "",
  html: `<span class="map-pin map-pin-incident${status === "Pending" ? " map-pin-pending" : ""}" style="background:${INCIDENT_COLORS[severity] || INCIDENT_COLORS.Low}" aria-hidden="true">!</span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -11],
});

const hasCoords = (r) => r.latitude !== null && r.latitude !== undefined && r.longitude !== null && r.longitude !== undefined;

/** Phase 20 — recorded affected / flood areas. `drawing` makes them click-through while a shape is drawn. */
export function AffectedAreaLayer({ areas = [], drawing = false, pane }) {
  return areas.filter((a) => a.geometry).map((a) => (
    <GeoJSON key={`area-${a.area_id}-${a.status}-${a.households_inside ?? ""}-${drawing ? "draw" : "view"}`} data={a.geometry}
      interactive={!drawing} pane={pane}
      style={() => (a.status === "Resolved" ? AREA_RESOLVED_STYLE : isFloodProne(a) ? FLOOD_PRONE_STYLE : AREA_STYLE)}>
      <Tooltip sticky>{a.area_name} ({isFloodProne(a) ? "flood-prone zone" : a.hazard_type}{a.status === "Resolved" ? ", resolved" : ""})</Tooltip>
      <Popup>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          <strong>{a.area_name}</strong> ({isFloodProne(a) ? "Flood-Prone Zone" : "Recorded Affected Area"})<br />
          {isFloodProne(a) && <><span style={{ color: "var(--color-orange-ink)" }}>Reference area prone to flooding — not confirmed active flooding.</span><br /></>}
          Hazard: {a.hazard_type} · Status: {a.status}<br />
          {a.event_name && <>Event: {a.event_name}<br /></>}
          {a.households_inside !== undefined && <>Households inside: <strong>{a.households_inside}</strong><br /></>}
          <span style={{ color: "var(--color-text-subtle)" }}>Recorded by the Administrator.</span>
        </div>
      </Popup>
    </GeoJSON>
  ));
}

/** Phase 23 — recorded disaster incidents with coordinates. */
export function IncidentLayer({ incidents = [] }) {
  return incidents.filter(hasCoords).map((r) => (
    <Marker key={`inc-${r.report_id}`} position={[Number(r.latitude), Number(r.longitude)]} icon={INCIDENT_ICON(r.severity, r.status)}>
      <Tooltip>{r.reference_no || `Report #${r.report_id}`} · {r.severity}</Tooltip>
      <Popup>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          <strong>{r.reference_no || `Report #${r.report_id}`}</strong> (Disaster Incident)<br />
          {r.disaster_type} · Severity: <strong>{r.severity}</strong> · {r.status}<br />
          {r.report_date}<br />
          {r.head_of_family && <>Household: {r.head_of_family}{r.purok ? `, ${purokLabel(r.purok)}` : ""}<br /></>}
          {r.coordinates_source === "household" && <span style={{ color: "var(--color-text-subtle)" }}>Shown at the household's saved location.<br /></span>}
        </div>
      </Popup>
    </Marker>
  ));
}

/** Phase 19 — evacuation centers (resident-safe public information). */
export function EvacuationCenterLayer({ centers = [] }) {
  return centers.filter(hasCoords).map((c) => (
    <Marker key={`evac-${c.center_id}`} position={[Number(c.latitude), Number(c.longitude)]} icon={EVAC_ICON(c.status)}>
      <Popup>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          <strong>{c.name}</strong> (Evacuation Center)<br />
          Status: <strong>{c.status}</strong><br />
          Occupancy: {c.current_occupancy} / {c.capacity}<br />
          {c.address}, {purokLabel(c.purok)}<br />
          {c.facilities && <>Facilities: {c.facilities}<br /></>}
          {c.contact_person && <>Contact: {c.contact_person}{c.contact_number ? ` (${c.contact_number})` : ""}<br /></>}
        </div>
      </Popup>
    </Marker>
  ));
}

/** Phase 19 — distribution sites (schedules with recorded coordinates). */
export function DistributionSiteLayer({ sites = [] }) {
  return sites.filter(hasCoords).map((d) => (
    <Marker key={`site-${d.schedule_id}`} position={[Number(d.latitude), Number(d.longitude)]} icon={SITE_ICON}>
      <Popup>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          <strong>Distribution site</strong><br />
          {d.location}<br />
          {d.distribution_date}{d.distribution_time ? ` ${String(d.distribution_time).slice(0, 5)}` : ""}<br />
          {d.package_name && <>Package: {d.package_name}<br /></>}
          {d.assigned_personnel_name && <>Personnel: {d.assigned_personnel_name}<br /></>}
        </div>
      </Popup>
    </Marker>
  ));
}

/**
 * "My Location" — purely client-side, browser Geolocation result. Never
 * persisted, never sent to the PHP backend. Solid blue dot with a white ring,
 * plus an optional translucent accuracy circle.
 */
export function MyLocationLayer({ myLocation }) {
  if (!myLocation) return null;
  return (
    <>
      {typeof myLocation.accuracy === "number" && myLocation.accuracy > 0 && (
        <Circle
          center={[myLocation.lat, myLocation.lng]}
          radius={myLocation.accuracy}
          pathOptions={{ color: MAP_COLORS.myLocation, weight: 1, fillColor: MAP_COLORS.myLocation, fillOpacity: 0.12 }}
        />
      )}
      <CircleMarker
        center={[myLocation.lat, myLocation.lng]}
        radius={9}
        pathOptions={{ color: MAP_COLORS.white, weight: 3, fillColor: MAP_COLORS.myLocation, fillOpacity: 1 }}
      >
        <Popup>
          <div style={{ fontSize: 13 }}>
            <strong>My Location</strong><br />
            {myLocation.lat.toFixed(5)}, {myLocation.lng.toFixed(5)}
            {typeof myLocation.accuracy === "number" && <><br />Accuracy: ~{Math.round(myLocation.accuracy)} m</>}
          </div>
        </Popup>
      </CircleMarker>
    </>
  );
}
