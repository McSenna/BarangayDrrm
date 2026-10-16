import { useEffect, useState } from "react";
import { getPuroks } from "../services/api.jsx";

// Fallback = the same standard list the backend enforces (backend/lib/puroks.php).
const FALLBACK = ["Purok 1", "Purok 2", "Purok 3", "Purok 4", "Purok 5A", "Purok 5B", "Purok 6", "Purok 7"];
let cache = null;

/** Loads the standard purok list once per page load. */
export function usePuroks() {
  const [puroks, setPuroks] = useState(cache || FALLBACK);
  useEffect(() => {
    if (cache) return;
    getPuroks()
      .then((res) => {
        cache = res.data.data;
        setPuroks(cache);
      })
      .catch(() => {});
  }, []);
  return puroks;
}

/**
 * Standard Purok dropdown (Phase 19) — replaces free-text purok inputs.
 * If a record still holds an older non-standard value, it is shown as a
 * labelled "current value" option so the form does not silently change it.
 */
export default function PurokSelect({ name = "purok", value, onChange, required = false, allowEmpty = false, emptyLabel = "Select purok", id }) {
  const puroks = usePuroks();
  const isLegacy = value && !puroks.includes(value);
  return (
    <select id={id} name={name} value={value || ""} onChange={onChange} required={required}>
      {(allowEmpty || !value) && <option value="">{emptyLabel}</option>}
      {isLegacy && <option value={value}>{value} (old value — please choose a standard purok)</option>}
      {puroks.map((p) => (
        <option key={p} value={p}>{p}</option>
      ))}
    </select>
  );
}
