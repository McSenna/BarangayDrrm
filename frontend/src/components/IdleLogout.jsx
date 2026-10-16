import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const IDLE_MINUTES = Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES) || 30;
const WARNING_SECONDS = 60;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];

/**
 * Idle logout (Phase 19). Auto-refresh requests keep the PHP session alive,
 * so the browser signs the user out after IDLE_MINUTES without any mouse,
 * keyboard, scroll or touch activity. A one-minute warning lets the user stay
 * signed in. Background polling is not counted as activity.
 */
export default function IdleLogout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const lastActivity = useRef(Date.now());
  const [secondsLeft, setSecondsLeft] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    const mark = () => {
      lastActivity.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, mark, { passive: true }));

    const timer = setInterval(async () => {
      const idleMs = Date.now() - lastActivity.current;
      const remaining = Math.ceil((IDLE_MINUTES * 60 * 1000 - idleMs) / 1000);
      if (remaining <= 0) {
        clearInterval(timer);
        try {
          await logout();
        } catch {
          /* session may already be gone */
        }
        const here = window.location.pathname + window.location.search;
        navigate(`/?login=1&reason=idle&next=${encodeURIComponent(here)}`, { replace: true });
      } else if (remaining <= WARNING_SECONDS) {
        setSecondsLeft(remaining);
      } else {
        setSecondsLeft(null);
      }
    }, 1000);

    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, mark));
    };
  }, [user, logout, navigate]);

  if (secondsLeft === null) return null;
  return (
    <div className="idle-warning" role="alertdialog" aria-live="assertive">
      <span>You will be signed out in {secondsLeft}s because of inactivity.</span>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => {
          lastActivity.current = Date.now();
          setSecondsLeft(null);
        }}
      >
        Stay signed in
      </button>
    </div>
  );
}
