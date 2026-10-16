/** Displays a stored purok value: "Purok 3" stays as is, older values like "3" become "Purok 3". */
export function purokLabel(value) {
  if (!value) return "";
  return /^purok/i.test(String(value).trim()) ? value : `Purok ${value}`;
}

/** Same comparison rule as the backend (lib/puroks.php purok_match_key): "3" and "Purok 3" are the same purok. */
export function purokKey(value) {
  const v = String(value ?? "").trim();
  const m = v.toUpperCase().replace(/^(PUROK|PRK\.?|P)\s*[-.#:]?\s*/, "").replace(/\s+/g, "");
  if (/^[1-7]$/.test(m) && m !== "5") return `Purok ${m}`;
  if (/^5[AB]$/.test(m)) return `Purok ${m}`;
  return v;
}
