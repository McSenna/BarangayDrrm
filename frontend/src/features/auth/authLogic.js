/**
 * Login rules with no React in them, so tests/auth_logic_test.mjs can run
 * them with plain Node: where to go after logging in, which `next` values are
 * safe, how server responses become messages, and client-side validation.
 *
 * The server (backend/auth/login.php) is unchanged: 400 missing fields, 401
 * wrong email or password (deliberately generic), 403 account deactivated,
 * 429 temporarily locked after repeated failures.
 */

/** Existing role destinations (unchanged from the old Login page). */
export const REDIRECT_BY_ROLE = {
  admin: "/admin",
  relief_personnel: "/personnel",
  resident: "/resident",
};

const PUBLIC_PATHS = ["/", "/about", "/contact"];

/**
 * Returns `next` as a same-origin relative path ("/admin/map?x=1#y"), or null.
 * Rejects absolute URLs, protocol-relative ("//evil.com"), backslash tricks
 * ("/\\evil.com"), javascript: and anything that resolves to another origin.
 */
export function safeNext(next) {
  if (typeof next !== "string" || next === "") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(next)) return null;
  try {
    const base = "https://binitayan.invalid";
    const u = new URL(next, base);
    if (u.origin !== base) return null;
    if (u.pathname === "/login" || u.pathname === "/register") return null; // no loops back to a login screen
    return u.pathname + u.search + u.hash;
  } catch {
    return null;
  }
}

/**
 * Where a user goes after logging in: a safe `next` inside their own area (or
 * a public page), otherwise their role's home. A `next` for another role's
 * area is ignored, since that page would refuse them anyway.
 */
export function destinationFor(user, next) {
  const home = REDIRECT_BY_ROLE[user?.role] || "/";
  const n = safeNext(next);
  if (!n) return home;
  const path = n.split(/[?#]/)[0];
  if (PUBLIC_PATHS.includes(path)) return n;
  if (home !== "/" && (path === home || path.startsWith(home + "/"))) return n;
  return home;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client validation for logging in (no password complexity on login). */
export function validateLogin({ email, password }) {
  const errors = {};
  const e = String(email || "").trim();
  if (!e || !EMAIL_RE.test(e)) errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Enter your password.";
  return errors;
}

/**
 * Maps a failed login request (an axios error) to what the form shows.
 * kind: credentials | throttled | disabled | pending | network.
 * `retryAfter` (seconds) is set only when the server sends Retry-After.
 */
export function loginErrorFor(error) {
  const res = error?.response;
  if (!res) return { kind: "network", message: "Can't connect right now. Check your connection and try again." };
  const status = res.status;
  if (status === 401 || status === 422 || status === 400) {
    return { kind: "credentials", message: "Incorrect email or password." };
  }
  if (status === 429) {
    const header = Number(res.headers?.["retry-after"]);
    if (Number.isFinite(header) && header > 0) {
      return { kind: "throttled", retryAfter: Math.ceil(header), message: throttledMessage(Math.ceil(header)) };
    }
    const m = /(\d+)\s*minute/i.exec(res.data?.message || "");
    const minutes = m ? Number(m[1]) : 15;
    return { kind: "throttled", message: `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.` };
  }
  if (status === 403) {
    // The server has no "awaiting verification" state today; if one is added
    // it should say so in its message, and this branch will show it.
    if (/verif|pending|approval/i.test(res.data?.message || "")) {
      return { kind: "pending", message: "Your account is waiting for barangay verification." };
    }
    return { kind: "disabled", message: "This account is disabled. Contact the barangay office." };
  }
  return { kind: "network", message: "Can't connect right now. Check your connection and try again." };
}

export function throttledMessage(seconds) {
  return `Too many attempts. Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;
}
