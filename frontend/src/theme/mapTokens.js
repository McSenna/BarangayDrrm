/**
 * Map and data-visualisation colour tokens.
 *
 * Leaflet writes colours into SVG attributes, which cannot read CSS custom
 * properties, so map colours need literal values. This file is the only place
 * they live. UI colours stay in src/styles/tokens.css; the status hues below
 * repeat those values so the map and the badges agree.
 */

// Mirrors of the UI palette (src/styles/tokens.css).
const NAVY = "#16324F";
const RED = "#DC2626";
const RED_INK = "#B91C1C";
const ORANGE = "#F59E0B";
const ORANGE_INK = "#B45309";
const GREEN = "#16A34A";
const TEXT = "#1A2433";
const SUBTLE = "#64748B";
const SLATE = "#F1F5F9";
const WHITE = "#FFFFFF";
const BORDER = "#E2E8F0";

// Map-only hues.
const NEUTRAL = "#94A3B8";      // unassessed / resolved / fallback
const AREA_BLUE = "#1D4ED8";    // Administrator-recorded affected areas
const AREA_BLUE_FILL = "#3B82F6";
const GEO_BLUE = "#1A73E8";     // "My Location" dot and accuracy circle
const HIGH_PRIORITY = "#EA580C";
const INCIDENT_CRITICAL = "#7F1D1D"; // darker than High so Critical reads as worse
const INCIDENT_MEDIUM = "#D97706";   // white "!" glyph stays legible (3.2:1)
// GIS map — designated flood-prone Puroks (red) vs Puroks not currently designated (neutral).
const FLOOD_ZONE_FILL = "#EF4444";

export const MAP_COLORS = {
  boundary: NAVY,
  hazard: RED,
  hazardText: RED_INK,
  area: AREA_BLUE,
  areaFill: AREA_BLUE_FILL,
  resolved: SUBTLE,
  resolvedFill: NEUTRAL,
  floodProne: ORANGE_INK,
  floodProneFill: ORANGE,
  householdOutline: TEXT,
  drawing: RED,
  white: WHITE,
  myLocation: GEO_BLUE,
  neutral: NEUTRAL,
  mutedText: SUBTLE,
};

// GIS map: Purok designation polygons. Red is reserved for the flood-prone
// designation; the neutral style is deliberately quiet so it never reads as "safe".
export const ZONE_STYLES = {
  flood_prone: { color: RED_INK, weight: 2, opacity: 1, fillColor: FLOOD_ZONE_FILL, fillOpacity: 0.35 },
  not_designated: { color: SUBTLE, weight: 1.5, opacity: 0.9, fillColor: NEUTRAL, fillOpacity: 0.14 },
};
export const GIS_MASK = { stroke: false, fillColor: SLATE, fillOpacity: 1, interactive: false };
export const GIS_BOUNDARY = { color: NAVY, weight: 3, opacity: 1, fill: false, interactive: false, className: "gis-boundary" };
export const GIS_ASSIGN_LINE = { color: NAVY, weight: 2, dashArray: "4 6", opacity: 0.8, interactive: false };

// Active barangay alert areas (Phase 33), mirrors --color-sev-*-line in tokens.css.
// A separate layer from the flood-prone designation: a dark casing under a
// severity-coloured outline, with a light tint. Dash pattern + label + icon
// carry the severity too, so colour is never the only cue.
export const ALERT_COLORS = { Advisory: "#EAB308", Warning: "#EA580C", Critical: RED };
const ALERT_DASH = { Advisory: "3 7", Warning: "12 6", Critical: null };

/** [casing, outline] path styles for one alert area. state: "normal" | "selected" | "dimmed". */
export function alertAreaStyles(severity, state = "normal") {
  const key = ALERT_COLORS[severity] ? severity : "Advisory";
  const color = ALERT_COLORS[key];
  const sel = state === "selected";
  const dim = state === "dimmed";
  return [
    { color: TEXT, weight: sel ? 9 : 7, opacity: dim ? 0.2 : 0.55, fill: false, lineCap: "round", lineJoin: "round", interactive: false },
    {
      color, weight: sel ? 5 : 3.5, opacity: dim ? 0.4 : 1, dashArray: ALERT_DASH[key], lineCap: "round", lineJoin: "round",
      fillColor: color, fillOpacity: sel ? 0.24 : dim ? 0.04 : 0.12, interactive: false,
    },
  ];
}

// Household priority level -> marker colour, lightest to most severe.
export const PRIORITY_COLORS = {
  "Low Priority": GREEN,
  "Moderate Priority": ORANGE,
  "High Priority": HIGH_PRIORITY,
  "Critical Priority": RED,
  "No report": NEUTRAL,
  "Not Assessed": NEUTRAL,
  "Needs Verification": NEUTRAL,
};

// Disaster incident severity -> square pin colour.
export const INCIDENT_COLORS = {
  Critical: INCIDENT_CRITICAL,
  High: RED,
  Medium: INCIDENT_MEDIUM,
  Low: SUBTLE,
};

// Eight distinct, readable categorical colours, one per standard Purok.
export const PUROK_COLORS = {
  "Purok 1": "#1F77B4",
  "Purok 2": "#E6730B",
  "Purok 3": "#2CA02C",
  "Purok 4": "#D62728",
  "Purok 5A": "#9467BD",
  "Purok 5B": "#8C564B",
  "Purok 6": "#D1499B",
  "Purok 7": "#0E9AA7",
};

// Repeating palette for non-standard Purok values in "colour by Purok" mode.
export const PUROK_PALETTE = [
  NAVY, HIGH_PRIORITY, GREEN, RED, "#7C5CBF",
  "#1F78B4", ORANGE_INK, "#C2185B", "#00897B", "#5D4037",
];

// Admin dashboard charts (Recharts also writes SVG attributes).
// Severity is status, not identity: red = Critical/High, navy = Medium/Low.
export const CHART_COLORS = {
  urgent: RED,
  other: NAVY,
  alert: ORANGE_INK,
  grid: BORDER,
  axis: SUBTLE,
  surface: WHITE,
  cursor: SLATE,
};
