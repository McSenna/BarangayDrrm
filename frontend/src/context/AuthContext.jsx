import { createContext, useContext, useEffect, useState } from "react";
import { getSession, login as apiLogin, logout as apiLogout } from "../services/api.jsx";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession()
      .then((res) => {
        if (res.data.authenticated) setUser(res.data.user);
      })
      // Backend unreachable or erroring: treat as logged out (ProtectedRoute
      // sends the user to /login) instead of leaving an unhandled rejection.
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // Phase 19 — the API reports an expired session (HTTP 401): clear the user
  // so ProtectedRoute sends them back to the login page.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, []);

  const login = async (email, password) => {
    const res = await apiLogin({ email, password });
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
