"""
Phase 24 browser test — Purok boundaries on the Barangay Map (Chromium/Playwright).
Runs against the defense build: Vite preview on :5174 -> API :8084 (def21_rehearsal,
seeded with database/seed_defense_demo.php). Read-only except the test login.
Usage: python3 tests/ui_purok_map_test.py [frontend_url]

SUPERSEDED (2026-10-16): the Barangay Map page was rebuilt as the GIS Household &
Flood-Prone Zone Map (components/gis/). Its selectors (#map-purok, Purok colours,
"Purok 1 (outline only)") no longer exist, and Purok 1 is valid since the approved
end-vertex fix. Use tests/ui_gis_map_test.mjs for the map page instead.
"""
import sys
from playwright.sync_api import sync_playwright
B = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5174").rstrip("/")
PW = "BinitayanTest2026!"
COL = {"Purok 1": "#1f77b4", "Purok 2": "#e6730b", "Purok 3": "#2ca02c", "Purok 4": "#d62728", "Purok 5A": "#9467bd", "Purok 5B": "#8c564b", "Purok 6": "#d1499b", "Purok 7": "#0e9aa7"}
res = []
def check(n, c, d=""):
    res.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ("" if c else f"  -> {str(d)[:300]}"))

def login(b, email, w=1366, h=900):
    ctx = b.new_context(viewport={"width": w, "height": h}); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "tile.openstreetmap" not in m.text and "Failed to load resource" not in m.text else None)
    pg.goto(B + "/login"); pg.fill('input[name="email"]', email); pg.fill('input[name="password"]', PW); pg.click('button[type="submit"]'); pg.wait_for_timeout(1800)
    return ctx, pg, errs

paths = """(c) => [...document.querySelectorAll('.leaflet-overlay-pane path')].filter(p => (p.getAttribute('stroke')||'').toLowerCase() === c)
  .map(p => ({fill: p.getAttribute('fill'), dash: p.getAttribute('stroke-dasharray'), fo: parseFloat(p.getAttribute('fill-opacity')||'0'), w: parseFloat(p.getAttribute('stroke-width')||'0')}))"""
with sync_playwright() as p:
    b = p.chromium.launch()
    for role, email, base in [("admin", "admin.binitayan.test@gmail.com", "/admin"), ("personnel", "personnel.binitayan.test@gmail.com", "/personnel")]:
        ctx, pg, errs = login(b, email)
        pg.goto(B + base + "/map"); pg.wait_for_timeout(4000)
        for name, c in COL.items():
            ps = pg.evaluate(paths, c)
            if name == "Purok 1":
                check(f"[{role}] {name} drawn as dashed outline only (failed validation, no fill)", len(ps) >= 1 and all(x["fill"] == "none" and x["dash"] for x in ps), ps)
            else:
                check(f"[{role}] {name} drawn with translucent fill", len(ps) >= 1 and all(0 < x["fo"] < 0.5 for x in ps), ps)
        body = pg.inner_text("main")
        check(f"[{role}] legend lists all eight Puroks and marks Purok 1 as outline only",
              all(n in body for n in COL) and "Purok 1 (outline only — failed validation)" in body)
        check(f"[{role}] barangay boundary still drawn", pg.evaluate("[...document.querySelectorAll('.leaflet-overlay-pane path')].some(p => p.getAttribute('stroke') === '#0f5c56')"))
        check(f"[{role}] household markers and incident pins still shown", pg.evaluate("document.querySelectorAll('.leaflet-overlay-pane path.leaflet-interactive').length") > 8
              and pg.evaluate("document.querySelectorAll('.map-pin-incident').length") > 0)
        opts = pg.evaluate("[...document.querySelectorAll('#map-purok option')].map(o => o.value)")
        check(f"[{role}] Purok filter offers All Puroks + the 8 standard Puroks", opts[:9] == [""] + list(COL), opts)
        for name in COL:
            pg.select_option("#map-purok", name); pg.wait_for_timeout(700)
            chip = pg.inner_text("#purok-filter-active") if pg.query_selector("#purok-filter-active") else ""
            rows = pg.evaluate("[...document.querySelectorAll('main table')].find(t => t.innerText.toLowerCase().includes('coordinates'))?.querySelectorAll('tbody tr').length || 0")
            sel = pg.evaluate(paths, COL[name])
            others = [x for n2, c2 in COL.items() if n2 != name for x in pg.evaluate(paths, c2)]
            check(f"[{role}] filter {name}: chip shows it, 1 household listed, its boundary emphasised",
                  f"Showing {name}" in chip and rows == 1 and sel and max(x["w"] for x in sel) >= 4 and all(x["w"] <= 2 for x in others), (chip, rows, sel[:1]))
        pg.fill('input[placeholder^="Search by name"]', "Pascual"); pg.select_option("#map-purok", "Purok 4"); pg.wait_for_timeout(600)
        check(f"[{role}] search still works together with the Purok filter", "Jerome Pascual" in pg.inner_text("main"))
        pg.fill('input[placeholder^="Search by name"]', "Pascual"); pg.select_option("#map-purok", "Purok 2"); pg.wait_for_timeout(600)
        check(f"[{role}] search + a different Purok shows no match", "No households" in pg.inner_text("main"))
        pg.fill('input[placeholder^="Search by name"]', ""); pg.click("text=Show all Puroks"); pg.wait_for_timeout(700)
        rows = pg.evaluate("[...document.querySelectorAll('main table')].find(t => t.innerText.toLowerCase().includes('coordinates'))?.querySelectorAll('tbody tr').length || 0")
        check(f"[{role}] 'Show all Puroks' restores all 8 households", rows == 8 and not pg.query_selector("#purok-filter-active"), rows)
        # labels appear when zoomed in
        n0 = pg.evaluate("document.querySelectorAll('.purok-label').length")
        for _ in range(1):
            pg.click(".leaflet-control-zoom-in"); pg.wait_for_timeout(700)
        n1 = pg.evaluate("document.querySelectorAll('.purok-label').length")
        check(f"[{role}] Purok labels hidden at the whole-barangay view, shown when zoomed in", n0 == 0 and n1 == 8, (n0, n1))
        # review panel
        pg.click("text=Show details"); pg.wait_for_timeout(500)
        t = pg.inner_text("main")
        check(f"[{role}] review panel: 7 of 8 valid, Purok 1 problem, mismatch shown, nothing changed automatically",
              "7 of 8" in t and "self-intersection" in t and "Stored Purok differs" in t and "Nothing is changed automatically" in t)
        check(f"[{role}] no JavaScript errors", not errs, errs[:3])
        pg.screenshot(path=f"/home/claude/ui/p24_{role}_map.png", full_page=False)
        ctx.close()
    # mobile
    ctx, pg, errs = login(b, "admin.binitayan.test@gmail.com", 390, 844)
    pg.goto(B + "/admin/map"); pg.wait_for_timeout(4000)
    ov = pg.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
    check("390px: map page has no horizontal overflow and Purok polygons render", not ov and len(pg.evaluate(paths, COL["Purok 5A"])) >= 1)
    pg.screenshot(path="/home/claude/ui/p24_mobile_map.png", full_page=True)
    ctx.close()
    # resident
    ctx, pg, errs = login(b, "binitayan.test04@gmail.com")
    pg.goto(B + "/admin/map"); pg.wait_for_timeout(1500)
    check("resident cannot open the staff map", not pg.url.endswith("/admin/map"), pg.url)
    pg.goto(B + "/personnel/map"); pg.wait_for_timeout(1500)
    check("resident cannot open the personnel map", not pg.url.endswith("/personnel/map"), pg.url)
    ctx.close(); b.close()
print(f"\nPUROK MAP UI TEST: {sum(res)}/{len(res)} passed")
sys.exit(0 if all(res) else 1)
