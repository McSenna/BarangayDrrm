import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import DataTable from '../../components/DataTable.jsx';
import Modal from '../../components/Modal.jsx';
import DamageClassificationPicker from '../../components/DamageClassificationPicker.jsx';
import { localDateISO } from '../../utils/dates.js';
import { purokLabel, purokKey } from '../../utils/purokLabel.js';
import {
  NOTE_DAMAGE_LEVELS, ASSESSMENT_STATUSES, ALLOCATION_STATUS_LABELS, ALLOCATION_STATUS_BADGE, assessmentStatusLabel, assessmentDamageLabel,
  canEditHouseholdAssessment, assessmentPayload, assessmentDraftPayload, assessmentFormFor, isLocked, damageLabel,
} from '../../utils/householdAssessment.js';
import api, {
  getHouseholdAssessments, assignHouseholdAssessment, saveAssessmentDraft, submitAssessment, getUsers,
  getHouseholdAssessmentPhotos, uploadHouseholdAssessmentPhoto, householdAssessmentPhotoUrl,
} from '../../services/api.jsx';

const errorMessage = (error, fallback) => error.response?.data?.message || error.message || fallback;

export default function HouseholdFieldAssessments() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isField = user?.role === 'field_officer';
  const base = isAdmin ? '/admin' : isField ? '/field' : '/personnel';
  const [params, setParams] = useSearchParams();
  const householdId = params.get('household_id');
  const [rows, setRows] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({});
  const [officerId, setOfficerId] = useState('');
  const [photos, setPhotos] = useState([]);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [files, setFiles] = useState([]);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [score, setScore] = useState(null);
  const [damagePoints, setDamagePoints] = useState({});
  const [confirming, setConfirming] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [result, users] = await Promise.all([
        getHouseholdAssessments(), isAdmin ? getUsers({ role: 'field_officer', status: 'active' }) : Promise.resolve(null),
      ]);
      setRows(result.data.data || []);
      if (users) setOfficers((users.data.data || []).filter((officer) => officer.role === 'field_officer' && Number(officer.is_active) === 1));
    } catch (err) { setError(errorMessage(err, 'Household assignments could not be loaded. Try again.')); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const accessibleRows = useMemo(() => isField
    ? rows.filter((row) => Number(row.assigned_field_officer_id) === Number(user?.user_id)) : rows, [rows, isField, user?.user_id]);
  useEffect(() => {
    const row = accessibleRows.find((entry) => String(entry.household_id) === householdId);
    setSelected(row || null);
    setForm(row ? assessmentFormFor(row) : {});
    setOfficerId(row?.assigned_field_officer_id ? String(row.assigned_field_officer_id) : '');
    setFiles([]);
    setFileKey((key) => key + 1);
    setConflict(false);
  }, [householdId, accessibleRows]);
  useEffect(() => {
    if (!selected) return;
    const heading = document.getElementById('visit-heading');
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: 'start' });
  }, [selected?.household_id]);

  useEffect(() => {
    setScore(null);
    if (!selected) return;
    let cancelled = false;
    api.get('dashboard/priority_list.php', { params: { household_id: selected.household_id } })
      .then((res) => { if (cancelled) return; setScore(res.data.data?.[0] || null); setDamagePoints(res.data.method?.damage_points || {}); })
      .catch(() => { if (!cancelled) setScore(null); });
    return () => { cancelled = true; };
  }, [selected?.household_id, selected?.version]);

  const refreshPhotos = async (id) => {
    setPhotoLoading(true);
    setPhotoError('');
    try { const result = await getHouseholdAssessmentPhotos(id); setPhotos(result.data.data || []); }
    catch (err) { setPhotoError(errorMessage(err, 'Photo evidence could not be loaded. Try again.')); }
    finally { setPhotoLoading(false); }
  };
  useEffect(() => {
    setPhotos([]);
    if (!selected) return;
    let cancelled = false;
    setPhotoLoading(true);
    setPhotoError('');
    getHouseholdAssessmentPhotos(selected.household_id)
      .then((res) => { if (!cancelled) setPhotos(res.data.data || []); })
      .catch((err) => { if (!cancelled) setPhotoError(errorMessage(err, 'Photo evidence could not be loaded. Try again.')); })
      .finally(() => { if (!cancelled) setPhotoLoading(false); });
    return () => { cancelled = true; };
  }, [selected?.household_id]);

  const filtered = accessibleRows.filter((row) => (!status || row.status === status)
    && `${row.head_of_family || ''} ${row.purok || ''} ${row.address || ''} ${row.assigned_field_officer_name || ''}`.toLowerCase().includes(search.toLowerCase()));
  const editable = canEditHouseholdAssessment(user, selected);
  const availableOfficers = officers.filter((officer) => purokKey(officer.assigned_purok) === purokKey(selected?.purok));
  const replaceRow = (row) => setRows((previous) => previous.map((entry) => Number(entry.household_id) === Number(row.household_id) ? { ...entry, ...row } : entry));
  const handleFailure = (err, fallback) => {
    setError(errorMessage(err, fallback));
    setConflict(err.response?.status === 409);
  };
  const assign = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await assignHouseholdAssessment({ household_id: selected.household_id, assigned_field_officer_id: Number(officerId), version: selected.version || 0 });
      replaceRow({ ...response.data.data, assigned_field_officer_name: officers.find((officer) => Number(officer.user_id) === Number(officerId))?.full_name || selected.assigned_field_officer_name });
      setNotice('Field Officer assigned. The household is awaiting an actual visit.');
    } catch (err) { handleFailure(err, 'The assignment could not be saved. Try again.'); }
    finally { setBusy(false); }
  };
  const saveDraft = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await saveAssessmentDraft(assessmentDraftPayload(selected, form));
      replaceRow({ ...response.data.data.assessment, allocation_status: response.data.data.allocation.status });
      setNotice('Draft saved. You can finish and submit the visit later.');
    } catch (err) { handleFailure(err, 'The draft could not be saved. Try again.'); }
    finally { setBusy(false); }
  };
  // Validate first, then ask for confirmation: a submitted visit is locked.
  const submit = (event) => {
    event.preventDefault();
    setError(''); setNotice('');
    try { assessmentPayload(selected, form); setConfirming(true); }
    catch (err) { setError(err.message); }
  };
  const confirmSubmit = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await submitAssessment(assessmentPayload(selected, form));
      const { assessment, allocation, promoted, reasons } = response.data.data;
      replaceRow({ ...assessment, allocation_status: allocation.status });
      setNotice(promoted
        ? 'Assessment submitted and locked. The household is now Ready for Distribution.'
        : `Assessment submitted and locked. The household is not Ready yet: ${reasons.join(' ')}`);
    } catch (err) { handleFailure(err, 'The assessment could not be submitted. Try again.'); }
    finally { setBusy(false); setConfirming(false); }
  };
  const upload = async () => {
    setBusy(true); setPhotoError(''); setNotice('');
    const failed = [];
    for (const file of files) {
      try { await uploadHouseholdAssessmentPhoto(selected.household_id, file); }
      catch (err) { failed.push(file); setPhotoError(errorMessage(err, 'Some photos could not be uploaded. Retry the remaining files.')); }
    }
    setFiles(failed);
    if (!failed.length) { setFileKey((key) => key + 1); setNotice('Photo evidence uploaded.'); }
    // Keep an upload error visible while refreshing successfully uploaded evidence.
    try { const response = await getHouseholdAssessmentPhotos(selected.household_id); setPhotos(response.data.data || []); }
    catch { setPhotoError('Evidence could not be refreshed. Reload photos to check the upload.'); }
    setBusy(false);
  };
  const change = (event) => setForm((previous) => ({ ...previous, [event.target.name]: event.target.value }));
  const selectHousehold = (id) => { setError(''); setNotice(''); setParams(id ? { household_id: String(id) } : {}); };

  return <>
    <div className="page-header">
      <div><h1>{isField ? 'For Assessment' : 'Household Field Assessments'}</h1>
        <p>{isAdmin ? 'Assign a Field Officer to visit each household and review their findings.' : isField ? 'Visit your assigned households and record what you observed.' : 'Review household visit findings and photo evidence.'}</p></div>
      <button className="btn btn-ghost" onClick={load} disabled={loading || busy}>Refresh assignments</button>
    </div>
    {error && <div className="alert alert-error" role="alert">{error}
      {conflict && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={load}>Reload latest details (discard unsaved changes)</button>}
    </div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}

    {selected ? <section className="card" aria-labelledby="visit-heading" style={{ marginBottom: 24 }}>
      <div className="page-header" style={{ marginBottom: 16 }}><div>
        <h2 id="visit-heading" tabIndex={-1} style={{ scrollMarginTop: 88 }}>{selected.head_of_family}</h2>
        <p>{purokLabel(selected.purok)} · {selected.address || 'Address not recorded'}</p>
      </div><button className="btn btn-ghost" disabled={busy} onClick={() => selectHousehold(null)}>Close household</button></div>
      <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className={`badge ${selected.status === 'assessed' ? 'badge-verified' : 'badge-pending'}`}>Visit: {assessmentStatusLabel(selected)}</span>
        {selected.allocation_status && <span className={`badge ${ALLOCATION_STATUS_BADGE[selected.allocation_status]}`}>Allocation: {ALLOCATION_STATUS_LABELS[selected.allocation_status]}</span>}
        {isLocked(selected) && <span className="badge badge-unassessed">Locked</span>}
      </p>
      <p><strong>Assigned Field Officer:</strong> {selected.assigned_field_officer_name || 'Not assigned'}</p>
      <p><strong>Household damage:</strong> {assessmentDamageLabel(selected)}</p>
      {isLocked(selected) && isField && <p className="users-help">Locked — this visit was submitted. Ask an administrator to re-open it if something must change.</p>}
      {selected.status === 'assessed' && <>
        <p><strong>Actual visit date:</strong> {selected.field_visit_date || '—'}</p>
        <p style={{ whiteSpace: 'pre-wrap' }}><strong>Findings:</strong> {selected.findings || '—'}</p>
        <p style={{ whiteSpace: 'pre-wrap' }}><strong>Remarks:</strong> {selected.remarks || 'None recorded'}</p>
        <p><strong>Other damage:</strong> Infrastructure: {selected.infrastructure_damage || 'None'} · Property: {selected.property_damage || 'None'} · Agricultural: {selected.agricultural_damage || 'None'}</p>
        <p><strong>Estimated severity:</strong> {selected.estimated_severity || '—'}</p>
        <p><strong>Submitted:</strong> {selected.submitted_at || '—'}</p>
      </>}

      {isAdmin && <form onSubmit={assign} style={{ marginTop: 24 }}>
        <h3>Assign a household visit</h3>
        <div className="form-group"><label htmlFor="visit-officer">Active Field Officer</label>
          <select id="visit-officer" required value={officerId} onChange={(event) => setOfficerId(event.target.value)} disabled={busy}>
            <option value="">Select a Field Officer</option>
            {availableOfficers.map((officer) => <option key={officer.user_id} value={officer.user_id}>{officer.full_name}{officer.assigned_purok ? ` — ${purokLabel(officer.assigned_purok)}` : ''}</option>)}
          </select>
          {!availableOfficers.length && <p>No active Field Officers are assigned to this Purok. <Link to="/admin/administrators?tab=field_officers">Manage Field Officers</Link>.</p>}
        </div>
        {isLocked(selected) && <p>This visit is submitted and locked. Re-open the allocation on the Relief Allocation page before reassigning it.</p>}
        <button className="btn btn-primary" disabled={busy || !availableOfficers.some((officer) => Number(officer.user_id) === Number(officerId)) || conflict}>{busy ? 'Saving…' : selected.assigned_field_officer_id ? 'Reassign visit' : 'Assign visit'}</button>
      </form>}

      {editable && <form onSubmit={submit} style={{ marginTop: 24 }} aria-labelledby="assessment-heading">
        <h3 id="assessment-heading">Record your household visit</h3>
        <p>Record what you observed at the actual visit. “No damage” confirms you checked and found none. You can save a draft and submit later; a submitted visit is locked.</p>
        {score && <div className="score-preview" aria-live="polite">
          <span>Automatic subtotal: <strong>{score.automatic_subtotal ?? 'For Verification'}</strong>{score.automatic_subtotal != null && ' / 80'}</span>
          <span>Damage: <strong>{form.damage_classification ? `${damagePoints[form.damage_classification] ?? '—'}` : '—'}</strong> / 20</span>
          <span>Preview total: <strong>{score.automatic_subtotal != null && form.damage_classification && damagePoints[form.damage_classification] != null ? score.automatic_subtotal + damagePoints[form.damage_classification] : '—'}</strong> / 100</span>
          <small>Preview only — the server calculates the final score and priority when you submit.</small>
        </div>}
        <fieldset disabled={busy || conflict} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="form-group"><label htmlFor="visit-date">Actual visit date (required)</label><input id="visit-date" type="date" name="field_visit_date" required max={localDateISO()} value={form.field_visit_date || ''} onChange={change} /></div>
          <DamageClassificationPicker required value={form.damage_classification || ''} points={damagePoints}
            onChange={(value) => setForm((previous) => ({ ...previous, damage_classification: value }))} />
          <div className="form-row">{[['infrastructure_damage', 'Infrastructure damage'], ['property_damage', 'Property damage'], ['agricultural_damage', 'Agricultural damage']].map(([name, label]) => <div className="form-group" key={name}>
            <label htmlFor={`visit-${name}`}>{label} (noted, not scored)</label><select id={`visit-${name}`} name={name} value={form[name] || 'None'} onChange={change}>{NOTE_DAMAGE_LEVELS.map((level) => <option key={level}>{level}</option>)}</select>
          </div>)}</div>
          <div className="form-group"><label htmlFor="visit-severity">Estimated severity</label><select id="visit-severity" name="estimated_severity" value={form.estimated_severity || 'Low'} onChange={change}>{['Low', 'Medium', 'High', 'Critical'].map((level) => <option key={level}>{level}</option>)}</select></div>
          <div className="form-group"><label htmlFor="visit-findings">Visit findings (required)</label><textarea id="visit-findings" name="findings" rows={4} required maxLength={10000} value={form.findings || ''} onChange={change} placeholder="Describe what you observed at the household." /></div>
          <div className="form-group"><label htmlFor="visit-remarks">Additional remarks (optional)</label><textarea id="visit-remarks" name="remarks" rows={3} maxLength={10000} value={form.remarks || ''} onChange={change} /></div>
          <div className="form-actions">
            <button className="btn btn-ghost" type="button" onClick={saveDraft}>{busy ? 'Saving…' : 'Save draft'}</button>
            <button className="btn btn-primary" type="submit">Submit assessment</button>
          </div>
        </fieldset>
      </form>}
      {confirming && <Modal title="Submit this assessment?" onClose={() => !busy && setConfirming(false)}>
        <p>This assessment will be locked after submission. Only an administrator can re-open it.</p>
        <p><strong>Household damage:</strong> {damageLabel(form.damage_classification)} · <strong>Visit date:</strong> {form.field_visit_date}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>Keep editing</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={confirmSubmit}>{busy ? 'Submitting…' : 'Submit and lock'}</button>
        </div>
      </Modal>}

      <hr style={{ margin: '24px 0', border: 0, borderTop: '1px solid var(--color-border)' }} />
      <h3>Photo evidence</h3>
      {photoError && <div className="alert alert-error" role="alert">{photoError} <button className="btn btn-ghost btn-sm" onClick={() => refreshPhotos(selected.household_id)} disabled={busy}>Reload photos</button></div>}
      {photoLoading ? <p role="status">Loading photo evidence…</p> : photos.length ? <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {photos.map((photo) => <a key={photo.photo_id} href={householdAssessmentPhotoUrl(photo.photo_id)} target="_blank" rel="noreferrer" style={{ maxWidth: '100%' }}>
          <img src={householdAssessmentPhotoUrl(photo.photo_id)} alt={photo.original_name || 'Household visit evidence'} style={{ width: 140, height: 110, objectFit: 'cover', borderRadius: 'var(--radius-control)' }} />
        </a>)}
      </div> : <p>No visit photos have been uploaded.</p>}
      {editable && <div className="form-group" style={{ marginTop: 16 }}>
        <label htmlFor="visit-photos">Add available photo evidence</label><input key={fileKey} id="visit-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={(event) => setFiles(Array.from(event.target.files || []))} />
        <p>JPEG, PNG or WebP, up to 5 MB each (20 photos maximum). Photos are optional — add them before you submit, because a submitted visit is locked.</p>
        {!!files.length && <button type="button" className="btn btn-secondary" disabled={busy} onClick={upload}>{busy ? 'Uploading…' : `Upload ${files.length} photo${files.length === 1 ? '' : 's'}`}</button>}
      </div>}
      <p><Link to={`${base}/reports?household_id=${selected.household_id}`}>View existing disaster reports and their photo evidence</Link></p>
      {selected.legacy_assessment && <p>Earlier report-based assessments remain with the original disaster reports. They do not confirm completion of this household visit.</p>}
    </section> : householdId && !loading && <div className="alert alert-error" role="alert">This household assignment is unavailable in your account.</div>}

    <div className="card">
      <div className="form-row"><div className="form-group"><label htmlFor="assignment-search">Search households</label><input id="assignment-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Household name, Purok or address" /></div>
        <div className="form-group"><label htmlFor="assignment-status">Visit status</label><select id="assignment-status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{Object.entries(ASSESSMENT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
      {loading ? <div className="loading-text" role="status">Loading household assignments…</div> : <DataTable rows={filtered} emptyText={isField ? 'No household visits match. Your Administrator assigns household visits here.' : 'No households match your search.'} columns={[
        { key: 'head_of_family', label: 'Household' }, { key: 'purok', label: 'Purok', render: (row) => purokLabel(row.purok) },
        { key: 'assigned_field_officer_name', label: 'Field Officer', render: (row) => row.assigned_field_officer_name || 'Not assigned' },
        { key: 'status', label: 'Visit status', render: (row) => <span className={`badge ${row.status === 'assessed' ? 'badge-verified' : 'badge-pending'}`}>{assessmentStatusLabel(row)}</span> },
        { key: 'damage_classification', label: 'Household damage', render: assessmentDamageLabel },
        { key: 'allocation_status', label: 'Allocation', render: (row) => row.allocation_status ? <span className={`badge ${ALLOCATION_STATUS_BADGE[row.allocation_status]}`}>{ALLOCATION_STATUS_LABELS[row.allocation_status]}</span> : '—' },
        { key: 'field_visit_date', label: 'Visit date', render: (row) => row.status === 'assessed' ? row.field_visit_date || '—' : '—' },
        { key: 'action', label: 'Action', render: (row) => <button className="btn btn-ghost btn-sm" disabled={busy} aria-label={`Review ${row.head_of_family}`} onClick={() => selectHousehold(row.household_id)}>Review</button> },
      ]} />}
    </div>
  </>;
}
