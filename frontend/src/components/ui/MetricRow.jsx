import StatValue, { deriveTone } from "./StatValue.jsx";

/**
 * One label/value row inside a <dl className="metric-list">.
 * The tone comes from the data via deriveTone(value, alertWhen); pass `tone`
 * only for non-numeric values such as "Disabled".
 */
export default function MetricRow({ label, value, alertWhen, tone }) {
  return (
    <div className="metric-row">
      <dt>{label}</dt>
      <dd><StatValue value={value} tone={tone || deriveTone(value, alertWhen)} /></dd>
    </div>
  );
}
