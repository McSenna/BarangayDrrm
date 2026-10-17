import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Circle, GeoJSON, Popup, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { purokLabel, purokKey } from "../utils/purokLabel.js";
import { BARANGAY_CENTER, DEFAULT_ZOOM, PRIORITY_COLOR, BOUNDARY_STYLE, BOUNDARY_FIT_PADDING, colorForPurok } from "../config/mapConfig.js";
import binitayanBoundary from "../data/binitayanBoundary.json";
import { getGeoJsonBounds } from "../utils/geoBounds.js";
import { PUROK_COLORS } from "../utils/purokBoundaries.js";
import { MAP_COLORS } from "../theme/mapTokens.js";
import { AffectedAreaLayer, IncidentLayer, EvacuationCenterLayer, DistributionSiteLayer, MyLocationLayer, isFloodProne } from "./map/OverlayLayers.jsx";

function PurokLayer({ items, selected, interactive }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const showLabels = zoom >= 17; // the whole-barangay view (zoom 16) is too small for 8 labels
  return items.filter((it) => it.feature?.geometry).map((it) => {
    const color = PUROK_COLORS[it.name] || MAP_COLORS.neutral;
    const isSel = selected === it.name;
    const dim = selected && !isSel;
    const style = it.valid
      ? { color, weight: isSel ? 4 : 2, opacity: dim ? 0.45 : 0.95, fillColor: color, fillOpacity: isSel ? 0.28 : dim ? 0.04 : 0.13 }
      : { color, weight: isSel ? 4 : 2, opacity: dim ? 0.45 : 0.95, dashArray: "6 6", fill: false };
    return (
      <GeoJSON key={`purok-${it.name}-${selected || "all"}-${showLabels}`} data={it.feature} style={() => style} interactive={interactive}>
        {showLabels && (
          <Tooltip permanent direction="center" className="purok-label" opacity={1}>
            {it.name}{it.valid ? "" : " (unverified)"}
          </Tooltip>
        )}
        {!showLabels && <Tooltip sticky>{it.name}{it.valid ? " (candidate boundary)" : " — boundary failed validation"}</Tooltip>}
        <Popup>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            <strong>{it.name}</strong> — candidate Purok boundary<br />
            {it.valid ? "Geometry checks passed." : <span style={{ color: "var(--color-red-ink)" }}>Failed validation: {it.problems.join("; ")}. Shown as an outline only.</span>}<br />
            <span style={{ color: "var(--color-text-subtle)" }}>Supplied by the project team; not an official survey.</span>
          </div>
        </Popup>
      </GeoJSON>
    );
  });
}

const HAZARD_RING = { color: MAP_COLORS.hazard, weight: 3, dashArray: "4 4", fill: false };

const AFFECTED_RING = { color: MAP_COLORS.area, weight: 3, fill: false };
const FLOOD_PRONE_RING = { color: MAP_COLORS.floodProne, weight: 2, dashArray: "2 4", fill: false };
const DAMAGE_LABELS = { house: "House", infrastructure: "Infrastructure", property: "Property", agricultural: "Agricultural" };

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick && onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

const SEVERITY_SCORE_RADIUS = { "Low Priority": 8, "Moderate Priority": 10, "High Priority": 13, "Critical Priority": 16, "No report": 7, "Not Assessed": 7 };

const BOUNDARY_BOUNDS = getGeoJsonBounds(binitayanBoundary);

/** Recenters/zooms the map imperatively when `target` changes — used by the "Locate" action. */
function FlyToController({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], 18, { duration: 0.8 });
    }
  }, [target, map]);
  return null;
}

/** Centers/zooms the map on the browser-reported "My Location" point when it changes. */
function MyLocationFlyController({ myLocation }) {
  const map = useMap();
  useEffect(() => {
    if (myLocation) {
      map.flyTo([myLocation.lat, myLocation.lng], 17, { duration: 0.8 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocation && myLocation._t]);
  return null;
}

/**
 * Fits the map to the Binitayan boundary once on initial load, and again every
 * time `resetSignal` changes (the "Reset to Barangay" button bumps a counter).
 */
function BoundaryFitController({ resetSignal }) {
  const map = useMap();
  useEffect(() => {
    if (BOUNDARY_BOUNDS) {
      map.fitBounds(BOUNDARY_BOUNDS, { padding: BOUNDARY_FIT_PADDING });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]); // run once on mount — automatic initial fit to the boundary

  useEffect(() => {
    if (resetSignal && BOUNDARY_BOUNDS) {
      map.fitBounds(BOUNDARY_BOUNDS, { padding: BOUNDARY_FIT_PADDING });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  return null;
}

export default function BarangayMap({
  households,          // array of households, each with latitude/longitude + priority info merged in
  colorBy = "priority", // "priority" | "purok"
  purokList = [],
  showHeatOverlay = false,
  flyToTarget = null,
  resetSignal = 0,       // bumped by the "Reset to Barangay" button in BarangayMapView
  openPopupSignal = null, // { household_id, _t } — opens that household's popup (search/Locate)
  myLocation = null,      // { lat, lng, accuracy, _t } — browser Geolocation result, never sent to the backend
  onMarkerClick = () => {},
  // Phase 19 layers (all optional; existing callers are unaffected)
  evacuationCenters = [],  // [{ center_id, name, latitude, longitude, status, capacity, current_occupancy, ... }]
  distributionSites = [],  // [{ schedule_id, location, latitude, longitude, distribution_date, ... }]
  hazardPurokKeys = null,  // Set of purok match keys with an active purok-specific hazard alert
  barangayWideHazard = false, // an active barangay-wide hazard alert exists
  // Phase 20 (optional; existing callers are unaffected)
  affectedAreas = [],        // [{ area_id, area_name, hazard_type, status, event_name, geometry, households_inside }]
  affectedInfo = null,       // Map household_id -> server result row ({ areas, report, damage, request, allocations, ... }) for households INSIDE an area
  showAreaMembership = false, // popup says "Outside Affected Area" for households not in affectedInfo
  drawPoints = null,         // [{lat, lng}] — area being drawn
  purokItems = null,         // Phase 24: validated candidate Purok features (utils/purokBoundaries.js)
  selectedPurok = "",        // Phase 24: Purok chosen in the filter (highlighted)
  incidents = [],            // Phase 23: [{ report_id, reference_no, latitude, longitude, severity, status, disaster_type, report_date, head_of_family, purok }]
  onMapClick = null,         // click handler while drawing
  height = "560px",
}) {
  const mappable = households.filter((h) => h.latitude !== null && h.latitude !== undefined && h.longitude !== null && h.longitude !== undefined);

  const markerRefs = useRef({});

  useEffect(() => {
    if (openPopupSignal && openPopupSignal.household_id != null) {
      const marker = markerRefs.current[openPopupSignal.household_id];
      if (marker) marker.openPopup();
    }
  }, [openPopupSignal]);

  return (
    <MapContainer
      center={[BARANGAY_CENTER.lat, BARANGAY_CENTER.lng]}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom={true}
      style={{ height, width: "100%", borderRadius: "10px", isolation: "isolate" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeoJSON
        key={barangayWideHazard ? "boundary-hazard" : "boundary"}
        data={binitayanBoundary}
        style={() => (barangayWideHazard ? { ...BOUNDARY_STYLE, color: MAP_COLORS.hazard, fillColor: MAP_COLORS.hazard, fillOpacity: 0.1, dashArray: "6 4" } : BOUNDARY_STYLE)}
      />

      {purokItems && <PurokLayer items={purokItems} selected={selectedPurok} interactive={!onMapClick} />}

      {/* Phase 20 — recorded affected / flood areas (drawn under the markers' popups). */}
      <AffectedAreaLayer areas={affectedAreas} drawing={!!onMapClick} />
      <BoundaryFitController resetSignal={resetSignal} />

      <FlyToController target={flyToTarget} />

      <MyLocationFlyController myLocation={myLocation} />

      {/* Basic "heat" effect: overlapping translucent circles sized/colored by priority.
          This is a simple visual approximation, not real spatial density analysis,
          per the project's "keep GIS basic" requirement. */}
      {showHeatOverlay && mappable.map((h) => {
        const level = h.priority_level || "No report";
        const color = PRIORITY_COLOR[level] || PRIORITY_COLOR["No report"];
        return (
          <Circle
            key={`heat-${h.household_id}`}
            center={[h.latitude, h.longitude]}
            radius={70}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.18, stroke: false }}
          />
        );
      })}

      {mappable.map((h) => {
        const level = h.priority_level || "No report";
        const color = colorBy === "purok" ? colorForPurok(h.purok, purokList) : (PRIORITY_COLOR[level] || PRIORITY_COLOR["No report"]);
        const radius = colorBy === "purok" ? 8 : (SEVERITY_SCORE_RADIUS[level] || 8);

        const inHazardPurok = hazardPurokKeys && hazardPurokKeys.has(purokKey(h.purok));
        return (
          <CircleMarker
            key={h.household_id}
            ref={(el) => { markerRefs.current[h.household_id] = el; }}
            center={[h.latitude, h.longitude]}
            radius={radius}
            pathOptions={{ color: MAP_COLORS.householdOutline, weight: 1, fillColor: color, fillOpacity: 0.9 }}
            eventHandlers={{ click: () => onMarkerClick(h) }}
          >
            <Popup>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                <strong>{h.head_of_family}</strong><br />
                Household #{h.household_id}<br />
                {purokLabel(h.purok)}<br />
                {inHazardPurok && <><strong style={{ color: "var(--color-red-ink)" }}>Active hazard alert in this purok</strong><br /></>}
                {affectedInfo && affectedInfo.has(h.household_id) && (() => {
                  const hits = affectedInfo.get(h.household_id).areas || [];
                  const recorded = hits.filter((a) => !isFloodProne(a));
                  const prone = hits.filter(isFloodProne);
                  return (
                    <>
                      {recorded.length > 0 && <><strong style={{ color: MAP_COLORS.area }}>
                        {recorded.some((a) => a.hazard_type === "Flood") ? "Flood-Affected Household" : "Affected-Area Household"}
                      </strong> — inside {recorded.map((a) => a.area_name).join(", ")}<br /></>}
                      {prone.length > 0 && <><strong style={{ color: "var(--color-orange-ink)" }}>In a flood-prone zone</strong> ({prone.map((a) => a.area_name).join(", ")}) — at risk, not confirmed flooded<br /></>}
                    </>
                  );
                })()}
                {showAreaMembership && affectedInfo && !affectedInfo.has(h.household_id) && <><span style={{ color: "var(--color-text-subtle)" }}>Outside Affected Area</span><br /></>}
                {h.address}<br />
                Household Members: {h.number_of_members} (Vulnerable Members: {h.vulnerable_members ?? 0})<br />
                {h.priority_level && (
                  <>Priority Level: <strong>{h.priority_level}</strong>{h.priority_score != null && <> (Provisional subtotal: {h.priority_score}/80)</>}<br /></>
                )}
                {h.latest_severity && h.latest_severity !== "No report" && (
                  <>Disaster Report: <strong>{h.latest_severity}</strong> severity ({h.latest_report_status})<br /></>
                )}
                {affectedInfo && affectedInfo.has(h.household_id) && (() => {
                  const d = affectedInfo.get(h.household_id);
                  return (
                    <>
                      {d.report && <>Report #{d.report.report_id}: {d.report.disaster_type}, {d.report.severity} ({d.report.status})<br /></>}
                      {d.damage && <>Damage: {Object.entries(d.damage).filter(([, v]) => v && v !== "None").map(([k, v]) => `${DAMAGE_LABELS[k]} ${v}`).join(", ") || "None recorded"}<br /></>}
                      {d.request ? <>Relief request #{d.request.request_id}: {d.request.status}<br /></> : <>Relief request: none<br /></>}
                      {d.allocations && <>Allocations: {d.allocations.Approved || 0} approved, {d.allocations.Distributed || 0} distributed<br /></>}
                    </>
                  );
                })()}
                Coordinates: {h.latitude}, {h.longitude}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* Phase 19 — hazard-affected puroks: there are no official purok boundary
          polygons, so households in a purok with an active hazard alert get a
          dashed red ring instead of an invented purok shape. */}
      {hazardPurokKeys && hazardPurokKeys.size > 0 && mappable
        .filter((h) => hazardPurokKeys.has(purokKey(h.purok)))
        .map((h) => (
          <CircleMarker key={`hz-${h.household_id}`} center={[h.latitude, h.longitude]} radius={(SEVERITY_SCORE_RADIUS[h.priority_level] || 8) + 5}
            pathOptions={HAZARD_RING} interactive={false} />
        ))}

      {affectedInfo && mappable.filter((h) => affectedInfo.has(h.household_id)).map((h) => {
        const hits = affectedInfo.get(h.household_id).areas || [];
        const recorded = hits.length === 0 || hits.some((a) => !isFloodProne(a));
        return (
          <CircleMarker key={`aff-${h.household_id}`} center={[h.latitude, h.longitude]} radius={(SEVERITY_SCORE_RADIUS[h.priority_level] || 8) + 9}
            pathOptions={recorded ? AFFECTED_RING : FLOOD_PRONE_RING} interactive={false} />
        );
      })}

      {/* Phase 23 — recorded disaster incidents with coordinates. */}
      <IncidentLayer incidents={incidents} />

      {/* Phase 20 — area being drawn (click the map to add points). */}
      {onMapClick && <MapClickHandler onMapClick={onMapClick} />}
      {drawPoints && drawPoints.length > 0 && (
        <>
          <Polyline positions={[...drawPoints.map((p) => [p.lat, p.lng]), ...(drawPoints.length > 2 ? [[drawPoints[0].lat, drawPoints[0].lng]] : [])]}
            pathOptions={{ color: MAP_COLORS.drawing, weight: 3, dashArray: "5 5" }} />
          {drawPoints.map((p, i) => (
            <CircleMarker key={`dp-${i}`} center={[p.lat, p.lng]} radius={5} pathOptions={{ color: MAP_COLORS.drawing, fillColor: MAP_COLORS.white, fillOpacity: 1, weight: 2 }} />
          ))}
        </>
      )}

      {/* Phase 19 — evacuation centers (resident-safe public information). */}
      <EvacuationCenterLayer centers={evacuationCenters} />

      {/* Phase 19 — distribution sites (schedules with recorded coordinates). */}
      <DistributionSiteLayer sites={distributionSites} />

      {/* "My Location" — browser Geolocation only, never sent to the backend. */}
      <MyLocationLayer myLocation={myLocation} />
    </MapContainer>
  );
}
