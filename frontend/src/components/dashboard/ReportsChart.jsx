import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_COLORS } from "../../theme/mapTokens.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-04" -> "Oct 4"; "2026-10" -> "Oct 2026". Parsed by hand so the date never shifts by timezone. */
export function bucketLabel(key, granularity) {
  const [y, m, d] = key.split("-").map(Number);
  if (granularity === "month") return `${MONTHS[m - 1]} ${y}`;
  return `${MONTHS[m - 1]} ${d}`;
}
const tickLabel = (key, granularity) => {
  const [y, m, d] = key.split("-").map(Number);
  return granularity === "month" ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : `${MONTHS[m - 1]} ${d}`;
};

function ChartTooltip({ active, payload, granularity, alertsByBucket }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  const alerts = alertsByBucket[b.key] || [];
  const prefix = granularity === "week" ? "Week of " : "";
  return (
    <div className="chart-tip">
      <p className="chart-tip-title">{prefix}{bucketLabel(b.key, granularity)}</p>
      <p className="chart-tip-row">
        <span className="chart-tip-key chart-tip-key-urgent" aria-hidden="true" />
        <strong>{b.urgent}</strong> Critical / High
        {b.urgent > 0 && <span className="chart-tip-sub">({b.Critical} critical, {b.High} high)</span>}
      </p>
      <p className="chart-tip-row">
        <span className="chart-tip-key chart-tip-key-other" aria-hidden="true" />
        <strong>{b.other}</strong> Medium / Low
      </p>
      {alerts.map((a) => (
        <p key={a.alert_id} className="chart-tip-alert">
          {a.status}: {a.title}
        </p>
      ))}
    </div>
  );
}

/**
 * Disaster reports per day / week / month, stacked by urgency, with a dashed
 * marker where a hazard alert was issued. A visually hidden table carries the
 * same numbers for screen readers.
 */
export default function ReportsChart({ series }) {
  const { granularity = "day", buckets = [], alerts = [] } = series || {};
  const data = buckets.map((b) => ({ ...b, urgent: b.Critical + b.High, other: b.Medium + b.Low }));
  const total = data.reduce((sum, b) => sum + b.urgent + b.other, 0);
  const alertsByBucket = alerts.reduce((acc, a) => {
    (acc[a.bucket] ||= []).push(a);
    return acc;
  }, {});
  const alertKeys = Object.keys(alertsByBucket);
  const unit = granularity === "day" ? "day" : granularity === "week" ? "week" : "month";

  return (
    <figure className="chart-figure">
      <ul className="chart-legend" aria-label="Legend">
        <li><span className="legend-swatch legend-urgent" aria-hidden="true" />Critical / High</li>
        <li><span className="legend-swatch legend-other" aria-hidden="true" />Medium / Low</li>
        <li><span className="legend-line" aria-hidden="true" />Hazard alert issued</li>
      </ul>
      <div className="chart-plot" aria-hidden="true">
        {total === 0 && (
          <p className="chart-empty">No disaster reports in this period{alertKeys.length ? ", but hazard alerts were issued" : ""}.</p>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 14, right: 8, bottom: 0, left: -18 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
            <XAxis
              dataKey="key"
              tickFormatter={(k) => tickLabel(k, granularity)}
              tick={{ fill: CHART_COLORS.axis, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: CHART_COLORS.grid }}
              minTickGap={18}
            />
            <YAxis allowDecimals={false} tick={{ fill: CHART_COLORS.axis, fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              cursor={{ fill: CHART_COLORS.cursor }}
              content={<ChartTooltip granularity={granularity} alertsByBucket={alertsByBucket} />}
              isAnimationActive={false}
            />
            <Bar dataKey="other" stackId="r" fill={CHART_COLORS.other} stroke={CHART_COLORS.surface} strokeWidth={1} maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="urgent" stackId="r" fill={CHART_COLORS.urgent} stroke={CHART_COLORS.surface} strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            {/* Drawn after the bars so an onset marker is never hidden behind that day's bar. */}
            {alertKeys.map((k) => (
              <ReferenceLine key={k} x={k} stroke={CHART_COLORS.alert} strokeDasharray="4 4" strokeWidth={2} ifOverflow="extendDomain" />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        {total} disaster reports in this period, counted per {unit}.
      </figcaption>
      <table className="sr-only">
        <caption>Disaster reports per {unit}</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">Critical / High</th><th scope="col">Medium / Low</th><th scope="col">Hazard alerts issued</th></tr></thead>
        <tbody>
          {data.filter((b) => b.urgent + b.other + b.alerts > 0).map((b) => (
            <tr key={b.key}>
              <th scope="row">{bucketLabel(b.key, granularity)}</th>
              <td>{b.urgent}</td><td>{b.other}</td><td>{b.alerts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
