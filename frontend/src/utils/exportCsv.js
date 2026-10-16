/**
 * Exports an array of row objects to a CSV file and triggers a browser download.
 *
 * @param {string} filename - e.g. "households-2026-09-05.csv"
 * @param {{ key: string, label: string }[]} columns - which fields to include, and their header text
 * @param {object[]} rows - the data
 */
export function exportToCsv(filename, columns, rows) {
  const escapeCell = (value) => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    // Quote any cell containing a comma, quote, or newline; double up internal quotes.
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCell(row[c.key])).join(","));
  const csvContent = [header, ...lines].join("\r\n");

  // Prepend a UTF-8 BOM so Excel opens special characters (e.g. ñ) correctly.
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
