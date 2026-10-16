/**
 * Pure mapping helpers for the landing page data adapter (no React, no network),
 * so they can be unit-tested with plain Node: tests/landing_adapter_test.mjs.
 * Type definitions live in ./api.js.
 */
import { purokLabel } from "../../utils/purokLabel.js";

export const POLL_MS = 60_000;
export const STALE_AFTER_MS = 15 * 60_000;
export const WEATHER_MAX_AGE_HOURS = 24;

/** Stored alert status -> page alert level. */
export function toAlertLevel(status) {
  if (status === "Critical") return "critical";
  if (status === "Warning" || status === "Alert") return "warning";
  return "normal";
}

/** @returns {IncidentType} */
export function toIncidentType(hazardType = "") {
  const t = hazardType.toLowerCase();
  if (t.includes("flash")) return "flash_flood";
  if (t.includes("flood")) return "flood";
  if (t.includes("landslide") || t.includes("mudslide")) return "landslide";
  if (t.includes("fire")) return "fire";
  return "other";
}

const SEVERITY = { Critical: "critical", Warning: "high", Alert: "medium", Normal: "low" };

/** Text with one item per line -> trimmed, non-empty lines. */
export function splitLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** @returns {HazardStatus} */
export function mapHazardStatus(raw, settings) {
  const statusLabel = raw?.overall_status || "Normal";
  const level = toAlertLevel(statusLabel);
  const incidents = (raw?.active_alerts || []).map((a) => ({
    id: String(a.alert_id),
    purok: a.affected_purok ? purokLabel(a.affected_purok) : "Barangay-wide",
    purokRaw: a.affected_purok || null,
    type: toIncidentType(a.hazard_type),
    title: a.hazard_type || "Hazard",
    description: a.title || "",
    severity: SEVERITY[a.status] || "medium",
  }));
  const stepsKey = level === "critical" ? "public_advisory_steps"
    : level === "warning" ? "public_advisory_steps_warning"
    : "public_preparedness_tips";
  return { level, statusLabel, incidents, advisorySteps: splitLines(settings?.[stepsKey]) };
}

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/** @returns {WeatherNow|null} */
export function mapWeather(raw, now = new Date()) {
  if (!raw?.log_date) return null;
  const observedAt = `${raw.log_date}T${(raw.log_time || "00:00:00").slice(0, 8)}+08:00`;
  const ageMs = now.getTime() - new Date(observedAt).getTime();
  return {
    condition: raw.weather_condition || "—",
    tempC: num(raw.temperature),
    rainfallMm: num(raw.rainfall_mm),
    windKph: num(raw.wind_speed_kph),
    windDir: raw.wind_direction || "",
    observedAt,
    isRecent: ageMs >= 0 && ageMs <= WEATHER_MAX_AGE_HOURS * 3_600_000,
  };
}

/** @returns {EvacuationSummary} */
export function mapEvacuation(raw) {
  return {
    openCenters: Number(raw?.open_centers || 0),
    capacity: Number(raw?.capacity || 0),
    occupied: Number(raw?.occupied || 0),
  };
}

/** @returns {PublicConfig} */
export function mapPublicConfig(settings) {
  return {
    hotline: settings?.contact_phone || "",
    hallAddress: settings?.barangay_address || "",
    sealUrl: "/logo.png",
  };
}

/**
 * Evacuation availability tone from the share of free slots:
 * > 50% ok (green) · 20–50% pending (orange) · < 20% critical (red, "Nearly full").
 */
export function evacuationTone({ capacity, occupied }) {
  if (capacity <= 0) return { tone: "critical", freePct: 0, free: 0, nearlyFull: true };
  const free = Math.max(0, capacity - occupied);
  const freePct = (free / capacity) * 100;
  const tone = freePct > 50 ? "ok" : freePct >= 20 ? "pending" : "critical";
  return { tone, freePct, free, nearlyFull: tone === "critical" };
}

/** "tel:" href from a displayed number (spaces and dashes removed). */
export const telHref = (number) => `tel:${String(number || "").replace(/[^\d+]/g, "")}`;

/** "2 minutes ago" style text. */
export function relativeTime(date, now = new Date()) {
  if (!date) return "";
  const s = Math.round((date.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(s);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}
