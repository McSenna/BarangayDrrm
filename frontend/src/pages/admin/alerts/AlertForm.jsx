import { useId, useState } from "react";
import SeverityBadge from "../../../features/alerts/SeverityBadge.jsx";
import { STANDARD_PUROKS } from "../../../utils/purokBoundaries.js";
import { Dialog, apiError } from "./AlertDialogs.jsx";

export const ALERT_TYPES = ["Flood", "Typhoon", "Fire", "Landslide", "Earthquake", "Other"];
const SEVERITY_HELP = {
  Advisory: "Be aware and prepare.",
  Warning: "Conditions are getting worse; get ready to act.",
  Critical: "Immediate danger; act now.",
};
const EMPTY = { title: "", hazard_type: "Flood", severity: "Advisory", description: "", instructions: "", scope: "barangay", puroks: [] };

/** Same rules as the server (backend/lib/barangay_alerts.php), so most mistakes are caught before saving. */
function validate(f) {
  const e = {};
  if (!f.title.trim()) e.title = "Enter a title residents will understand at a glance.";
  if (f.scope === "puroks" && f.puroks.length === 0) e.puroks = "Select at least one purok, or choose the entire barangay.";
  return e;
}

/**
 * Create (as a draft) or edit an alert. Status is never part of this form: it changes only with Activate
 * and Turn off. Editing an active alert updates open maps at their next refresh.
 */
export default function AlertForm({ alert, onClose, onSave }) {
  const editing = Boolean(alert);
  const legacyType = editing && !ALERT_TYPES.includes(alert.hazard_type) ? alert.hazard_type : null;
  const [form, setForm] = useState(() => (editing ? {
    title: alert.title || "", hazard_type: alert.hazard_type, severity: alert.severity, description: alert.description || "",
    instructions: alert.instructions || "", scope: alert.scope, puroks: alert.puroks || [],
  } : EMPTY));
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useId();
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const togglePurok = (p) => set("puroks", form.puroks.includes(p) ? form.puroks.filter((x) => x !== p) : STANDARD_PUROKS.filter((x) => x === p || form.puroks.includes(x)));

  const submit = async (e) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true); setServerError("");
    const payload = { ...form, title: form.title.trim(), puroks: form.scope === "puroks" ? form.puroks : [] };
    try {
      await onSave(editing ? { ...payload, alert_id: alert.alert_id, version: alert.version } : payload);
    } catch (err) {
      setServerError(apiError(err, editing ? "Your changes were not saved." : "The alert was not saved."));
      setBusy(false);
    }
  };

  return (
    <Dialog title={editing ? "Edit alert" : "New barangay alert"} onClose={onClose} busy={busy} wide>
      <form onSubmit={submit} noValidate className="ba-form">
        {editing && alert.alert_status === "Active" && (
          <p className="ba-dialog-note">This alert is active. Your changes appear on open maps within about 15 seconds.</p>
        )}
        {!editing && <p className="ba-dialog-note">New alerts are saved as drafts. Residents see nothing until you activate it.</p>}

        <div className="form-group">
          <label htmlFor={`${id}-title`}>Alert title</label>
          <input id={`${id}-title`} value={form.title} maxLength={150} onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Rising water along the river" aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? `${id}-title-err` : undefined} />
          {errors.title && <p id={`${id}-title-err`} className="ba-field-error">{errors.title}</p>}
        </div>

        <div className="form-group">
          <label htmlFor={`${id}-type`}>Alert type</label>
          <select id={`${id}-type`} value={form.hazard_type} onChange={(e) => set("hazard_type", e.target.value)}>
            {legacyType && <option value={legacyType}>{legacyType} (older type)</option>}
            {ALERT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <fieldset className="ba-fieldset">
          <legend>Severity</legend>
          <div className="ba-options ba-options--3">
            {["Advisory", "Warning", "Critical"].map((s) => (
              <label key={s} className="ba-option">
                <input type="radio" name={`${id}-sev`} value={s} checked={form.severity === s} onChange={() => set("severity", s)} />
                <span className="ba-option-body"><SeverityBadge severity={s} /><span className="ba-option-help">{SEVERITY_HELP[s]}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="ba-fieldset">
          <legend>Affected area</legend>
          <div className="ba-options">
            <label className="ba-option">
              <input type="radio" name={`${id}-scope`} value="barangay" checked={form.scope === "barangay"} onChange={() => set("scope", "barangay")} />
              <span className="ba-option-body"><strong>Entire barangay</strong><span className="ba-option-help">The barangay boundary is highlighted.</span></span>
            </label>
            <label className="ba-option">
              <input type="radio" name={`${id}-scope`} value="puroks" checked={form.scope === "puroks"} onChange={() => set("scope", "puroks")} />
              <span className="ba-option-body"><strong>Selected puroks</strong><span className="ba-option-help">Only those puroks are highlighted.</span></span>
            </label>
          </div>
          {form.scope === "puroks" && (
            <div className="ba-puroks" role="group" aria-label="Puroks" aria-describedby={errors.puroks ? `${id}-puroks-err` : undefined}>
              {STANDARD_PUROKS.map((p) => (
                <label key={p} className="ba-purok">
                  <input type="checkbox" checked={form.puroks.includes(p)} onChange={() => togglePurok(p)} />
                  {p}
                </label>
              ))}
            </div>
          )}
          {errors.puroks && <p id={`${id}-puroks-err`} className="ba-field-error">{errors.puroks}</p>}
        </fieldset>

        <div className="form-group">
          <label htmlFor={`${id}-desc`}>Description <span className="ba-optional">(optional)</span></label>
          <textarea id={`${id}-desc`} rows={3} maxLength={2000} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="What is happening, from official advisories." />
        </div>
        <div className="form-group">
          <label htmlFor={`${id}-instr`}>Resident instructions <span className="ba-optional">(shown on the map panel)</span></label>
          <textarea id={`${id}-instr`} rows={3} maxLength={2000} value={form.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="e.g. Move to higher ground. Go to the barangay hall evacuation center." />
        </div>

        {serverError && <div className="alert alert-error" role="alert">{serverError}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Save as draft"}</button>
        </div>
      </form>
    </Dialog>
  );
}
