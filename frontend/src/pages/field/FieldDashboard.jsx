import { Link } from "react-router-dom";
import HazardBanner from "../../components/HazardBanner.jsx";
import PageHeader from "../../components/ui/PageHeader.jsx";
import { useAuth } from "../../context/AuthContext.jsx";

export default function FieldDashboard() {
  const { user } = useAuth();
  return <>
    <PageHeader title="Field Officer Dashboard" description={`Assigned area: ${user?.assigned_purok || "awaiting Purok assignment"}. Record field observations and assessments for barangay review.`}
      actions={<Link className="btn btn-primary" to="/field/assignments">My Household Assignments</Link>} />
    <HazardBanner compact />
    <div className="card">
      <h2>Field work</h2>
      <p>Visit your assigned households, record findings and observed damage, and check the current hazards and map.</p>
      <div className="users-actions" style={{ marginTop: 16 }}>
        <Link className="btn btn-ghost" to="/field/reports">Disaster Reports</Link>
        <Link className="btn btn-ghost" to="/field/households">View Households</Link>
        <Link className="btn btn-ghost" to="/field/monitoring">Hazard Monitoring</Link>
        <Link className="btn btn-ghost" to="/field/map">Barangay Map</Link>
      </div>
    </div>
  </>;
}
