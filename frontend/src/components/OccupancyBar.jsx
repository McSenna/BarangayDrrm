/** Occupancy of an evacuation center as "used / capacity" with a small bar (Phase 19). */
export default function OccupancyBar({ occupancy, capacity }) {
  const occ = Number(occupancy) || 0;
  const cap = Number(capacity) || 0;
  const pct = cap > 0 ? Math.min(100, Math.round((occ / cap) * 100)) : 0;
  const tone = pct >= 100 ? " full" : pct >= 80 ? " warn" : "";
  return (
    <div style={{ minWidth: 110 }}>
      <span style={{ fontSize: 13 }}>{occ} / {cap} ({pct}%)</span>
      <div className={`occupancy-bar${tone}`} role="img" aria-label={`${pct}% full`}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
