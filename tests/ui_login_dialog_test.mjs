// Login dialog browser test (Chrome via puppeteer-core). Read-only: every
// POST to auth/login.php is answered in the browser with a mocked response,
// so no login attempt reaches login_history and no account can be locked.
// The one real-session check (already logged in) needs an admin PHPSESSID.
//
// Needs: Vite dev server (npm run dev) + the PHP API under XAMPP, Chrome, and
//   npm i --no-save puppeteer-core@23.11.1 axe-core@4.10.2
// Usage: [GIS_ADMIN_SESSION=<phpsessid>] [CHROME_PATH=...] node tests/ui_login_dialog_test.mjs [screenshot_dir]
import puppeteer from "puppeteer-core";
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const B = process.env.GIS_FRONTEND_URL || "http://localhost:5173";
const ADMIN_SESSION = process.env.GIS_ADMIN_SESSION || "";
const OUT = process.argv[2] || ".";
const res = [];
const ok = (c, m, x) => { res.push(!!c); console.log((c ? "PASS " : "FAIL ") + m + (c || x === undefined ? "" : "  -> " + JSON.stringify(x))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });

const CORS = { "Access-Control-Allow-Origin": B, "Access-Control-Allow-Credentials": "true", "Access-Control-Expose-Headers": "Retry-After" };
const USERS = { admin: { user_id: 1, full_name: "Test Admin", email: "a@x.test", role: "admin" }, resident: { user_id: 3, full_name: "Test Resident", email: "r@x.test", role: "resident" } };

async function open(w = 1440, h = 900, path = "/", { session, reduced } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 });
  if (reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/tile\.openstreetmap|favicon|net::|status of 40[13]|status of 429|status of 500/.test(m.text())) errs.push(m.text()); });
  page.mock = null; // { status, body, headers, delay, abort }
  page.posts = [];
  await page.setRequestInterception(true);
  page.on("request", async (r) => {
    if (r.url().includes("auth/login.php") && r.method() === "POST") {
      page.posts.push(r.postData());
      const m = page.mock || { status: 401, body: { success: false, message: "Invalid email or password." } };
      if (m.delay) await sleep(m.delay);
      if (m.abort) return r.abort("failed");
      return r.respond({ status: m.status, contentType: "application/json", headers: { ...CORS, ...(m.headers || {}) }, body: JSON.stringify(m.body) });
    }
    r.continue();
  });
  if (session) await page.setCookie({ name: "PHPSESSID", value: session, domain: "localhost", path: "/" });
  // Record every client-side route change (to see redirects that happen quickly).
  await page.evaluateOnNewDocument(() => {
    window.__paths = [];
    for (const k of ["pushState", "replaceState"]) {
      const orig = history[k];
      history[k] = function (s, t, u) { const r = orig.apply(this, arguments); window.__paths.push(location.pathname + location.search + location.hash); return r; };
    }
  });
  await page.goto(B + path, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(900);
  return { page, errs };
}
const q = (p, fn, ...a) => p.evaluate(fn, ...a);
const dialogOpen = (p) => q(p, () => !!document.querySelector('[role="dialog"][aria-modal="true"]'));
const active = (p) => q(p, () => { const a = document.activeElement; return a ? (a.id || a.getAttribute("aria-label") || a.className || a.tagName) : null; });
async function fill(p, email, password) {
  await p.click("#login-email", { clickCount: 3 }); await p.type("#login-email", email);
  await p.click("#login-password", { clickCount: 3 }); await p.type("#login-password", password);
}
async function axe(p, label) {
  await p.addScriptTag({ content: AXE });
  const r = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length}`));
  ok(r.length === 0, `axe: no violations — ${label}`, r);
}

// ================= desktop =================
{
  const { page, errs } = await open();
  const trigger = await q(page, () => { const b = document.querySelector(".site-login"); return [b.tagName, b.getAttribute("aria-haspopup")]; });
  ok(trigger[0] === "BUTTON" && trigger[1] === "dialog", "header Log in is a <button aria-haspopup=dialog>", trigger);
  await page.click(".site-login"); await sleep(350);
  ok(await dialogOpen(page), "header button opens the dialog");
  ok((await active(page)) === "login-email", "focus moves to Email", await active(page));
  const a11y = await q(page, () => { const d = document.querySelector('[role="dialog"]'); return [d.getAttribute("aria-labelledby"), d.getAttribute("aria-describedby"), document.getElementById("login-title")?.textContent, document.getElementById("login-desc")?.textContent]; });
  ok(a11y.join("|") === "login-title|login-desc|Log in|Log in to your Barangay Binitayan account.", "dialog labelled + described with the exact copy", a11y);
  const env = await q(page, () => ({ inert: document.getElementById("root").hasAttribute("inert"), overflow: document.body.style.overflow, blur: getComputedStyle(document.querySelector(".ld-scrim")).backdropFilter, bg: getComputedStyle(document.querySelector(".ld-scrim")).backgroundColor, w: document.querySelector(".ld-panel").getBoundingClientRect().width, r: getComputedStyle(document.querySelector(".ld-panel")).borderRadius, tape: getComputedStyle(document.querySelector(".ld-tape")).backgroundImage }));
  ok(env.inert && env.overflow === "hidden", "page behind is inert and scroll-locked", env);
  // Nothing from the page (e.g. the Leaflet hero map, z-index 400+) may draw over the panel.
  const covered = await q(page, () => {
    const p = document.querySelector(".ld-panel"), r = p.getBoundingClientRect(), bad = [];
    for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.1, 0.5, 0.9]) {
      const el = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      if (!el || !p.contains(el)) bad.push([fx, fy, el && (el.className || el.tagName)]);
    }
    return bad;
  });
  ok(covered.length === 0, "the panel is on top everywhere (no page layer over it)", covered);
  ok(env.blur.includes("blur(6px)") && env.bg === "rgba(15, 39, 64, 0.45)", "scrim: navy 45% + 6px blur", env);
  ok(env.w === 448 && env.r === "20px" && env.tape.includes("repeating-linear-gradient"), "panel 448px, 20px radius, hazard tape on top", env);
  const copy = await q(page, () => document.querySelector(".ld-panel").innerText);
  ok(["Email", "Password", "Forgot password?", "Log in", "NEW HERE?", "Create a resident account", "Emergency? Don't wait to log in.", "911"].every((s) => copy.includes(s)), "all spec copy present", copy);
  ok(await q(page, () => { const s = document.querySelector(".lf-seal"); return s && s.tagName === "IMG" && s.alt === "Barangay Binitayan seal" && s.naturalWidth > 0; }), "official seal image loads (64px, alt text)");
  const inputs = await q(page, () => { const e = document.getElementById("login-email"), p = document.getElementById("login-password"); return [e.type, e.autocomplete, e.inputMode, e.name, p.type, p.autocomplete, p.name, e.getBoundingClientRect().height, document.querySelector(".lf-form").getAttribute("method")]; });
  ok(inputs.join() === "email,username,email,email,password,current-password,password,48,post", "inputs: types, names, autocomplete for password managers, 48px", inputs);
  await page.screenshot({ path: `${OUT}/login_desktop_open.png` });
  await axe(page, "dialog open (idle)");

  // Tab trap
  const seen = new Set();
  for (let i = 0; i < 14; i++) { await page.keyboard.press("Tab"); seen.add(await q(page, () => !!document.activeElement.closest(".ld-panel"))); }
  ok(seen.size === 1 && seen.has(true), "Tab stays inside the dialog");
  await page.focus("#login-email"); await page.keyboard.down("Shift"); await page.keyboard.press("Tab"); await page.keyboard.up("Shift");
  ok((await active(page)) === "Close", "Shift+Tab from Email wraps to the last control (Close)", await active(page));

  // Esc closes and returns focus
  await page.keyboard.press("Escape"); await sleep(300);
  ok(!(await dialogOpen(page)) && (await q(page, () => document.activeElement.classList.contains("site-login"))), "Esc closes; focus back on the Log in button");
  ok(await q(page, () => !document.getElementById("root").hasAttribute("inert") && document.body.style.overflow === ""), "page restored (not inert, scrollable)");

  // ✕ closes
  await page.click(".site-login"); await sleep(300); await page.click(".ld-close"); await sleep(300);
  ok(!(await dialogOpen(page)), "✕ closes");
  // backdrop: clean closes, dirty stays
  await page.click(".site-login"); await sleep(300); await page.mouse.click(20, 450); await sleep(300);
  ok(!(await dialogOpen(page)), "backdrop click closes an untouched form");
  await page.click(".site-login"); await sleep(300); await page.type("#login-email", "someone@"); await page.mouse.click(20, 450); await sleep(400);
  ok(await dialogOpen(page), "backdrop click keeps a form with typed input open");
  await page.mouse.click(720, 700); // a click inside the panel never closes
  ok(await dialogOpen(page), "clicks inside the panel never close");
  // Back button closes
  await page.goBack(); await sleep(400);
  ok(!(await dialogOpen(page)) && (await q(page, () => location.pathname + location.search)) === "/", "browser Back closes the dialog and stays on /");

  // validation
  await page.click(".site-login"); await sleep(300);
  await page.click(".lf-submit"); await sleep(200);
  const v = await q(page, () => [...document.querySelectorAll(".lf-error")].map((e) => e.textContent).join("|") + "#" + document.getElementById("login-email").getAttribute("aria-invalid") + "#" + document.getElementById("login-email").getAttribute("aria-describedby"));
  ok(v === "Enter a valid email address.|Enter your password.#true#login-email-error", "empty submit: both messages, aria-invalid + aria-describedby", v);
  ok((await active(page)) === "login-email" && page.posts.length === 0, "focus on first invalid field; nothing sent");
  await page.type("#login-email", "admin@binitayan.test"); await sleep(100);
  ok(await q(page, () => !document.getElementById("login-email-error")), "errors update live after the first submit");
  await axe(page, "validation errors shown");

  // show / hide password keeps focus + caret
  await page.click("#login-password"); await page.type("#login-password", "secret12");
  await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft");
  await page.click(".lf-eye"); await sleep(100);
  const eye = await q(page, () => { const p = document.getElementById("login-password"), b = document.querySelector(".lf-eye"); return [p.type, b.getAttribute("aria-label"), b.getAttribute("aria-pressed"), document.activeElement === p, p.selectionStart]; });
  ok(eye.join() === "text,Hide password,true,true,6", "show password: type text, label + pressed switch, focus and caret kept", eye);
  await page.click(".lf-eye"); await sleep(50);
  ok((await q(page, () => document.getElementById("login-password").type)) === "password", "hide password again");

  // server errors
  const attempt = async (mock) => {
    page.mock = mock; await fill(page, "admin@binitayan.test", "wrongpass"); await page.keyboard.press("Enter"); await sleep((mock.delay || 0) + 500);
    return q(page, () => ({ banner: document.querySelector(".lf-banner")?.textContent || "", pwd: document.getElementById("login-password").value, email: document.getElementById("login-email").value, focus: document.activeElement.classList.contains("lf-banner"), disabled: document.querySelector(".lf-submit").disabled }));
  };
  let r = await attempt({ status: 401, body: { success: false, message: "Invalid email or password." } });
  ok(r.banner === "Incorrect email or password." && r.pwd === "" && r.email === "admin@binitayan.test" && r.focus, "401: generic message, password cleared, email kept, focus on banner", r);
  await page.screenshot({ path: `${OUT}/login_desktop_error.png` });
  await axe(page, "error banner shown");
  r = await attempt({ status: 403, body: { success: false, message: "Your account has been deactivated." } });
  ok(r.banner === "This account is disabled. Contact the barangay office.", "403: disabled message", r);
  r = await attempt({ status: 500, body: { success: false } });
  ok(r.banner === "Can't connect right now. Check your connection and try again." && r.email === "admin@binitayan.test", "500: connection message, email kept", r);
  r = await attempt({ abort: true });
  ok(r.banner.startsWith("Can't connect right now"), "network failure: connection message", r);
  r = await attempt({ status: 429, body: { success: false, message: "Too many failed sign-in attempts. Please wait 15 minutes and try again." } });
  ok(r.banner === "Too many attempts. Try again in 15 minutes.", "429 (no Retry-After): minutes from the server", r);
  r = await attempt({ status: 429, body: { success: false }, headers: { "Retry-After": "3" } });
  ok(r.banner.includes("seconds") && r.disabled, "429 with Retry-After: countdown, submit disabled", r);
  await sleep(3300);
  ok(await q(page, () => !document.querySelector(".lf-submit").disabled && !document.querySelector(".lf-banner")), "after the countdown the button is enabled again");

  // submitting state
  page.mock = { status: 401, body: {}, delay: 1500 };
  await fill(page, "admin@binitayan.test", "pass1234"); await page.click(".lf-submit"); await sleep(250);
  const sub = await q(page, () => [document.querySelector(".lf-submit").textContent, document.querySelector(".lf-form").getAttribute("aria-busy"), document.getElementById("login-email").disabled, document.getElementById("login-password").disabled]);
  ok(sub.join() === "Logging in…,true,true,true", "submitting: spinner text, aria-busy, fields disabled", sub);
  await page.keyboard.press("Escape"); await page.click(".lf-submit").catch(() => {}); await sleep(100);
  ok(await dialogOpen(page) && page.posts.filter((x) => x.includes("pass1234")).length === 1, "Esc ignored and no double submit while submitting");
  await sleep(1700);

  const stored = await q(page, () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  ok(!/wrongpass|pass1234|secret12/.test(stored), "no password in localStorage/sessionStorage");
  ok(errs.length === 0, "no JavaScript errors (desktop)", errs.slice(0, 4));
  await page.close();
}

// ================= success + redirects =================
async function successFlow(path, user, label, expect) {
  const { page } = await open(1280, 860, path);
  page.mock = { status: 200, body: { success: true, message: "Login successful.", user: USERS[user] } };
  if (!(await dialogOpen(page))) { await page.click(".site-login"); await sleep(300); }
  await fill(page, "x@binitayan.test", "pass1234"); await page.click(".lf-submit"); await sleep(250);
  const btn = await q(page, () => document.querySelector(".lf-submit")?.textContent);
  await sleep(1200);
  const paths = await q(page, () => window.__paths);
  ok(paths.some((x) => x.split(/[?#]/)[0] === expect) && paths.every((x) => x.startsWith("/") && !x.split(/[?#]/)[0].includes("evil")), `${label} -> ${expect}`, paths);
  await page.close();
  return btn;
}
ok((await successFlow("/", "admin", "admin login", "/admin")) === "Success", "success state shown on the button before redirecting");
await successFlow("/", "resident", "resident login", "/resident");
await successFlow("/?login=1&next=%2Fadmin%2Fmap%3Fhousehold%3D4", "admin", "next inside /admin honoured", "/admin/map");
await successFlow("/?login=1&next=%2F%2Fevil.com%2Fadmin", "admin", "next //evil.com ignored", "/admin");
await successFlow("/?login=1&next=https%3A%2F%2Fevil.com", "admin", "next https://evil.com ignored", "/admin");
await successFlow("/?login=1&next=%2Fadmin%2Fmap", "resident", "resident with next=/admin/map", "/resident");

// ================= deep links + guard + /login =================
{
  const { page } = await open(1280, 860, "/?login=1");
  ok(await dialogOpen(page) && (await q(page, () => location.search)) === "", "/?login=1 opens the dialog and cleans the URL");
  await page.close();
}
{
  const { page } = await open(1280, 860, "/#login");
  ok(await dialogOpen(page) && (await q(page, () => location.hash)) === "", "/#login opens the dialog and cleans the URL");
  await page.close();
}
{
  const { page } = await open(1280, 860, "/admin/map");
  ok(await dialogOpen(page) && (await q(page, () => location.pathname)) === "/", "protected page while logged out -> home with the login dialog");
  page.mock = { status: 200, body: { success: true, user: USERS.admin } }; 
  await fill(page, "x@binitayan.test", "pass1234"); await page.click(".lf-submit"); await sleep(1400);
  ok((await q(page, () => window.__paths)).some((x) => x === "/admin/map"), "after logging in, back to the protected page (next)");
  await page.close();
}
{
  const { page } = await open(1280, 860, "/?login=1&reason=idle");
  ok((await q(page, () => document.querySelector(".lf-notice")?.textContent || "")).includes("signed out after a period of inactivity"), "idle sign-out notice shown in the dialog");
  await page.close();
}
{
  const { page, errs } = await open(1280, 860, "/login");
  await page.screenshot({ path: `${OUT}/login_page.png` });
  ok(!(await dialogOpen(page)) && await q(page, () => !!document.querySelector('main form input[name="email"]') && document.querySelector("h1#login-title")?.textContent === "Log in"), "/login still renders the same form as a page (h1)");
  await page.click(".site-login"); await sleep(200);
  ok((await active(page)) === "login-email" && !(await dialogOpen(page)), "on /login the header button focuses the form instead of stacking a dialog");
  await axe(page, "/login page");
  ok(errs.length === 0, "/login: no JavaScript errors", errs.slice(0, 3));
  page.mock = { status: 200, body: { success: true, user: USERS.admin } }; 
  await fill(page, "x@binitayan.test", "pass1234"); await page.click('button[type="submit"]'); await sleep(1400);
  ok((await q(page, () => window.__paths)).some((x) => x === "/admin"), "/login page logs in and redirects by role");
  await page.close();
}
{
  const { page } = await open(1280, 860, "/");
  await page.evaluate(() => document.querySelector(".cta-band")?.scrollIntoView());
  const cta = await page.$('.cta-band button[aria-haspopup="dialog"]');
  if (!(await page.$('.cta-band'))) console.log("SKIP CTA band: RegisterCTA is not rendered on the home page");
  else {
    ok(!!cta, "CTA band Log in is a dialog button");
    await cta.click(); await sleep(300);
    ok(await dialogOpen(page), "CTA band Log in opens the dialog");
  }
  await page.close();
}
if (ADMIN_SESSION) {
  const { page } = await open(1280, 860, "/?login=1", { session: ADMIN_SESSION });
  await sleep(600);
  ok(!(await dialogOpen(page)) && (await q(page, () => location.pathname)).startsWith("/admin"), "already logged in: ?login=1 goes to the dashboard instead");
  await page.deleteCookie({ name: "PHPSESSID", domain: "localhost" }); // later pages must be logged out
  await page.close();
} else console.log("SKIP already-logged-in check (set GIS_ADMIN_SESSION)");

// ================= responsive =================
for (const [w, h] of [[360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
  const { page, errs } = await open(w, h, "/?login=1");
  const m = await q(page, () => {
    const p = document.querySelector(".ld-panel").getBoundingClientRect(), cs = getComputedStyle(document.querySelector(".ld-panel"));
    const sc = document.querySelector(".ld-scroll");
    return { w: Math.round(p.width), bottom: Math.round(p.bottom), left: Math.round(p.left), r: cs.borderRadius, font: getComputedStyle(document.getElementById("login-email")).fontSize,
      overflowX: document.documentElement.scrollWidth > innerWidth + 1, scrolls: sc.scrollHeight > sc.clientHeight, closeTop: Math.round(document.querySelector(".ld-close").getBoundingClientRect().top - p.top) };
  });
  if (w < 480) {
    ok(m.w === w && m.bottom === h && m.r === "20px 20px 0px 0px" && m.font === "16px", `${w}px: bottom sheet, full width, top radius only, 16px inputs`, m);
    await page.evaluate(() => { const s = document.querySelector(".ld-scroll"); s.scrollTop = s.scrollHeight; });
    await sleep(150);
    const closeVisible = await q(page, () => document.querySelector(".ld-close").getBoundingClientRect().top >= 0);
    ok(closeVisible, `${w}px: close button stays visible while the sheet scrolls`);
    await page.evaluate(() => document.querySelector(".lf-submit").scrollIntoView({ block: "nearest" }));
    await sleep(150);
    const submitBox = await q(page, () => { const r = document.querySelector(".lf-submit").getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight]; });
    ok(submitBox[0] >= 0 && submitBox[1] <= submitBox[2], `${w}px: submit can be scrolled fully into view inside the sheet`, submitBox);
  } else {
    ok(m.w === 448 && Math.abs(m.left - (w - 448) / 2) <= 1 && m.r === "20px", `${w}px: centered 448px panel`, m);
  }
  ok(!m.overflowX, `${w}px: no horizontal scroll`, m);
  const hidden = await q(page, () => {
    const p = document.querySelector(".ld-panel"), r = p.getBoundingClientRect(), bad = [];
    for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.15, 0.5, 0.85]) {
      const y = Math.min(r.top + r.height * fy, innerHeight - 2);
      const el = document.elementFromPoint(r.left + r.width * fx, y);
      if (!el || !p.contains(el)) bad.push([fx, fy, el && (el.className || el.tagName)]);
    }
    return bad;
  });
  ok(hidden.length === 0, `${w}px: nothing from the page draws over the dialog`, hidden);
  await page.screenshot({ path: `${OUT}/login_${w}.png` });
  ok(errs.length === 0, `${w}px: no JavaScript errors`, errs.slice(0, 3));
  await page.close();
}
{
  const { page } = await open(1280, 860, "/?login=1", { reduced: true });
  ok(await q(page, () => getComputedStyle(document.querySelector(".ld-panel")).animationName === "none" && getComputedStyle(document.querySelector(".ld-scrim")).animationName === "none"), "prefers-reduced-motion: no open animation");
  await page.close();
}

await browser.close();
console.log(`\nLOGIN DIALOG UI TEST: ${res.filter(Boolean).length}/${res.length} passed`);
process.exit(res.every(Boolean) ? 0 : 1);
