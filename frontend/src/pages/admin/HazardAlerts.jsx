import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { History, MessageSquareText, Pencil, Plus, Power, Send, Trash2 } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import DataTable from "../../components/DataTable.jsx";
import usePolling from "../../hooks/usePolling.js";
import SeverityBadge from "../../features/alerts/SeverityBadge.jsx";
import { announceAlertsChanged, areaLabel, formatManila, normalizeAlert } from "../../features/alerts/alertModel.js";
import "../../features/alerts/alerts.css";
import { activateAlert, createAlert, deactivateAlert, deleteAlertDraft, getHazardAlerts, updateAlert } from "../../services/api.jsx";
import AlertForm from "./alerts/AlertForm.jsx";
import { ActivateDialog, DeleteDraftDialog, HistoryDialog, TurnOffDialog } from "./alerts/AlertDialogs.jsx";

const TABS = [
  ["Active", "Active"],
  ["Draft", "Drafts"],
  ["Inactive", "Inactive (history)"],
  ["", "All"],
];
const STATE_BADGE = { Draft: "badge badge-unassessed", Active: "badge badge-ready", Inactive: "badge ba-badge-inactive" };

/** API record -> row: the raw record plus the normalized fields the alert components use. */
const toRow = (r) => ({ ...r, ...normalizeAlert(r), alert_id: Number(r.alert_id) });

function When({ iso, by }) {
  if (!iso) return <span className="ba-cell-muted">—</span>;
  return <span className="ba-when"><time dateTime={iso}>{formatManila(iso)}</time>{by && <span className="ba-cell-muted">{by}</span>}</span>;
}

/**
 * Barangay Alerts (Administrator). Draft -> Active -> Inactive: create as a draft, edit, activate (shown on
 * the public Home map and the staff Barangay Map), turn off with an optional note. Turned-off alerts are
 * kept with their history. Every change is saved on the server before success is shown; the list refreshes
 * right after and open maps in this browser refresh at once (others within about 15 seconds).
 */
export default function HazardAlerts() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("Active");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState(null); // { kind: 'form'|'activate'|'off'|'delete'|'history', alert? }

  const load = useCallback(async () => {
    try {
      const res = await getHazardAlerts();
      setRows((res.data.data || []).map(toRow));
      setLoadError("");
    } catch (err) {
      setLoadError(err.response?.data?.message || "We couldn't load the alerts. The list shows the last records loaded; it will try again automatically.");
    } finally {
      setLoaded(true);
    }
  }, []);
  const { refresh } = usePolling(load, { interval: 30000 });

  const counts = useMemo(() => rows.reduce((c, r) => ({ ...c, [r.alert_status]: (c[r.alert_status] || 0) + 1 }), {}), [rows]);
  const shown = tab ? rows.filter((r) => r.alert_status === tab) : rows;

  /** After the server saved a change: refresh the list (and open maps), then close the dialog and show the message. */
  const done = async (message, nextTab) => {
    announceAlertsChanged();
    await refresh();
    setDialog(null);
    setNotice(message);
    if (nextTab !== undefined) setTab(nextTab);
  };
  const actions = {
    save: async (payload) => {
      const res = payload.alert_id ? await updateAlert(payload) : await createAlert(payload);
      await done(res.data.message, payload.alert_id ? undefined : "Draft");
    },
    activate: async (a) => { const res = await activateAlert(a.alert_id); await done(`“${a.title}”: ${res.data.message}`, "Active"); },
    off: async (a, note) => { const res = await deactivateAlert(a.alert_id, note || null); await done(`“${a.title}”: ${res.data.message}`); },
    remove: async (a) => { const res = await deleteAlertDraft(a.alert_id); await done(res.data.message); },
  };

  const sendSms = (r) => navigate("/admin/send-sms", {
    state: {
      category: "Emergency Warning",
      message: `BARANGAY BINITAYAN — ${r.type.toUpperCase()} ${r.severity.toUpperCase()}: ${r.title}. ${areaLabel(r)}. ${r.instructions || r.description || ""}`.trim(),
      recipient_mode: "household",
    },
  });

  const columns = [
    { key: "title", label: "Alert", render: (r) => (
      <span className="ba-cell-alert"><strong>{r.title}</strong><span className="ba-cell-muted">{r.type}</span></span>
    ) },
    { key: "severity", label: "Severity", render: (r) => <SeverityBadge severity={r.severity} /> },
    { key: "area", label: "Affected area", render: (r) => areaLabel(r) },
    { key: "alert_status", label: "Status", render: (r) => <span className={STATE_BADGE[r.alert_status]}>{r.alert_status}</span> },
    { key: "activated", label: "Activated", render: (r) => <When iso={r.activated_at} by={r.issued_by_name} /> },
    { key: "deactivated", label: "Turned off", render: (r) => <When iso={r.deactivated_at} by={r.resolved_by_name} /> },
    { key: "people", label: "Created / last updated by", render: (r) => (
      <span className="ba-when"><span>{r.created_by_name || "—"}</span><span className="ba-cell-muted">Updated by {r.updated_by_name || "—"}</span></span>
    ) },
    { key: "actions", label: "Actions", render: (r) => (
      <div className="ba-actions">
        {r.alert_status !== "Inactive" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: "form", alert: r })}><Pencil aria-hidden="true" size={14} />Edit<span className="sr-only"> {r.title}</span></button>}
        {r.alert_status === "Draft" && <button type="button" className="btn btn-primary btn-sm" onClick={() => setDialog({ kind: "activate", alert: r })}><Send aria-hidden="true" size={14} />Activate<span className="sr-only"> {r.title}</span></button>}
        {r.alert_status === "Active" && <button type="button" className="btn btn-danger btn-sm" onClick={() => setDialog({ kind: "off", alert: r })}><Power aria-hidden="true" size={14} />Turn off<span className="sr-only"> {r.title}</span></button>}
        {r.alert_status === "Active" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => sendSms(r)}><MessageSquareText aria-hidden="true" size={14} />Send SMS<span className="sr-only"> about {r.title}</span></button>}
        {r.alert_status === "Draft" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: "delete", alert: r })}><Trash2 aria-hidden="true" size={14} />Delete draft<span className="sr-only"> {r.title}</span></button>}
        {r.alert_status !== "Draft" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog({ kind: "history", alert: r })}><History aria-hidden="true" size={14} />History<span className="sr-only"> of {r.title}</span></button>}
      </div>
    ) },
  ];

  const empty = { Active: "No active barangay alerts. Activate a draft to show it on the barangay map.", Draft: "No drafts. Use New alert to prepare one.", Inactive: "No turned-off alerts yet.", "": "No alerts have been created yet." }[tab];

  return (
    <>
      <PageHeader
        title="Barangay Alerts"
        description="Create alerts as drafts, activate them to show on the barangay map, and turn them off when the situation ends. Turned-off alerts stay here as history."
        actions={<Button icon={Plus} onClick={() => { setNotice(""); setDialog({ kind: "form" }); }}>New alert</Button>}
      />

      {notice && <div className="alert alert-success ba-notice" role="status">{notice}</div>}
      {loadError && <div className="alert alert-error" role="alert">{loadError}</div>}

      <div className="seg-tabs" role="tablist" aria-label="Alert status">
        {TABS.map(([key, label]) => (
          <button key={label} type="button" role="tab" className="seg-tab" aria-selected={tab === key} aria-controls="ba-table" onClick={() => setTab(key)}>
            {label} <span className="ba-tab-count">{key ? counts[key] || 0 : rows.length}</span>
          </button>
        ))}
      </div>

      <div className="card" id="ba-table" role="tabpanel">
        {!loaded ? <div className="loading-text">Loading alerts…</div> : <DataTable columns={columns} rows={shown.map((r) => ({ ...r, id: r.alert_id }))} emptyText={empty} />}
      </div>

      {dialog?.kind === "form" && <AlertForm alert={dialog.alert} onClose={() => setDialog(null)} onSave={actions.save} />}
      {dialog?.kind === "activate" && <ActivateDialog alert={dialog.alert} onClose={() => setDialog(null)} onConfirm={() => actions.activate(dialog.alert)} />}
      {dialog?.kind === "off" && <TurnOffDialog alert={dialog.alert} onClose={() => setDialog(null)} onConfirm={(note) => actions.off(dialog.alert, note)} />}
      {dialog?.kind === "delete" && <DeleteDraftDialog alert={dialog.alert} onClose={() => setDialog(null)} onConfirm={() => actions.remove(dialog.alert)} />}
      {dialog?.kind === "history" && <HistoryDialog alertId={dialog.alert.alert_id} onClose={() => setDialog(null)} />}
    </>
  );
}
