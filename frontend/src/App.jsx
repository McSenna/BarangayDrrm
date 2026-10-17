import { Routes, Route, Navigate } from "react-router-dom";

import Home from "./pages/Home.jsx";
import About from "./pages/About.jsx";
import Contact from "./pages/Contact.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";

import ProtectedRoute from "./components/ProtectedRoute.jsx";
import DashboardLayout from "./components/DashboardLayout.jsx";

import AdminDashboard from "./pages/admin/AdminDashboard.jsx";
import DisasterReports from "./pages/admin/DisasterReports.jsx";
import Inventory from "./pages/admin/Inventory.jsx";
import InventoryLogs from "./pages/admin/InventoryLogs.jsx";
import ReliefAllocation from "./pages/admin/ReliefAllocation.jsx";
import PriorityList from "./pages/admin/PriorityList.jsx";
import ReliefRecommendations from "./pages/admin/ReliefRecommendations.jsx";
import AdminUsers from "./pages/admin/AdminUsers.jsx";
import HazardAlerts from "./pages/admin/HazardAlerts.jsx";
import SendSMS from "./pages/admin/SendSMS.jsx";
import SmsLogs from "./pages/admin/SmsLogs.jsx";
import AuditLogs from "./pages/admin/AuditLogs.jsx";
import LoginHistory from "./pages/admin/LoginHistory.jsx";
import AdminBarangayMap from "./pages/admin/BarangayMapPage.jsx";
import AdminMyProfile from "./pages/admin/MyProfile.jsx";
import SystemSettings from "./pages/admin/SystemSettings.jsx";
import InventorySettings from "./pages/admin/InventorySettings.jsx";
import DisasterSettings from "./pages/admin/DisasterSettings.jsx";
import PurokCleanup from "./pages/admin/PurokCleanup.jsx";
import AdminReliefRequests from "./pages/admin/ReliefRequests.jsx";
import ReliefRequestReview from "./pages/admin/ReliefRequestReview.jsx";
import AdminEvacuationCenters from "./pages/admin/EvacuationCenters.jsx";
// Phase 20 — panel-requested automation
import DisasterEvents from "./pages/admin/DisasterEvents.jsx";
import AffectedAreas from "./pages/admin/AffectedAreas.jsx";
import SituationReport from "./pages/admin/reports/SituationReport.jsx";
import Notifications from "./pages/shared/Notifications.jsx";

import ResidentDashboard from "./pages/resident/ResidentDashboard.jsx";
import HouseholdProfile from "./pages/resident/HouseholdProfile.jsx";
import ReliefStatus from "./pages/resident/ReliefStatus.jsx";
import RecordDisasterReport from "./pages/shared/RecordDisasterReport.jsx";
import HazardMonitoring from "./pages/shared/HazardMonitoring.jsx";
import PaperAssessmentForm from "./pages/shared/PaperAssessmentForm.jsx";
import ResidentMyProfile from "./pages/resident/MyProfile.jsx";

import PersonnelDashboard from "./pages/personnel/PersonnelDashboard.jsx";
import AssignedRelief from "./pages/personnel/AssignedRelief.jsx";
import PersonnelBarangayMap from "./pages/personnel/BarangayMapPage.jsx";
import PersonnelMyProfile from "./pages/personnel/MyProfile.jsx";
import LoginDialog from "./features/auth/LoginDialog.jsx";

export default function App() {
  return (
    <>
    <Routes>
      {/* Public pages */}
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Admin */}
      <Route path="/admin" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><AdminDashboard /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/households" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <Navigate to="/admin/administrators?tab=households" replace />
        </ProtectedRoute>
      } />
      <Route path="/admin/reports" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><DisasterReports /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/inventory" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><Inventory /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/inventory/logs" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><InventoryLogs /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/allocations" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><ReliefAllocation /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/priority" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><PriorityList /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/personnel/priority" element={
        <ProtectedRoute allowedRoles={["relief_personnel"]}>
          <DashboardLayout><PriorityList /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/recommendations" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><ReliefRecommendations /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/administrators" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><AdminUsers /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/residents" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <Navigate to="/admin/administrators?tab=residents" replace />
        </ProtectedRoute>
      } />
      <Route path="/admin/personnel" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <Navigate to="/admin/administrators?tab=personnel" replace />
        </ProtectedRoute>
      } />
      <Route path="/admin/disaster-events" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><DisasterEvents /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/affected-areas" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><AffectedAreas /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/analytics/situation-report" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><SituationReport /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/hazard-alerts" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><HazardAlerts /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/send-sms" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><SendSMS /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/sms-logs" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><SmsLogs /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/audit-logs" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><AuditLogs /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/login-history" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><LoginHistory /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/map" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><AdminBarangayMap /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/my-profile" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><AdminMyProfile /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/system-settings" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><SystemSettings /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/inventory-settings" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><InventorySettings /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/disaster-settings" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><DisasterSettings /></DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/admin/purok-cleanup" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><PurokCleanup /></DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/admin/relief-requests" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><AdminReliefRequests /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/admin/relief-requests/:requestId" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><ReliefRequestReview /></DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/admin/evacuation-centers" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><AdminEvacuationCenters /></DashboardLayout>
        </ProtectedRoute>
      } />

      {/* Resident */}
      <Route path="/resident" element={
        <ProtectedRoute allowedRoles={["resident"]}>
          <DashboardLayout><ResidentDashboard /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/resident/household" element={
        <ProtectedRoute allowedRoles={["resident"]}>
          <DashboardLayout><HouseholdProfile /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/resident/relief-status" element={
        <ProtectedRoute allowedRoles={["resident"]}>
          <DashboardLayout><ReliefStatus /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/resident/my-profile" element={
        <ProtectedRoute allowedRoles={["resident"]}>
          <DashboardLayout><ResidentMyProfile /></DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/resident/notifications" element={
        <ProtectedRoute allowedRoles={["resident"]}>
          <DashboardLayout><Notifications /></DashboardLayout>
        </ProtectedRoute>
      } />

      {/* Phase 21: retired resident pages (residents no longer submit reports,
          relief requests or feedback) redirect to the resident dashboard. */}
      {["/resident/submit-report", "/resident/my-reports", "/resident/relief-requests", "/resident/feedback",
        "/resident/weather-hazards", "/resident/evacuation-centers"].map((p) => (
        <Route key={p} path={p} element={<Navigate to="/resident" replace />} />
      ))}

      {/* Phase 21: disaster reports for Relief Personnel + Record Disaster Report (admin and personnel) */}
      <Route path="/admin/reports/new" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><RecordDisasterReport /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/personnel/reports" element={
        <ProtectedRoute allowedRoles={["relief_personnel"]}>
          <DashboardLayout><DisasterReports /></DashboardLayout>
        </ProtectedRoute>
      } />
      {/* Phase 25: printable paper assessment form (manual fallback during outages) */}
      <Route path="/admin/assessment-form" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><PaperAssessmentForm /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/personnel/assessment-form" element={
        <ProtectedRoute allowedRoles={["relief_personnel"]}>
          <DashboardLayout><PaperAssessmentForm /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/personnel/reports/new" element={
        <ProtectedRoute allowedRoles={["relief_personnel"]}>
          <DashboardLayout><RecordDisasterReport /></DashboardLayout>
        </ProtectedRoute>
      } />


      {/* Phase 23: pages removed or merged into the six core modules redirect to the module that now holds the function. */}
      {[
        ["/admin/household-stats", "/admin"],
        ["/admin/weather", "/admin/hazard-alerts"],
        ["/admin/inventory/low-stock", "/admin/inventory?filter=low"],
        ["/admin/inventory/donations", "/admin/inventory"],
        ["/admin/packages", "/admin/allocations"],
        ["/admin/schedules", "/admin/allocations"],
        ["/admin/schedules/new", "/admin/allocations"],
        ["/admin/schedules/:scheduleId", "/admin/allocations"],
        ["/admin/analytics", "/admin/analytics/situation-report"],
        ["/admin/analytics/disasters", "/admin/analytics/situation-report"],
        ["/admin/analytics/households", "/admin/analytics/situation-report"],
        ["/admin/analytics/inventory", "/admin/analytics/situation-report"],
        ["/admin/analytics/relief", "/admin/analytics/situation-report"],
        ["/admin/feedback", "/admin"],
        ["/personnel/beneficiaries", "/personnel/map"],
        ["/personnel/history", "/personnel/assigned?view=distributed"],
        ["/personnel/schedules", "/personnel/assigned"],
        ["/personnel/schedules/:scheduleId", "/personnel/assigned"],
        ["/personnel/beneficiary-verification", "/personnel/assigned"],
        ["/personnel/completed-deliveries", "/personnel/assigned"],
        ["/personnel/weather-hazards", "/personnel/monitoring"],
        ["/personnel/evacuation-centers", "/personnel/map"],
      ].map(([from, to]) => (
        <Route key={from} path={from} element={<Navigate to={to} replace />} />
      ))}

      {/* Phase 23: Hazard Monitoring (incidents, severity, affected households, active alerts) */}
      <Route path="/admin/monitoring" element={
        <ProtectedRoute allowedRoles={["admin"]}>
          <DashboardLayout><HazardMonitoring /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/personnel/monitoring" element={
        <ProtectedRoute allowedRoles={["relief_personnel"]}>
          <DashboardLayout><HazardMonitoring /></DashboardLayout>
        </ProtectedRoute>
      } />

      {/* Relief Personnel */}
      <Route path="/personnel" element={
        <ProtectedRoute allowedRoles={["relief_personnel"]}>
          <DashboardLayout><PersonnelDashboard /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/personnel/assigned" element={
        <ProtectedRoute allowedRoles={["relief_personnel"]}>
          <DashboardLayout><AssignedRelief /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/personnel/map" element={
        <ProtectedRoute allowedRoles={["relief_personnel"]}>
          <DashboardLayout><PersonnelBarangayMap /></DashboardLayout>
        </ProtectedRoute>
      } />
      <Route path="/personnel/my-profile" element={
        <ProtectedRoute allowedRoles={["relief_personnel"]}>
          <DashboardLayout><PersonnelMyProfile /></DashboardLayout>
        </ProtectedRoute>
      } />

      <Route path="/personnel/notifications" element={
        <ProtectedRoute allowedRoles={["relief_personnel"]}>
          <DashboardLayout><Notifications /></DashboardLayout>
        </ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    {/* Login dialog: opens over any page via openLogin(), ?login=1 or #login. */}
    <LoginDialog />
    </>
  );
}
