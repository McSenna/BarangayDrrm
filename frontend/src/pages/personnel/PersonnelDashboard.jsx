import { useCallback, useState } from "react";
import HazardBanner from "../../components/HazardBanner.jsx";
import ModuleCard from "../../components/dashboard/ModuleCard.jsx";
import MetricRow from "../../components/ui/MetricRow.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import usePolling from "../../hooks/usePolling.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { getReports, getPriorityList, getReadyAllocations } from "../../services/api.jsx";

/**
 * Relief Personnel Dashboard (Phase 23) — the modules this role works in:
 * reporting (record incidents and field assessments), DSS (view priorities),
 * hazard monitoring and map, and relief allocation (ready / distribute).
 * Built from the same staff APIs the module pages use. Refreshes every 60 s.
 */
export default function PersonnelDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    const r = await Promise.allSettled([getReports(), getPriorityList(), getReadyAllocations()]);
    const v = (i) => (r[i].status === "fulfilled" ? r[i].value.data.data || [] : []);
    setData({ reports: v(0), priority: v(1), allocations: v(2) });
  }, []);
  usePolling(load, { interval: 60000 });

  if (!data) return <div className="loading-text">Loading dashboard…</div>;

  const reports = data.reports.filter((x) => x.status !== "Rejected");
  const pending = reports.filter((x) => x.status === "Pending").length;
  const criticalCount = reports.filter((x) => x.severity === "Critical").length;
  const highCount = reports.filter((x) => x.severity === "High").length;
  const review = data.priority.filter((x) => x.needs_review).length;
  const top = data.priority.filter((x) => x.score_complete).slice(0, 3);
  const ready = data.allocations.length; // the server returns only Ready allocations in this Purok

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.full_name.split(" ")[0]}`}
        description={`Assigned area: ${user.assigned_purok || "awaiting Purok assignment"}. Record incidents, monitor affected households, and complete Ready for Distribution allocations within your Purok.`}
      />

      <HazardBanner compact />

      <section className="dash-section" aria-labelledby="modules">
        <h2 id="modules" className="section-title">Modules</h2>
        <div className="module-grid">
          <ModuleCard
            id="rep" number={1} title="Automation of Reporting"
            action={{ to: "/personnel/reports", label: "Disaster Reports" }}
            secondary={{ to: "/personnel/reports/new", label: "+ Record report" }}
          >
            <MetricRow label="Incidents recorded" value={reports.length} />
            <MetricRow label="Pending verification" value={pending} alertWhen="pending" />
          </ModuleCard>

          <ModuleCard
            id="dss" number={2} title="DSS / Household Priorities"
            action={{ to: "/personnel/priority", label: "Priority Assessment" }}
          >
            <MetricRow label="Top priority" value={top[0] ? `${top[0].head_of_family} (${top[0].final_score}/100)` : "—"} />
            <MetricRow label="Needing manual review" value={review} alertWhen="pending" />
          </ModuleCard>

          <ModuleCard
            id="haz" number={3} title="Hazard Monitoring & Map"
            action={{ to: "/personnel/monitoring", label: "Hazard Monitoring" }}
            secondary={{ to: "/personnel/map", label: "Barangay Map" }}
          >
            <MetricRow
              label="Critical / High incidents"
              value={criticalCount + highCount}
              tone={criticalCount > 0 ? "critical" : highCount > 0 ? "pending" : "ok"}
            />
          </ModuleCard>

          <ModuleCard
            id="rel" number={4} title="Relief Allocation"
            action={{ to: "/personnel/assigned", label: "Ready for Distribution" }}
          >
            <MetricRow label="Ready for distribution" value={ready} alertWhen="pending" />
          </ModuleCard>
        </div>
      </section>
    </>
  );
}
