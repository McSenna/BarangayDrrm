import { useCallback, useEffect, useReducer, useRef } from "react";
import { getActiveAlerts } from "../../services/api.jsx";
import { ALERTS_CHANGED_CHANNEL, ALERTS_CHANGED_EVENT, DEFAULT_POLL_MS, initialAlertsState, reduceAlertsState } from "./alertModel.js";

const ENV_MS = Number(import.meta.env.VITE_ALERT_POLL_MS);
const POLL_MS = Number.isFinite(ENV_MS) && ENV_MS >= 5000 ? ENV_MS : DEFAULT_POLL_MS;
// A request that hangs (weak signal, stuck connection) counts as a failure after this, so "outdated" shows.
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Active barangay alerts, kept fresh without a page reload (no real-time server exists, so this polls).
 *  - every `interval` ms (VITE_ALERT_POLL_MS, default 15 s) while the tab is visible; at once when it becomes
 *    visible again, and at once when an administrator changes an alert in this browser (announceAlertsChanged);
 *  - one request at a time, each timing out after 10 s: a refresh asked for while one is running is queued
 *    once (never more), so a change announced mid-request is still fetched and requests never pile up;
 *  - a failed refresh keeps the last alerts and sets `outdated` (see reduceAlertsState);
 *  - on unmount the timer, listeners and any pending request are cancelled.
 * @returns {{ alerts, status: 'loading'|'ready'|'error', outdated: boolean, lastSuccessAt: Date|null, refresh: () => void }}
 */
export default function useActiveAlerts({ interval = POLL_MS } = {}) {
  const [state, dispatch] = useReducer(reduceAlertsState, initialAlertsState);
  const pending = useRef(null);
  const rerun = useRef(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!alive.current) return;
    if (pending.current) { rerun.current = true; return; }
    do {
      rerun.current = false;
      const ctrl = new AbortController();
      pending.current = ctrl;
      try {
        const res = await getActiveAlerts({ signal: ctrl.signal, timeout: REQUEST_TIMEOUT_MS });
        if (!res.data?.success || !Array.isArray(res.data?.data?.alerts)) throw new Error("Unexpected response");
        if (alive.current) dispatch({ type: "success", alerts: res.data.data.alerts, at: new Date() });
      } catch {
        if (alive.current && !ctrl.signal.aborted) dispatch({ type: "failure", at: new Date() });
      } finally {
        if (pending.current === ctrl) pending.current = null;
      }
    } while (rerun.current && alive.current);
  }, []);

  useEffect(() => {
    alive.current = true;
    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") await refresh();
        if (alive.current) schedule();
      }, interval);
    };
    const now = () => { refresh(); schedule(); };
    const onVisible = () => { if (document.visibilityState === "visible") now(); };

    refresh();
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(ALERTS_CHANGED_EVENT, now);
    let channel = null;
    try {
      channel = new BroadcastChannel(ALERTS_CHANGED_CHANNEL);
      channel.onmessage = now;
    } catch {
      channel = null;
    }
    return () => {
      alive.current = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(ALERTS_CHANGED_EVENT, now);
      channel?.close();
      pending.current?.abort();
      pending.current = null;
      rerun.current = false;
    };
  }, [interval, refresh]);

  return { ...state, refresh };
}
