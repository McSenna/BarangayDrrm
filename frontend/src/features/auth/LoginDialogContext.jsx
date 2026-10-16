import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { destinationFor, safeNext } from "./authLogic.js";

/**
 * Global open/close for the login dialog.
 *
 * The dialog is open while the current history entry carries
 * `state.loginDialog`. Opening pushes an entry for the same URL, so the
 * browser Back button closes the dialog; closing from the UI steps back off
 * that entry. Deep links `?login=1` (with optional `next` and `reason`) and
 * `#login` open it and are then removed from the address bar.
 *
 *   const { openLogin } = useLoginDialog();
 *   openLogin({ next: "/admin/map", email: "someone@example.com" });
 */
const LoginDialogContext = createContext(null);

export function LoginDialogProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const dialog = location.state?.loginDialog ? location.state : null;

  const openLogin = useCallback(({ next, email, reason, at, replace } = {}) => {
    if (user) {
      navigate(destinationFor(user, next));
      return;
    }
    if (location.pathname === "/login" && !at) {
      // The full-page form is already here.
      document.getElementById("login-email")?.focus();
      return;
    }
    const target = at || location.pathname + location.search + location.hash;
    navigate(target, {
      replace: !!replace,
      state: { loginDialog: replace ? "replace" : "push", next: safeNext(next), email: email || "", reason: reason || null },
    });
  }, [user, location.pathname, location.search, location.hash, navigate]);

  const closeLogin = useCallback(() => {
    if (!location.state?.loginDialog) return;
    const here = location.pathname + location.search + location.hash;
    if (location.state.loginDialog === "push" && (window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(here, { replace: true, state: null });
  }, [location, navigate]);

  // Deep links: /?login=1&next=/admin/map&reason=idle or /#login
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(location.search);
    const wantsLogin = params.get("login") === "1" || location.hash === "#login";
    if (!wantsLogin) return;
    const next = params.get("next");
    const reason = params.get("reason");
    ["login", "next", "reason"].forEach((k) => params.delete(k));
    const query = params.toString();
    const clean = location.pathname + (query ? `?${query}` : "") + (location.hash === "#login" ? "" : location.hash);
    if (user) {
      navigate(destinationFor(user, next), { replace: true });
      return;
    }
    navigate(clean, { replace: true });
    navigate(clean, { state: { loginDialog: "push", next: safeNext(next), email: "", reason: reason === "idle" ? "idle" : null } });
  }, [location.search, location.hash, location.pathname, loading, user, navigate]);

  const value = useMemo(() => ({ dialog, openLogin, closeLogin }), [dialog, openLogin, closeLogin]);
  return <LoginDialogContext.Provider value={value}>{children}</LoginDialogContext.Provider>;
}

export function useLoginDialog() {
  return useContext(LoginDialogContext);
}
