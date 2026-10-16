import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import DashboardCard from "../../components/DashboardCard.jsx";
import usePolling from "../../hooks/usePolling.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { getAllocations, getHouseholds, getNotifications, getMyProfile } from "../../services/api.jsx";
import {
  ALLOCATION_STEPS, ALLOCATION_STATUS_HELP, AllocationStatusBadge, allocationDisplayStatus, formatSchedule,
} from "../../config/allocationStatus.jsx";

/**
 * Resident Dashboard (Phase 21 — revised resident scope).
 *
 * Residents only VIEW their own account, household and relief allocation
 * status, and read their own notifications. They do not submit disaster
 * reports or perform administrative operations; household and assessment
 * data are managed by authorized personnel. Refreshes every 60 s.
 */
export default function ResidentDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [household, setHousehold] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      getMyProfile(), getHouseholds(), getAllocations(), getNotifications({ limit: 4 }),
    ]);
    const ok = (i) => (results[i].status === "fulfilled" ? results[i].value.data : null);
    if (ok(0)) setProfile(ok(0).data);
    if (ok(1)) setHousehold(ok(1).data[0] || null);
    if (ok(2)) setAllocations(ok(2).data || []);
    if (ok(3)) { setNotifications(ok(3).data); setUnread(ok(3).unread_count); }
    setLoaded(true);
  }, []);
  usePolling(load, { interval: 60000 });

  if (!loaded) return <div className="loading-text">Loading dashboard…</div>;

  const count = (s) => allocations.filter((a) => allocationDisplayStatus(a) === s).length;
  const ready = allocations.filter((a) => allocationDisplayStatus(a) === "Ready for Distribution");
  const nextReady = [...ready].sort((a, b) => String(a.ready_schedule_date).localeCompare(String(b.ready_schedule_date)))[0];
  const readyItems = nextReady
    ? ready.filter((a) => a.ready_schedule_date === nextReady.ready_schedule_date && a.ready_location === nextReady.ready_location)
    : [];
  // The household's current stage: the most advanced open stage, else Distributed.
  const current = ready.length ? "Ready for Distribution"
    : count("Approved") ? "Approved"
    : count("Pending") ? "Pending"
    : count("Distributed") ? "Distributed" : null;
  const currentIdx = current ? ALLOCATION_STEPS.indexOf(current) : -1;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Welcome, {user.full_name.split(" ")[0]}</h1>
          <p>Your account, household and relief allocation status.</p>
        </div>
      </div>

      <div className="stat-grid">
        <DashboardCard label="Pending" value={count("Pending")} tone={count("Pending") ? "warn" : ""} />
        <DashboardCard label="Approved" value={count("Approved")} />
        <DashboardCard label="Ready for Distribution" value={ready.length} tone={ready.length ? "accent" : ""} />
        <DashboardCard label="Distributed" value={count("Distributed")} />
      </div>

      {nextReady && (
        <div className="ready-box">
          <h3>Your relief is ready for distribution</h3>
          <dl>
            <dt>Items</dt>
            <dd>{readyItems.map((a) => `${a.item_name} ${a.quantity} ${a.unit}`).join(", ")}</dd>
            <dt>Schedule</dt>
            <dd>{formatSchedule(nextReady.ready_schedule_date, nextReady.ready_schedule_time)}</dd>
            <dt>Location</dt>
            <dd>{nextReady.ready_location}</dd>
            {nextReady.ready_instructions && (<><dt>Instructions</dt><dd>{nextReady.ready_instructions}</dd></>)}
          </dl>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Relief Allocation Status</h3>
          <Link to="/resident/relief-status" className="btn btn-ghost btn-sm">View details</Link>
        </div>
        {!household ? (
          <p style={{ fontSize: 14, margin: 0 }}>
            Relief allocation status will appear here after the barangay office links your account to your household.
          </p>
        ) : current === null ? (
          <p style={{ fontSize: 14, margin: 0 }}>No relief has been allocated to your household yet.</p>
        ) : (
          <>
            <ol className="relief-steps" aria-label="Relief allocation progress">
              {ALLOCATION_STEPS.map((s, i) => (
                <li key={s} className={i === currentIdx ? "current" : i < currentIdx ? "done" : ""} aria-current={i === currentIdx ? "step" : undefined}>
                  <span className="step-num">{i + 1}</span>{s}
                </li>
              ))}
            </ol>
            <p style={{ fontSize: 14, margin: "10px 0 0" }}>{ALLOCATION_STATUS_HELP[current]}</p>
            {allocations.slice(0, 4).map((a) => (
              <div key={a.allocation_id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14, padding: "8px 0", borderTop: "1px solid var(--color-border)", marginTop: 8 }}>
                <span>{a.item_name} — {a.quantity} {a.unit}</span>
                <AllocationStatusBadge allocation={a} />
              </div>
            ))}
          </>
        )}
      </div>

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", marginBottom: 20 }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>My Account</h3>
            <Link to="/resident/my-profile" className="btn btn-ghost btn-sm">My Profile</Link>
          </div>
          <div style={{ fontSize: 14, display: "grid", gap: 4 }}>
            <div><strong>Name:</strong> {profile?.full_name || user.full_name}</div>
            <div><strong>Email:</strong> {profile?.email || user.email}</div>
            <div><strong>SMS number:</strong> {profile?.contact_number || "Not set — add it in My Profile to receive relief SMS."}</div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>My Household</h3>
            {household && <Link to="/resident/household" className="btn btn-ghost btn-sm">Details</Link>}
          </div>
          {!household ? (
            <p style={{ fontSize: 14, margin: 0 }}>
              No household is linked to your account yet. Please contact the barangay office.
            </p>
          ) : (
            <div style={{ fontSize: 14, display: "grid", gap: 4 }}>
              <div><strong>Head of family:</strong> {household.head_of_family}</div>
              <div><strong>Purok:</strong> {household.purok}</div>
              <div><strong>Members:</strong> {household.number_of_members}</div>
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Notifications{unread ? ` (${unread} new)` : ""}</h3>
            <Link to="/resident/notifications" className="btn btn-ghost btn-sm">All</Link>
          </div>
          {notifications.length === 0 ? <p style={{ fontSize: 14, margin: 0 }}>No notifications yet.</p> : notifications.map((nt) => (
            <div key={nt.notification_id} className={`notif-item${Number(nt.is_read) ? " read" : ""}`}>
              <span className="notif-dot" aria-hidden="true" />
              <div>
                <div className="notif-title">{nt.title}</div>
                <div className="notif-meta">{String(nt.created_at).slice(0, 16)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 13, color: "var(--color-ink-soft)" }}>
        Household, vulnerability and disaster information is recorded and updated by authorized barangay personnel.
        For corrections, please contact the barangay office.
      </p>
    </>
  );
}
