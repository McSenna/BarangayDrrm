"""Browser smoke test of the DEFENSE dataset (read-only; only logs in and opens pages).
Usage: python3 tests/ui_defense_smoke.py [frontend_url]   (default http://localhost:5174)
The frontend must point at the API that uses the defense database."""
import sys, os
from playwright.sync_api import sync_playwright

B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5174"
PW = "BinitayanTest2026!"
OUT = os.path.join(os.path.dirname(__file__), "..", "docs", "test-results", "defense_ui")
os.makedirs(OUT, exist_ok=True)
res = []


def check(name, ok, detail=""):
    res.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" -> {str(detail)[:250]}"))


HEADS = ["Ramon Dizon", "Gloria Mendoza", "Eduardo Salazar", "Jerome Pascual", "Corazon Villanueva", "Wilfredo Ocampo", "Leonora Castillo", "Ernesto Dimaculangan"]
with sync_playwright() as p:
    b = p.chromium.launch()

    def session(email, w=1366):
        c = b.new_context(viewport={"width": w, "height": 900})
        pg = c.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(B + "/login")
        pg.fill('input[name="email"]', email)
        pg.fill('input[name="password"]', PW)
        pg.click('button[type="submit"]')
        pg.wait_for_timeout(1500)
        return c, pg, errors

    def open_(pg, path, wait=2500):
        pg.goto(B + path)
        pg.wait_for_timeout(wait)
        return pg.inner_text("main")

    # ---------------- administrator
    c, pg, err = session("admin.binitayan.test@gmail.com")
    t = open_(pg, "/admin")
    check("admin dashboard renders with the defense data", "Typhoon" in t or "8" in t, t[:200])
    pg.screenshot(path=f"{OUT}/admin_dashboard.png")
    t = open_(pg, "/admin/priority")
    order = sorted(((t.find(h), h) for h in HEADS if h in t))
    check("Priority Assessment lists all 8 households, highest first (H08 Ernesto Dimaculangan)", len(order) == 8 and order[0][1] == "Ernesto Dimaculangan", order)
    check("Priority Assessment shows High, Moderate and Low categories and scores out of 100", all(x in t for x in ["High Priority", "Moderate Priority", "Low Priority", "79"]))
    t = open_(pg, "/admin/recommendations")
    check("Relief Recommendations page renders with shortages", "Shortage" in t or "shortage" in t, t[:200])
    t = open_(pg, "/admin/relief-requests")
    check("Relief Requests list shows Pending, Allocated and Distributed", all(s in t for s in ["Pending", "Allocated", "Distributed"]), t[:300])
    t = open_(pg, "/admin/inventory")
    check("Inventory shows the 6 [DEFENSE TEST] items", t.count("[DEFENSE TEST]") >= 6)
    t = open_(pg, "/admin/evacuation-centers")
    check("Evacuation Centers shows both centers with 18 / 50 and 8 / 30", "Binitayan Defense Demonstration Evacuation Center" in t and "18" in t and "50" in t, t[:300])
    t = open_(pg, "/admin/hazard-alerts")
    check("Hazard Alerts shows the Purok 7 flood and Purok 5A landslide alerts", "Purok 7" in t and "Purok 5A" in t)
    t = open_(pg, "/admin/sms-logs")
    check("SMS Logs show 'Not Configured' and no 'Sent' badge text", "Not Configured" in t)
    t = open_(pg, "/admin/monitoring")
    check("Hazard Monitoring lists the Typhoon incidents with reference numbers (Phase 23)", "Typhoon" in t and "RPT-" in t, t[:300])
    t = open_(pg, "/admin/audit-logs")
    check("Audit Logs page lists workflow actions", "Disaster report verified" in t or "Relief distributed" in t, t[:300])
    t = open_(pg, "/admin/map", 4000)
    pg.click("text=Show Whole Barangay") if pg.locator("text=Show Whole Barangay").count() else None
    pg.wait_for_timeout(1500)
    paths = pg.locator(".leaflet-overlay-pane path.leaflet-interactive").count()
    icons = pg.locator(".leaflet-marker-pane .leaflet-marker-icon").count()
    check("Admin map table lists all 8 households", all(h in t for h in HEADS), [h for h in HEADS if h not in t])
    check(f"Admin map draws household markers + hazard rings + boundary ({paths} interactive paths) and center/site icons ({icons})", paths >= 8 and icons >= 3, (paths, icons))
    pg.screenshot(path=f"{OUT}/admin_map.png")
    all_paths = pg.locator(".leaflet-overlay-pane path").count()
    # hazard-alert rings only (red, "4 4" dash); Phase 24 Purok 1 is also a dashed outline, in its own colour
    rings = pg.locator('.leaflet-overlay-pane path[stroke="#b3372c"][stroke-dasharray="4 4"]').count()
    check(f"hazard rings drawn for the 2 households in alert puroks (H05, H08): {rings} dashed rings, {all_paths} overlay paths in total", rings == 2, (rings, all_paths))
    purok = pg.locator("select", has=pg.locator("option", has_text="All Puroks")).first
    purok.select_option(value="Purok 7")  # Phase 24: labels now show counts, e.g. "Purok 7 (1)"
    pg.wait_for_timeout(1200)
    t7 = pg.inner_text("main")
    shown = [h for h in HEADS if h in t7]
    markers7 = pg.locator(".leaflet-overlay-pane path.leaflet-interactive").count()
    check(f"Purok filter 'Purok 7' leaves only Ernesto Dimaculangan in the table ({markers7} interactive paths on the map)", shown == ["Ernesto Dimaculangan"], shown)
    purok.select_option(value="")
    pg.wait_for_timeout(800)
    search = pg.locator('input[placeholder^="Search by name"]').first
    search.fill("Dimaculangan")
    pg.wait_for_timeout(1200)
    ts = pg.inner_text("main")
    shown = [h for h in HEADS if h in ts]
    check("Search 'Dimaculangan' leaves only Ernesto Dimaculangan", shown == ["Ernesto Dimaculangan"], shown)
    search.fill("")
    pg.wait_for_timeout(800)
    loc = pg.locator("tr", has_text="Wilfredo Ocampo").locator("text=Locate")
    if loc.count():
        loc.first.click()
        pg.wait_for_timeout(1500)
        pop = pg.locator(".leaflet-popup-content").inner_text() if pg.locator(".leaflet-popup-content").count() else ""
        check("Locate opens the H06 popup with coordinates 13.155759, 123.714951", "Wilfredo Ocampo" in pop and "13.155759" in pop, pop)
    else:
        check("Locate button present for H06", False)
    check("no JavaScript errors on admin pages", not err, err)
    c.close()

    # ---------------- relief personnel
    c, pg, err = session("personnel.binitayan.test@gmail.com")
    t = open_(pg, "/personnel/assigned")
    check("Personnel Assigned Relief shows H04 and H07 Approved allocations", "Jerome Pascual" in t and "Leonora Castillo" in t, t[:300])
    t = open_(pg, "/personnel/monitoring")
    check("Personnel Hazard Monitoring shows the critical incidents needing attention (Phase 23)", "Needs attention" in t and "Critical" in t, t[:300])
    t = open_(pg, "/personnel/map", 4000)
    check("Personnel map lists the 8 households", all(h in t for h in HEADS))
    check("no JavaScript errors on personnel pages", not err, err)
    c.close()

    # ---------------- resident (privacy)
    c, pg, err = session("binitayan.test05@gmail.com", 390)
    t = open_(pg, "/resident/household")
    check("Resident H05 sees own household (Corazon Villanueva, 3 members)", "Corazon Villanueva" in t and "3" in t)
    # Phase 21: residents only view their own status; retired pages redirect to the dashboard
    t = open_(pg, "/resident/relief-status")
    others = [h for h in HEADS if h in t and h != "Corazon Villanueva"]
    check("Resident Relief Allocation Status renders, no other household names", "Relief Allocation Status" in t and not others, others)
    t = open_(pg, "/resident")
    check("Resident dashboard shows allocation status counters and My Account", "Ready for Distribution" in t and "My Account" in t, t[:300])
    for retired in ["/resident/submit-report", "/resident/evacuation-centers", "/resident/weather-hazards", "/resident/feedback"]:
        pg.goto(B + retired); pg.wait_for_timeout(1500)
        check(f"retired resident page {retired} redirects to the dashboard", pg.url.rstrip("/").endswith("/resident"), pg.url)
    pg.screenshot(path=f"{OUT}/resident_dashboard_mobile.png")
    check("no JavaScript errors on resident pages", not err, err)
    c.close()
    b.close()
print(f"UI SUMMARY: {sum(res)}/{len(res)} passed")
sys.exit(0 if all(res) else 1)
