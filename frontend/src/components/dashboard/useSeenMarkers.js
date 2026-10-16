import { useCallback, useEffect, useState } from "react";

const KEY = "bdrrm.admin-dashboard.seen";

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}
function write(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable (private window): markers simply don't persist */
  }
}

/**
 * "New since your last visit" markers for the work queue, per browser.
 *
 * On the first visit the highest report and allocation IDs become the
 * watermark, so nothing is marked. Records added later (higher IDs) carry a
 * marker until the Administrator opens them from the queue, or presses
 * "Mark all as seen", which moves the watermark up.
 *
 * `latest` = { reports, allocations }: the highest IDs in the database
 * (overview.php latest_ids, unfiltered), so filters never move the watermark.
 */
export default function useSeenMarkers(latest) {
  const [state, setState] = useState(() => read());

  // First visit (or storage cleared): start the watermark at the current data.
  useEffect(() => {
    if (state || !latest) return;
    const initial = { reports: latest.reports, allocations: latest.allocations, opened: { reports: [], allocations: [] } };
    setState(initial);
    write(initial);
  }, [state, latest]);

  const isNew = useCallback(
    (kind, id) => Boolean(state) && id > (state[kind] ?? Infinity) && !state.opened?.[kind]?.includes(id),
    [state]
  );

  const markOpened = useCallback((kind, id) => {
    setState((prev) => {
      if (!prev || prev.opened?.[kind]?.includes(id)) return prev;
      const next = { ...prev, opened: { ...prev.opened, [kind]: [...(prev.opened?.[kind] || []), id].slice(-200) } };
      write(next);
      return next;
    });
  }, []);

  const markAllSeen = useCallback(() => {
    if (!latest) return;
    setState((prev) => {
      const next = {
        reports: Math.max(prev?.reports ?? 0, latest.reports),
        allocations: Math.max(prev?.allocations ?? 0, latest.allocations),
        opened: { reports: [], allocations: [] },
      };
      write(next);
      return next;
    });
  }, [latest]);

  return { isNew, markOpened, markAllSeen };
}
