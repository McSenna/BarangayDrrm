"""Browser smoke test with the seeded TEST accounts (run after the seed). Usage: python3 tests/ui_testdata_smoke.py"""
from playwright.sync_api import sync_playwright
B = "http://localhost:5173"; PW = "BinitayanTest2026!"; n = 0; ok_n = 0
cases = [("admin.binitayan.test@gmail.com", "/admin/priority", ["Efren Dela Rosa", "Critical"], 1366),
         ("binitayan.test01@gmail.com", "/resident/relief-status", ["Relief Allocation Status"], 390),
         ("personnel.binitayan.test@gmail.com", "/personnel/monitoring", ["Hazard Monitoring", "RPT-"], 768),  # Phase 23: schedules page retired
         ("admin.binitayan.test@gmail.com", "/admin/relief-requests", ["Under Review"], 390)]
with sync_playwright() as p:
    b = p.chromium.launch()
    for email, path, expect, w in cases:
        c = b.new_context(viewport={"width": w, "height": 844}); pg = c.new_page()
        pg.goto(B + "/login"); pg.fill('input[name="email"]', email); pg.fill('input[name="password"]', PW); pg.click('button[type="submit"]'); pg.wait_for_timeout(1500)
        pg.goto(B + path); pg.wait_for_timeout(2500); t = pg.inner_text("main")
        ok = all(e in t for e in expect); n += 1; ok_n += ok
        print("PASS" if ok else "FAIL", f"{email} {path} at {w}px shows {expect}")
        c.close()
    b.close()
print(f"SUMMARY: {ok_n}/{n} passed")
