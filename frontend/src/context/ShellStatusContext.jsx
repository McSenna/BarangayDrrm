import { createContext, useCallback, useContext, useEffect, useState } from "react";
import usePolling from "../hooks/usePolling.js";
import { getNotifications, getPublicHazardStatus, getStatistics } from "../services/api.jsx";
import { useAuth } from "./AuthContext.jsx";
import { ALERTS_CHANGED_CHANNEL, ALERTS_CHANGED_EVENT } from "../features/alerts/alertModel.js";

const ShellStatusContext = createContext({ hazard: null, stats: null, unread: 0 });

/**
 * Live figures for the app shell (header status chip, sidebar count badges,
 * notification bell). Read-only calls to existing endpoints, refreshed every
 * 60 s with the shared polling hook (pauses while the tab is hidden):
 *   - hazard status: every role (public endpoint)
 *   - dashboard statistics: Administrator only (admin-only endpoint)
 *   - unread notifications: Resident and Relief Personnel (admins receive none)
 * A failed request keeps the last good value; the shell never shows an error.
 */
export function ShellStatusProvider({ children }) {
  const { user } = useAuth();
  const role = user?.role;
  const [hazard, setHazard] = useState(null);
  const [stats, setStats] = useState(null);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    const jobs = [
      getPublicHazardStatus().then((res) => setHazard(res.data.data)).catch(() => {}),
    ];
    if (role === "admin") {
      jobs.push(getStatistics().then((res) => setStats(res.data.data)).catch(() => {}));
    } else if (role) {
      jobs.push(
        getNotifications({ limit: 1, unread_only: 1 })
          .then((res) => setUnread(res.data.unread_count || 0))
          .catch(() => {})
      );
    }
    await Promise.all(jobs);
  }, [role]);

  const { refresh } = usePolling(load, { interval: 60000, enabled: Boolean(role) });

  // Phase 33: an administrator changed a barangay alert in this browser — refresh the status chip now.
  useEffect(() => {
    if (!role) return undefined;
    window.addEventListener(ALERTS_CHANGED_EVENT, refresh);
    let channel = null;
    try { channel = new BroadcastChannel(ALERTS_CHANGED_CHANNEL); channel.onmessage = refresh; } catch { channel = null; }
    return () => { window.removeEventListener(ALERTS_CHANGED_EVENT, refresh); channel?.close(); };
  }, [role, refresh]);

  return (
    <ShellStatusContext.Provider value={{ hazard, stats, unread }}>
      {children}
    </ShellStatusContext.Provider>
  );
}

export function useShellStatus() {
  return useContext(ShellStatusContext);
}
