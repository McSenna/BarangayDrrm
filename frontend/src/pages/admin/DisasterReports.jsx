import { localDateISO } from "../../utils/dates.js";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { REPORT_NEEDS } from "../../config/reportNeeds.js";
import { useAutoRefresh } from "../../hooks/usePolling.js";
import { purokLabel } from "../../utils/purokLabel.js";
import DataTable from "../../components/DataTable.jsx";
import Modal from "../../components/Modal.jsx";
import { exportToCsv } from "../../utils/exportCsv.js";
import {
  getReports, verifyReport, rejectReport, getHouseholds, updateReport, uploadReportPhotos,
  getReportPhotos, deleteReportPhoto, reportPhotoUrl,
  getDamageAssessment, getDisasterTypes,
} from "../../services/api.jsx";

const SEVERITY_BADGE = { Low: "badge-low", Medium: "badge-medium", High: "badge-high", Critical: "badge-critical" };
const STATUS_BADGE = { Pending: "badge-pending", Verified: "badge-verified", Rejected: "badge-rejected" };
// Fallback filter list; the real list is fetched from System Settings > Disaster Settings (Phase 14).
const FALLBACK_DISASTER_TYPES = ["Flood", "Typhoon", "Landslide", "Earthquake", "Fire", "Other"];
const SEVERITY_LEVELS = ["Low", "Medium", "High", "Critical"];

/**
 * Disaster Reports — shared by the Administrator (/admin/reports) and Relief
 * Personnel (/personnel/reports) since Phase 21. Reports are recorded by
 * authorized personnel (Record Disaster Report); both roles can update the
 * details and add photos. Household visits use the separate assignment workflow. Verifying or
 * rejecting a report stays with the Administrator (also enforced server-side).
 */
export default function DisasterReports() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const base = isAdmin ? "/admin" : user?.role === "field_officer" ? "/field" : "/personnel";
  const [reports, setReports] = useState([]);
  const [households, setHouseholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [disasterTypes, setDisasterTypes] = useState(FALLBACK_DISASTER_TYPES);

  const [detailRow, setDetailRow] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [assessment, setAssessment] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [remarksModal, setRemarksModal] = useState(null); // { report, action: 'verify'|'reject' }
  const [remarksText, setRemarksText] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [editMsg, setEditMsg] = useState(null);
  const [newPhotos, setNewPhotos] = useState([]);
  const [photoMsg, setPhotoMsg] = useState(null);

  // filters
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [purokFilter, setPurokFilter] = useState("");
  const [searchParams] = useSearchParams();
  // Phase 22: "View reports" from the Priority Assessment opens this page filtered to one household.
  const [householdFilter, setHouseholdFilter] = useState(() => (/^\d+$/.test(searchParams.get("household_id") || "") ? searchParams.get("household_id") : ""));

  // Phase 19: load(true) refreshes silently (used by auto-refresh — no spinner, forms untouched).
  const load = (silent = false) => {
    if (silent !== true) setLoading(true);
    const params = {};
    if (statusFilter) params.status = statusFilter;
    if (typeFilter) params.disaster_type = typeFilter;
    if (purokFilter) params.purok = purokFilter;
    if (householdFilter) params.household_id = householdFilter;

    Promise.allSettled([getReports(params), getHouseholds()])
      .then(([r, h]) => {
        if (r.status === "fulfilled") setReports(r.value.data.data);
        if (h.status === "fulfilled") setHouseholds(h.value.data.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter, typeFilter, purokFilter, householdFilter]);
  useAutoRefresh(() => load(true), 45000);

  useEffect(() => {
    getDisasterTypes({ active_only: 0 }) // include inactive so old reports still filter correctly
      .then((res) => {
        const names = res.data.data.map((t) => t.type_name);
        if (names.length > 0) setDisasterTypes(names);
      })
      .catch(() => {}); // keep the fallback list on error
  }, []);

  const puroks = useMemo(() => {
    const set = new Set(households.map((h) => h.purok).filter(Boolean));
    return Array.from(set).sort();
  }, [households]);

  const resetFilters = () => {
    setStatusFilter(""); setTypeFilter(""); setPurokFilter(""); setHouseholdFilter("");
  };

  const handleExportCsv = () => {
    exportToCsv(
      `disaster-reports-${localDateISO()}.csv`,
      [
        { key: "reference_no", label: "Reference No." },
        { key: "head_of_family", label: "Household" },
        { key: "resident_name", label: "Recorded By" },
        { key: "purok", label: "Purok" },
        { key: "disaster_type", label: "Disaster Type" },
        { key: "location", label: "Location" },
        { key: "severity", label: "Severity" },
        { key: "status", label: "Status" },
        { key: "report_date", label: "Date" },
        { key: "report_time", label: "Time" },
        { key: "description", label: "Description" },
        { key: "reported_needs", label: "Immediate Needs" },
        { key: "latitude", label: "Latitude" },
        { key: "longitude", label: "Longitude" },
        { key: "created_at", label: "Encoded At" },
        { key: "collection_method", label: "Collection Method" },
        { key: "paper_form_no", label: "Paper Form No." },
        { key: "field_assessor", label: "Field Assessor" },
        { key: "displacement_status", label: "Displacement Status" },
        { key: "updated_at", label: "Last Updated" },
        { key: "verified_by_name", label: "Reviewed By" },
        { key: "verification_remarks", label: "Review Remarks" },
      ],
      reports
    );
  };

  const openDetail = async (row) => {
    setDetailRow(row);
    setEditForm(null);
    setEditMsg(null);
    setNewPhotos([]);
    setPhotoMsg(null);
    setDetailLoading(true);
    try {
      const [p, a] = await Promise.allSettled([getReportPhotos(row.report_id), getDamageAssessment(row.report_id)]);
      setPhotos(p.status === "fulfilled" ? p.value.data.data || [] : []);
      setAssessment(a.status === "fulfilled" ? a.value.data.data : null);
      if (p.status === "rejected") setPhotoMsg({ type: "error", text: "Report photos could not be loaded. Please reopen the report to try again." });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDeletePhoto = async (photo_id) => {
    if (!confirm("Delete this photo? This cannot be undone.")) return;
    try {
      await deleteReportPhoto(photo_id);
    } catch (err) {
      setPhotoMsg({ type: "error", text: err.response?.data?.message || "We couldn't delete this photo." });
    }
    const p = await getReportPhotos(detailRow.report_id);
    setPhotos(p.data.data);
  };

  const canDeletePhoto = (row) =>
    isAdmin || (row.status === "Pending" && Number(row.user_id) === Number(user?.user_id));

  const handleAddPhotos = async () => {
    if (newPhotos.length === 0) return;
    setPhotoMsg(null);
    try {
      const res = await uploadReportPhotos(detailRow.report_id, newPhotos);
      const errs = res.data.errors || [];
      setPhotoMsg(errs.length ? { type: "error", text: "Some photos could not be uploaded: " + errs.join(" ") } : { type: "success", text: "Photos added." });
      setNewPhotos([]);
      const p = await getReportPhotos(detailRow.report_id);
      setPhotos(p.data.data);
      load(true);
    } catch (err) {
      setPhotoMsg({ type: "error", text: err.response?.data?.message || "We couldn't upload the photos. Please try again." });
    }
  };

  const startEdit = () => {
    setEditMsg(null);
    setEditForm({
      disaster_type: detailRow.disaster_type, severity: detailRow.severity, location: detailRow.location || "",
      description: detailRow.description || "", report_date: detailRow.report_date,
      report_time: detailRow.report_time ? String(detailRow.report_time).slice(0, 5) : "",
      latitude: detailRow.latitude ?? "",
      longitude: detailRow.longitude ?? "",
      reported_needs: detailRow.reported_needs ? String(detailRow.reported_needs).split(",") : [],
    });
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    setEditMsg(null);
    try {
      const payload = { report_id: detailRow.report_id, ...editForm, reported_needs: editForm.reported_needs.join(",") };
      const res = await updateReport(payload);
      setEditMsg({ type: "success", text: res.data.message });
      setDetailRow({ ...detailRow, ...payload, report_time: editForm.report_time || null });
      setEditForm(null);
      load(true);
    } catch (err) {
      setEditMsg({ type: "error", text: err.response?.data?.message || "We couldn't update this report. Please try again." });
    }
  };

  const openRemarksModal = (report, action) => {
    setRemarksModal({ report, action });
    setRemarksText("");
  };

  const submitRemarks = async (e) => {
    e.preventDefault();
    const { report, action } = remarksModal;
    if (action === "verify") await verifyReport(report.report_id, remarksText);
    else await rejectReport(report.report_id, remarksText);
    setRemarksModal(null);
    setDetailRow(null);
    load();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Disaster Reports</h1>
          <p>{isAdmin
            ? "Record, verify and update disaster reports for registered households."
            : "Record disaster incidents for registered households. Assigned Field Officers complete household visit assessments."}</p>
        </div>
        <Link to={`${base}/reports/new`} className="btn btn-primary">+ Record Disaster Report</Link>
        <button className="btn btn-ghost" onClick={handleExportCsv}>Export CSV</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row filter-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="dr-status">Status</label>
            <select id="dr-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option>Pending</option>
              <option>Verified</option>
              <option>Rejected</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="dr-type">Disaster Type</label>
            <select id="dr-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All</option>
              {disasterTypes.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="dr-purok">Purok</label>
            <select id="dr-purok" value={purokFilter} onChange={(e) => setPurokFilter(e.target.value)}>
              <option value="">All</option>
              {puroks.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="dr-household">Household</label>
            <select id="dr-household" value={householdFilter} onChange={(e) => setHouseholdFilter(e.target.value)}>
              <option value="">All</option>
              {households.map((h) => <option key={h.household_id} value={h.household_id}>{h.head_of_family}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={resetFilters}>Reset Filters</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading reports…</div>
        ) : (
          <DataTable
            columns={[
              { key: "reference_no", label: "Reference", render: (r) => r.reference_no || `#${r.report_id}` },
              { key: "head_of_family", label: "Household", render: (r) => r.head_of_family || "—" },
              { key: "resident_name", label: "Recorded By" },
              { key: "purok", label: "Purok", render: (r) => r.purok || "—" },
              { key: "disaster_type", label: "Disaster Type" },
              { key: "location", label: "Location" },
              { key: "severity", label: "Reported Severity", render: (r) => <span className={`badge ${SEVERITY_BADGE[r.severity]}`}>{r.severity}</span> },
              { key: "photo_count", label: "Photos", render: (r) => r.photo_count > 0 ? `${r.photo_count}` : "—" },
              { key: "status", label: "Status", render: (r) => <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span> },
              { key: "report_date", label: "Date Reported" },
              { key: "actions", label: "Actions", render: (row) => (
                <button className="btn btn-ghost btn-sm" onClick={() => openDetail(row)}>View</button>
              )},
            ]}
            rows={reports}
            emptyText="No disaster reports match your filters."
          />
        )}
      </div>

      {detailRow && (
        <Modal title={`Disaster Report ${detailRow.reference_no || `#${detailRow.report_id}`}`} onClose={() => setDetailRow(null)}>
          {editMsg && <div className={`alert ${editMsg.type === "success" ? "alert-success" : "alert-error"}`}>{editMsg.text}</div>}
          <p><strong>Recorded by:</strong> {detailRow.resident_name}</p>
          <p><strong>Household:</strong> {detailRow.head_of_family ? `${detailRow.head_of_family} (${purokLabel(detailRow.purok)})` : "No household linked"}</p>
          <p><strong>Disaster Type:</strong> {detailRow.disaster_type}</p>
          <p><strong>Location:</strong> {detailRow.location}</p>
          <p><strong>Severity (as reported):</strong> <span className={`badge ${SEVERITY_BADGE[detailRow.severity]}`}>{detailRow.severity}</span></p>
          <p><strong>Date and Time:</strong> {detailRow.report_date} {detailRow.report_time || ""}</p>
          <p><strong>Description:</strong><br />{detailRow.description || "—"}</p>
          <p><strong>Immediate needs:</strong> {detailRow.reported_needs ? String(detailRow.reported_needs).split(",").join(", ") : "None recorded"}</p>
          <p><strong>Incident coordinates:</strong> {detailRow.latitude != null && detailRow.longitude != null ? `${detailRow.latitude}, ${detailRow.longitude}` : (detailRow.household_latitude != null ? `not recorded (household location ${detailRow.household_latitude}, ${detailRow.household_longitude})` : "not recorded")}</p>
          <p><strong>Collected by:</strong> {detailRow.collection_method || "not recorded"}
            {detailRow.paper_form_no ? ` · paper form ${detailRow.paper_form_no}` : ""}
            {detailRow.field_assessor ? ` · field assessor ${detailRow.field_assessor}` : ""}</p>
          <p><strong>Displacement:</strong> {detailRow.displacement_status || "not recorded"}</p>
          <p style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>
            Assessment date {detailRow.report_date} · encoded {detailRow.created_at} by {detailRow.resident_name}
            {detailRow.updated_at ? ` · last updated ${detailRow.updated_at}` : ""}
          </p>
          <p><strong>Status:</strong> <span className={`badge ${STATUS_BADGE[detailRow.status]}`}>{detailRow.status}</span></p>

          {detailRow.status !== "Pending" && (
            <div style={{ marginTop: 10, padding: 10, background: "var(--color-slate)", borderRadius: "var(--radius-control)" }}>
              <p style={{ margin: 0, fontSize: 13.5 }}>
                <strong>{detailRow.status} by:</strong> {detailRow.verified_by_name || "—"} on {detailRow.verified_at || "—"}
              </p>
              {detailRow.verification_remarks && (
                <p style={{ margin: "6px 0 0", fontSize: 13.5 }}>
                  <strong>Review Remarks:</strong> {detailRow.verification_remarks}
                </p>
              )}
            </div>
          )}

          {editForm ? (
            <form onSubmit={submitEdit} style={{ marginTop: 12, padding: 12, border: "1px solid var(--color-border)", borderRadius: 8 }}>
              <p style={{ fontWeight: 600, margin: "0 0 8px" }}>Update Report Details</p>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="dr-edit-type">Disaster Type</label>
                  <select id="dr-edit-type" value={editForm.disaster_type} onChange={(e) => setEditForm({ ...editForm, disaster_type: e.target.value })}>
                    {(disasterTypes.includes(editForm.disaster_type) ? disasterTypes : [editForm.disaster_type, ...disasterTypes]).map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Severity</label>
                  <select value={editForm.severity} onChange={(e) => setEditForm({ ...editForm, severity: e.target.value })}>
                    {SEVERITY_LEVELS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Location</label>
                <input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} required maxLength={255} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={editForm.report_date} max={localDateISO()} onChange={(e) => setEditForm({ ...editForm, report_date: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Time</label>
                  <input type="time" value={editForm.report_time} onChange={(e) => setEditForm({ ...editForm, report_time: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Immediate needs</label>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {REPORT_NEEDS.map((n) => (
                    <label key={n} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontWeight: 400 }}>
                      <input type="checkbox" style={{ width: 16, height: 16 }} checked={editForm.reported_needs.includes(n)}
                        onChange={(e) => setEditForm({ ...editForm, reported_needs: e.target.checked ? [...editForm.reported_needs, n] : editForm.reported_needs.filter((x) => x !== n) })} />
                      {n}
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Incident latitude</label>
                  <input inputMode="decimal" value={editForm.latitude} onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Incident longitude</label>
                  <input inputMode="decimal" value={editForm.longitude} onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })} />
                </div>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)", margin: "0 0 8px" }}>
                The verification status does not change. The old and new values are recorded in the audit log.
              </p>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditForm(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          ) : (
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={startEdit}>Update Details</button>
              {isAdmin && detailRow.status === "Pending" && (
                <>
                  <button className="btn btn-danger" onClick={() => openRemarksModal(detailRow, "reject")}>Reject</button>
                  <button className="btn btn-secondary" onClick={() => openRemarksModal(detailRow, "verify")}>Verify</button>
                </>
              )}
            </div>
          )}
          {!isAdmin && detailRow.status === "Pending" && (
            <p style={{ fontSize: 12.5, color: "var(--color-ink-soft)" }}>This report is waiting for verification by the Administrator.</p>
          )}

          {detailLoading ? (
            <div className="loading-text">Loading photos and damage assessment…</div>
          ) : (
            <>
              <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid var(--color-border)" }} />
              <p style={{ fontWeight: 600, marginBottom: 8 }}>Photos</p>
              {photos.length === 0 ? (
                <p style={{ fontSize: 13.5, color: "var(--color-ink-soft)" }}>No photos uploaded for this report.</p>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {photos.map((p) => (
                    <div key={p.photo_id} style={{ position: "relative" }}>
                      <a href={reportPhotoUrl(p.file_path)} target="_blank" rel="noreferrer">
                        <img
                          src={reportPhotoUrl(p.file_path)}
                          alt="Disaster report"
                          style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid var(--color-border)" }}
                        />
                      </a>
                      {canDeletePhoto(detailRow) && <button
                        onClick={() => handleDeletePhoto(p.photo_id)}
                        className="photo-delete"
                        aria-label="Delete photo"
                        title="Delete photo"
                      ><X aria-hidden="true" size={14} strokeWidth={2.75} /></button>}
                    </div>
                  ))}
                </div>
              )}

              <div className="form-group" style={{ marginTop: 10 }}>
                <label>Add photos (up to 5, 5 MB each)</label>
                <input type="file" accept="image/*" multiple onChange={(e) => setNewPhotos(Array.from(e.target.files).slice(0, 5))} />
                {newPhotos.length > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={handleAddPhotos}>
                    Upload {newPhotos.length} photo(s)
                  </button>
                )}
                {photoMsg && <p style={{ fontSize: 13, color: photoMsg.type === "success" ? "var(--color-success, green)" : "var(--color-danger, crimson)" }}>{photoMsg.text}</p>}
              </div>

              <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid var(--color-border)" }} />
              <h3>Household visit assessment</h3>
              <p>Household damage is recorded by the assigned Field Officer after an actual visit.</p>
              {detailRow.household_id && <p><Link className="btn btn-secondary" to={`${base === "/field" ? "/field/assignments" : `${base}/field-assessments`}?household_id=${detailRow.household_id}`}>{isAdmin ? "Assign or review household visit" : base === "/field" ? "Open my household assignment" : "View household assessment"}</Link></p>}
              {assessment && <div>
                <h4>Earlier report assessment (reference)</h4>
                <p>This historical record does not confirm a completed household visit.</p>
                <p>House: {assessment.house_damage || "—"} · Infrastructure: {assessment.infrastructure_damage || "—"} · Property: {assessment.property_damage || "—"} · Agricultural: {assessment.agricultural_damage || "—"}</p>
                <p style={{ whiteSpace: "pre-wrap" }}>{assessment.remarks || "No remarks recorded"}</p>
                {assessment.assessed_by_name && <p>Recorded by {assessment.assessed_by_name} on {assessment.assessed_at || "—"}</p>}
              </div>}
            </>
          )}
        </Modal>
      )}

      {remarksModal && (
        <Modal
          title={remarksModal.action === "verify" ? "Verify Disaster Report" : "Reject Disaster Report"}
          onClose={() => setRemarksModal(null)}
        >
          <form onSubmit={submitRemarks}>
            <div className="form-group">
              <label>{remarksModal.action === "reject" ? "Reason for Rejection (required)" : "Remarks (optional)"}</label>
              <textarea
                value={remarksText}
                onChange={(e) => setRemarksText(e.target.value)}
                placeholder={remarksModal.action === "verify" ? "e.g. Confirmed by barangay tanod on-site." : "e.g. Duplicate of an earlier report."}
                required={remarksModal.action === "reject"}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setRemarksModal(null)}>Cancel</button>
              <button type="submit" className={`btn ${remarksModal.action === "verify" ? "btn-secondary" : "btn-danger"}`}>
                {remarksModal.action === "verify" ? "Verify Report" : "Reject Report"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
