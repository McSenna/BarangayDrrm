/**
 * The user's LOCAL calendar date as YYYY-MM-DD.
 *
 * Use this for "today" (date defaults, date-picker limits, file names).
 * Do not use new Date().toISOString().slice(0, 10): that is the UTC date,
 * which in the Philippines (UTC+8) is still yesterday until 8:00 AM, while
 * the backend validates dates against Asia/Manila.
 */
export function localDateISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
