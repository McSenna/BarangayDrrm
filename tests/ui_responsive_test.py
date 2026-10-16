"""
Responsive UI / browser test (Chromium via Playwright, LOCAL dev server only).

Visits every static route for each role at 390x844, 768x1024, 1024x768 and
1366x768 and records: horizontal overflow, uncaught page errors, console
errors, failing API calls (HTTP >= 400), blank pages and role redirects.
Also checks the Evacuation Center Add/Edit modal over the Leaflet map,
the mobile navigation, CSV/PDF export downloads, the Phase 23 module
navigation, retired-route redirects, Hazard Monitoring filters and map layers.

Requires: Vite on http://localhost:5173, PHP API on 127.0.0.1:8080.
Usage: python3 tests/ui_responsive_test.py <admin_pw>
Note: OpenStreetMap tile requests fail in an offline sandbox; those network
errors are excluded (they are not application errors).
"""
import json, sys, re
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
CREDS = {
    "admin": ("admin@binitayan.gov.ph", sys.argv[1]),
    "resident": ("demo.resident1@binitayan.gov.ph", "demo1234"),
    "personnel": ("demo.personnel1@binitayan.gov.ph", "demo1234"),
}
VIEWPORTS = [(390, 844), (768, 1024), (1024, 768), (1366, 768)]
ROUTES = {
    # Phase 23: retired pages removed from the route list (their redirects are checked below).
    "admin": ["/admin", "/admin/households", "/admin/reports", "/admin/reports/new", "/admin/disaster-events",
              "/admin/analytics/situation-report", "/admin/priority", "/admin/recommendations",
              "/admin/monitoring", "/admin/map", "/admin/hazard-alerts", "/admin/affected-areas", "/admin/evacuation-centers",
              "/admin/allocations", "/admin/relief-requests", "/admin/relief-requests/1", "/admin/inventory", "/admin/inventory/logs",
              "/admin/sms-logs", "/admin/send-sms",
              "/admin/administrators", "/admin/residents", "/admin/personnel", "/admin/audit-logs", "/admin/login-history",
              "/admin/my-profile", "/admin/system-settings", "/admin/inventory-settings", "/admin/disaster-settings", "/admin/purok-cleanup"],
    "resident": ["/resident", "/resident/household", "/resident/relief-status", "/resident/my-profile", "/resident/notifications"],
    "personnel": ["/personnel", "/personnel/reports", "/personnel/reports/new", "/personnel/priority", "/personnel/monitoring",
                  "/personnel/map", "/personnel/assigned", "/personnel/notifications", "/personnel/my-profile"],
}
# Phase 23: retired or merged pages -> where their function now lives.
RETIRED = {
    "admin": {"/admin/household-stats": "/admin", "/admin/weather": "/admin/hazard-alerts", "/admin/inventory/low-stock": "/admin/inventory?filter=low",
              "/admin/inventory/donations": "/admin/inventory", "/admin/packages": "/admin/allocations", "/admin/schedules": "/admin/allocations",
              "/admin/schedules/new": "/admin/allocations", "/admin/schedules/1": "/admin/allocations", "/admin/analytics": "/admin/analytics/situation-report",
              "/admin/analytics/disasters": "/admin/analytics/situation-report", "/admin/analytics/households": "/admin/analytics/situation-report",
              "/admin/analytics/inventory": "/admin/analytics/situation-report", "/admin/analytics/relief": "/admin/analytics/situation-report",
              "/admin/feedback": "/admin"},
    "personnel": {"/personnel/beneficiaries": "/personnel/map", "/personnel/history": "/personnel/assigned?view=distributed",
                  "/personnel/schedules": "/personnel/assigned", "/personnel/beneficiary-verification": "/personnel/assigned",
                  "/personnel/completed-deliveries": "/personnel/assigned", "/personnel/weather-hazards": "/personnel/monitoring",
                  "/personnel/evacuation-centers": "/personnel/map"},
}
PUBLIC = ["/", "/about", "/contact", "/login", "/register"]
IGNORE = re.compile(r"tile\.openstreetmap|openstreetmap\.org|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|favicon|unpkg\.com|ERR_CONNECTION|Failed to load resource")
out = {"routes": [], "checks": []}


def check(name, ok, detail=""):
    out["checks"].append({"check": name, "status": "PASS" if ok else "FAIL", "detail": "" if ok else str(detail)[:300]})
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" -> {str(detail)[:300]}"))


pw = sync_playwright().start()
browser = pw.chromium.launch()


def session(role, w, h):
    ctx = browser.new_context(viewport={"width": w, "height": h}, accept_downloads=True)
    page = ctx.new_page()
    errs, api = [], []
    page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    page.on("console", lambda m: errs.append(f"console: {m.text}") if m.type == "error" and not IGNORE.search(m.text) else None)
    page.on("response", lambda r: api.append(f"{r.status} {r.url.split('/backend/')[-1]}") if "/backend/" in r.url and r.status >= 400 else None)
    if role:
        email, pwd = CREDS[role]
        page.goto(BASE + "/login")
        page.fill('input[name="email"]', email)
        page.fill('input[name="password"]', pwd)
        page.click('button[type="submit"]')
        page.wait_for_timeout(1500)
    return ctx, page, errs, api


for (w, h) in VIEWPORTS:
    for role in [None, "admin", "resident", "personnel"]:
        ctx, page, errs, api = session(role, w, h)
        for path in (PUBLIC if role is None else ROUTES[role]):
            errs.clear(); api.clear()
            page.goto(BASE + path)
            page.wait_for_timeout(1300)
            url = page.url.replace(BASE, "")
            info = page.evaluate("""() => ({
                overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
                sw: document.documentElement.scrollWidth,
                textLen: (document.querySelector('main') || document.body).innerText.trim().length,
                clipped: [...document.querySelectorAll('button, .btn')].filter(b => b.offsetParent && b.scrollWidth > b.clientWidth + 2).length,
                tablesWrapped: [...document.querySelectorAll('table')].every(t => { let p = t.parentElement; while (p && p !== document.body) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX)) return true; p = p.parentElement; } return t.scrollWidth <= window.innerWidth; })
            })""")
            rec = {"vp": f"{w}x{h}", "role": role or "public", "path": path, "final": url, **info, "errors": list(errs), "api_errors": list(api)}
            out["routes"].append(rec)
        # mobile navigation
        if role and w == 390:
            page.goto(BASE + ROUTES[role][0]); page.wait_for_timeout(1000)
            tog = page.query_selector(".sidebar-toggle")
            vis = tog is not None and tog.is_visible()
            if vis:
                tog.click(); page.wait_for_timeout(400)
            opened = page.evaluate("!!document.querySelector('.sidebar-nav-open')")
            check(f"{role} mobile hamburger opens navigation at 390px", vis and opened, (vis, opened))
        if role and w == 1366:
            page.goto(BASE + ROUTES[role][0]); page.wait_for_timeout(800)
            tog = page.query_selector(".sidebar-toggle")
            check(f"{role} hamburger hidden at 1366px (full sidebar)", tog is None or not tog.is_visible())
        ctx.close()

# role guards in the browser
for role, forbidden in [("resident", "/admin/households"), ("resident", "/personnel/assigned"), ("personnel", "/admin/inventory"), ("personnel", "/resident/relief-status"),
                        # Phase 21: retired resident pages and staff report pages
                        ("resident", "/resident/submit-report"), ("resident", "/resident/my-reports"), ("resident", "/resident/relief-requests"),
                        ("resident", "/resident/feedback"), ("resident", "/admin/reports/new"), ("resident", "/personnel/reports/new")]:
    ctx, page, errs, api = session(role, 1366, 768)
    page.goto(BASE + forbidden); page.wait_for_timeout(1200)
    check(f"{role} redirected away from {forbidden}", not page.url.endswith(forbidden), page.url)
    ctx.close()
for role, table in RETIRED.items():
    ctx, page, errs, api = session(role, 1366, 768)
    for old, new in table.items():
        page.goto(BASE + old); page.wait_for_timeout(900)
        got = page.url.replace(BASE, "")
        check(f"{role} retired route {old} -> {new}", got == new, got)
    ctx.close()
ctx, page, errs, api = session(None, 1366, 768)
page.goto(BASE + "/admin/households"); page.wait_for_timeout(1200)
check("anonymous user redirected from protected page to login", "/login" in page.url, page.url)
ctx.close()

# evacuation modal over Leaflet map (Add and Edit), all 4 viewports
for (w, h) in VIEWPORTS:
    ctx, page, errs, api = session("admin", w, h)
    page.goto(BASE + "/admin/evacuation-centers"); page.wait_for_timeout(2200)
    has_map = page.evaluate("!!document.querySelector('.leaflet-container')")
    for mode in ["Add", "Edit"]:
        if mode == "Add":
            page.click("text=+ Add Evacuation Center")
        else:
            page.keyboard.press("Escape"); page.wait_for_timeout(300)
            if page.query_selector(".modal-box"):
                b = [x for x in page.query_selector_all(".modal-box button") if x.inner_text().strip() in ("Cancel", "Close", "✕")]
                if b: b[0].click()
            page.wait_for_timeout(300)
            eb = [x for x in page.query_selector_all("button") if x.inner_text().strip() == "Edit" and x.is_visible()]
            if not eb:
                check(f"evacuation Edit modal at {w}x{h}", False, "no Edit button visible"); continue
            eb[0].click()
        page.wait_for_timeout(700)
        res = page.evaluate("""() => {
          const m = document.querySelector('.modal-box'); if (!m) return null;
          const box = m.getBoundingClientRect(); let covered = 0, total = 0;
          for (let y = box.top + 5; y < Math.min(box.bottom, innerHeight) - 2; y += 25) for (let x = box.left + 5; x < box.right - 5; x += 40) {
            total++; const el = document.elementFromPoint(x, y); if (!el || !el.closest('.modal-box')) covered++; }
          m.scrollTop = m.scrollHeight;
          const s = [...m.querySelectorAll('button')].find(b => /^(Save|Save Changes|Add Center|Update)/.test(b.textContent.trim()));
          let onTop = false, inView = false;
          if (s) { const r = s.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); onTop = el === s || s.contains(el); inView = r.bottom <= innerHeight && r.top >= 0; }
          return {covered, total, onTop, inView, fits: box.width <= innerWidth};
        }""")
        ok = res and res["covered"] == 0 and res["onTop"] and res["inView"] and res["fits"]
        check(f"evacuation {mode} modal fully above Leaflet map, Save reachable at {w}x{h} (map present={has_map})", ok, res)
        page.screenshot(path=f"/home/claude/ui/st_evac_{mode.lower()}_{w}.png")
    ctx.close()

# exports and rule-based summary (1366)
ctx, page, errs, api = session("admin", 1366, 768)
for path in ["/admin/inventory", "/admin/households", "/admin/reports", "/admin/allocations"]:
    page.goto(BASE + path); page.wait_for_timeout(1500)
    try:
        with page.expect_download(timeout=8000) as dl:
            page.click("text=Export CSV")
        d = dl.value
        p = f"/home/claude/ui/st_export{path.replace('/', '_')}.csv"; d.save_as(p)
        txt = open(p, encoding="utf-8-sig").read()
        check(f"CSV export downloads from {path}", txt.count("\n") >= 1 and "," in txt, txt[:80])
    except Exception as e:
        check(f"CSV export downloads from {path}", False, e)
# Phase 23: the four analytics pages were retired; the Situation Report is the one report export.
page.goto(BASE + "/admin/analytics/situation-report"); page.wait_for_timeout(3000)
try:
    if page.query_selector('input[type="date"]'):  # no disaster events on this database -> reporting period
        import datetime as _dt
        ds = page.query_selector_all('input[type="date"]')
        ds[0].fill((_dt.date.today() - _dt.timedelta(days=60)).isoformat()); ds[1].fill(_dt.date.today().isoformat())
    page.click("text=Generate Disaster Situation Report"); page.wait_for_timeout(3000)
    with page.expect_download(timeout=20000) as dl:
        page.click("text=Export PDF")
    d = dl.value
    p = "/home/claude/ui/st_export_situation_report.pdf"; d.save_as(p)
    check("PDF export downloads from the Situation Report", open(p, "rb").read(5) == b"%PDF-", p)
except Exception as e:
    check("PDF export downloads from the Situation Report", False, e)

# Phase 23: six core modules in the admin navigation and on the dashboard
page.goto(BASE + "/admin"); page.wait_for_timeout(2500)
nav = page.inner_text("aside").lower()  # group labels are uppercased by CSS
groups = ["Automation of Reporting", "DSS / Household Priorities", "Hazard Monitoring & Map", "Relief Allocation", "SMS Notifications", "Administration"]
check("admin sidebar shows Dashboard + the six module groups + Administration", "dashboard" in nav and all(g.lower() in nav for g in groups), nav)
check("admin sidebar no longer lists retired pages",
      not any(x.lower() in nav for x in ["Household Statistics", "Weather Monitoring", "Low Stock", "Donations", "Relief Packages", "Distribution Schedules", "Relief Feedback", "Analytics"]), nav)
cards = page.evaluate("[...document.querySelectorAll('.module-card h2')].map(e => e.textContent)")
check("admin dashboard shows one card per core module (6)", len(cards) == 6 and "SMS" in cards[-1], cards)
page.goto(BASE + "/admin/monitoring"); page.wait_for_timeout(2500)
labels = page.evaluate("[...document.querySelectorAll('main label')].map(e => e.textContent.trim())")
check("Hazard Monitoring has type, severity, purok and status filters", all(x in labels for x in ["Type", "Severity", "Purok", "Status"]), labels)
check("Hazard Monitoring lists incidents with reference numbers", "RPT-" in page.inner_text("main"), page.inner_text("main")[:200])
page.select_option("#hm-sev", "Critical"); page.wait_for_timeout(500)
sev = page.evaluate("[...document.querySelectorAll('main table tbody tr td:nth-child(4)')].map(e => e.textContent.trim())")
check("severity filter shows only Critical incidents", all(x == "Critical" for x in sev), sev)
page.goto(BASE + "/admin/map"); page.wait_for_timeout(2500)
mk = page.evaluate("document.querySelectorAll('.leaflet-marker-icon, .leaflet-interactive').length")
check("admin map renders household/center markers", mk > 0, mk)
check("admin map draws Binitayan boundary layer", page.evaluate("!!document.querySelector('path.leaflet-interactive')"))
check("admin map has the disaster-incident layer and incident status filter",
      page.evaluate("!!document.querySelector('#map-inc-status')") and "Disaster incidents" in page.inner_text("main"))
check("admin map distinguishes flood-prone zones from active flooding in the legend", "not active flooding" in page.inner_text("main"))
check("admin map offers Edit location for households", page.evaluate("[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Edit location')"))
page.screenshot(path="/home/claude/ui/st_admin_map.png")
# logout
btn = [b for b in page.query_selector_all("button, a") if b.inner_text().strip().lower() in ("logout", "log out", "sign out") and b.is_visible()]
if btn:
    btn[0].click(); page.wait_for_timeout(1200)
    page.goto(BASE + "/admin"); page.wait_for_timeout(1000)
    check("logout from UI returns to login and protects pages", "/login" in page.url, page.url)
else:
    check("logout button visible", False, "not found")
ctx.close()

# Phase 21: resident navigation shows only the permitted functions; no report submission anywhere
ctx, page, errs, api = session("resident", 1366, 768)
page.goto(BASE + "/resident"); page.wait_for_timeout(2000)
nav = page.inner_text("aside") if page.query_selector("aside") else page.inner_text("body")
check("resident sidebar lists only Dashboard, Relief Allocation Status, Notifications, My Household, My Profile",
      all(x in nav for x in ["Dashboard", "Relief Allocation Status", "Notifications", "My Household", "My Profile"])
      and not any(x in nav for x in ["Submit Disaster Report", "My Disaster Reports", "Relief Requests", "Relief Feedback", "Evacuation Centers", "Weather"]), nav)
body = page.inner_text("main")
check("resident dashboard has no report-submission action", "Submit Disaster Report" not in body and "Submit Report" not in body, body[:300])
check("resident dashboard shows allocation status and account", "Relief Allocation Status" in body and "My Account" in body, body[:300])
page.goto(BASE + "/resident/my-profile"); page.wait_for_timeout(1500)
check("resident profile: name and email are read-only, contact number editable",
      page.get_attribute('input[name="full_name"]', "readonly") is not None and page.get_attribute('input[name="email"]', "readonly") is not None
      and page.get_attribute('input[name="contact_number"]', "readonly") is None)
page.screenshot(path="/home/claude/ui/st_res_dashboard.png")
ctx.close()
browser.close(); pw.stop()

# summarize routes
bad = [r for r in out["routes"] if r["overflow"] or r["errors"] or r["api_errors"] or r["textLen"] < 20 or (r["role"] != "public" and r["final"].split("?")[0] == "/login") or not r["tablesWrapped"]]
print(f"\nROUTE VISITS: {len(out['routes'])}, with issues: {len(bad)}")
for r in bad:
    print(" ", r["vp"], r["role"], r["path"], "->", r["final"], "overflow" if r["overflow"] else "", f"sw={r['sw']}" if r["overflow"] else "", r["errors"][:2], r["api_errors"][:3], "" if r["tablesWrapped"] else "TABLE-NOT-WRAPPED", f"text={r['textLen']}" if r["textLen"] < 20 else "")
c = {}
for x in out["checks"]:
    c[x["status"]] = c.get(x["status"], 0) + 1
print("CHECKS:", c)
json.dump(out, open("/home/claude/tests/ui_results.json", "w"), indent=1)
