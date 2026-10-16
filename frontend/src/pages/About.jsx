import SiteHeader from "../components/site/SiteHeader.jsx";
import SiteFooter from "../components/site/SiteFooter.jsx";

export default function About() {
  return (
    <div className="layout">
      <SiteHeader />
      <section id="main" tabIndex={-1} className="section">
        <h2>About the System</h2>
        <p style={{ color: "var(--color-ink-soft)", maxWidth: 680 }}>
          The Web-Based Post Disaster Monitoring and Relief Allocation with Decision
          Support System supports Barangay Binitayan, Daraga, Albay, in its post-disaster
          operations. It records disaster reports and damage assessments, maintains
          household and relief inventory information, and provides explainable priority
          assessments and relief recommendations. Final allocation decisions remain with
          authorized barangay personnel.
        </p>

        <div className="feature-grid" style={{ marginTop: 30 }}>
          <div className="feature-card">
            <h3 style={{ fontSize: 16 }}>For Residents</h3>
            <p style={{ margin: 0, color: "var(--color-ink-soft)", fontSize: 14 }}>
              View their own account and household information, check the status of relief
              allocated to the household, and receive SMS notifications when their relief is
              ready for distribution.
            </p>
          </div>
          <div className="feature-card">
            <h3 style={{ fontSize: 16 }}>For Administrators</h3>
            <p style={{ margin: 0, color: "var(--color-ink-soft)", fontSize: 14 }}>
              Manage resident accounts and household records, record and verify disaster
              reports, record damage assessments, maintain relief inventory, review relief
              recommendations, and approve relief allocations.
            </p>
          </div>
          <div className="feature-card">
            <h3 style={{ fontSize: 16 }}>For Relief Personnel</h3>
            <p style={{ margin: 0, color: "var(--color-ink-soft)", fontSize: 14 }}>
              Record disaster incidents and field assessments, view the map and approved relief
              allocations, mark relief as ready for distribution (the household is notified by SMS),
              and record relief distribution.
            </p>
          </div>
        </div>

        <h2 style={{ marginTop: 40 }}>How the Priority Score Works</h2>
        <p style={{ color: "var(--color-ink-soft)", maxWidth: 680 }}>
          The Decision Support System computes an explainable priority score for each
          household from recorded information: reported disaster severity, household size,
          vulnerable members (such as senior citizens, persons with disabilities, children,
          and pregnant members), disaster report status, damage assessment, active hazard
          alerts affecting the household's purok, and current relief status. Households
          with higher scores are listed first for Administrator review; the score supports,
          but does not replace, the barangay's allocation decisions.
        </p>
      </section>
      <SiteFooter />
    </div>
  );
}
