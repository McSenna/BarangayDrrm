import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import useFocusTrap from "../../../hooks/useFocusTrap.js";
import SeverityBadge from "../../../features/alerts/SeverityBadge.jsx";
import { areaLabel, formatManila } from "../../../features/alerts/alertModel.js";
import { getAlertHistory } from "../../../services/api.jsx";

/** The server's message, or a plain one for a network failure. `kept` says what stayed unchanged. */
export function apiError(err, kept) {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.response) return `The server could not complete this (error ${err.response.status}). ${kept} Please try again.`;
  return `We couldn't reach the server. ${kept} Check your connection and try again.`;
}

/** Modal dialog with a focus trap; Esc and the backdrop close it unless `busy`. */
export function Dialog({ title, onClose, busy = false, wide = false, children }) {
  const ref = useRef(null);
  const titleId = useId();
  useFocusTrap(ref, true, () => !busy && onClose());
  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div ref={ref} className={`modal-box ba-dialog${wide ? " ba-dialog--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id={titleId} style={{ margin: 0 }}>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close">
            <X aria-hidden="true" size={18} strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AlertSummary({ alert }) {
  return (
    <div className="ba-summary">
      <div className="ba-summary-top"><SeverityBadge severity={alert.severity} /><span>{alert.type}</span></div>
      <p className="ba-summary-title">{alert.title}</p>
      <p className="ba-summary-meta">Affected area: <strong>{areaLabel(alert)}</strong></p>
    </div>
  );
}

/** Draft -> Active, after confirmation. Explains that nothing is sent by SMS. */
export function ActivateDialog({ alert, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try { await onConfirm(); } catch (err) { setError(apiError(err, "The alert is still a draft.")); setBusy(false); }
  };
  return (
    <Dialog title="Activate this alert?" onClose={onClose} busy={busy}>
      <AlertSummary alert={alert} />
      <p className="ba-dialog-text">It will appear right away as an active alert on the public barangay map and on the staff Barangay Map. Open maps pick it up within about 15 seconds.</p>
      <p className="ba-dialog-note">No SMS or other message is sent automatically. Use Send SMS separately if residents should be texted.</p>
      {!alert.instructions && <p className="ba-dialog-note">This alert has no resident instructions. You can add them by editing it first.</p>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? "Activating…" : "Activate alert"}</button>
      </div>
    </Dialog>
  );
}

/**
 * Active -> Inactive with an optional resolution note. The dialog stays open until the server has saved the
 * change; on failure it keeps the alert active and shows why.
 */
export function TurnOffDialog({ alert, onClose, onConfirm }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const noteId = useId();
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await onConfirm(note.trim()); } catch (err) { setError(apiError(err, "The alert is still active.")); setBusy(false); }
  };
  return (
    <Dialog title={`Turn off “${alert.title}”`} onClose={onClose} busy={busy}>
      <form onSubmit={submit}>
        <AlertSummary alert={alert} />
        <p className="ba-dialog-text"><strong>Turn off this alert? It will no longer appear as an active alert on the barangay map.</strong></p>
        <p className="ba-dialog-note">The record and its history are kept and can be viewed under Inactive. Permanent flood-prone zones are not affected.</p>
        <div className="form-group">
          <label htmlFor={noteId}>Resolution note (optional)</label>
          <textarea id={noteId} value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Water has receded; residents may return home." aria-describedby={`${noteId}-count`} />
          <span id={`${noteId}-count`} className="ba-count">{note.length}/500</span>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Keep active</button>
          <button type="submit" className="btn btn-danger" disabled={busy}>{busy ? "Turning off…" : "Turn off alert"}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function DeleteDraftDialog({ alert, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    setBusy(true); setError("");
    try { await onConfirm(); } catch (err) { setError(apiError(err, "The draft was not deleted.")); setBusy(false); }
  };
  return (
    <Dialog title="Delete this draft?" onClose={onClose} busy={busy}>
      <AlertSummary alert={alert} />
      <p className="ba-dialog-text">The draft was never shown to residents. Deleting it cannot be undone.</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-danger" onClick={submit} disabled={busy}>{busy ? "Deleting…" : "Delete draft"}</button>
      </div>
    </Dialog>
  );
}

const FIELD_LABEL = { title: "title", hazard_type: "type", severity: "severity", description: "description", instructions: "resident instructions", scope: "affected area", puroks: "puroks" };
function historyLabel(h) {
  if (h.action === "created") return "Created as a draft";
  if (h.action === "activated") return "Activated";
  if (h.action === "deactivated") return "Turned off";
  return `Edited${h.changes?.length ? `: ${h.changes.map((c) => FIELD_LABEL[c] || c).join(", ")}` : ""}`;
}

/** Full record and its audit trail (who did what, when, in Philippine time). */
export function HistoryDialog({ alertId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    getAlertHistory(alertId)
      .then((res) => live && setData(res.data.data))
      .catch((err) => live && setError(apiError(err, "")));
    return () => { live = false; };
  }, [alertId]);
  const a = data?.alert;
  return (
    <Dialog title={a ? a.title : "Alert history"} onClose={onClose} wide>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {!data && !error && <p className="loading-text">Loading the alert history…</p>}
      {a && (
        <>
          <dl className="ba-record">
            <div><dt>Status</dt><dd>{a.alert_status}</dd></div>
            <div><dt>Severity</dt><dd><SeverityBadge severity={a.severity} /></dd></div>
            <div><dt>Type</dt><dd>{a.hazard_type}</dd></div>
            <div><dt>Affected area</dt><dd>{a.scope === "barangay" ? "Entire barangay" : a.puroks.join(", ") || a.unmapped_area || "—"}</dd></div>
            <div><dt>Activated</dt><dd>{a.activated_at ? `${formatManila(a.activated_at)} by ${a.issued_by_name || "—"}` : "Not activated"}</dd></div>
            <div><dt>Turned off</dt><dd>{a.deactivated_at ? `${formatManila(a.deactivated_at)} by ${a.resolved_by_name || "—"}` : "—"}</dd></div>
            <div><dt>Created by</dt><dd>{a.created_by_name || "—"}{a.created_at ? `, ${formatManila(a.created_at)}` : ""}</dd></div>
            <div><dt>Last updated by</dt><dd>{a.updated_by_name || "—"}{a.updated_at ? `, ${formatManila(a.updated_at)}` : ""}</dd></div>
            {a.resolution_note && <div className="ba-record-wide"><dt>Resolution note</dt><dd>{a.resolution_note}</dd></div>}
            {a.description && <div className="ba-record-wide"><dt>Description</dt><dd>{a.description}</dd></div>}
            {a.instructions && <div className="ba-record-wide"><dt>Resident instructions</dt><dd>{a.instructions}</dd></div>}
          </dl>
          <h4 className="ba-history-title">History</h4>
          {data.history.length === 0 ? <p className="ba-dialog-note">No history was recorded for this alert.</p> : (
            <ol className="ba-history">
              {data.history.map((h) => (
                <li key={h.history_id} className={`ba-history-item ba-history-item--${h.action}`}>
                  <p className="ba-history-what">{historyLabel(h)}</p>
                  <p className="ba-history-meta"><time dateTime={h.acted_at}>{formatManila(h.acted_at)}</time> · {h.acted_by_name || "Unknown administrator"}</p>
                  {h.note && <p className="ba-history-note">{h.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Close</button></div>
    </Dialog>
  );
}
