/**
 * Public landing page data adapter — the ONE place that maps backend
 * responses onto the landing page's data contracts. Components never read
 * raw API fields.
 *
 * Sources (all public, no login, no personal data):
 *   HazardStatus, WeatherNow   hazards/get_public_status.php
 *   EvacuationSummary          evacuation/get_public_summary.php (totals only)
 *   PublicConfig, advisories   settings/get_settings.php (via SettingsContext)
 *
 * Not provided on purpose: ReliefSummary. Stock counts are not published
 * publicly (decision 2026-10-16); the hero's relief card describes tracking
 * without numbers.
 */
import { useCallback, useEffect, useState } from "react";
import usePolling from "../../hooks/usePolling.js";
import { getPublicEvacuationSummary, getPublicHazardStatus } from "../../services/api.jsx";
import { useSettings } from "../../context/SettingsContext.jsx";
import { POLL_MS, STALE_AFTER_MS, mapHazardStatus, mapWeather, mapEvacuation, mapPublicConfig } from "./mappers.js";

/** @typedef {'normal' | 'warning' | 'critical'} AlertLevel */
/** @typedef {'flood' | 'flash_flood' | 'landslide' | 'fire' | 'other'} IncidentType */
/**
 * @typedef {Object} Incident
 * @property {string} id
 * @property {string} purok         "Purok 7", or "Barangay-wide"
 * @property {string|null} purokRaw  stored value, for map placement
 * @property {IncidentType} type
 * @property {string} title          hazard type, e.g. "Flood"
 * @property {string} description    one-line headline issued by the barangay
 * @property {'low'|'medium'|'high'|'critical'} severity
 */
/**
 * @typedef {Object} HazardStatus
 * @property {AlertLevel} level
 * @property {string} statusLabel    stored level: "Critical" | "Warning" | "Alert" | "Normal"
 * @property {Incident[]} incidents
 * @property {string[]} advisorySteps admin-edited "What to do now" (or preparedness tips when normal)
 */
/** @typedef {{ openCenters: number, capacity: number, occupied: number }} EvacuationSummary */
/**
 * @typedef {Object} WeatherNow
 * @property {string} condition
 * @property {number|null} tempC
 * @property {number|null} rainfallMm
 * @property {number|null} windKph
 * @property {string} windDir
 * @property {string} observedAt   ISO 8601 with +08:00
 * @property {boolean} isRecent    observed within WEATHER_MAX_AGE_HOURS
 */
/** @typedef {{ hotline: string, hallAddress: string, sealUrl: string }} PublicConfig */

export {
  POLL_MS, STALE_AFTER_MS, WEATHER_MAX_AGE_HOURS, toAlertLevel, toIncidentType, splitLines,
  mapHazardStatus, mapWeather, mapEvacuation, mapPublicConfig, evacuationTone, telHref, relativeTime,
} from "./mappers.js";

/** Re-renders every `ms` so relative times and staleness stay current. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/**
 * Live landing data, refreshed every 60 s (paused while the tab is hidden,
 * refreshed on return). A failed refresh keeps the last good data; `stale`
 * turns on once the last success is older than 15 minutes.
 */
export function useLandingData() {
  const { settings } = useSettings();
  const [raw, setRaw] = useState({ hazard: null, evacuation: null });
  const [lastUpdated, setLastUpdated] = useState(null);
  const [failed, setFailed] = useState(false);
  const now = useNow();

  const load = useCallback(async () => {
    const [h, e] = await Promise.allSettled([getPublicHazardStatus(), getPublicEvacuationSummary()]);
    if (h.status === "fulfilled") {
      setRaw((prev) => ({ ...prev, hazard: h.value.data.data }));
      setLastUpdated(new Date());
      setFailed(false);
    } else {
      setFailed(true);
    }
    if (e.status === "fulfilled") setRaw((prev) => ({ ...prev, evacuation: e.value.data.data }));
  }, []);
  const { refresh } = usePolling(load, { interval: POLL_MS });

  const hazard = raw.hazard ? mapHazardStatus(raw.hazard, settings) : null;
  return {
    hazard,
    weather: raw.hazard ? mapWeather(raw.hazard.latest_weather, now) : null,
    evacuation: raw.evacuation ? mapEvacuation(raw.evacuation) : null,
    config: mapPublicConfig(settings),
    loading: !raw.hazard && !failed,
    failed,
    lastUpdated,
    stale: Boolean(lastUpdated) && now.getTime() - lastUpdated.getTime() > STALE_AFTER_MS,
    now,
    refresh,
  };
}
