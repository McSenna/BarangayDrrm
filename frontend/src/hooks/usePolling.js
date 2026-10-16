import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Controlled polling (Phase 19) — keeps a page's data reasonably fresh with
 * plain HTTP requests to the PHP API. No WebSockets, no extra server.
 *
 * - Calls `load()` once on mount, then again every `interval` ms.
 * - Uses a timeout chain (not setInterval), so a slow request can never
 *   overlap the next one and requests can never pile up.
 * - Pauses while the browser tab is hidden; refreshes once when the tab
 *   becomes visible again if the data is older than one interval.
 * - When `load` changes (e.g. new filters), fetches immediately.
 * - `load` only fetches data and updates state — it must not reset forms.
 *
 * Returns { lastUpdated, refreshing, refresh } for the "Last updated" label
 * and a manual Refresh button.
 */
export default function usePolling(load, { interval = 45000, enabled = true } = {}) {
  const loadRef = useRef(load);
  const timerRef = useRef(null);
  const inFlightRef = useRef(false);
  const rerunRef = useRef(false);
  const lastRef = useRef(null);
  const mountedRef = useRef(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async () => {
    if (inFlightRef.current) {
      // A request is already running: run once more when it finishes, so a
      // filter change during a refresh is never lost.
      rerunRef.current = true;
      return;
    }
    inFlightRef.current = true;
    if (mountedRef.current) setRefreshing(true);
    try {
      do {
        rerunRef.current = false;
        await loadRef.current();
        const now = new Date();
        lastRef.current = now;
        if (mountedRef.current) setLastUpdated(now);
      } while (rerunRef.current && mountedRef.current);
    } catch {
      // The page's own load() shows its error message; polling just tries again later.
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // New `load` (filters changed): fetch now. Skipped on the first render,
  // where the polling effect below performs the initial load.
  const firstRef = useRef(true);
  useEffect(() => {
    loadRef.current = load;
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    if (enabled) run();
  }, [load, enabled, run]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    const schedule = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        if (cancelled) return;
        if (document.visibilityState === "visible") await run();
        if (!cancelled) schedule();
      }, interval);
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      const age = lastRef.current ? Date.now() - lastRef.current.getTime() : Infinity;
      if (age >= interval) {
        run().then(() => !cancelled && schedule());
      }
    };

    run().then(() => !cancelled && schedule());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, interval, run]);

  return { lastUpdated, refreshing, refresh: run };
}

/**
 * Auto-refresh for pages that already load their own data on mount
 * (Phase 19). Calls `refreshFn` (which must refresh silently — no spinner,
 * no form reset) every `interval` ms while the tab is visible, using the
 * same timeout chain as usePolling. Returns { lastUpdated, refreshing, refresh }.
 */
export function useAutoRefresh(refreshFn, interval = 45000) {
  const fnRef = useRef(refreshFn);
  fnRef.current = refreshFn;
  const [lastUpdated, setLastUpdated] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setRefreshing(true);
    try {
      await fnRef.current();
      setLastUpdated(new Date());
    } catch {
      /* the page shows its own errors */
    } finally {
      busyRef.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const schedule = () => {
      timer = setTimeout(async () => {
        if (cancelled) return;
        if (document.visibilityState === "visible") await refresh();
        if (!cancelled) schedule();
      }, interval);
    };
    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [interval, refresh]);

  return { lastUpdated, refreshing, refresh };
}
