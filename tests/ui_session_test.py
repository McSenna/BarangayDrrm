"""Browser session tests (Chromium/Playwright, local): idle logout after 30 min
(using Playwright's fake clock), expired server session -> back to login, and
deactivated account while logged in. Usage: python3 tests/ui_session_test.py <admin_pw>"""
import sys, requests
from playwright.sync_api import sync_playwright
BASE = "http://localhost:5173"; API = "http://127.0.0.1:8080/barangay-disaster/backend/"
res = []
def check(n, ok, d=""):
    res.append(ok); print(("PASS " if ok else "FAIL ") + n + ("" if ok else f" -> {d}"))
def login(page, email, pw):
    page.goto(BASE + "/login"); page.fill('input[name="email"]', email); page.fill('input[name="password"]', pw)
    page.click('button[type="submit"]'); page.wait_for_timeout(1500)
def wait_login(page):
    # The redirect happens right after the API answers 401; allow up to 10 s on the
    # single-threaded test server (it may still be busy with earlier polling requests).
    try:
        page.wait_for_url("**/login**", timeout=10000)
    except Exception:
        pass
with sync_playwright() as p:
    b = p.chromium.launch()
    # 1. idle logout with fake clock
    ctx = b.new_context(viewport={"width": 1366, "height": 768}); page = ctx.new_page()
    page.clock.install()
    login(page, "demo.resident1@binitayan.gov.ph", "demo1234")
    page.clock.run_for(2000)
    check("resident logged in (dashboard)", page.url.endswith("/resident"), page.url)
    page.clock.run_for(29 * 60 * 1000 + 5000)
    page.wait_for_timeout(500)
    body = page.inner_text("body")
    check("idle warning appears in the last minute before 30-minute idle logout", "inactiv" in body.lower() or "signed out" in body.lower() or "stay" in body.lower(), body[:200])
    page.clock.run_for(70 * 1000)
    page.wait_for_timeout(1500)
    check("after 30 minutes idle the user is signed out to /login?reason=idle", "/login" in page.url and "idle" in page.url, page.url)
    r = page.request.get(API + "auth/session.php").json()
    check("server session ended by idle logout", r.get("authenticated") is False, r)
    ctx.close()
    # 2. server session expired -> next API call returns 401 -> app returns to login
    ctx = b.new_context(viewport={"width": 1366, "height": 768}); page = ctx.new_page()
    login(page, "demo.resident1@binitayan.gov.ph", "demo1234")
    ctx.clear_cookies()
    page.click("aside >> text=Relief Allocation Status")  # Phase 21 resident nav
    wait_login(page)
    check("expired session: app redirects to login on 401", "/login" in page.url, page.url)
    ctx.close()
    # 3. deactivated while logged in
    adm = requests.Session(); adm.post(API + "auth/login.php", json={"email": "admin@binitayan.gov.ph", "password": sys.argv[1]})
    uid = [u for u in adm.get(API + "users/get_users.php").json()["data"] if u["email"] == "demo.resident3@binitayan.gov.ph"][0]["user_id"]
    ctx = b.new_context(viewport={"width": 1366, "height": 768}); page = ctx.new_page()
    login(page, "demo.resident3@binitayan.gov.ph", "demo1234")
    adm.post(API + "users/toggle_status.php", json={"user_id": uid, "is_active": 0})
    page.click("aside >> text=My Household")  # Phase 21 resident nav
    wait_login(page)
    check("deactivated account is sent back to login on next action", "/login" in page.url, page.url)
    adm.post(API + "users/toggle_status.php", json={"user_id": uid, "is_active": 1})
    ctx.close(); b.close()
print(f"SUMMARY: {sum(res)}/{len(res)} passed")
