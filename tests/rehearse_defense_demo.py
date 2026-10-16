"""Rehearse the live steps of DEFENSE_DEMO_SCRIPT.md through the real API.

THIS CHANGES DATA. Run it only against a COPY of the defense database, never the
one you will present with. The script refuses to run unless the database name
contains "rehearsal".

  mysqladmin -uroot create barangay_defense_rehearsal
  mysqldump -uroot barangay_defense_db | mysql -uroot barangay_defense_rehearsal
  (start an API that uses DB_NAME=barangay_defense_rehearsal)
  python3 tests/rehearse_defense_demo.py http://127.0.0.1:8082/barangay-disaster/backend/ barangay_defense_rehearsal
"""
import sys, subprocess, requests

BASE = sys.argv[1]
DB = sys.argv[2]
if "rehearsal" not in DB:
    sys.exit("Refusing: the database name must contain 'rehearsal' (this script changes data).")
PW = "BinitayanTest2026!"
res = []


def check(step, name, ok, detail=""):
    res.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + f"[{step}] {name}" + ("" if ok else f" -> {str(detail)[:300]}"))


def one(q):
    return subprocess.run(["mysql", "-uroot", "-N", "-B", DB, "-e", q], capture_output=True, text=True, check=True).stdout.strip()


def login(email):
    s = requests.Session()
    r = s.post(BASE + "auth/login.php", json={"email": email, "password": PW}).json()
    return s, r


def prio(admin):
    return {h["head_of_family"]: h for h in admin.get(BASE + "dashboard/priority_list.php").json()["data"]}


# the API must be using the rehearsal copy: a login through the API must add a row to THIS database
before_logins = int(one("SELECT COUNT(*) FROM login_history"))
admin, _ = login("admin.binitayan.test@gmail.com")
if int(one("SELECT COUNT(*) FROM login_history")) != before_logins + 1:
    sys.exit("Refusing: the API is not writing to the rehearsal database.")

# STEP 1-4: resident H05
h05, r = login("binitayan.test05@gmail.com")
check("1", "H05 Corazon Villanueva logs in as resident", r.get("success") and r["user"]["role"] == "resident", r)
hh = h05.get(BASE + "households/get_households.php").json()["data"]
check("2", "H05 sees own household: Purok 5A, 3 members, 1 senior", len(hh) == 1 and hh[0]["purok"] == "Purok 5A" and hh[0]["number_of_members"] == 3 and hh[0]["seniors_count"] == 1, hh)
before = prio(admin)["Corazon Villanueva"]["priority_score"]
# Phase 21: residents cannot submit reports; Relief Personnel record the follow-up report for H05.
check("3", "H05 cannot submit a report through the API (Phase 21, 403)",
      h05.post(BASE + "disasters/create_report.php", json={"household_id": int(hh[0]["household_id"]), "disaster_type": "Typhoon", "severity": "Low", "location": "x", "report_date": "2026-09-30"}).status_code == 403)
per0, _ = login("personnel.binitayan.test@gmail.com")
r = per0.post(BASE + "disasters/create_report.php", json={"household_id": int(hh[0]["household_id"]), "disaster_type": "Typhoon", "severity": "Low", "location": "Purok 5A hillside",
                                                         "report_date": "2026-09-30", "report_time": "08:00",
                                                         "description": "[DEFENSE TEST] Follow-up: mud still blocks the back door; the family cleaned the kitchen."}).json()
check("3", "Relief Personnel record a new Low Typhoon report for H05", r.get("success"), r)
new_id = r.get("report_id")
mine = per0.get(BASE + "disasters/get_reports.php", params={"household_id": hh[0]["household_id"]}).json()["data"]
check("4", "Disaster Reports shows the new H05 report as Pending", any(int(x["report_id"]) == int(new_id) and x["status"] == "Pending" for x in mine))
check("4", "H05 priority unchanged at 52 (its Verified Medium report stays the selected report; the new one is Pending)", prio(admin)["Corazon Villanueva"]["priority_score"] == before == 52, before)

# STEP 5: dashboard cards (after step 3)
w = admin.get(BASE + "dashboard/statistics.php").json()["data"]
wf = w["workflow"]
cards = {"affected": wf["affected_households"], "awaiting_verification": wf["reports_by_status"].get("Pending", 0),
         "high_critical": wf["priority_levels"].get("High Priority", 0) + wf["priority_levels"].get("Critical Priority", 0),
         "requests_awaiting": wf["requests_by_status"].get("Pending", 0) + wf["requests_by_status"].get("Under Review", 0),
         "approved_allocations": wf["allocations_by_status"].get("Approved", 0), "low_stock": w["low_stock_items"],
         "evacuation": (wf["evacuation"]["occupancy"], wf["evacuation"]["capacity"])}
print("  dashboard cards:", cards)
check("5", "dashboard: 2 reports awaiting verification, 1 request awaiting review, 5 approved allocations, 2 low-stock items, evacuation 26/80",
      (cards["awaiting_verification"], cards["requests_awaiting"], cards["approved_allocations"], cards["low_stock"], cards["evacuation"]) == (2, 1, 5, 2, (26, 80)), cards)

# STEP 5-8: admin reports, verify H08, assessment
reps = admin.get(BASE + "disasters/get_reports.php").json()["data"]
check("6", "admin sees 9 reports, 2 Pending (H05 new + H08)", len(reps) == 9 and sum(1 for x in reps if x["status"] == "Pending") == 2)
h08_report = int(one("SELECT r.report_id FROM disaster_reports r JOIN households h ON r.household_id = h.household_id WHERE h.head_of_family = 'Ernesto Dimaculangan'"))
p = prio(admin)["Ernesto Dimaculangan"]
check("7", "before verification: H08 = 79 High, confidence 2, flagged for review", (p["priority_score"], p["priority_level"], p["ratings"]["assessment_confidence"], p["needs_review"]) == (79, "High Priority", 2, True), p.get("ratings"))
r = admin.post(BASE + "disasters/verify_report.php", json={"report_id": h08_report, "remarks": "Verified during the defense demonstration."}).json()
check("7", "admin verifies H08's report", r.get("success"), r)
p = prio(admin)["Ernesto Dimaculangan"]
check("7", "after verification: H08 = 85 Critical, confidence 5, no longer flagged", (p["priority_score"], p["priority_level"], p["ratings"]["assessment_confidence"], p["needs_review"]) == (85, "Critical Priority", 5, False), p.get("ratings"))
da = admin.get(BASE + "disasters/get_damage_assessment.php", params={"report_id": h08_report}).json()
check("8", "H08 damage assessment opens (Major house, property, agricultural)", da.get("success") and da["data"]["house_damage"] == "Major" and da["data"]["agricultural_damage"] == "Major", da)

# STEP 9-14: DSS + request review
pl = prio(admin)
order = [h for h in sorted(pl, key=lambda k: pl[k]["rank"] or 99)]
print("  ranking after verification:", [(h, pl[h]["priority_score"], pl[h]["priority_level"]) for h in order])
check("10", "ranking now has Critical, High, Moderate and Low households", {x["priority_level"] for x in pl.values()} == {"Critical Priority", "High Priority", "Moderate Priority", "Low Priority"})
req = int(one("SELECT q.request_id FROM relief_requests q JOIN households h ON q.household_id = h.household_id WHERE h.head_of_family = 'Ernesto Dimaculangan'"))
det = admin.get(BASE + "requests/get_request_detail.php", params={"request_id": req}).json()["data"]
lines = {i["item_name"].replace(" [DEFENSE TEST]", ""): i for i in det["items"]}
for n, i in lines.items():
    print(f"  H08 {n:17} requested {i['requested_quantity']:2} needs {i['dss_needs_estimate']:2} DSS recommends {i['dss_recommended_quantity']} available {i['available_stock']:3} shortage {i['shortage']}")
check("12", "review screen shows the DSS panel: 85 Critical, rank 1", det["dss"]["priority_score"] == 85 and det["dss"]["priority_level"] == "Critical Priority" and det["dss"]["rank"] == 1, det["dss"])
hk = lines["Hygiene Kit"]
check("14", "Hygiene Kit: requested 5, available 2, shortage 3", (hk["requested_quantity"], hk["available_stock"], hk["shortage"]) == (5, 2, 3), hk)

# STEP 15: admin decides with a quantity different from the DSS recommendation
r = admin.post(BASE + "requests/start_review.php", json={"request_id": req}).json()
check("15", "Mark Under Review", r.get("success"), r)
decision = []
for n, i in lines.items():
    q = 2 if n == "Hygiene Kit" else i["requested_quantity"] if n == "Bottled Water" else 4
    decision.append({"request_item_id": i["request_item_id"], "approved_quantity": q})
r = admin.post(BASE + "requests/decide_request.php", json={"request_id": req, "decision": "approve", "items": decision,
                                                           "remarks": "Approved Food Pack 4, Water 24, Hygiene Kit 2 (all available kits)."}).json()
check("15", "Save Approval -> Partially Approved (no stock reserved yet)", r.get("success") and r.get("status") == "Partially Approved", r)
check("15", f"admin's Hygiene Kit quantity (2) differs from the DSS recommendation ({hk['dss_recommended_quantity']})", hk["dss_recommended_quantity"] != 2)
too_much = admin.post(BASE + "requests/decide_request.php", json={"request_id": req, "decision": "approve",
                                                                  "items": [{"request_item_id": d["request_item_id"], "approved_quantity": 99} for d in decision]})
check("15", "approving more than requested is refused (400)", too_much.status_code == 400, too_much.text[:150])
r = admin.post(BASE + "requests/process_request.php", json={"request_id": req}).json()
check("15", "Create Allocations -> 3 Approved allocations (stock reserved)", r.get("success"), r)
check("15", "Hygiene Kit available drops to 0 (6 stock, 6 reserved)", one("SELECT quantity - (SELECT SUM(quantity) FROM relief_allocations a WHERE a.item_id = i.item_id AND a.status = 'Approved') FROM relief_items i WHERE item_name LIKE 'Hygiene Kit%'") == "0")

p = prio(admin)["Ernesto Dimaculangan"]
print("  H08 after Create Allocations:", p["priority_score"], p["priority_level"], p["unmet_needs"])
check("15", "after Create Allocations: H08 essential needs 60% covered -> damage/needs 4 -> 3, score 85 -> 80 (still Critical)", (p["priority_score"], p["priority_level"], p["unmet_needs"]["coverage_percent"]) == (80, "Critical Priority", 60), (p["priority_score"], p["unmet_needs"]))

# STEP 16-20: personnel distributes H04
per, r = login("personnel.binitayan.test@gmail.com")
check("16", "Relief Personnel logs in", r.get("success") and r["user"]["role"] == "relief_personnel", r)
allocs = [a for a in per.get(BASE + "relief/get_allocations.php").json()["data"] if a["head_of_family"] == "Jerome Pascual" and a["status"] == "Approved"]
check("17", "Assigned Relief lists H04's 3 Approved allocations", len(allocs) == 3, allocs)
all_approved = [x for x in per.get(BASE + "relief/get_allocations.php").json()["data"] if x["status"] == "Approved"]
check("17", "Approved Allocations shows 8 rows in total (H04 3, H07 2, H08 3)", len(all_approved) == 8, len(all_approved))
stock_before = {n: int(q) for n, q in (l.split("\t") for l in one("SELECT item_name, quantity FROM relief_items").split("\n"))}
for a in allocs:
    r = per.post(BASE + "relief/distribute.php", json={"allocation_id": a["allocation_id"]}).json()
    check("18", f"Distribute allocation #{a['allocation_id']} ({a['item_name']} x{a['quantity']})", r.get("success"), r)
stock_after = {n: int(q) for n, q in (l.split("\t") for l in one("SELECT item_name, quantity FROM relief_items").split("\n"))}
diff = {n.replace(" [DEFENSE TEST]", ""): stock_after[n] - stock_before[n] for n in stock_after if stock_after[n] != stock_before[n]}
print("  stock change:", diff)
check("19", "stock deducted exactly: Food Pack -4, Hygiene Kit -2, Bottled Water -18", diff == {"Family Food Pack": -4, "Hygiene Kit": -2, "Bottled Water": -18}, diff)
check("19", "3 new Stock Out log entries for H04", one("SELECT COUNT(*) FROM inventory_logs WHERE log_type = 'Stock Out' AND reference LIKE '%Jerome Pascual%'") == "3")
check("20", "H04 request status becomes Distributed", one("SELECT q.status FROM relief_requests q JOIN households h ON q.household_id = h.household_id WHERE h.head_of_family = 'Jerome Pascual'") == "Distributed")
again = per.post(BASE + "relief/distribute.php", json={"allocation_id": allocs[0]["allocation_id"]})
check("18", "distributing the same allocation twice is refused (no double deduction)", again.status_code in (400, 409) or again.json().get("success") is False, again.text[:150])
p = prio(admin)["Jerome Pascual"]
check("20", "H04 stays 71: its relief was already counted as covering 60% of needs when it was approved", p["priority_score"] == 71 and p["unmet_needs"]["coverage_percent"] == 60, (p["priority_score"], p["unmet_needs"]))

# STEP 21-24
c = admin.get(BASE + "evacuation/get_centers.php").json()["data"]
check("23", "evacuation centers: Open 18/50 and Open 8/30", sorted((x["status"], x["current_occupancy"], x["capacity"]) for x in c) == [("Open", 8, 30), ("Open", 18, 50)], c)
a = admin.get(BASE + "hazards/alerts/get_alerts.php").json()["data"]
check("24", "2 active hazard alerts, 1 resolved", sum(1 for x in a if int(x["is_active"]) == 1) == 2 and sum(1 for x in a if int(x["is_active"]) == 0) == 1)
wl = admin.get(BASE + "hazards/weather/get_weather_logs.php").json()["data"]
check("24", "3 manual weather logs (Stormy 86 mm ... Cloudy 4 mm)", len(wl) == 3 and {x["weather_condition"] for x in wl} == {"Stormy", "Rainy", "Cloudy"}, len(wl))
hist = admin.get(BASE + "evacuation/get_center_logs.php", params={"center_id": 1}).json()["data"]
check("23", "Center A history: added with 12, then 12 -> 18", {(x["previous_occupancy"], x["new_occupancy"]) for x in hist} == {(None, 12), (12, 18)}, hist)
p = prio(admin)
check("21", "map colours after the demo: H08 80 Critical, H04 71 High", (p["Ernesto Dimaculangan"]["priority_score"], p["Jerome Pascual"]["priority_score"]) == (80, 71))

# STEP 25-27: SMS (TextBee not configured in the sandbox)
before_sms = int(one("SELECT COUNT(*) FROM sms_logs"))
r = admin.post(BASE + "sms/send.php", json={"recipient_mode": "household", "household_ids": [int(one("SELECT household_id FROM households WHERE head_of_family = 'Ernesto Dimaculangan'"))],
                                            "category": "General", "message": "Binitayan Disaster Response: Your relief request has been reviewed. Please check your account for the current status."}).json()
check("26", "Send SMS without TextBee -> message says Not Configured (no success claim)", "Not Configured" in r.get("message", ""), r)
check("27", "SMS Logs gain one 'Not Configured' row; still no 'Sent'", int(one("SELECT COUNT(*) FROM sms_logs")) == before_sms + 1 and one("SELECT COUNT(*) FROM sms_logs WHERE status = 'Sent'") == "0")

# STEP 28
st = admin.get(BASE + "dashboard/statistics.php").json()["data"]
check("28", "dashboard updates: 9 reports", st["total_disaster_reports"] == 9, st["total_disaster_reports"])
sev = {x["label"]: x["count"] for x in admin.get(BASE + "reports/dashboard_analytics.php").json()["data"]["reports_by_severity"]}
check("28", "severity mix 2 Critical / 3 High / 2 Medium / 2 Low", sev == {"Critical": 2, "High": 3, "Medium": 2, "Low": 2}, sev)
au = dict(l.split("\t") for l in one("SELECT action, COUNT(*) FROM audit_logs GROUP BY action").split("\n"))
check("28", "audit log has the demo's verification, approval and distribution", int(au.get("Disaster report verified", 0)) == 8 and int(au.get("Relief request Partially Approved", 0)) == 2 and int(au.get("Relief distributed", 0)) == 5, au)

print(f"\nREHEARSAL SUMMARY: {sum(res)}/{len(res)} passed")
sys.exit(0 if all(res) else 1)
