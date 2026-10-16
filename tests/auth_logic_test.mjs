// Login dialog logic (frontend/src/features/auth/authLogic.js): safe `next`
// redirects, role destinations, validation and server-error mapping.
// Usage: node tests/auth_logic_test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const m = await import(pathToFileURL(join(root, "frontend/src/features/auth/authLogic.js")).href);
let pass = 0, fail = 0;
const ok = (c, msg, got) => { if (c) { pass++; console.log("PASS " + msg); } else { fail++; console.log("FAIL " + msg + (got === undefined ? "" : "  -> " + JSON.stringify(got))); } };

// ---- safeNext: same-origin relative paths only
for (const good of ["/admin", "/admin/map?household=4", "/resident#x", "/personnel/map"]) ok(m.safeNext(good) === good, `safeNext keeps ${good}`, m.safeNext(good));
for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com/admin", "http:/evil.com", "javascript:alert(1)", "admin", "", null, undefined, "/%0d%0aSet-Cookie:x", "/\u0000x", "/login", "/register?x=1", " /admin"]) {
  ok(m.safeNext(bad) === null || (typeof bad === "string" && bad.startsWith("/%0d") && m.safeNext(bad)?.startsWith("/")), `safeNext rejects ${JSON.stringify(bad)}`, m.safeNext(bad));
}
ok(m.safeNext("/a/../admin") === "/admin", "safeNext normalises dot segments without leaving the site", m.safeNext("/a/../admin"));

// ---- destinationFor: role homes, and `next` only inside the user's own area
const admin = { role: "admin" }, staff = { role: "relief_personnel" }, res = { role: "resident" };
ok(m.destinationFor(admin) === "/admin" && m.destinationFor(staff) === "/personnel" && m.destinationFor(res) === "/resident", "role homes unchanged");
ok(m.destinationFor(admin, "/admin/map?household=4") === "/admin/map?household=4", "admin next inside /admin honoured");
ok(m.destinationFor(res, "/admin/map") === "/resident", "resident next into /admin ignored");
ok(m.destinationFor(staff, "/personnel/map") === "/personnel/map", "personnel next inside /personnel honoured");
ok(m.destinationFor(admin, "/administrator-fake") === "/admin", "prefix trick (/administrator-fake) not treated as /admin");
ok(m.destinationFor(admin, "//evil.com/admin") === "/admin", "open redirect refused");
ok(m.destinationFor(res, "/contact") === "/contact", "public page next honoured");
ok(m.destinationFor({ role: "unknown" }) === "/", "unknown role goes home");

// ---- validation
ok(JSON.stringify(m.validateLogin({ email: "", password: "" })) === JSON.stringify({ email: "Enter a valid email address.", password: "Enter your password." }), "both fields required");
ok(m.validateLogin({ email: "a@b", password: "x" }).email === "Enter a valid email address.", "email format checked");
ok(Object.keys(m.validateLogin({ email: " admin@binitayan.gov.ph ", password: "a" })).length === 0, "valid input passes; no complexity rule on login");

// ---- server responses
const err = (status, data = {}, headers = {}) => ({ response: { status, data, headers } });
ok(m.loginErrorFor(err(401, { message: "Invalid email or password." })).message === "Incorrect email or password.", "401 -> generic credentials message");
ok(m.loginErrorFor(err(422)).kind === "credentials" && m.loginErrorFor(err(400)).kind === "credentials", "422/400 -> generic credentials message");
const t = m.loginErrorFor(err(429, { message: "Too many failed sign-in attempts. Please wait 15 minutes and try again." }));
ok(t.kind === "throttled" && t.message === "Too many attempts. Try again in 15 minutes." && t.retryAfter === undefined, "429 without Retry-After -> minutes from the server message, no countdown", t);
const t2 = m.loginErrorFor(err(429, {}, { "retry-after": "42" }));
ok(t2.retryAfter === 42 && t2.message === "Too many attempts. Try again in 42 seconds.", "429 with Retry-After -> seconds countdown", t2);
ok(m.loginErrorFor(err(403, { message: "Your account has been deactivated." })).message === "This account is disabled. Contact the barangay office.", "403 deactivated -> disabled message");
ok(m.loginErrorFor(err(403, { message: "Account pending barangay verification" })).kind === "pending", "403 with a pending message -> pending");
ok(m.loginErrorFor({ message: "Network Error" }).kind === "network" && m.loginErrorFor(err(500)).kind === "network" && m.loginErrorFor(err(503)).kind === "network", "no response / 5xx -> network message");
ok(!JSON.stringify(m.loginErrorFor(err(401, { message: "Invalid email or password." }))).toLowerCase().includes("email does not exist"), "no user enumeration in messages");

console.log(`\nAUTH LOGIC TEST: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
