/**
 * Flood-prone Purok designation for the GIS map.
 *
 * Mirrors backend/lib/flood_zones.php (FLOOD_PRONE_PUROKS);
 * tests/purok_boundaries_js_test.mjs checks that the two lists agree.
 * The server decides each household's flood status from its location; this
 * file only styles the map and labels the statuses.
 *
 * Wording rule: Puroks 1–4 are DESIGNATED flood-prone by the barangay. That is
 * not an official hazard assessment or a severity measurement, and the other
 * Puroks are "not currently designated" — never "safe".
 */
import { STANDARD_PUROKS } from "../utils/purokBoundaries.js";
import { purokKey } from "../utils/purokLabel.js";

export const FLOOD_PRONE_PUROKS = ["Purok 1", "Purok 2", "Purok 3", "Purok 4"];

/** "flood_prone" | "not_designated" for a standard Purok (any spelling), else null. */
export function floodDesignation(purok) {
  const key = purokKey(purok);
  if (!STANDARD_PUROKS.includes(key)) return null;
  return FLOOD_PRONE_PUROKS.includes(key) ? "flood_prone" : "not_designated";
}

/**
 * Household flood status (from households/purok_classification.php).
 * `badge` is the StatusBadge tone; `heading` is the popup's status line.
 */
export const FLOOD_STATUS = {
  flood_prone: { label: "Flood-prone zone", heading: "Flood-prone zone", badge: "high" },
  not_designated: { label: "Not currently designated", heading: "Not currently designated", badge: "neutral" },
  unverified: { label: "Location unverified", heading: "Location unverified", badge: "warning" },
  unmapped: { label: "No map location", heading: "No map location", badge: "neutral" },
};

export const DESIGNATION_LABEL = {
  flood_prone: "Designated flood-prone",
  not_designated: "Not currently designated",
};

export const FLOOD_DESIGNATION_NOTE =
  "Puroks 1–4 are designated flood-prone in the barangay mapping system. This is a barangay designation, not an official flood-hazard assessment or a flood-severity measurement. “Not currently designated” does not mean safe from flooding.";
