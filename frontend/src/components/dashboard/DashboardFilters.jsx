import { RotateCcw } from "lucide-react";

export const RANGE_OPTIONS = [
  { value: "7d", label: "7 days", long: "Last 7 days" },
  { value: "30d", label: "30 days", long: "Last 30 days" },
  { value: "90d", label: "90 days", long: "Last 90 days" },
  { value: "12m", label: "1 year", long: "Last 12 months" },
  { value: "all", label: "All", long: "All time" },
];
export const DEFAULT_FILTERS = { range: "30d", purok: "", event: "" };

/**
 * One row of filters above everything they scope: period (segmented radio
 * group), Purok and disaster event (native selects), and Reset when anything
 * differs from the default. Values live in the URL, so a filtered view can be
 * bookmarked or shared.
 */
export default function DashboardFilters({ filters, onChange, puroks = [], events = [] }) {
  const set = (key) => (value) => onChange({ ...filters, [key]: value });
  const isDefault = Object.keys(DEFAULT_FILTERS).every((k) => filters[k] === DEFAULT_FILTERS[k]);

  return (
    <div className="dash-filters" role="search" aria-label="Dashboard filters">
      <fieldset className="segmented">
        <legend className="sr-only">Period</legend>
        {RANGE_OPTIONS.map((o) => (
          <label key={o.value} className="segmented-option">
            <input
              type="radio"
              name="dash-range"
              value={o.value}
              checked={filters.range === o.value}
              onChange={() => set("range")(o.value)}
            />
            <span aria-hidden="true">{o.label}</span>
            <span className="sr-only">{o.long}</span>
          </label>
        ))}
      </fieldset>

      <label className="dash-select">
        <span className="sr-only">Purok</span>
        <select value={filters.purok} onChange={(e) => set("purok")(e.target.value)}>
          <option value="">All Puroks</option>
          {puroks.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>

      <label className="dash-select dash-select-wide">
        <span className="sr-only">Disaster event</span>
        <select value={filters.event} onChange={(e) => set("event")(e.target.value)}>
          <option value="">All disaster events</option>
          {events.map((ev) => (
            <option key={ev.event_id} value={String(ev.event_id)}>
              {ev.event_name}{ev.status === "Active" ? " (active)" : ""}
            </option>
          ))}
        </select>
      </label>

      {!isDefault && (
        <button type="button" className="btn btn-text dash-reset" onClick={() => onChange(DEFAULT_FILTERS)}>
          <RotateCcw aria-hidden="true" size={14} strokeWidth={2.25} />
          Reset filters
        </button>
      )}
    </div>
  );
}
