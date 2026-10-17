import axios from "axios";

// Phase 19 — the API location comes from Vite environment configuration:
//   VITE_API_BASE_URL in frontend/.env.local (development) or
//   frontend/.env.production.local (production build for Hostinger).
// The fallback below is the original local XAMPP path, so an unconfigured
// local setup keeps working exactly as before. Only the API URL is configured
// here — database credentials and API keys live on the PHP side only.
const RAW_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost/barangay-disaster/backend/";
export const BASE_URL = RAW_BASE_URL.endsWith("/") ? RAW_BASE_URL : `${RAW_BASE_URL}/`;

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // send/receive PHP session cookie
  headers: {
    "Content-Type": "application/json",
  },
});

// Phase 19 — when the PHP session has expired (HTTP 401 on any endpoint other
// than login/session), tell the app so it returns the user to the login page
// instead of leaving a page full of errors. Login failures are not affected.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || "";
    if (error.response?.status === 401 && !url.startsWith("auth/")) {
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
    return Promise.reject(error);
  }
);

export default api;

// ---------------------------------------------------------------
// Auth
// ---------------------------------------------------------------
export const login = (data) => api.post("auth/login.php", data);
export const register = (data) => api.post("auth/register.php", data);
export const logout = () => api.post("auth/logout.php");
export const getSession = () => api.get("auth/session.php");

// ---------------------------------------------------------------
// Households
// ---------------------------------------------------------------
export const getHouseholds = (params = {}) => api.get("households/get_households.php", { params });
export const addHousehold = (data) => api.post("households/add_household.php", data);
export const updateHousehold = (data) => api.put("households/update_household.php", data);
// Phase 23: Admin + Relief Personnel set a household map location (validated against the boundary on the server).
// Phase 24: read-only review of stored Purok vs location inside the candidate Purok boundaries.
export const getPurokClassification = (params = {}) => api.get("households/purok_classification.php", { params });
export const updateHouseholdCoordinates = (household_id, latitude, longitude) =>
  api.post("households/update_coordinates.php", { household_id, latitude, longitude });
export const deleteHousehold = (household_id) =>
  api.delete("households/delete_household.php", { data: { household_id } });

// Household members
export const getHouseholdMembers = (household_id) =>
  api.get("households/members/get_members.php", { params: { household_id } });
export const addHouseholdMember = (data) => api.post("households/members/add_member.php", data);
export const updateHouseholdMember = (data) => api.put("households/members/update_member.php", data);
export const verifyHouseholdRoster = (household_id) => api.post("households/members/verify_roster.php", { household_id, confirm_complete: true });
export const deleteHouseholdMember = (member_id) =>
  api.delete("households/members/delete_member.php", { data: { member_id } });

// ---------------------------------------------------------------
// Disaster reports
// ---------------------------------------------------------------
export const getReports = (params = {}) => api.get("disasters/get_reports.php", { params });
// Phase 21: reports are recorded by authorized personnel for a household (data.household_id).
export const createReport = (data) => api.post("disasters/create_report.php", data);
export const updateReport = (data) => api.post("disasters/update_report.php", data);
export const verifyReport = (report_id, remarks = "") => api.post("disasters/verify_report.php", { report_id, remarks });
export const rejectReport = (report_id, remarks = "") => api.post("disasters/reject_report.php", { report_id, remarks });

// Report photos
export const getReportPhotos = (report_id) => api.get("disasters/get_report_photos.php", { params: { report_id } });
export const uploadReportPhotos = (report_id, files) => {
  const formData = new FormData();
  formData.append("report_id", report_id);
  Array.from(files).forEach((file) => formData.append("photos[]", file));
  // Let the browser set the multipart Content-Type (with the correct boundary) itself —
  // overriding it manually breaks the upload.
  return api.post("disasters/upload_photos.php", formData, {
    headers: { "Content-Type": undefined },
  });
};
export const deleteReportPhoto = (photo_id) => api.delete("disasters/delete_photo.php", { data: { photo_id } });
export const reportPhotoUrl = (file_path) => `${BASE_URL}disasters/view_photo.php?path=${encodeURIComponent(file_path)}`;

// Damage assessment
export const getDamageAssessment = (report_id) => api.get("disasters/get_damage_assessment.php", { params: { report_id } });
export const saveDamageAssessment = (data) => api.post("disasters/save_damage_assessment.php", data);

// Household visits are assigned by an administrator and assessed by that officer.
export const getHouseholdAssessments = (params = {}) => api.get("disasters/list_household_assessments.php", { params });
export const assignHouseholdAssessment = (data) => api.post("disasters/assign_household_assessment.php", data);
export const submitHouseholdAssessment = (data) => api.post("disasters/submit_household_assessment.php", data);
export const getHouseholdAssessmentPhotos = (household_id) => api.get("disasters/household_assessment_photos.php", { params: { household_id } });
export const householdAssessmentPhotoUrl = (photo_id) => `${BASE_URL}disasters/download_household_assessment_photo.php?id=${encodeURIComponent(photo_id)}`;
export const uploadHouseholdAssessmentPhoto = (household_id, photo) => {
  const data = new FormData();
  data.append("household_id", household_id);
  data.append("photo", photo);
  return api.post("disasters/household_assessment_photos.php", data, { headers: { "Content-Type": undefined } });
};

// ---------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------
export const getItems = () => api.get("inventory/get_items.php");
export const addItem = (data) => api.post("inventory/add_item.php", data);
export const updateItem = (data) => api.put("inventory/update_item.php", data);
export const deleteItem = (item_id) => api.delete("inventory/delete_item.php", { data: { item_id } });
export const stockIn = (data) => api.post("inventory/stock_in.php", data);
export const stockOut = (data) => api.post("inventory/stock_out.php", data);
export const adjustQuantity = (data) => api.post("inventory/adjust_quantity.php", data);
export const getInventoryLogs = (params = {}) => api.get("inventory/get_logs.php", { params });

// ---------------------------------------------------------------
// Relief allocation
// ---------------------------------------------------------------
// Historical per-item allocations (read-only; the workflow functions are at the end of this file).
export const getLegacyAllocations = () => api.get("relief/get_allocations.php");

// ---------------------------------------------------------------
// SMS Notifications (Phase 10) — httpSMS, disabled until configured
// ---------------------------------------------------------------
export const sendSms = (data) => api.post("sms/send.php", data);
export const getSmsLogs = (params = {}) => api.get("sms/get_logs.php", { params });

// ---------------------------------------------------------------
// Audit & Security (Phase 13)
// ---------------------------------------------------------------
export const getAuditLogs = (params = {}) => api.get("audit/get_logs.php", { params });
export const getLoginHistory = (params = {}) => api.get("audit/get_login_history.php", { params });
export const getInventoryReconciliation = () => api.get("reports/inventory_reconciliation.php");

// ---------------------------------------------------------------
// Dashboard / decision support
// ---------------------------------------------------------------
export const getStatistics = () => api.get("dashboard/statistics.php");
// Admin dashboard: figures scoped by { range, purok, event_id }.
export const getDashboardOverview = (params = {}) => api.get("dashboard/overview.php", { params });
export const getPriorityList = () => api.get("dashboard/priority_list.php");
export const getReliefRecommendations = (mode = "full_need") => api.get("dashboard/relief_recommendations.php", { params: { mode } });

// ---------------------------------------------------------------
// Hazard Monitoring (Phase 4) — manual entry by default; API-ready
// ---------------------------------------------------------------

export const getHazardAlerts = (params = {}) => api.get("hazards/alerts/get_alerts.php", { params });
export const addHazardAlert = (data) => api.post("hazards/alerts/add_alert.php", data);
export const updateHazardStatus = (alert_id, status) => api.post("hazards/alerts/update_status.php", { alert_id, status });
export const resolveHazardAlert = (alert_id) => api.post("hazards/alerts/update_status.php", { alert_id, resolve: true });
export const deleteHazardAlert = (alert_id) => api.delete("hazards/alerts/delete_alert.php", { data: { alert_id } });

export const getPublicHazardStatus = () => api.get("hazards/get_public_status.php");

// Barangay alerts (Phase 33): Draft -> Active -> Inactive. Public read; every change is admin-only on the server.
export const getActiveAlerts = (config = {}) => api.get("hazards/alerts/get_active_alerts.php", config);
export const createAlert = (data) => api.post("hazards/alerts/save_alert.php", data);
export const updateAlert = (data) => api.put("hazards/alerts/save_alert.php", data);
export const activateAlert = (alert_id) => api.post("hazards/alerts/activate.php", { alert_id });
export const deactivateAlert = (alert_id, resolution_note) => api.post("hazards/alerts/deactivate.php", { alert_id, resolution_note });
export const getAlertHistory = (alert_id) => api.get("hazards/alerts/get_alert_history.php", { params: { alert_id } });
export const deleteAlertDraft = (alert_id) => api.post("hazards/alerts/delete_alert.php", { alert_id });

// ---------------------------------------------------------------
// Users (admin)
// ---------------------------------------------------------------
export const getUsers = (params = {}) => api.get("users/get_users.php", { params });
export const getUser = (user_id) => api.get("users/get_user.php", { params: { user_id } });
export const reviewRegistration = (user_id, decision, version) => api.post("users/review_registration.php", { user_id, decision, version });
export const addUser = (data) => api.post("users/add_user.php", data);
export const updateUser = (data) => api.put("users/update_user.php", data);
export const deleteUser = (user_id) => api.delete("users/delete_user.php", { data: { user_id } });
export const toggleUserStatus = (user_id, is_active, version) =>
  api.post("users/toggle_status.php", { user_id, is_active, ...(version ? { version } : {}) });
export const exportUsers = (params) => api.get("users/get_users.php", {
  params: { ...params, managed: 1, export: "csv" }, responseType: "blob",
});

// ---------------------------------------------------------------
// Household <-> Resident linking
// ---------------------------------------------------------------
export const linkHouseholdResident = (household_id, user_id) =>
  api.post("households/link_resident.php", { household_id, user_id });

// ---------------------------------------------------------------
// My Profile (Phase 14) — any logged-in user, own account only
// ---------------------------------------------------------------
export const getMyProfile = () => api.get("users/get_my_profile.php");
export const updateMyProfile = (data) => api.put("users/update_my_profile.php", data);
export const changeMyPassword = (data) => api.post("users/change_my_password.php", data);

// ---------------------------------------------------------------
// System Settings (Phase 14)
// ---------------------------------------------------------------
export const getSystemSettings = () => api.get("settings/get_settings.php");
export const updateSystemSettings = (data) => api.post("settings/update_settings.php", data);

// Inventory Settings — categories (Phase 14)
export const getInventoryCategories = (params = {}) => api.get("settings/categories/get_categories.php", { params });
export const addInventoryCategory = (data) => api.post("settings/categories/add_category.php", data);
export const updateInventoryCategory = (data) => api.put("settings/categories/update_category.php", data);
export const deleteInventoryCategory = (category_id) =>
  api.delete("settings/categories/delete_category.php", { data: { category_id } });

// Disaster Settings — disaster types (Phase 14)
export const getDisasterTypes = (params = {}) => api.get("settings/disaster_types/get_types.php", { params });
export const addDisasterType = (data) => api.post("settings/disaster_types/add_type.php", data);
export const updateDisasterType = (data) => api.put("settings/disaster_types/update_type.php", data);
export const deleteDisasterType = (type_id) =>
  api.delete("settings/disaster_types/delete_type.php", { data: { type_id } });

// ---------------------------------------------------------------
// Phase 19 — Purok list and Purok Cleanup (admin)
// ---------------------------------------------------------------
export const getPuroks = () => api.get("settings/get_puroks.php");
export const getPurokValues = () => api.get("maintenance/get_purok_values.php");
export const applyPurokMapping = (old_value, new_value) =>
  api.post("maintenance/apply_purok_mapping.php", { old_value, new_value });

// ---------------------------------------------------------------
// Phase 19 — In-app notifications (own notifications only)
// ---------------------------------------------------------------
export const getNotifications = (params = {}) => api.get("notifications/get_notifications.php", { params });
export const markNotificationRead = (notification_id) => api.post("notifications/mark_read.php", { notification_id });
export const markAllNotificationsRead = () => api.post("notifications/mark_read.php", { all: true });

// ---------------------------------------------------------------
// Phase 19 — Relief Requests
// ---------------------------------------------------------------
export const getReliefRequests = (params = {}) => api.get("requests/get_requests.php", { params });
export const getReliefRequestDetail = (request_id) => api.get("requests/get_request_detail.php", { params: { request_id } });
export const createReliefRequest = (data) => api.post("requests/create_request.php", data);
export const startRequestReview = (request_id) => api.post("requests/start_review.php", { request_id });
export const decideReliefRequest = (data) => api.post("requests/decide_request.php", data);

// ---------------------------------------------------------------
// Phase 19 — Relief Feedback
// ---------------------------------------------------------------

// ---------------------------------------------------------------
// Phase 19 — Evacuation Centers
// ---------------------------------------------------------------
export const getEvacuationCenters = (params = {}) => api.get("evacuation/get_centers.php", { params });
export const saveEvacuationCenter = (data) => api.post("evacuation/save_center.php", data);
export const updateEvacuationOccupancy = (data) => api.post("evacuation/update_occupancy.php", data);
export const setEvacuationStatus = (data) => api.post("evacuation/set_status.php", data);
export const deleteEvacuationCenter = (center_id) => api.delete("evacuation/delete_center.php", { data: { center_id } });
// Public (no login): open-center count and total capacity/occupancy only.
export const getPublicEvacuationSummary = () => api.get("evacuation/get_public_summary.php");
export const getEvacuationLogs =(center_id) => api.get("evacuation/get_center_logs.php", { params: { center_id } });

// ---------------------------------------------------------------
// Phase 20 — panel-requested automation
// ---------------------------------------------------------------
// Disaster events
export const getDisasterEvents = () => api.get("disasters/events/get_events.php");
export const saveDisasterEvent = (data) => api.post("disasters/events/save_event.php", data);
export const setDisasterEventStatus = (event_id, status) => api.post("disasters/events/set_event_status.php", { event_id, status });
// Administrator-recorded affected / flood areas + server-side point-in-polygon
export const getAffectedAreas = (params = {}) => api.get("hazards/areas/get_areas.php", { params });
export const saveAffectedArea = (data) => api.post("hazards/areas/save_area.php", data);
export const setAffectedAreaStatus = (area_id, status) => api.post("hazards/areas/set_area_status.php", { area_id, status });
export const deleteAffectedArea = (area_id) => api.post("hazards/areas/delete_area.php", { area_id });
export const getAffectedHouseholds = (params = {}) => api.get("hazards/areas/get_affected_households.php", { params });
// Automated disaster situation report
export const getSituationReport = (params = {}) => api.get("reports/situation_report.php", { params });
// SMS status (no secrets) and safe retry of one failed log entry
export const getSmsStatus = () => api.get("sms/status.php");
export const retrySms = (sms_id) => api.post("sms/retry.php", { sms_id });

// Relief allocation workflow: field visit → automatic Ready for Distribution → Relief Personnel completion.
// Points, totals and priorities always come from the server.
export const saveAssessmentDraft = (data) => api.post("allocations/assessment_draft.php", data);
export const submitAssessment = (data) => api.post("allocations/assessment_submit.php", data);
export const getReadyAllocations = (params = {}) => api.get("allocations/ready_list.php", { params });
export const getAllocation = (id) => api.get("allocations/get.php", { params: { id } });
export const getAllocations = (params = {}) => api.get("allocations/list.php", { params });
export const getAllocationHistory = (id) => api.get("allocations/history.php", { params: { id } });
// body: { completion_key, items: [{ allocation_item_id, released_qty }], recipient_name?, remarks?, proof_photo? }
export const completeAllocation = (allocation_id, body) => api.post("allocations/complete.php", { allocation_id, ...body });
export const reopenAllocation = (allocation_id, reason) => api.post("allocations/reopen.php", { allocation_id, reason });
export const cancelAllocation = (allocation_id, reason) => api.post("allocations/cancel.php", { allocation_id, reason });
export const adjustPlanned = (allocation_id, items, reason) => api.post("allocations/adjust_planned.php", { allocation_id, items, reason });
export const startAllocationRound = (household_id) => api.post("allocations/start_round.php", { household_id });
export const setStandardPackage = (package_id) => api.post("relief/packages/set_standard.php", { package_id });
// Relief packages (the standard package is planned for every Ready household) and the resident's own rounds.
export const getReliefPackages = () => api.get("relief/packages/get_packages.php");
export const createReliefPackage = (data) => api.post("relief/packages/add_package.php", data);
export const getMyAllocations = () => api.get("allocations/mine.php");

