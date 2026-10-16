import { memo, useEffect, useMemo, useState } from "react";
import { Circle, GeoJSON, MapContainer, Marker, Pane, Polygon, Polyline, Popup, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  BARANGAY_BOUNDS, MAX_BOUNDS, OVERVIEW_PADDING, OUTSIDE_MASK, PUROKS, PUROK_BY_NAME, unverifiedPuroks,
  binitayanBoundary, insideBarangay,
} from "./gisGeometry.js";
import { HouseholdPopup, PurokPopup } from "./GisPopups.jsx";
import { AffectedAreaLayer, IncidentLayer, EvacuationCenterLayer, MyLocationLayer } from "../map/OverlayLayers.jsx";
import { ZONE_STYLES, GIS_MASK, GIS_BOUNDARY, GIS_ASSIGN_LINE, MAP_COLORS, PRIORITY_COLORS, PUROK_COLORS } from "../../theme/mapTokens.js";
import { purokKey } from "../../utils/purokLabel.js";

/**
 * Barangay Binitayan GIS map (Admin and Relief Personnel).
 *
 * Locked to the barangay: no dragging, no keyboard panning, no box zoom.
 * Wheel, double-click and pinch zoom keep the current centre ("center"
 * mode), so a gesture can never slide the view toward a neighbouring
 * barangay; maxBounds holds every programmatic move inside the boundary and
 * the minimum zoom is the whole-barangay view. Zooming back out to it
 * re-centres on the barangay. Everything outside the PSA boundary is covered
 * by an opaque mask.
 *
 * Layer order (bottom to top): OSM tiles → outside mask → Purok designation
 * polygons → barangay outline → Purok labels → household markers → popups.
 */

// Bottom → top. Leaflet's own panes: tiles 200, overlay 400, marker 600, tooltip 650, popup 700.
const Z = { mask: 380, zones: 410, outline: 430, labels: 450 };

const HOUSE_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>' +
  '<path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';

// One icon object per visual variant, shared by every marker that looks the same.
const iconCache = new Map();
function houseIcon(v) {
  const key = `${v.status}|${v.selected}|${v.review}|${v.accent}|${v.hazard}|${v.affected}|${v.variant}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const cls = ["gis-house", `gis-house--${v.status}`];
    if (v.selected) cls.push("is-selected");
    if (v.review) cls.push("is-review");
    if (v.hazard) cls.push("is-hazard");
    if (v.affected) cls.push("is-affected");
    if (v.variant) cls.push(`is-${v.variant}`);
    const dot = v.accent ? `<i class="gis-house-dot" style="background:${v.accent}"></i>` : "";
    icon = L.divIcon({ className: "gis-house-icon", html: `<span class="${cls.join(" ")}">${HOUSE_SVG}${dot}</span>`, iconSize: [0, 0], iconAnchor: [0, 0] });
    iconCache.set(key, icon);
  }
  return icon;
}

function labelIcon(p) {
  return L.divIcon({
    className: "gis-label-icon",
    html: `<span class="gis-purok-label gis-purok-label--${p.designation === "flood_prone" ? "flood" : "neutral"}"><b class="gis-label-full">${p.name}</b><b class="gis-label-short">${p.short}</b></span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}
const LABEL_ICONS = new Map(PUROKS.map((p) => [p.name, labelIcon(p)]));

/** The selected household's popup, capped to the map's height so its actions stay reachable. */
function SelectedPopup({ h, onSelect, children }) {
  const map = useMap();
  const maxHeight = Math.max(220, Math.round(map.getSize().y * 0.8));
  return (
    <Popup
      position={[h.latitude, h.longitude]}
      offset={[0, -12]}
      minWidth={270}
      maxWidth={310}
      maxHeight={maxHeight}
      autoPanPaddingTopLeft={[16, 60]} // clear the toolbar
      autoPanPaddingBottomRight={[16, 16]}
      eventHandlers={{ remove: () => onSelect(null, h.household_id) }}
    >
      {children}
    </Popup>
  );
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Keeps the map locked to Binitayan: the overview zoom is the minimum, the
 * view re-centres when zoomed fully out, and the container carries a zoom
 * bucket (data-zoom) so CSS can size markers and labels for the scale.
 */
function LockedView({ focus, onSettled }) {
  const map = useMap();

  useEffect(() => {
    const overviewZoom = () => map.getBoundsZoom(BARANGAY_BOUNDS, false, OVERVIEW_PADDING);
    const showOverview = () => map.setView(BARANGAY_BOUNDS.getCenter(), map.getMinZoom(), { animate: false });
    const setBucket = () => {
      const z = map.getZoom();
      map.getContainer().dataset.zoom = z >= 18 ? "near" : z >= map.getMinZoom() + 0.75 ? "mid" : "far";
    };
    map.setMinZoom(overviewZoom());
    showOverview();
    setBucket();

    const onZoomEnd = () => {
      setBucket();
      const atOverview = map.getZoom() <= map.getMinZoom() + 0.01;
      const c = map.getCenter();
      const centre = BARANGAY_BOUNDS.getCenter();
      if (atOverview && (Math.abs(c.lat - centre.lat) > 1e-6 || Math.abs(c.lng - centre.lng) > 1e-6)) showOverview();
    };
    const onResize = () => {
      const wasOverview = map.getZoom() <= map.getMinZoom() + 0.01;
      map.setMinZoom(overviewZoom());
      if (wasOverview || map.getZoom() < map.getMinZoom()) showOverview();
      setBucket();
    };
    map.on("zoomend", onZoomEnd);
    map.on("resize", onResize);
    return () => {
      map.off("zoomend", onZoomEnd);
      map.off("resize", onResize);
    };
  }, [map]);

  // keyboard={false} (no arrow-key panning) also drops Leaflet's Esc-to-close; restore it.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") map.closePopup(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [map]);

  useEffect(() => {
    if (!focus) return;
    const animate = !prefersReducedMotion();
    if (focus.type === "household" && focus.lat != null) {
      const zoom = Math.max(map.getZoom(), 18);
      // Centre a little north of the household so it sits in the lower part of
      // the frame and its popup needs little or no auto-pan once it opens.
      const lift = Math.min(170, map.getSize().y * 0.24);
      const target = map.unproject(map.project([focus.lat, focus.lng], zoom).subtract([0, lift]), zoom);
      // The popup opens once the map has stopped, so Leaflet's auto-pan sees the final view.
      let done = false;
      const settle = () => { if (!done) { done = true; onSettled(focus._t); } };
      map.once("moveend", settle);
      const fallback = setTimeout(settle, 1200);
      if (animate) map.flyTo(target, zoom, { duration: 0.6 });
      else map.setView(target, zoom, { animate: false });
      return () => { clearTimeout(fallback); map.off("moveend", settle); };
    } else if (focus.type === "purok" && PUROK_BY_NAME.has(focus.name)) {
      const opts = { padding: [48, 48], maxZoom: 18.5 };
      if (animate) map.flyToBounds(PUROK_BY_NAME.get(focus.name).bounds, { ...opts, duration: 0.6 });
      else map.fitBounds(PUROK_BY_NAME.get(focus.name).bounds, { ...opts, animate: false });
    } else if (focus.type === "overview") {
      if (animate) map.flyTo(BARANGAY_BOUNDS.getCenter(), map.getMinZoom(), { duration: 0.5 });
      else map.setView(BARANGAY_BOUNDS.getCenter(), map.getMinZoom(), { animate: false });
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, map]);

  return null;
}

/** Purok polygons styled by designation; the filtered Purok is emphasised and the others recede. */
function ZoneLayer({ purokStats, selectedPurok, interactive, onZoomPurok, onFilterPurok }) {
  return PUROKS.map((p) => {
    const base = ZONE_STYLES[p.designation] || ZONE_STYLES.not_designated;
    const isSel = selectedPurok === p.name;
    const dim = selectedPurok && !isSel;
    const style = {
      ...base,
      weight: isSel ? base.weight + 1.5 : base.weight,
      fillOpacity: dim ? base.fillOpacity * 0.4 : base.fillOpacity,
      opacity: dim ? 0.5 : base.opacity,
    };
    return (
      <GeoJSON
        key={`zone-${p.name}-${selectedPurok || "all"}-${interactive}`}
        data={p.feature}
        style={() => style}
        interactive={interactive}
        eventHandlers={interactive ? {
          mouseover: (e) => e.layer.setStyle({ weight: style.weight + 1.5 }),
          mouseout: (e) => e.layer.setStyle({ weight: style.weight }),
        } : undefined}
      >
        {interactive && (
          <Popup minWidth={260} maxWidth={300}>
            <PurokPopup purok={p} stats={purokStats.get(p.name)} onZoom={() => onZoomPurok(p.name)} onFilter={() => onFilterPurok(p.name)} />
          </Popup>
        )}
      </GeoJSON>
    );
  });
}

const HouseholdMarker = memo(function HouseholdMarker({ h, icon, interactive, onSelect }) {
  return (
    <Marker
      position={[h.latitude, h.longitude]}
      icon={icon}
      interactive={interactive}
      keyboard={false}
      riseOnHover
      title={`Household #${h.household_id} — ${h.head_of_family}`}
      eventHandlers={interactive ? { click: () => onSelect(h.household_id) } : undefined}
    />
  );
});

/** While a location is being assigned: map clicks inside the barangay pick the point. */
function AssignLayer({ assign, onPick, onReject }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      if (insideBarangay(lat, lng)) onPick({ lat, lng });
      else onReject();
    },
  });
  const h = assign.household;
  const old = h.latitude != null && h.longitude != null ? [h.latitude, h.longitude] : null;
  const pt = assign.point ? [assign.point.lat, assign.point.lng] : null;
  return (
    <>
      {old && <Marker position={old} icon={houseIcon({ status: "ghost", variant: "ghost" })} interactive={false} keyboard={false} />}
      {old && pt && <Polyline positions={[old, pt]} pathOptions={GIS_ASSIGN_LINE} />}
      {pt && <Marker position={pt} icon={houseIcon({ status: "preview", variant: "preview" })} interactive={false} keyboard={false} zIndexOffset={2000} />}
    </>
  );
}

export default function GisMap({
  households,                 // mapped households only (latitude/longitude numbers), already filtered
  selectedId = null,
  onSelect,                   // (household_id | null)
  focus = null,               // { type: "household" | "purok" | "overview", ..., _t }
  purokStats,                 // Map Purok name -> per_purok row
  selectedPurok = "",
  onZoomPurok,
  onFilterPurok,
  canEdit = false,
  onAssign,                   // (household) => start "Move location"
  assign = null,              // { household, point } while assigning
  onAssignPick,
  onAssignReject,
  markerAccent = "priority",  // "priority" | "purok" | "none"
  layers = {},                // { zones, incidents, areas, evacuation, hazards, heat }
  incidents = [],
  affectedAreas = [],
  affectedInfo = null,
  centers = [],
  hazardPurokKeys = null,
  barangayWideHazard = false,
  myLocation = null,
}) {
  const assigning = !!assign;
  // While the map flies to a household, hold its popup back (see LockedView).
  const [settledT, setSettledT] = useState(null);
  const flying = focus?.type === "household" && settledT !== focus._t;
  const onSettled = setSettledT;
  const selected = useMemo(() => households.find((h) => h.household_id === selectedId) || null, [households, selectedId]);

  return (
    <MapContainer
      bounds={BARANGAY_BOUNDS}
      boundsOptions={{ padding: [OVERVIEW_PADDING.x, OVERVIEW_PADDING.y] }}
      maxBounds={MAX_BOUNDS}
      maxBoundsViscosity={1}
      maxZoom={19}
      zoomSnap={0.25}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={120}
      dragging={false}
      keyboard={false}
      boxZoom={false}
      scrollWheelZoom="center"
      doubleClickZoom="center"
      touchZoom="center"
      zoomControl={false}
      className="gis-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <ZoomControl position="topright" zoomInTitle="Zoom in" zoomOutTitle="Zoom out" />
      <LockedView focus={focus} onSettled={onSettled} />

      <Pane name="gis-mask" style={{ zIndex: Z.mask }}>
        <Polygon positions={OUTSIDE_MASK} pathOptions={GIS_MASK} interactive={false} />
      </Pane>

      {layers.zones !== false && (
        <Pane name="gis-zones" style={{ zIndex: Z.zones }}>
          <ZoneLayer purokStats={purokStats} selectedPurok={selectedPurok} interactive={!assigning}
            onZoomPurok={onZoomPurok} onFilterPurok={onFilterPurok} />
          {unverifiedPuroks.filter((it) => it.feature?.geometry).map((it) => (
            <GeoJSON key={`unverified-${it.name}`} data={it.feature} interactive={false}
              style={() => ({ color: MAP_COLORS.mutedText, weight: 1.5, dashArray: "6 6", fill: false })} />
          ))}
        </Pane>
      )}

      {layers.areas && <AffectedAreaLayer areas={affectedAreas} drawing={assigning} pane="gis-zones" />}

      <Pane name="gis-outline" style={{ zIndex: Z.outline }}>
        <GeoJSON
          key={barangayWideHazard ? "outline-hazard" : "outline"}
          data={binitayanBoundary}
          style={() => (barangayWideHazard ? { ...GIS_BOUNDARY, color: MAP_COLORS.hazard, dashArray: "8 6" } : GIS_BOUNDARY)}
          interactive={false}
        />
      </Pane>

      {layers.zones !== false && (
        <Pane name="gis-labels" style={{ zIndex: Z.labels }}>
          {PUROKS.filter((p) => p.label).map((p) => (
            <Marker key={`label-${p.name}`} position={p.label} icon={LABEL_ICONS.get(p.name)} interactive={false} keyboard={false} />
          ))}
        </Pane>
      )}

      {layers.heat && households.map((h) => {
        const color = PRIORITY_COLORS[h.priority_level] || PRIORITY_COLORS["No report"];
        return <Circle key={`heat-${h.household_id}`} center={[h.latitude, h.longitude]} radius={70}
          pathOptions={{ color, fillColor: color, fillOpacity: 0.18, stroke: false }} interactive={false} />;
      })}

      {households.map((h) => {
        const accent = markerAccent === "priority" ? PRIORITY_COLORS[h.priority_level] || null
          : markerAccent === "purok" ? PUROK_COLORS[purokKey(h.purok)] || null : null;
        const icon = houseIcon({
          status: h.flood_status || "unverified",
          selected: h.household_id === selectedId,
          review: !!h.needs_review,
          accent,
          hazard: !!(layers.hazards && hazardPurokKeys && hazardPurokKeys.has(purokKey(h.purok))),
          affected: !!(layers.areas && affectedInfo && affectedInfo.has(h.household_id)),
        });
        return (
          <HouseholdMarker key={`${h.household_id}-${assigning ? "a" : "v"}`} h={h} icon={icon} interactive={!assigning} onSelect={onSelect} />
        );
      })}

      {layers.incidents && <IncidentLayer incidents={incidents} />}
      {layers.evacuation && <EvacuationCenterLayer centers={centers} />}
      <MyLocationLayer myLocation={myLocation} />

      {assigning && <AssignLayer assign={assign} onPick={onAssignPick} onReject={onAssignReject} />}

      {selected && !assigning && !flying && (
        <SelectedPopup key={`pop-${selected.household_id}`} h={selected} onSelect={onSelect}>
          <HouseholdPopup
            h={selected}
            canEdit={canEdit}
            inHazardPurok={!!(layers.hazards && hazardPurokKeys && hazardPurokKeys.has(purokKey(selected.purok)))}
            affected={layers.areas && affectedInfo ? affectedInfo.get(selected.household_id) : null}
            onAssign={onAssign}
          />
        </SelectedPopup>
      )}
    </MapContainer>
  );
}
