"""Rehearse DEFENSE_DEMO_SCRIPT.md (49-step presentation order) through the real API.

THIS CHANGES DATA. Run it only on a COPY of the defense database (name must
contain "rehearsal"), never on the database you will present with.
Usage: python3 tests/rehearse_defense_presentation.py <api_base_url> <rehearsal_db_name>
"""
import sys, subprocess, requests

BASE, DB = sys.argv[1], sys.argv[2]
if "rehearsal" not in DB:
    sys.exit("Refusing: database name must contain 'rehearsal'.")
PW = "BinitayanTest2026!"
res = []


def check(step, name, ok, detail=""):
    res.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + f"[{step}] {name}" + ("" if ok else f" -> {str(detail)[:300]}"))


def one(q):
    return subprocess.run(["mysql", "-uroot", "-N", "-B", DB, "-e", q], capture_output=True, text=True, check=True).stdout.strip()


def login(email):
    s = requests.Session()
    s.trust_env = False
    return s, s.post(BASE + "auth/login.php", json={"email": email, "password": PW}).json()


def prio(a):
    return {h["head_of_family"]: h for h in a.get(BASE + "dashboard/priority_list.php").json()["data"]}


def stock():
    return {n.replace(" [DEFENSE TEST]", ""): int(q) for n, q in (l.split("\t") for l in one("SELECT item_name, quantity FROM relief_items").split("\n"))}


before_logins = int(one("SELECT COUNT(*) FROM login_history"))
admin, _ = login("admin.binitayan.test@gmail.com")
if int(one("SELECT COUNT(*) FROM login_history")) != before_logins + 1:
    sys.exit("Refusing: the API is not using the rehearsal database.")
sms_start = int(one("SELECT COUNT(*) FROM sms_logs"))

# ---------------- PART B: resident H08
res_s, r = login("binitayan.test08@gmail.com")
check("6", "H08 Ernesto Dimaculangan logs in as resident", r.get("success") and r["user"]["role"] == "resident", r)
hh = res_s.get(BASE + "households/get_households.php").json()["data"]
check("7", "Household Profile: Purok 7, 8 members, children 1, seniors 1, PWD 1", len(hh) == 1 and (hh[0]["purok"], hh[0]["number_of_members"], hh[0]["children_count"], hh[0]["seniors_count"], hh[0]["pwd_count"]) == ("Purok 7", 8, 1, 1, 1), hh)
mem = res_s.get(BASE + "households/members/get_members.php", params={"household_id": hh[0]["household_id"]}).json()
check("7", "member list has 8 people", mem.get("success") and len(mem["data"]) == 8, mem)
# Phase 21: the resident cannot submit reports; Relief Personnel record the follow-up report for H08.
check("8", "H08 cannot submit a report through the API (Phase 21, 403)",
      res_s.post(BASE + "disasters/create_report.php", json={"household_id": int(hh[0]["household_id"]), "disaster_type": "Typhoon", "severity": "Low", "location": "x", "report_date": "2026-09-30"}).status_code == 403)
per0, _ = login("personnel.binitayan.test@gmail.com")
r = per0.post(BASE + "disasters/create_report.php", json={"household_id": int(hh[0]["household_id"]), "disaster_type": "Typhoon", "severity": "Low", "location": "Purok 7, riverside", "report_date": "2026-09-30", "report_time": "08:00",
                                                           "description": "[DEFENSE TEST] Follow-up: floodwater has gone down; mud remains inside the house."}).json()
check("8", "Relief Personnel record a Low follow-up Typhoon report for H08", r.get("success"), r)
new_id = int(r["report_id"])
mine = per0.get(BASE + "disasters/get_reports.php", params={"household_id": hh[0]["household_id"]}).json()["data"]
check("9", "Disaster Reports (H08): new report Pending + report #8 (High) Pending", {(int(x["report_id"]), x["status"]) for x in mine} >= {(new_id, "Pending"), (8, "Pending")}, [(x["report_id"], x["status"]) for x in mine])
check("9", "H08 score unchanged at 79 (the High report is still the selected report)", prio(admin)["Ernesto Dimaculangan"]["priority_score"] == 79)
check("10-11", "resident cannot open relief requests (Phase 21, 403)", res_s.get(BASE + "requests/get_requests.php").status_code == 403)
rq = admin.get(BASE + "requests/get_requests.php", params={"status": "open"}).json()["data"]
rq = [x for x in rq if int(x["request_id"]) == 4]
check("10-11", "Relief Requests (admin): request #4 is Pending", len(rq) == 1 and rq[0]["status"] == "Pending", rq)

# ---------------- PART C: admin
w = admin.get(BASE + "dashboard/statistics.php").json()["data"]
wf = w["workflow"]
cards = (wf["affected_households"], wf["reports_by_status"].get("Pending", 0), wf["priority_levels"].get("High Priority", 0) + wf["priority_levels"].get("Critical Priority", 0),
         wf["requests_by_status"].get("Pending", 0) + wf["requests_by_status"].get("Under Review", 0), wf["allocations_by_status"].get("Approved", 0), w["low_stock_items"],
         (wf["evacuation"]["occupancy"], wf["evacuation"]["capacity"]))
check("13", f"dashboard cards (affected, awaiting verification, high/critical, requests awaiting, approved allocations, low stock, evacuation) = {cards}", cards == (8, 2, 5, 1, 5, 2, (26, 80)), cards)  # Phase 22: 5 High/Critical households
reps = admin.get(BASE + "disasters/get_reports.php").json()["data"]
check("14", "Disaster Reports: 9 reports, 2 Pending (both H08)", len(reps) == 9 and sum(1 for x in reps if x["status"] == "Pending") == 2)
r = admin.post(BASE + "disasters/verify_report.php", json={"report_id": 8, "remarks": "Verified during the defense demonstration."}).json()
p = prio(admin)["Ernesto Dimaculangan"]
check("15", "verify report #8 -> H08 becomes 85 Critical (confidence 2 -> 5)", r.get("success") and (p["priority_score"], p["priority_level"], p["ratings"]["assessment_confidence"]) == (85, "Critical Priority", 5), (r, p.get("ratings")))
da = admin.get(BASE + "disasters/get_damage_assessment.php", params={"report_id": 8}).json()["data"]
check("16", "damage assessment #8: Major / None / Major / Major, Estimated Severity High", (da["house_damage"], da["infrastructure_damage"], da["property_damage"], da["agricultural_damage"], da["estimated_severity"]) == ("Major", "None", "Major", "Major", "High"), da)
pl = prio(admin)
rank = [(x, pl[x]["priority_score"]) for x in sorted(pl, key=lambda k: pl[k]["rank"] or 99)]
print("  ranking:", rank)
check("17-18", "ranking 85 / 76 / 72 / 72 / 71 / 52 / 49 / 36 with all four categories", [s for _, s in rank] == [85, 76, 72, 72, 71, 52, 49, 36] and {pl[x]["priority_level"] for x in pl} == {"Critical Priority", "High Priority", "Moderate Priority", "Low Priority"}, rank)
b = pl["Jerome Pascual"]["score_breakdown"]
check("19", "worked example H04: ratings S4 D4 V2 H3 C5 -> 24 + 20 + 8 + 9 + 10 = 71", [b[k] for k in ["disaster_severity", "damage_unmet_needs", "vulnerable_members", "household_size", "assessment_confidence"]] == [24, 20, 8, 9, 10] and pl["Jerome Pascual"]["priority_score"] == 71, b)
rec = admin.get(BASE + "dashboard/relief_recommendations.php").json()
first = rec["data"][0]
check("20,23", "Relief Recommendations: first household is H08 (Critical) and gets its full needs", first["head_of_family"] == "Ernesto Dimaculangan" and all(i["shortage"] == 0 for i in first["recommendations"]), first)
inv = {x["item_name"].replace(" [DEFENSE TEST]", ""): x for x in admin.get(BASE + "inventory/get_items.php").json()["data"]}
check("21", "Relief Inventory: Water 102, Food Pack 16, Hygiene Kit 6 (Low Stock), First Aid Kit 4 (Low Stock)", (inv["Bottled Water"]["quantity"], inv["Family Food Pack"]["quantity"], inv["Hygiene Kit"]["quantity"], inv["Hygiene Kit"]["low_stock"], inv["First Aid Kit"]["low_stock"]) == (102, 16, 6, True, True))
det = admin.get(BASE + "requests/get_request_detail.php", params={"request_id": 4}).json()["data"]
lines = {i["item_name"].replace(" [DEFENSE TEST]", ""): i for i in det["items"]}
tbl = {n: (i["requested_quantity"], i["dss_needs_estimate"], i["dss_recommended_quantity"], i["available_stock"], i["shortage"]) for n, i in lines.items()}
print("  request #4 (requested, need, DSS recommends, available, shortage):", tbl)
check("22,24", "request #4 review: Water 24/24/24/84/0, Food Pack 5/4/4/9/0, Hygiene Kit 5/1/1/2/3", tbl == {"Bottled Water": (24, 24, 24, 84, 0), "Family Food Pack": (5, 4, 4, 9, 0), "Hygiene Kit": (5, 1, 1, 2, 3)}, tbl)
check("24", "review screen DSS panel: 85 Critical", det["dss"]["priority_score"] == 85)
admin.post(BASE + "requests/start_review.php", json={"request_id": 4})
dec = admin.post(BASE + "requests/decide_request.php", json={"request_id": 4, "decision": "approve", "remarks": "Approved Food Pack 4, Water 24, Hygiene Kit 2 (all available kits).",
                                                             "items": [{"request_item_id": i["request_item_id"], "approved_quantity": {"Bottled Water": 24, "Family Food Pack": 4, "Hygiene Kit": 2}[n]} for n, i in lines.items()]}).json()
check("25", "Save Approval -> Partially Approved (Hygiene Kit 2 differs from DSS 1)", dec.get("status") == "Partially Approved", dec)
check("25", "stock NOT changed by approval", stock()["Hygiene Kit"] == 6)
pr = admin.post(BASE + "requests/process_request.php", json={"request_id": 4}).json()
check("25", "Create Allocations -> request Allocated, 3 Approved allocations", pr.get("success") and one("SELECT status FROM relief_requests WHERE request_id = 4") == "Allocated" and one("SELECT COUNT(*) FROM relief_allocations a JOIN households h ON a.household_id = h.household_id WHERE h.head_of_family = 'Ernesto Dimaculangan' AND a.status = 'Approved'") == "3", pr)
check("25", "Hygiene Kit now fully reserved (stock 6, reserved 6, available 0)", one("SELECT SUM(a.quantity) FROM relief_allocations a JOIN relief_items i ON a.item_id = i.item_id WHERE i.item_name LIKE 'Hygiene%' AND a.status = 'Approved'") == "6" and stock()["Hygiene Kit"] == 6)

# ---------------- PART D/E: map, evacuation, hazard
p = prio(admin)["Ernesto Dimaculangan"]
check("26-30", "after allocation H08's essential needs are 60% covered: 85 -> 80, still Critical", (p["priority_score"], p["priority_level"]) == (80, "Critical Priority"), (p["priority_score"], p.get("unmet_needs")))
mh = admin.get(BASE + "households/get_households.php").json()["data"]
h06 = next(x for x in mh if x["head_of_family"] == "Wilfredo Ocampo")
check("29-30", "H06 coordinates 13.155759, 123.714951 (Locate popup)", (float(h06["latitude"]), float(h06["longitude"])) == (13.155759, 123.714951))
ec = admin.get(BASE + "evacuation/get_centers.php").json()["data"]
check("31", "evacuation centers Open 18/50 and Open 8/30", sorted((x["status"], x["current_occupancy"], x["capacity"]) for x in ec) == [("Open", 8, 30), ("Open", 18, 50)])
al = admin.get(BASE + "hazards/alerts/get_alerts.php").json()["data"]
check("32", "hazard alerts: 2 active (Purok 7 flood, Purok 5A landslide), 1 resolved", sorted((x["affected_purok"] or "", int(x["is_active"])) for x in al) == [("", 0), ("Purok 5A", 1), ("Purok 7", 1)], [(x["affected_purok"], x["is_active"]) for x in al])

# ---------------- PART F/G: personnel distribution + inventory
per, r = login("personnel.binitayan.test@gmail.com")
check("34", "Relief Personnel logs in", r.get("success") and r["user"]["role"] == "relief_personnel")
allocs = [a for a in per.get(BASE + "relief/get_allocations.php").json()["data"] if a["status"] == "Approved"]
check("35", "Approved Allocations lists 8 rows (H04 3, H07 2, H08 3)", len(allocs) == 8, len(allocs))
before = stock()
check("38", "stock before: Water 102, Food Pack 16, Hygiene Kit 6", (before["Bottled Water"], before["Family Food Pack"], before["Hygiene Kit"]) == (102, 16, 6))
h04 = [a for a in allocs if a["head_of_family"] == "Jerome Pascual"]
oks = [per.post(BASE + "relief/distribute.php", json={"allocation_id": a["allocation_id"]}).json().get("success") for a in h04]
check("36", "Mark as Distributed x3 for Jerome Pascual", oks == [True, True, True], oks)
after = stock()
check("40", "stock after: Water 84, Food Pack 12, Hygiene Kit 4", (after["Bottled Water"], after["Family Food Pack"], after["Hygiene Kit"]) == (84, 12, 4), after)
check("41", "3 Stock Out log entries for Jerome Pascual", one("SELECT COUNT(*) FROM inventory_logs WHERE log_type = 'Stock Out' AND reference LIKE '%Jerome Pascual%'") == "3")
check("37", "request #2 (H04) becomes Distributed; H04 score stays 71 (its relief was counted when approved)", one("SELECT status FROM relief_requests WHERE request_id = 2") == "Distributed" and prio(admin)["Jerome Pascual"]["priority_score"] == 71)
again = per.post(BASE + "relief/distribute.php", json={"allocation_id": h04[0]["allocation_id"]})
check("36", "second distribution of the same allocation is refused (no double deduction)", again.json().get("success") is False and stock()["Bottled Water"] == 84, again.text[:120])

# ---------------- PART H: SMS
auto = one(f"SELECT GROUP_CONCAT(CONCAT(category, ':', recipient_name) ORDER BY sms_id SEPARATOR ' | ') FROM sms_logs WHERE sms_id > {sms_start}")
print("  automatic SMS log rows created during the demo:", auto)
# Phase 25 policy: SMS only when relief is marked Ready for Distribution. Request decisions,
# approvals and distributions notify in-app only (opt-in: SMS_ON_APPROVAL_AND_DISTRIBUTION).
# This demo does not mark anything Ready, so no automatic SMS row is expected.
check("43", "Phase 25: no automatic SMS for request decision, approval or distribution (SMS only when Ready); no report SMS",
      auto in ("", "NULL"), auto)
r = admin.post(BASE + "sms/send.php", json={"recipient_mode": "custom", "category": "General", "custom_recipients": [{"name": "Presenter (own phone)", "number": "09000009999"}],
                                            "message": "Binitayan Disaster Response: Relief distribution information is available. Please check your account or contact the barangay office."}).json()
check("42,44", "manual Send SMS with TextBee off -> 'Not Configured' message, no success claim", "Not Configured" in r.get("message", ""), r)
check("45", "SMS Logs: every row Not Configured, none Sent", one("SELECT COUNT(*) FROM sms_logs WHERE status <> 'Not Configured'") == "0")

# ---------------- PART I: reports
an = admin.get(BASE + "reports/dashboard_analytics.php").json()["data"]
sev = {x["label"]: x["count"] for x in an["reports_by_severity"]}
check("46-47", "analytics: 9 reports, severity 2 Critical / 3 High / 2 Medium / 2 Low", an["summary"]["total_disaster_reports"] == 9 and sev == {"Critical": 2, "High": 3, "Medium": 2, "Low": 2}, (an["summary"], sev))
au = dict(l.split("\t") for l in one("SELECT action, COUNT(*) FROM audit_logs GROUP BY action").split("\n"))
check("49", "audit log has the demo's verification, approval, allocation and distribution", int(au["Disaster report verified"]) == 8 and int(au["Relief request Partially Approved"]) == 2 and int(au["Relief request processed"]) == 4 and int(au["Relief distributed"]) == 5, au)

print(f"\nPRESENTATION REHEARSAL: {sum(res)}/{len(res)} passed")
sys.exit(0 if all(res) else 1)
