import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import usePolling from "../../hooks/usePolling.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "../../services/api.jsx";

/**
 * In-app notifications for the logged-in user (Phase 19). Used by Resident
 * and Relief Personnel. Auto-refreshes every 30 seconds while visible.
 */
export default function Notifications() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await getNotifications({ limit: 100 });
      setRows(res.data.data);
      setUnread(res.data.unread_count);
      setError("");
    } catch {
      setError("We couldn't load your notifications. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);
  const { refresh } = usePolling(load, { interval: 30000 });

  const markOne = async (n) => {
    if (Number(n.is_read)) return;
    await markNotificationRead(n.notification_id).catch(() => {});
    refresh();
  };
  const markAll = async () => {
    await markAllNotificationsRead().catch(() => {});
    refresh();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Notifications</h1>
          <p>{user?.role === "resident"
            ? "Updates about your household's relief allocations and distributions."
            : "Updates about disaster reports, relief requests, distributions and evacuation centers."}</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {unread > 0 && <button className="btn btn-ghost btn-sm" onClick={markAll}>Mark all as read</button>}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        {loading ? (
          <div className="loading-text">Loading notifications…</div>
        ) : rows.length === 0 ? (
          <div className="empty-state">You have no notifications yet.</div>
        ) : (
          rows.map((n) => (
            <div key={n.notification_id} className={`notif-item${Number(n.is_read) ? " read" : ""}`}>
              <span className="notif-dot" aria-hidden="true" />
              <div style={{ flex: 1 }}>
                <div className="notif-title">{n.title}</div>
                <div style={{ fontSize: 14 }}>{n.message}</div>
                <div className="notif-meta">
                  {new Date(n.created_at.replace(" ", "T")).toLocaleString()}
                  {Number(n.is_read) ? " · Read" : " · Unread"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {n.link && <Link className="btn btn-ghost btn-sm" to={n.link} onClick={() => markOne(n)}>Open</Link>}
                {!Number(n.is_read) && <button className="btn btn-ghost btn-sm" onClick={() => markOne(n)}>Mark read</button>}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
