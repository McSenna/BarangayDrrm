import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FileText,
  ListOrdered,
  Package,
  Plus,
  Send,
  Siren,
  Tent,
} from "lucide-react";
import HazardBanner from "../../components/HazardBanner.jsx";
import DashboardFilters, { DEFAULT_FILTERS, RANGE_OPTIONS } from "../../components/dashboard/DashboardFilters.jsx";
import KpiCard from "../../components/dashboard/KpiCard.jsx";
import { ActivityCard, EvacuationCard, HazardCard, StockCard } from "../../components/dashboard/LiveRail.jsx";
import PhaseTracker from "../../components/dashboard/PhaseTracker.jsx";
import PipelineChart from "../../components/dashboard/PipelineChart.jsx";
import ReportsChart, { bucketLabel } from "../../components/dashboard/ReportsChart.jsx";
import WorkQueue from "../../components/dashboard/WorkQueue.jsx";
import useSeenMarkers from "../../components/dashboard/useSeenMarkers.js";
import { Button, CapacityBar } from "../../components/ui/index.js";
import Skeleton from "../../components/ui/Skeleton.jsx";
import { useShellStatus } from "../../context/ShellStatusContext.jsx";
import usePolling from "../../hooks/usePolling.js";
import { getDashboardOverview } from "../../services/api.jsx";
import { deriveDrrmPhase } from "../../utils/drrmPhase.js";
import "../../components/dashboard/dashboard.css";

/** Filters live in the URL (?range=90d&purok=Purok+2&event=3), so a view can be bookmarked. */
function useDashboardFilters() {
  const [params, setParams] = useSearchParams();
  const filters = {
    range: RANGE_OPTIONS.some((o) => o.value === params.get("range")) ? params.get("range") : DEFAULT_FILTERS.range,
    purok: params.get("purok") || "",
    event: /^\d+$/.test(params.get("event") || "") ? params.get("event") : "",
  };
  const setFilters = (next) => {
    const p = {};
    if (next.range !== DEFAULT_FILTERS.range) p.range = next.range;
    if (next.purok) p.purok = next.purok;
    if (next.event) p.event = next.event;
    setParams(p, { replace: true });
  };
  return [filters, setFilters];
}

const filterKey = (f) => `${f.range}|${f.purok}|${f.event}`;

/**
 * Administrator Dashboard — a work queue with the live situation beside it.
 *
 *   header      title, DRRM phase, key actions (SMS, hazard alert, report)
 *   filters     period, Purok, disaster event — scope the cards, charts and queue
 *   cards       the four figures that need the Administrator
 *   main        tabbed work queue, reports chart, relief pipeline
 *   rail        hazard status, evacuation centers, stock, recent activity
 *               (barangay-wide, live; drops under the main column below 1280px)
 *
 * Filtered figures come from dashboard/overview.php; the rail reuses the shell's
 * 60 s statistics poll. Refreshes silently every 60 s.
 */
export default function AdminDashboard() {
  const [filters, setFilters] = useDashboardFilters();
  const [data, setData] = useState(null);
  const [loadedKey, setLoadedKey] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const { hazard, stats } = useShellStatus();

  const key = filterKey(filters);
  const load = useCallback(async () => {
    const [range, purok, event] = key.split("|");
    try {
      const res = await getDashboardOverview({ range, purok: purok || undefined, event_id: event || undefined });
      setData(res.data.data);
      setLoadedKey(key);
      setTick((t) => t + 1);
      setError("");
    } catch {
      setError("We couldn't load the dashboard. Check your connection; it will try again automatically.");
    }
  }, [key]);
  usePolling(load, { interval: 60000 });

  const markers = useSeenMarkers(data?.latest_ids || null);
  const phase = deriveDrrmPhase({ hazard, stats });
  const refetching = data && loadedKey !== key;

  const scope = useMemo(() => {
    if (!data) return "";
    const f = data.filters;
    const range = f.range === "all" ? "All time" : `${bucketLabel(f.from, "day")} – ${bucketLabel(f.to, "day")}`;
    const event = data.options.events.find((e) => e.event_id === f.event_id);
    return [range, f.purok || "All Puroks", event ? event.event_name : null].filter(Boolean).join(" · ");
  }, [data]);

  return (
    <div className="dash">
      <div className="page-header dash-header">
        <div className="page-header-text">
          <h1>Administrator Dashboard</h1>
          <p>Barangay Binitayan post-disaster monitoring. The Decision Support System recommends; the Administrator decides.</p>
          <PhaseTracker current={phase} />
        </div>
        <div className="dash-actions">
          <Button variant="ghost" to="/admin/send-sms" icon={Send}>Send SMS</Button>
          <Button variant="danger" to="/admin/hazard-alerts" icon={Siren}>Issue hazard alert</Button>
          <Button to="/admin/reports/new" icon={Plus}>Record disaster report</Button>
        </div>
      </div>

      <DashboardFilters
        filters={filters}
        onChange={setFilters}
        puroks={data?.options.puroks || []}
        events={data?.options.events || []}
      />
      <p className="dash-scope" aria-live="polite">
        {refetching ? "Updating…" : scope ? <>Showing <strong>{scope}</strong>. Priorities show each household's current state; evacuation and stock are barangay-wide.</> : " "}
      </p>

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="dash-banner-narrow">
        <HazardBanner compact refreshKey={tick} />
      </div>

      <div className={`dash-body${refetching ? " is-refetching" : ""}`} aria-busy={refetching || !data}>
        <Overview data={data} hazardActive={(hazard?.active_alerts || []).length > 0} />

        <div className="dash-grid">
          <div className="dash-main">
            {data ? <WorkQueue queue={data.queue} markers={markers} /> : <Skeleton height={360} radius={16} />}

            <div className="dash-charts">
              <section className="card chart-card" aria-labelledby="chart-reports">
                <div className="chart-head">
                  <h2 id="chart-reports" className="section-title">Disaster reports</h2>
                  <span className="chart-meta">{data ? `${data.reports.total} in period` : ""}</span>
                </div>
                {data ? <ReportsChart series={data.series} /> : <Skeleton height={232} />}
              </section>
              <section className="card chart-card" aria-labelledby="chart-relief">
                <div className="chart-head">
                  <h2 id="chart-relief" className="section-title">Relief pipeline</h2>
                  <span className="chart-meta">Allocations by stage</span>
                </div>
                {data ? <PipelineChart pipeline={data.pipeline} /> : <Skeleton height={232} />}
              </section>
            </div>

          </div>

          <aside className="dash-rail" aria-label="Live situation, barangay-wide">
            <div className="rail-hazard-wide"><HazardCard hazard={hazard} /></div>
            <EvacuationCard centers={data?.centers} />
            <StockCard stats={stats} />
            <ActivityCard stats={stats} />
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ---------- Overview cards ---------- */

function Overview({ data, hazardActive }) {
  if (!data) {
    return (
      <div className="kpi-grid dash-kpis" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={176} radius={16} />)}
      </div>
    );
  }
  const r = data.reports;
  const lv = data.priorities.levels;
  const crit = lv["Critical Priority"] || 0;
  const high = lv["High Priority"] || 0;
  const p = data.pipeline;
  const notReady = p.pending + p.approved;
  const capacity = data.centers.reduce((s, c) => s + c.capacity, 0);
  const free = Math.max(0, capacity - data.centers.reduce((s, c) => s + c.current_occupancy, 0));
  const freePct = capacity ? free / capacity : 0;
  const evacTone = capacity === 0 ? (hazardActive ? "critical" : "ok") : free === 0 ? "critical" : freePct <= 0.2 ? "pending" : "ok";

  return (
    <section className="dash-kpis" aria-label="Overview">
      <div className="kpi-grid">
        <KpiCard to="/admin/reports" icon={FileText} label="Reports to verify" value={r.pending} tone={r.pending ? "pending" : "ok"} linkLabel="disaster reports">
          <span className="kpi-sub">
            {r.pending_urgent ? `${r.pending_urgent} Critical or High severity · ` : ""}
            {r.without_assessment} verified without damage assessment
          </span>
        </KpiCard>
        <KpiCard
          to="/admin/priority"
          icon={ListOrdered}
          label="Critical / High priority households"
          value={crit + high}
          tone={crit ? "critical" : high ? "pending" : "ok"}
          linkLabel="priority assessment"
        >
          <span className="kpi-sub">
            {crit} critical · {high} high · {data.priorities.needs_review} need manual review
          </span>
        </KpiCard>
        <KpiCard to="/admin/allocations" icon={Package} label="Allocations not yet ready" value={notReady} tone={notReady ? "pending" : "ok"} linkLabel="relief allocations">
          <span className="kpi-sub">{p.pending} awaiting approval · {p.approved} approved · {p.ready} ready</span>
        </KpiCard>
        <KpiCard to="/admin/evacuation-centers" icon={Tent} label="Evacuation slots available" value={free} tone={evacTone} linkLabel="evacuation centers">
          <span className="kpi-capacity">
            <CapacityBar available={free} capacity={capacity} label="Evacuation slots available" />
            <span className="kpi-sub">{capacity ? `of ${capacity} in ${data.centers.length} open ${data.centers.length === 1 ? "center" : "centers"}` : "No evacuation center is open"}</span>
          </span>
        </KpiCard>
      </div>
    </section>
  );
}

