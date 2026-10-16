import { Link } from "react-router-dom";
import { CircleCheck, MapPin, Siren, TriangleAlert } from "lucide-react";
import CapacityBar from "../ui/CapacityBar.jsx";
import Skeleton from "../ui/Skeleton.jsx";
import StatusBadge from "../ui/StatusBadge.jsx";
import { hazardSeverity } from "../../utils/hazardSummary.js";
import { purokLabel } from "../../utils/purokLabel.js";

function timeAgo(value) {
  if (!value) return "";
  const then = new Date(String(value).replace(" ", "T"));
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (!Number.isFinite(mins)) return "";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

function RailCard({ title, to, linkLabel, className = "", children }) {
  return (
    <section className={`rail-card ${className}`} aria-label={title}>
      <div className="rail-head">
        <h3 className="rail-title">{title}</h3>
        {to && <Link to={to} className="rail-link">{linkLabel}</Link>}
      </div>
      {children}
    </section>
  );
}

const HAZARD_CLASS = { critical: "rail-hazard rail-hazard-critical", warning: "rail-hazard rail-hazard-warning", normal: "rail-hazard rail-hazard-normal" };

/** Barangay-wide hazard status. Hazard tape and a red/orange band only while alerts are active. */
export function HazardCard({ hazard }) {
  if (!hazard) {
    return (
      <RailCard title="Hazard status">
        <Skeleton height={44} />
      </RailCard>
    );
  }
  const severity = hazardSeverity(hazard.overall_status);
  const alerts = hazard.active_alerts || [];
  const Icon = severity === "critical" ? Siren : severity === "warning" ? TriangleAlert : CircleCheck;

  return (
    <section className={`rail-card ${HAZARD_CLASS[severity]}`} aria-label="Hazard status">
      {severity !== "normal" && <div className="hazard-tape" aria-hidden="true" />}
      <div className="rail-hazard-top">
        <span className="rail-hazard-tile" aria-hidden="true"><Icon size={20} strokeWidth={2.25} /></span>
        <h3 className="rail-hazard-level">
          <span className="sr-only">Barangay hazard status: </span>
          {severity === "normal" ? "Normal" : hazard.overall_status}
          {alerts.length > 0 && <span className="rail-hazard-count"> · {alerts.length} active {alerts.length === 1 ? "alert" : "alerts"}</span>}
        </h3>
      </div>
      {alerts.length > 0 ? (
        <ul className="rail-list" role="list">
          {alerts.map((a) => (
            <li key={a.alert_id} className="rail-alert">
              <span className="purok-tag">{a.affected_purok ? purokLabel(a.affected_purok) : "Barangay-wide"}</span>
              <span><strong>{a.hazard_type}</strong> — {a.title}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rail-note">No active hazard alerts.</p>
      )}
      <div className="rail-actions">
        {severity !== "normal" ? (
          <Link to="/admin/map" className={`btn btn-sm ${severity === "critical" ? "btn-danger" : "btn-primary"}`}>
            <MapPin aria-hidden="true" size={15} strokeWidth={2} /> Respond on map
          </Link>
        ) : null}
        <Link to="/admin/monitoring" className="rail-link">Hazard Monitoring</Link>
      </div>
    </section>
  );
}

export function EvacuationCard({ centers }) {
  const list = centers || [];
  const capacity = list.reduce((s, c) => s + c.capacity, 0);
  const occupancy = list.reduce((s, c) => s + c.current_occupancy, 0);
  return (
    <RailCard title="Evacuation centers" to="/admin/evacuation-centers" linkLabel="Manage">
      {!centers ? (
        <Skeleton height={60} />
      ) : list.length === 0 ? (
        <p className="rail-note">No evacuation center is open.</p>
      ) : (
        <>
          <p className="rail-figure">
            <strong>{Math.max(0, capacity - occupancy)}</strong> slots free
            <span className="rail-figure-sub"> · {occupancy} evacuees of {capacity}</span>
          </p>
          <ul className="rail-list" role="list">
            {list.map((c) => (
              <li key={c.center_id} className="rail-center">
                <span className="rail-center-row">
                  <span className="rail-center-name">{c.name}</span>
                  {c.status === "Full" ? <StatusBadge status="Full" /> : <span className="rail-center-count">{c.current_occupancy}/{c.capacity}</span>}
                </span>
                <CapacityBar available={c.capacity - c.current_occupancy} capacity={c.capacity} label={`${c.name}: slots available`} />
              </li>
            ))}
          </ul>
        </>
      )}
    </RailCard>
  );
}

export function StockCard({ stats }) {
  if (!stats) {
    return <RailCard title="Stock to watch"><Skeleton height={60} /></RailCard>;
  }
  const short = stats.workflow?.shortage_items || [];
  const shortNames = new Set(short.map((s) => s.item_name));
  const low = (stats.low_stock_list || []).filter((i) => !shortNames.has(i.item_name));
  const empty = short.length === 0 && low.length === 0;

  return (
    <RailCard title="Stock to watch" to="/admin/inventory" linkLabel="Inventory">
      {empty ? (
        <p className="rail-note rail-note-ok"><CircleCheck aria-hidden="true" size={16} strokeWidth={2.25} /> Every item is above its minimum level.</p>
      ) : (
        <ul className="rail-list" role="list">
          {short.slice(0, 4).map((s) => (
            <li key={`s-${s.item_name}`} className="rail-row">
              <span>{s.item_name}</span>
              <StatusBadge tone="critical">Short {s.shortage} {s.unit}</StatusBadge>
            </li>
          ))}
          {low.slice(0, Math.max(0, 5 - Math.min(4, short.length))).map((i) => (
            <li key={`l-${i.item_id}`} className="rail-row">
              <span>{i.item_name}</span>
              <StatusBadge tone="warning">{i.quantity} / min {i.minimum_level}</StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </RailCard>
  );
}

export function ActivityCard({ stats }) {
  const items = stats?.workflow?.recent_activity;
  return (
    <RailCard title="Recent activity" to="/admin/audit-logs" linkLabel="Audit log">
      {!items ? (
        <Skeleton height={80} />
      ) : items.length === 0 ? (
        <p className="rail-note">No recorded activity yet.</p>
      ) : (
        <ol className="rail-list rail-activity" role="list">
          {items.slice(0, 6).map((a, i) => (
            <li key={`${a.created_at}-${i}`}>
              <span className="rail-activity-text">{a.action}</span>
              <span className="rail-activity-meta">
                {a.full_name || "System"} · <time dateTime={String(a.created_at).replace(" ", "T")}>{timeAgo(a.created_at)}</time>
              </span>
            </li>
          ))}
        </ol>
      )}
    </RailCard>
  );
}
