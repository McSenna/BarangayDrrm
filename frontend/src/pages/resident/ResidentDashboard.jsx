import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import DashboardCard from "../../components/DashboardCard.jsx";
import usePolling from "../../hooks/usePolling.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { getMyAllocations, getHouseholds, getNotifications, getMyProfile } from "../../services/api.jsx";
import { ALLOCATION_STATUS_BADGE } from "../../utils/householdAssessment.js";

// Resident-facing steps of the relief allocation workflow, and which step each status reaches.
const STEPS = ["Field visit", "Ready for Distribution", "Relief received"];
const STEP_OF = { PENDING_ASSESSMENT: 0, ASSESSMENT_IN_PROGRESS: 0, READY_FOR_DISTRIBUTION: 1, COMPLETED: 2 };
const HELP = {
  PENDING_ASSESSMENT: "Waiting for a Field Officer to visit your household.",
  ASSESSMENT_IN_PROGRESS: "A Field Officer has started recording your household visit.",
  READY_FOR_DISTRIBUTION: "Your relief is ready. Please wait for the barangay to hand it over, or contact the barangay office.",
  COMPLETED: "Your relief was handed over.",
  CANCELLED: "This allocation was cancelled by the barangay.",
};

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
      getMyProfile(), getHouseholds(), getMyAllocations(), getNotifications({ limit: 4 }),
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

  // Rounds come newest first; the first one is the household's current allocation.
  const round = allocations[0] || null;
  const current = round ? round.status : null;
  const currentIdx = current in STEP_OF ? STEP_OF[current] : -1;
  const completedRounds = allocations.filter((a) => a.status === "COMPLETED").length;
  const listItems = (a) => a.items.map((i) => `${a.status === "COMPLETED" ? i.released_qty ?? 0 : i.planned_qty} ${i.unit} ${i.item_name}`).join(", ");

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Welcome, {user.full_name.split(" ")[0]}</h1>
          <p>Your account, household and relief allocation status.</p>
        </div>
      </div>

      <div className="stat-grid">
        <DashboardCard label="Current status" value={round ? round.status_label : "None"} tone={current === "READY_FOR_DISTRIBUTION" ? "accent" : ""} />
        <DashboardCard label="Relief received (rounds)" value={completedRounds} />
      </div>

      {current === "READY_FOR_DISTRIBUTION" && (
        <div className="ready-box">
          <h3>Your relief is ready for distribution</h3>
          <dl>
            <dt>Items</dt>
            <dd>{listItems(round)}</dd>
            <dt>Ready since</dt>
            <dd>{round.ready_at}</dd>
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
              {STEPS.map((s, i) => (
                <li key={s} className={i === currentIdx ? "current" : i < currentIdx ? "done" : ""} aria-current={i === currentIdx ? "step" : undefined}>
                  <span className="step-num">{i + 1}</span>{s}
                </li>
              ))}
            </ol>
            <p style={{ fontSize: 14, margin: "10px 0 0" }}>{HELP[current]}</p>
            {allocations.slice(0, 4).map((a) => (
              <div key={a.allocation_id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14, padding: "8px 0", borderTop: "1px solid var(--color-border)", marginTop: 8 }}>
                <span>Round {a.round_no}{a.items.length ? ` — ${listItems(a)}` : ""}</span>
                <span className={`badge ${ALLOCATION_STATUS_BADGE[a.status]}`}>{a.status_label}</span>
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
