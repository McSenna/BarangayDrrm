/**
 * Simple, reusable table.
 * columns: [{ key, label, render?(row) }]
 * rowClassName?(row) — optional class per row (Phase 23: highlight critical incidents).
 */
export default function DataTable({ columns, rows, emptyText = "No records found.", rowClassName }) {
  if (!rows || rows.length === 0) {
    return <div className="empty-state">{emptyText}</div>;
  }

  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className={rowClassName ? rowClassName(row) || undefined : undefined}>
              {columns.map((col) => (
                <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
