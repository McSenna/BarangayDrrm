import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Plus, Users, UserCheck, UserPlus, UserX, RefreshCw } from "lucide-react";
import AccountTabs from "../../components/users/AccountTabs.jsx";
import AccountDialog from "../../components/users/AccountDialog.jsx";
import Households from "./Households.jsx";
import Residents from "./Residents.jsx";
import Personnel from "./Personnel.jsx";
import PurokSelect from "../../components/PurokSelect.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { getUsers, addUser, updateUser, toggleUserStatus, exportUsers, reviewRegistration } from "../../services/api.jsx";

const ROLES = { admin: "Administrator", relief_personnel: "Relief Personnel", field_officer: "Field Officer", resident: "Resident" };
const EMPTY_FORM = { full_name: "", email: "", password: "", contact_number: "", role: "resident", assigned_purok: "" };
const message = (err) => err.response?.data?.message || "We couldn't complete this request. Check your connection and try again.";
const approved = (row) => !row.registration_status || row.registration_status === "approved";
const active = (row) => approved(row) && Number(row.is_active) === 1;
const statusLabel = (row) => approved(row) ? (active(row) ? "Active" : "Deactivated") : row.registration_status === "pending" ? "Pending approval" : "Rejected";
const roleLabel = (row) => row.display_role || ROLES[row.role];

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [url] = useSearchParams();
  const tab = ["active", "inactive", "all", "requests", "rejected", "households", "residents", "personnel", "field_officers"].includes(url.get("tab")) ? url.get("tab") : "active";
  const RegistryPanel = { households: Households, residents: Residents, personnel: Personnel, field_officers: Personnel }[tab];
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("created_at:desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [revision, setRevision] = useState(0);
  const request = useRef(0);
  const mutation = useRef(false);
  const checkAll = useRef(null);
  const [sortKey, direction] = sort.split(":");
  const params = { managed: 1, tab: RegistryPanel ? "all" : tab, search: query, role, status, sort: sortKey, direction, page, per_page: perPage };
  const paramsKey = JSON.stringify(params);
  const reload = useCallback(() => setRevision((n) => n + 1), []);

  useEffect(() => {
    const timer = setTimeout(() => { setQuery(search); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => { setPage(1); setSelected([]); }, [tab]);
  useEffect(() => {
    const id = ++request.current;
    setLoading(true); setError(""); setSelected([]);
    getUsers(JSON.parse(paramsKey)).then((res) => {
      if (id !== request.current) return;
      setData(res.data);
      setPage(res.data.pagination.page);
    }).catch((err) => { if (id === request.current) { setError(message(err)); setData(null); } })
      .finally(() => { if (id === request.current) setLoading(false); });
    return () => { request.current++; };
  }, [paramsKey, revision]);

  const rows = data?.data || [];
  const eligible = rows.filter((row) => approved(row) && Number(row.user_id) !== Number(currentUser.user_id));
  const chosen = rows.filter((row) => selected.includes(Number(row.user_id)));
  useEffect(() => {
    if (checkAll.current) checkAll.current.indeterminate = selected.length > 0 && selected.length < eligible.length;
  }, [selected.length, eligible.length]);
  const changeFilter = (setter) => (event) => { setter(event.target.value); setPage(1); setSelected([]); };
  const date = (value) => {
    if (!value) return "Never";
    const parsed = new Date(value.replace(" ", "T") + (data?.timestamp_offset || "+08:00"));
    return Number.isNaN(parsed.getTime()) ? "Unavailable" : new Intl.DateTimeFormat("en-PH", {
      dateStyle: "medium", timeStyle: "short", timeZone: data?.timezone || "Asia/Manila",
    }).format(parsed);
  };
  const open = (next) => { setFormError(""); setDialog(next); };
  const edit = (row) => {
    setForm({ full_name: row.full_name, email: row.email, contact_number: row.contact_number || "", role: row.role, assigned_purok: row.assigned_purok || "" });
    open({ type: "edit", row });
  };
  const persist = async () => {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setFormError("");
    try {
      if (dialog.row) await updateUser({ ...form, user_id: dialog.row.user_id, version: dialog.row.version });
      else await addUser(form);
      setDialog(null); setNotice(dialog.row ? "Account updated." : "Account created. Share the password securely with the account holder."); reload();
    } catch (err) { setFormError(message(err)); }
    finally { mutation.current = false; setBusy(false); }
  };
  const save = (event) => {
    event.preventDefault();
    if (dialog.row && form.role !== dialog.row.role) { setDialog({ ...dialog, type: "confirm-role" }); return; }
    persist();
  };
  const changeStatus = async () => {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setFormError("");
    const failures = []; let completed = 0;
    for (const row of dialog.rows) {
      try { await toggleUserStatus(row.user_id, dialog.next, row.version); completed++; }
      catch (err) { failures.push(`${row.full_name}: ${message(err)}`); }
    }
    setNotice(`${completed} account${completed === 1 ? "" : "s"} ${dialog.next ? "reactivated" : "deactivated"}.`);
    if (failures.length) { setDialog({ type: "results", failures }); }
    else setDialog(null);
    reload(); mutation.current = false; setBusy(false);
  };
  const review = async () => {
    if (mutation.current) return;
    mutation.current = true; setBusy(true); setFormError("");
    try {
      const res = await reviewRegistration(dialog.row.user_id, dialog.decision, dialog.row.version);
      setNotice(res.data.message); setDialog(null); reload();
    } catch (err) { setFormError(message(err)); }
    finally { mutation.current = false; setBusy(false); }
  };
  const download = async () => {
    if (exporting) return;
    setExporting(true); setError("");
    try {
      const res = await exportUsers({ ...params, ...(selected.length ? { ids: selected.join(",") } : {}) });
      const href = URL.createObjectURL(res.data);
      const link = document.createElement("a"); link.href = href; link.download = "users.csv";
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
      setNotice(selected.length ? "Selected accounts exported." : "All matching accounts exported.");
    } catch (err) {
      let detail; try { detail = JSON.parse(await err.response?.data?.text()).message; } catch { /* generic network error */ }
      setError(detail || message(err));
    } finally { setExporting(false); }
  };
  const stats = data?.summary;
  const summary = [["total", "Total users", Users], ["active", "Active", UserCheck], ["added_month", "Added this month", UserPlus], ["inactive", "Deactivated", UserX]];
  const total = data?.pagination.total || 0;
  const actualPage = data?.pagination.page || 1;
  const disabled = loading || busy || search !== query;

  return <section className="users-page" aria-labelledby="users-title">
    <div className="page-header"><div><h1 id="users-title">Users</h1><p>Manage account access for Barangay Binitayan.</p></div>
      {!RegistryPanel && <div className="users-actions">
        <button className="btn btn-ghost" disabled={disabled || exporting || !total} onClick={download}><Download size={17} aria-hidden="true" />{exporting ? "Exporting…" : selected.length ? "Export selected CSV" : "Export CSV"}</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => { setForm(EMPTY_FORM); open({ type: "create" }); }}><Plus size={18} aria-hidden="true" />Add user</button>
      </div>}
    </div>
    {notice && <div className="alert alert-success" role="status">{notice}</div>}
    {error && <div className="alert alert-error" role="alert">{error} <button className="btn btn-ghost" onClick={reload}>Retry</button></div>}
    <div className="users-summary">{summary.map(([key, label, Icon]) => <div className="card users-stat" key={key}>
      <div><span>{label}</span><strong>{stats ? stats[key].toLocaleString() : "—"}</strong></div><Icon size={23} aria-hidden="true" />
    </div>)}</div>
    <p className="users-scope">Counts cover all accounts. Month follows {data?.timezone || "Asia/Manila"}. Access is determined by role.</p>
    <AccountTabs active={tab} counts={stats || {}} />
    {RegistryPanel ? <div className="users-panel"><RegistryPanel key={tab} accountRole={tab === "field_officers" ? "field_officer" : "relief_personnel"} onAccountsChanged={reload} /></div> : <>
    {tab === "requests" && <p className="users-scope">Review new resident registrations. Pending accounts cannot sign in until approved.</p>}
    {tab === "rejected" && <p className="users-scope">Rejected registrations are retained for reference and cannot sign in.</p>}
    {tab === "all" && <p className="users-scope">Includes active and deactivated accounts. Residents linked to a household are shown as Head of the family.</p>}
    <div className="card users-directory">
      <div className="users-filters">
        <label className="users-search">Search users<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={150} placeholder="Name, email, purok or address" /></label>
        <label>Role<select value={role} onChange={changeFilter(setRole)}><option value="">All roles</option><option value="head_of_family">Head of the family</option>{Object.entries(ROLES).map(([key, label]) => <option key={key} value={key}>{key === "resident" ? "Resident (all)" : label}</option>)}</select></label>
        <label>Status<select value={status} onChange={changeFilter(setStatus)}><option value="">Any status</option><option value="active">Active</option><option value="inactive">Deactivated</option><option value="pending">Pending approval</option><option value="rejected">Rejected</option></select></label>
        <label>Sort by<select value={sort} onChange={changeFilter(setSort)}><option value="created_at:desc">Newest first</option><option value="created_at:asc">Oldest first</option><option value="full_name:asc">Name A–Z</option><option value="full_name:desc">Name Z–A</option><option value="last_login:desc">Last login: newest</option><option value="last_login:asc">Last login: oldest</option></select></label>
        <button className="btn btn-ghost" disabled={loading} onClick={reload} aria-label="Refresh users"><RefreshCw size={18} aria-hidden="true" /></button>
      </div>
      <div className="users-selection">
        <span>{selected.length ? `${selected.length} selected on this page` : "Selection applies to this page. CSV exports all matching accounts unless rows are selected."}</span>
        {selected.length > 0 && <div className="users-actions">
          <button className="btn btn-ghost btn-sm" disabled={disabled || !chosen.some((row) => !active(row))} onClick={() => open({ type: "status", next: 1, rows: chosen.filter((row) => !active(row)) })}>Reactivate selected</button>
          <button className="btn btn-danger btn-sm" disabled={disabled || !chosen.some(active)} onClick={() => open({ type: "status", next: 0, rows: chosen.filter(active) })}>Deactivate selected</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected([])}>Clear selection</button>
        </div>}
      </div>
      <div className="table-wrap users-table-wrap" role="region" aria-label="User accounts" tabIndex={0} aria-busy={loading}>
        <table className="users-table"><thead><tr>
          <th scope="col"><input ref={checkAll} type="checkbox" aria-label="Select all eligible users on this page" disabled={disabled || !eligible.length} checked={eligible.length > 0 && selected.length === eligible.length} onChange={(e) => setSelected(e.target.checked ? eligible.map((row) => Number(row.user_id)) : [])} /></th>
          {["User", "Role", "Access", "Location", "Status", ["requests", "rejected"].includes(tab) ? "Submitted" : "Last login", "Actions"].map((label) => <th scope="col" key={label}>{label}</th>)}
        </tr></thead><tbody>
          {loading ? <tr><td colSpan={8} className="users-empty">Loading accounts…</td></tr> : !rows.length ? <tr><td colSpan={8} className="users-empty">{error ? "Accounts are unavailable. Use Retry above." : "No users match these filters."}</td></tr> : rows.map((row) => <tr key={row.user_id}>
            <td><input type="checkbox" aria-label={`Select ${row.full_name}`} checked={selected.includes(Number(row.user_id))} disabled={disabled || !approved(row) || Number(row.user_id) === Number(currentUser.user_id)} onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, Number(row.user_id)] : ids.filter((id) => id !== Number(row.user_id)))} /></td>
            <td><div className="users-identity"><span className="users-avatar" aria-hidden="true">{row.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span><div><button className="users-name" onClick={() => open({ type: "view", row })}>{row.full_name}</button><span className="users-email">{row.email}</span></div></div></td>
            <td>{roleLabel(row)}</td><td>{row.access}{["field_officer", "relief_personnel"].includes(row.role) && <span className="users-email">{row.assigned_purok || "Needs Purok assignment"}</span>}</td><td>{row.location || row.assigned_purok || "No linked household"}</td>
            <td><span className={`badge ${row.registration_status === "pending" ? "badge-pending" : active(row) ? "badge-low" : "badge-rejected"}`}>{statusLabel(row)}</span></td><td>{date(["requests", "rejected"].includes(tab) ? row.created_at : row.last_login)}</td>
            <td><div className="users-row-actions">{row.registration_status === "pending" ? <>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => open({ type: "review", row, decision: "approved" })} aria-label={`Approve ${row.full_name}`}>Approve</button>
              <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => open({ type: "review", row, decision: "rejected" })} aria-label={`Reject ${row.full_name}`}>Reject</button>
            </> : approved(row) ? <><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => edit(row)} aria-label={`Edit ${row.full_name}`}>Edit</button>
              <button className="btn btn-ghost btn-sm" disabled={busy || Number(row.user_id) === Number(currentUser.user_id)} onClick={() => open({ type: "status", rows: [row], next: active(row) ? 0 : 1 })}>{active(row) ? "Deactivate" : "Reactivate"}</button></> : <button className="btn btn-ghost btn-sm" onClick={() => open({ type: "view", row })}>View details</button>}</div></td>
          </tr>)}
        </tbody></table>
      </div>
      <div className="users-pagination"><span role="status">{loading ? "Updating results…" : total ? `${(actualPage - 1) * perPage + 1}–${Math.min(actualPage * perPage, total)} of ${total.toLocaleString()} users` : "0 users"}</span>
        <div className="users-actions"><label>Rows per page<select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>{[10, 20, 50].map((n) => <option key={n}>{n}</option>)}</select></label>
          <button className="btn btn-ghost" disabled={disabled || actualPage <= 1} onClick={() => setPage(actualPage - 1)}>Previous</button>
          <span>{actualPage} / {data?.pagination.pages || 1}</span><button className="btn btn-ghost" disabled={disabled || actualPage >= (data?.pagination.pages || 1)} onClick={() => setPage(actualPage + 1)}>Next</button>
        </div>
      </div>
    </div>
    </>}
    {dialog && <AccountDialog title={{ create: "Add user", edit: "Edit user", view: "Account details", status: dialog.next ? "Reactivate accounts" : "Deactivate accounts", review: dialog.decision === "approved" ? "Approve registration" : "Reject registration", "confirm-role": "Change account access", results: "Some accounts could not be updated" }[dialog.type]} busy={busy} onClose={() => setDialog(null)}>
      {formError && <div className="alert alert-error" role="alert">{formError}</div>}
      {["create", "edit"].includes(dialog.type) && <form onSubmit={save}>
        <fieldset disabled={busy} className="users-form-fields">
          <label>Full name<input name="full_name" autoComplete="name" value={form.full_name} maxLength={150} required onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
          <label>Email<input name="email" type="email" autoComplete="email" value={form.email} maxLength={150} required onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          {Number(dialog.row?.is_household_head) === 1 && <p className="users-help">This account is designated Head of the family through its household link. Resident permissions provide access to its own household and relief status.</p>}
          <label>Account role<select value={form.role} disabled={Number(dialog.row?.user_id) === Number(currentUser.user_id)} onChange={(e) => setForm({ ...form, role: e.target.value, assigned_purok: ["field_officer", "relief_personnel"].includes(e.target.value) ? form.assigned_purok : "" })}>{Object.entries(ROLES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          {["field_officer", "relief_personnel"].includes(form.role) && <label htmlFor="account-assigned-purok">Assigned Purok<PurokSelect id="account-assigned-purok" name="assigned_purok" value={form.assigned_purok} onChange={(event) => setForm({ ...form, assigned_purok: event.target.value })} required /></label>}
          <p className="users-help">{form.role === "admin" ? "Full access to accounts, settings and all operations." : form.role === "resident" ? "Can view only their own household and relief status." : form.role === "field_officer" ? "Can record reports and assessments, view households, hazards and the map." : "Can record reports and carry out relief distribution."}</p>
          {!dialog.row && <><label>Password<input name="password" type="password" autoComplete="new-password" aria-describedby="account-password-help" value={form.password} minLength={6} maxLength={72} required onChange={(e) => setForm({ ...form, password: e.target.value })} /></label><small id="account-password-help">At least 6 characters. Share securely; the account holder can change it in My Profile.</small></>}
          <label>Contact number (optional)<input name="contact_number" type="tel" value={form.contact_number} maxLength={20} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} /></label>
        </fieldset>
        <div className="modal-actions"><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : dialog.row ? "Save changes" : "Create account"}</button></div>
      </form>}
      {dialog.type === "confirm-role" && <><p>Change {dialog.row.full_name} from {ROLES[dialog.row.role]} to {ROLES[form.role]}? This changes their access immediately.</p><div className="modal-actions"><button className="btn btn-ghost" disabled={busy} onClick={() => setDialog({ ...dialog, type: "edit" })}>Back</button><button className="btn btn-primary" disabled={busy} onClick={persist}>{busy ? "Saving…" : "Confirm role change"}</button></div></>}
      {dialog.type === "status" && <><p>{dialog.next ? "Restore sign-in and role access for" : "Block sign-in and protected requests for"} these {dialog.rows.length} account(s)?</p><ul>{dialog.rows.map((row) => <li key={row.user_id}>{row.full_name}</li>)}</ul><p>Account records will be kept. You can reverse this action later.</p><div className="modal-actions"><button className="btn btn-ghost" disabled={busy} onClick={() => setDialog(null)}>Cancel</button><button className={`btn ${dialog.next ? "btn-primary" : "btn-danger"}`} disabled={busy} onClick={changeStatus}>{busy ? "Updating…" : dialog.next ? "Reactivate" : "Deactivate"}</button></div></>}
      {dialog.type === "results" && <><ul>{dialog.failures.map((failure, i) => <li key={i}>{failure}</li>)}</ul><p>The list has been refreshed. Successful updates were saved; review failed accounts before retrying.</p></>}
      {dialog.type === "review" && <><p>{dialog.decision === "approved" ? "Approve" : "Reject"} the registration for <strong>{dialog.row.full_name}</strong> ({dialog.row.email})?</p><p>{dialog.decision === "approved" ? "This allows the resident to sign in and view their own household and relief status." : "The account will remain blocked from signing in. Its registration will be kept in the Rejected tab."}</p><div className="modal-actions"><button className="btn btn-ghost" disabled={busy} onClick={() => setDialog(null)}>Cancel</button><button className={`btn ${dialog.decision === "approved" ? "btn-primary" : "btn-danger"}`} disabled={busy} onClick={review}>{busy ? "Saving…" : dialog.decision === "approved" ? "Approve registration" : "Reject registration"}</button></div></>}
      {dialog.type === "view" && <><dl className="users-details">{[["Name", dialog.row.full_name], ["Email", dialog.row.email], ["Role", roleLabel(dialog.row)], ["Access", dialog.row.access], ["Status", statusLabel(dialog.row)], ["Contact", dialog.row.contact_number || "Not provided"], ...(["field_officer", "relief_personnel"].includes(dialog.row.role) ? [["Assigned Purok", dialog.row.assigned_purok || "Not assigned"]] : []), ["Location", dialog.row.location || "No linked household"], ["Last login", date(dialog.row.last_login)], ["Created", date(dialog.row.created_at)]].map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>{approved(dialog.row) && <div className="modal-actions"><button className="btn btn-primary" onClick={() => edit(dialog.row)}>Edit account</button></div>}</>}
    </AccountDialog>}
  </section>;
}
