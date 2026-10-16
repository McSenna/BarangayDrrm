"""
Capture the value-proposition screenshots (LOCAL TEST ENVIRONMENT ONLY).

Requires:
  - a database that contains ONLY the synthetic test dataset
    (schema + setup_admin.php + database/seed_test_data_8_households.php);
  - Vite on http://localhost:5173 and the PHP API it points to;
  - TextBee DISABLED (no app_config.local.php with SMS enabled).

The script performs real actions in the order required by
SCREENSHOT_GUIDE_VALUE_PROPOSITIONS.md (it submits reports, approves a request,
marks a delivery, sends an SMS that is logged as "Not Configured", ...), so run
it only on a throwaway test database.

Usage: python3 tests/capture_value_proposition_screenshots.py
Output: docs/screenshots/value-propositions/VP{n}_{nn}_{name}.png + capture_log.txt
"""
import io, os, subprocess, sys, time, traceback
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
PW = "BinitayanTest2026!"
ACC = {"ADMIN": "admin.binitayan.test@gmail.com", "PERS": "personnel.binitayan.test@gmail.com",
       **{f"H{i}": f"binitayan.test{i:02d}@gmail.com" for i in range(1, 9)}}
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, "docs/screenshots/value-propositions")
os.makedirs(OUT, exist_ok=True)
DB = os.environ.get("DB_NAME", "barangay_disaster_db")
log = []


def sql(q):
    return subprocess.run(["mysql", "-uroot", "-N", DB, "-e", q], capture_output=True, text=True).stdout.strip()


def sample_photo(path):
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (640, 420), (120, 150, 170))
    d = ImageDraw.Draw(img)
    for y in range(260, 420):
        d.line([(0, y), (640, y)], fill=(70, 110 - (y - 260) // 4, 140))
    d.rectangle([200, 140, 440, 300], fill=(180, 160, 130), outline=(60, 50, 40), width=4)
    d.polygon([(190, 145), (320, 70), (450, 145)], fill=(140, 60, 50))
    d.text((12, 12), "SAMPLE TEST PHOTO - synthetic", fill=(255, 255, 255))
    img.save(path)


import tempfile
TMP = tempfile.mkdtemp()
PHOTO = os.path.join(TMP, "household_photo.png")
sample_photo(PHOTO)


class Shooter:
    def __init__(self, pw):
        self.browser = pw.chromium.launch()
        self.ctx = None

    def as_(self, who, w=1366, h=768):
        if self.ctx:
            self.ctx.close()
        self.ctx = self.browser.new_context(viewport={"width": w, "height": h}, accept_downloads=True)
        self.page = self.ctx.new_page()
        self.dialogs = []
        self.page.on("dialog", lambda d: (self.dialogs.append(d.message), d.accept()))
        p = self.page
        p.goto(BASE + "/login")
        p.fill('input[name="email"]', ACC[who])
        p.fill('input[name="password"]', PW)
        p.click('button[type="submit"]')
        p.wait_for_timeout(1800)
        return p

    def go(self, path, wait=2200):
        self.page.goto(BASE + path)
        self.page.wait_for_timeout(wait)
        return self.page

    def shot(self, name, full=False, el=None, at=None):
        """Viewport screenshot by default. at= scrolls that locator/text to the top first."""
        path = os.path.join(OUT, name + ".png")
        if at is not None:
            loc = self.page.get_by_text(at, exact=True).first if isinstance(at, str) else at
            loc.evaluate("e => e.scrollIntoView({block: 'start'})")
            self.page.evaluate("window.scrollBy(0, -24)")
            self.page.wait_for_timeout(500)
        if el is not None:
            el.screenshot(path=path)
        else:
            self.page.screenshot(path=path, full_page=full)
        return path


def step(fig, name, fn):
    try:
        fn()
        log.append(f"OK      {fig:6} {name}")
        print("OK", fig, name)
    except Exception as e:
        log.append(f"FAILED  {fig:6} {name}: {str(e).splitlines()[0][:160]}")
        print("FAILED", fig, name, e)
        traceback.print_exc(limit=1)


def modal(p):
    return p.locator(".modal-box").last


with sync_playwright() as pw:
    S = Shooter(pw)
    hh = {f"H{i}": sql(f"SELECT household_id FROM households WHERE user_id=(SELECT user_id FROM users WHERE email='{ACC[f'H{i}']}')") for i in range(1, 9)}
    req = {k: sql(f"SELECT request_id FROM relief_requests WHERE household_id={v} ORDER BY request_id DESC LIMIT 1") for k, v in hh.items()}
    sched = sql("SELECT schedule_id FROM distribution_schedules WHERE package_id=(SELECT package_id FROM relief_packages WHERE package_name='Family Relief Pack [TEST]')")

    # ============ VP2 first (before the Purok 4 alert changes H4's score) ============
    p = S.as_("ADMIN")

    def s201():
        S.go("/admin/priority", 3000); S.shot("VP2_01_priority_assessment"); S.shot("VP2_01b_priority_ranked_table", at=S.page.locator("table").last)
    step("2.01", "Priority assessment", s201)

    def s202():
        p = S.page
        p.locator("tr", has_text="Efren Dela Rosa").get_by_role("button", name="View Breakdown").click()
        p.wait_for_timeout(800); S.shot("VP2_02_breakdown_H8", el=modal(p))
        p.keyboard.press("Escape")
    step("2.02", "Breakdown H8", s202)

    def s203():
        S.go("/admin/recommendations", 3500); S.shot("VP2_03_relief_recommendations")
    step("2.03", "Relief recommendations", s203)

    def s204():
        p = S.page
        inp = p.locator("table input[type=number]").first
        inp.scroll_into_view_if_needed(); inp.fill("1"); p.wait_for_timeout(400)
        box = inp.bounding_box()
        p.screenshot(path=os.path.join(OUT, "VP2_04_approve_modified_quantity.png"),
                     clip={"x": 0, "y": max(0, box["y"] - 300), "width": 1366, "height": 460})
    step("2.04", "Approve with modified quantity (not saved)", s204)

    def s205():
        S.go(f"/admin/relief-requests/{req['H8']}", 3000); S.shot("VP2_05_request_review_dss_H8"); S.shot("VP2_05b_request_items_dss_stock_H8", at="Requested Items, DSS Estimates and Stock")
    step("2.05", "Request review DSS panel H8", s205)

    # ============ VP1 ============
    def s101():
        p = S.as_("H2"); S.go("/resident/submit-report")
        p.select_option('select[name="disaster_type"]', label="Typhoon")
        p.select_option('select[name="severity"]', label="Medium")
        p.fill('input[name="location"]', "Purok 2, along the barangay road")
        p.fill('textarea[name="description"]', "Strong winds tore the roof sheets again; rainwater entered the kitchen.")
        p.set_input_files('input[type="file"]', [PHOTO])
        p.wait_for_timeout(600); S.shot("VP1_01_submit_report_form")
    step("1.01", "Submit report form", s101)

    def s102():
        p = S.page
        p.get_by_role("button", name="Submit Report").click()
        p.get_by_text("submitted successfully").first.wait_for(timeout=8000)
        S.shot("VP1_02_submit_success_message")
        p.wait_for_timeout(2500)
        S.shot("VP1_02b_after_submit_my_reports_pending")
    step("1.02", "Submit success", s102)

    def s103():
        p = S.go("/resident/my-reports", 2500)
        p.locator("tr", has_text="Pending").get_by_role("button", name="View").first.click(); p.wait_for_timeout(1800)
        S.shot("VP1_03_my_report_detail_with_photo", el=modal(p))
    step("1.03", "My report detail with photo (Pending)", s103)

    def s101m():
        p = S.as_("H5", 390, 844); S.go("/resident/submit-report"); S.shot("VP1_01m_submit_report_mobile", full=True)
    step("1.01m", "Submit report form (mobile)", s101m)

    p = S.as_("ADMIN")

    def s104():
        S.go("/admin/reports", 2500); S.shot("VP1_04_disaster_reports_list")
    step("1.04", "Disaster reports list", s104)

    def s105():
        p = S.page
        p.locator("tr", has_text="Lourdes Ibarrientos").get_by_role("button", name="View").first.click()
        p.wait_for_timeout(1500); S.shot("VP1_05_report_detail_H7", el=modal(p))
    step("1.05", "Report detail H7", s105)

    def s106():
        p = S.page
        modal(p).locator("button", has_text="✕").first.click(); p.wait_for_timeout(500)
        p.locator("tr", has_text="Arnel Cabrera").get_by_role("button", name="View").first.click()
        p.wait_for_timeout(1500)
        m = modal(p)
        p.get_by_text("Damage Assessment", exact=True).last.scroll_into_view_if_needed()
        S.shot("VP1_06_damage_assessment_H4", el=m)
        p.keyboard.press("Escape")
    step("1.06", "Damage assessment H4", s106)

    def s107():
        S.go("/admin/analytics/disasters", 3500); S.shot("VP1_07_disaster_analytics"); S.shot("VP1_07b_rule_based_summary", at=S.page.get_by_text("Rule-Based Summary").first)
    step("1.07", "Disaster analytics + Rule-Based Summary", s107)

    def s108():
        p = S.page
        with p.expect_download(timeout=30000) as dl:
            p.get_by_role("button", name="Export PDF").click()
        pdf = os.path.join(OUT, "_disaster_report.pdf"); dl.value.save_as(pdf)
        subprocess.run(["pdftoppm", "-png", "-r", "80", "-f", "1", "-l", "1", pdf, os.path.join(OUT, "_pdf")], check=True)
        os.replace(os.path.join(OUT, [f for f in os.listdir(OUT) if f.startswith("_pdf")][0]), os.path.join(OUT, "VP1_08_exported_pdf_page1.png"))
    step("1.08", "Exported PDF (page 1)", s108)

    # ============ VP3 ============
    def s301():
        p = S.go("/admin/hazard-alerts", 2500)
        p.get_by_role("button", name="+ Issue Hazard Alert").click(); p.wait_for_timeout(600)
        m = modal(p)
        m.locator('select[name="hazard_type"]').select_option(label="Typhoon")
        m.locator('select[name="status"]').select_option(label="Warning")
        m.locator('input[name="title"]').fill("Strong winds expected in Purok 4 [TEST]")
        m.locator('select[name="affected_purok"]').select_option(label="Purok 4")
        m.locator('textarea[name="description"]').fill("Secure roofs and loose materials. [TEST DATA]")
        S.shot("VP3_01_issue_hazard_alert_form", el=m)
        m.locator('button[type="submit"]').click(); p.wait_for_timeout(1800)
        S.shot("VP3_01b_hazard_alerts_list")
    step("3.01", "Issue hazard alert + list", s301)

    def s302():
        p = S.go("/admin/priority", 3000)
        p.locator("tr", has_text="Arnel Cabrera").get_by_role("button", name="View Breakdown").click()
        p.wait_for_timeout(800); S.shot("VP3_02_breakdown_H4_after_alert", el=modal(p))
        p.keyboard.press("Escape")
    step("3.02", "H4 breakdown after Purok 4 alert", s302)

    def s303():
        p = S.go("/admin/weather", 2500)
        p.get_by_role("button", name="+ Add Weather Log").click(); p.wait_for_timeout(600)
        m = modal(p)
        m.locator('input[name="temperature"]').fill("26.5")
        m.locator('input[name="rainfall_mm"]').fill("42")
        m.locator('select[name="weather_condition"]').select_option(index=3)
        m.locator('input[name="wind_speed_kph"]').fill("55")
        m.locator('input[name="wind_direction"]').fill("NE")
        m.locator('textarea[name="remarks"]').fill("Heavy rain observed at the barangay hall [TEST]")
        S.shot("VP3_03_add_weather_log_form", el=m)
        m.get_by_role("button", name="Save").click(); p.wait_for_timeout(1500)
        S.shot("VP3_03b_weather_logs")
    step("3.03", "Weather log form + list", s303)

    def s304():
        S.as_("H4"); S.go("/resident", 3000); S.shot("VP3_04_resident_dashboard_hazard_banner", full=False)
        S.go("/resident/weather-hazards", 2500); S.shot("VP3_04b_resident_weather_hazards")
    step("3.04", "Resident hazard banner + weather & hazards", s304)

    def s305():
        S.as_("PERS"); S.go("/personnel/weather-hazards", 2500); S.shot("VP3_05_personnel_weather_hazards")
    step("3.05", "Personnel weather & hazards", s305)

    # ============ VP4 ============
    S.as_("ADMIN")

    def s401():
        p = S.go("/admin/map", 4500)
        p.get_by_role("button", name="Show Whole Barangay").click(); p.wait_for_timeout(1500)
        S.shot("VP4_01_barangay_map", at=p.locator(".leaflet-container"))
        S.shot("VP4_01b_map_legend_and_table", at=p.get_by_text("Evacuation center (open)").first)
    step("4.01", "Barangay map", s401)

    def s402():
        p = S.page
        p.fill('input[placeholder^="Search by name, address"]', "Villafuerte"); p.wait_for_timeout(800)
        p.get_by_role("button", name="Locate").first.click(); p.wait_for_timeout(2000)
        S.shot("VP4_02_locate_household_popup", at=p.locator(".leaflet-container"))
    step("4.02", "Locate H6 popup", s402)

    def s403():
        p = S.page
        p.fill('input[placeholder^="Search by name, address"]', ""); p.wait_for_timeout(500)
        sel = p.locator("select", has=p.locator("option", has_text="Purok 5A")).first
        sel.select_option(label="Purok 5A"); p.wait_for_timeout(1200)
        p.get_by_role("button", name="Show Whole Barangay").click(); p.wait_for_timeout(1200)
        S.shot("VP4_03_purok_filter_5A", at=sel)
    step("4.03", "Purok filter 5A", s403)

    def s404():
        p = S.go("/admin/households", 2500)
        p.locator("tr", has_text="Danilo Barcena").get_by_role("button", name="Edit").first.click(); p.wait_for_timeout(1000)
        m = modal(p); p.get_by_text("Location Coordinates (optional)").scroll_into_view_if_needed()
        S.shot("VP4_04_household_coordinates_form", el=m)
    step("4.04", "Household coordinates form H3", s404)

    def s405():
        p = S.page; m = modal(p)
        m.locator('input[name="latitude"]').fill("13.30"); m.locator('input[name="longitude"]').fill("123.90")
        S.shot("VP4_05_outside_boundary_input", el=m)
        m.locator('button[type="submit"]').click(); p.wait_for_timeout(1500)
        # The error is a native browser alert() (cannot be captured headless): record its text instead.
        assert S.dialogs and "outside Barangay Binitayan" in S.dialogs[-1], S.dialogs
        log.append("MANUAL  4.05   capture the browser alert: " + S.dialogs[-1])
        m.locator("button", has_text="Cancel").click()
        assert sql(f"SELECT latitude FROM households WHERE household_id={hh['H3']}").startswith("13.154975")
    step("4.05", "Outside boundary error (not saved)", s405)

    def s406():
        p = S.as_("PERS"); S.go("/personnel/map", 4500)
        p.get_by_role("button", name="Show Whole Barangay").click(); p.wait_for_timeout(1200)
        S.shot("VP4_06_personnel_map", at=p.locator(".leaflet-container"))
    step("4.06", "Personnel map", s406)

    def s407():
        S.as_("H3"); S.go("/resident/evacuation-centers", 3500); S.shot("VP4_07_resident_evacuation_map", full=True)
        S.as_("H3", 390, 844); S.go("/resident/evacuation-centers", 3500); S.shot("VP4_07m_resident_evacuation_map_mobile", full=True)
    step("4.07", "Resident evacuation map (desktop + mobile)", s407)

    # ============ VP5 ============
    def s501():
        p = S.as_("H7"); S.go("/resident/relief-requests", 2500)

        def pick(i, text):
            sel = p.locator(f'select[aria-label="Relief item {i}"]')
            val = sel.evaluate("(s, t) => [...s.options].find(o => o.text.includes(t)).value", text)
            sel.select_option(val)
        pick(1, "Rice [TEST]"); p.fill('input[aria-label="Quantity 1"]', "2")
        p.get_by_role("button", name="+ Add another item").click()
        pick(2, "Blanket [TEST]"); p.fill('input[aria-label="Quantity 2"]', "2")
        p.select_option("#rr-urgency", label="High")
        p.fill("#rr-reason", "Kitchen fire destroyed our food supply and bedding. [TEST DATA]")
        S.shot("VP5_01_new_relief_request_form", at="New Relief Request")
        p.get_by_role("button", name="Submit Relief Request").click(); p.wait_for_timeout(2000)
        S.shot("VP5_01b_request_history", at="My Request History")
    step("5.01", "Resident relief request form + history", s501)

    S.as_("ADMIN")

    def s502():
        p = S.go("/admin/relief-requests", 2500)
        try:
            p.locator("select").first.select_option(label="All requests"); p.wait_for_timeout(1200)
        except Exception:
            pass
        S.shot("VP5_02_admin_relief_requests")
    step("5.02", "Admin relief requests list", s502)

    def s503():
        p = S.go(f"/admin/relief-requests/{req['H4']}", 3000)
        for item, q in [("Family Food Pack [TEST]", "3"), ("Blanket [TEST]", "1"), ("First Aid Kit [TEST]", "1"), ("Hygiene Kit [TEST]", "1")]:
            p.fill(f'input[aria-label="Approved quantity for {item}"]', q)
        p.wait_for_timeout(400); S.shot("VP5_03_review_partial_approval_H4", at="Requested Items, DSS Estimates and Stock")
    step("5.03", "Review H4 with approved quantities", s503)

    def s504():
        p = S.page
        p.get_by_role("button", name="Save Approval").click(); p.wait_for_timeout(2500)
        S.shot("VP5_04_partially_approved_status")
        S.shot("VP5_04b_process_into_relief_allocations", at="Process into Relief Allocations")
        p.get_by_role("button", name="Create Allocations").click(); p.wait_for_timeout(2500)
        S.page.evaluate("window.scrollTo(0,0)"); S.shot("VP5_04c_allocated")
    step("5.04", "Partially Approved + Create Allocations", s504)

    def s505():
        S.go("/admin/inventory", 2500); S.shot("VP5_05_inventory_committed_low_stock")
    step("5.05", "Inventory committed & low stock", s505)

    def s506():
        S.as_("PERS"); S.go("/personnel/assigned", 2500); S.shot("VP5_06_personnel_assigned_relief")
    step("5.06", "Personnel assigned relief", s506)

    def s507():
        p = S.go(f"/personnel/schedules/{sched}", 3000)
        row = lambda: p.locator("tr", has_text="Lourdes Ibarrientos")
        S.shot("VP5_07a_schedule_detail_pending")
        row().get_by_role("button", name="Mark as Prepared").click(); p.wait_for_timeout(1500)
        row().get_by_role("button", name="Mark as Dispatched").click(); p.wait_for_timeout(1500)
        row().get_by_role("button", name="Verify").click(); p.wait_for_timeout(1500)
        S.shot("VP5_07b_schedule_dispatched_verified")
        row().get_by_role("button", name="Mark as Delivered").click(); p.wait_for_timeout(800)
        m = modal(p)
        m.locator('input[placeholder^="Full name"]').fill("Lourdes Ibarrientos")
        m.locator("textarea").fill("Received at Binitayan Test Evacuation Center A [TEST]")
        m.locator('input[type="file"]').set_input_files([PHOTO])
        S.shot("VP5_07c_confirm_delivery_form", el=m)
        m.get_by_role("button", name="Confirm Delivery").click(); p.wait_for_timeout(3000)
        S.shot("VP5_07d_schedule_delivered")
    step("5.07", "Schedule pipeline to Delivered", s507)

    def s508():
        p = S.go("/personnel/completed-deliveries", 2500)
        p.get_by_role("button", name="View Report").first.click(); p.wait_for_timeout(1500)
        S.shot("VP5_08_delivery_report_photo", el=modal(p))
    step("5.08", "Delivery report with photo", s508)

    def s509():
        S.as_("ADMIN"); S.go("/admin/inventory/logs", 2500); S.shot("VP5_09_inventory_logs_stock_out")
    step("5.09", "Inventory logs", s509)

    def s510():
        p = S.as_("H1"); S.go("/resident/relief-status", 2500); S.shot("VP5_10a_resident_relief_status")
        S.go("/resident/feedback", 2500)
        p.get_by_role("button", name="Give Feedback").first.click(); p.wait_for_timeout(600)
        m = modal(p)
        m.locator("#fb-rating").select_option(value="4")
        m.locator("#fb-suff").select_option(label="Sufficient")
        m.locator("#fb-exp").select_option(label="Good")
        m.locator("textarea").fill("Salamat po. The rice arrived on time. [TEST]")
        S.shot("VP5_10b_feedback_form", el=m)
        m.get_by_role("button", name="Send Feedback").click(); p.wait_for_timeout(1500)
        S.shot("VP5_10c_feedback_submitted")
    step("5.10", "Resident relief status + feedback", s510)

    def s511():
        S.as_("ADMIN"); S.go("/admin/feedback", 2500); S.shot("VP5_11_admin_feedback")
    step("5.11", "Admin feedback page", s511)

    # ============ VP6 ============
    def s601():
        p = S.go("/admin/hazard-alerts", 2500)
        p.locator("tr", has_text="Purok 4").get_by_role("button", name="Send SMS").first.click(); p.wait_for_timeout(2000)
        p.locator("tr", has_text="Arnel Cabrera").first.click(); p.wait_for_timeout(500)
        S.page.evaluate("window.scrollTo(0,0)"); S.shot("VP6_01_send_sms_prefilled_from_hazard"); S.shot("VP6_01b_send_sms_recipients", at="Recipients")
    step("6.01", "Send SMS page (from hazard alert)", s601)

    def s602():
        p = S.page
        p.get_by_role("button", name="Send SMS").last.click(); p.wait_for_timeout(2500)
        p.evaluate("window.scrollTo(0,0)"); p.wait_for_timeout(300)
        S.shot("VP6_02_send_result_not_configured")
    step("6.02", "Send result (Not Configured)", s602)

    def s603():
        S.go("/admin/sms-logs", 2500); S.shot("VP6_03_sms_logs", at=S.page.locator("table").first)
    step("6.03", "SMS logs", s603)

    def s604():
        p = S.go("/admin/reports", 2500)
        p.locator("tr", has_text="Lourdes Ibarrientos").get_by_role("button", name="View").first.click(); p.wait_for_timeout(1500)
        p.get_by_role("button", name="Verify", exact=True).click(); p.wait_for_timeout(600)
        modal(p).locator("textarea").fill("Checked on site by the BDRRM team. [TEST]")
        p.get_by_role("button", name="Verify Report").click(); p.wait_for_timeout(2500)
        S.go("/admin/sms-logs", 2500); S.shot("VP6_04_automatic_sms_log_after_verify", at=S.page.locator("table").first)
    step("6.04", "Automatic SMS log after verifying H7 report", s604)

    def s605():
        S.as_("H7"); S.go("/resident/notifications", 2500); S.shot("VP6_05_resident_notifications")
    step("6.05", "Resident notifications", s605)

    S.ctx.close(); S.browser.close()

for f in os.listdir(OUT):
    if f.startswith("_"):
        os.remove(os.path.join(OUT, f))
import shutil
shutil.rmtree(TMP, ignore_errors=True)
open(os.path.join(OUT, "capture_log.txt"), "w").write("\n".join(log) + "\n")
print("\n".join(log))
