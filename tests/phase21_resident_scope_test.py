"""
Phase 21 test — resident role correction, staff-recorded disaster reports,
"Ready for Distribution" with automated SMS.

    python3 tests/phase21_resident_scope_test.py <api_sms_off> <api_sms_mock> <db> <admin_email> <admin_password>

  api_sms_off  : backend URL with TextBee OFF (SMS logged "Not Configured")
  api_sms_mock : backend URL, same database, TextBee ON pointing to the LOCAL MOCK
                 gateway (/home/claude/mock; fails while /tmp/textbee_fail exists).
                 No real SMS is ever sent.
  db           : a REHEARSAL database (name must contain "rehearsal") loaded with
                 barangay_disaster_db_FINAL.sql + an Administrator + defensedata_typhoon_flood.sql
"""
import base64, os, subprocess, sys, datetime
import requests

if len(sys.argv) != 6 or "rehearsal" not in sys.argv[3]:
    sys.exit(__doc__)
OFF, ON, DB, AE, AP = sys.argv[1].rstrip("/") + "/", sys.argv[2].rstrip("/") + "/", sys.argv[3], sys.argv[4], sys.argv[5]
PW = "BinitayanTest2026!"
FAIL_FLAG = "/tmp/textbee_fail"
MOCK_LOG = "/tmp/textbee_calls.log"
TODAY = datetime.date.today()
TOMORROW = (TODAY + datetime.timedelta(days=1)).isoformat()
results = []


def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {str(detail)[:400]}"))


def sql(q):
    return subprocess.run(["mysql", "-N", "-B", DB, "-e", q], capture_output=True, text=True).stdout.strip()


def one(q):
    v = sql(q)
    return v.splitlines()[0] if v else ""


class JS(requests.Session):
    def post(self, url, data=None, **kw):
        if isinstance(data, (dict, list)) and "json" not in kw:
            return super().post(url, json=data, **kw)
        return super().post(url, data=data, **kw)

    def put(self, url, data=None, **kw):
        if isinstance(data, (dict, list)) and "json" not in kw:
            return super().put(url, json=data, **kw)
        return super().put(url, data=data, **kw)


def sess(base, email, pw):
    s = JS()
    r = s.post(base + "auth/login.php", json={"email": email, "password": pw})
    assert r.json().get("success"), (email, r.text)
    return s


def J(r):
    try:
        d = r.json()
    except Exception:
        d = {"_raw": r.text[:200]}
    d["_status"] = r.status_code
    return d


def mock_calls():
    try:
        return len(open(MOCK_LOG).read().splitlines())
    except FileNotFoundError:
        return 0


if os.path.exists(FAIL_FLAG):
    os.remove(FAIL_FLAG)

A = sess(OFF, AE, AP)
AM = sess(ON, AE, AP)
P = sess(OFF, "personnel.binitayan.test@gmail.com", PW)
PM = sess(ON, "personnel.binitayan.test@gmail.com", PW)
R4 = sess(OFF, "binitayan.test04@gmail.com", PW)
R6 = sess(OFF, "binitayan.test06@gmail.com", PW)
H4 = int(one("SELECT household_id FROM households h JOIN users u ON u.user_id=h.user_id WHERE u.email='binitayan.test04@gmail.com'"))
H6 = int(one("SELECT household_id FROM households h JOIN users u ON u.user_id=h.user_id WHERE u.email='binitayan.test06@gmail.com'"))
U6 = int(one("SELECT user_id FROM users WHERE email='binitayan.test06@gmail.com'"))
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")


def ranking():
    return {p["household_id"]: p["priority_score"] for p in A.get(OFF + "dashboard/priority_list.php").json()["data"]}


base_rank = ranking()
check("0 baseline DSS (Phase 22 weighted): 79, 76, 72, 72, 71, 52, 49, 36", sorted(base_rank.values(), reverse=True) == [79, 76, 72, 72, 71, 52, 49, 36], base_rank)

# ================================================================== A. resident restrictions
reports0 = one("SELECT COUNT(*) FROM disaster_reports")
r = J(R6.post(OFF + "disasters/create_report.php", {"disaster_type": "Flood", "severity": "High", "location": "Purok 6",
                                                   "report_date": TODAY.isoformat(), "household_id": H6}))
check("A1 resident cannot submit a disaster report through the API (403), nothing saved",
      r["_status"] == 403 and one("SELECT COUNT(*) FROM disaster_reports") == reports0, r)
rep_any = one("SELECT report_id FROM disaster_reports ORDER BY report_id LIMIT 1")
photo_any = one("SELECT photo_id FROM report_photos LIMIT 1") or "1"
denied = {
    "upload photos": requests.Session.post(R6, OFF + "disasters/upload_photos.php", data={"report_id": rep_any}, files={"photos[]": ("a.png", PNG, "image/png")}),
    "delete photo": R6.delete(OFF + "disasters/delete_photo.php", json={"photo_id": int(photo_id) if (photo_id := photo_any).isdigit() else 1}),
    "update report": R6.post(OFF + "disasters/update_report.php", {"report_id": int(rep_any), "disaster_type": "Flood", "severity": "Low", "location": "x y z", "report_date": TODAY.isoformat()}),
    "verify report": R6.post(OFF + "disasters/verify_report.php", {"report_id": int(rep_any)}),
    "reject report": R6.post(OFF + "disasters/reject_report.php", {"report_id": int(rep_any), "remarks": "x"}),
    "save damage assessment": R6.post(OFF + "disasters/save_damage_assessment.php", {"report_id": int(rep_any), "house_damage": "Major"}),
    "list disaster reports": R6.get(OFF + "disasters/get_reports.php"),
    "damage assessment": R6.get(OFF + "disasters/get_damage_assessment.php", params={"report_id": rep_any}),
    "report photos": R6.get(OFF + "disasters/get_report_photos.php", params={"report_id": rep_any}),
    "create relief request": R6.post(OFF + "requests/create_request.php", {"urgency": "High", "items": [{"item_id": 1, "quantity": 1}]}),
    "list relief requests": R6.get(OFF + "requests/get_requests.php"),
    "relief request detail": R6.get(OFF + "requests/get_request_detail.php", params={"request_id": 1}),
    "submit feedback": R6.post(OFF + "feedback/submit_feedback.php", {"type": "allocation", "ref_id": 1, "received": "Yes", "rating": 5}),
    "my deliveries (feedback)": R6.get(OFF + "feedback/get_my_deliveries.php"),
    "inventory items": R6.get(OFF + "inventory/get_items.php"),
    "relief packages": R6.get(OFF + "relief/packages/get_packages.php"),
    "evacuation centers": R6.get(OFF + "evacuation/get_centers.php"),
    "hazard alerts": R6.get(OFF + "hazards/alerts/get_alerts.php"),
    "weather logs": R6.get(OFF + "hazards/weather/get_weather_logs.php"),
    "inventory categories": R6.get(OFF + "settings/categories/get_categories.php"),
    "disaster types": R6.get(OFF + "settings/disaster_types/get_types.php"),
    "puroks": R6.get(OFF + "settings/get_puroks.php"),
    "DSS priority list": R6.get(OFF + "dashboard/priority_list.php"),
    "DSS recommendations": R6.get(OFF + "dashboard/relief_recommendations.php"),
    "user accounts": R6.get(OFF + "users/get_users.php"),
    "approve allocation": R6.post(OFF + "relief/approve_allocation.php", {"allocation_id": 1}),
    "create allocation": R6.post(OFF + "relief/create_allocation.php", {"household_id": H6, "item_id": 1, "quantity": 1}),
    "mark ready": R6.post(OFF + "relief/mark_ready.php", {"allocation_ids": [1], "distribution_date": TOMORROW, "location": "Hall", "confirmed": True}),
    "distribute": R6.post(OFF + "relief/distribute.php", {"allocation_id": 1}),
    "stock out": R6.post(OFF + "inventory/stock_out.php", {"item_id": 1, "quantity": 1}),
    "update household (coordinates)": R6.post(OFF + "households/update_household.php", {"household_id": H6, "latitude": 13.15, "longitude": 123.71}),
    "add household member": R6.post(OFF + "households/members/add_member.php", {"household_id": H6, "full_name": "X"}),
    "affected households": R6.get(OFF + "hazards/areas/get_affected_households.php"),
    "situation report": R6.get(OFF + "reports/situation_report.php"),
    "SMS logs": R6.get(OFF + "sms/get_logs.php"),
    "send SMS": R6.post(OFF + "sms/send.php", {"message": "x", "recipients": []}),
    "audit logs": R6.get(OFF + "audit/get_logs.php"),
}
bad = {k: v.status_code for k, v in denied.items() if v.status_code not in (403, 404)}
check(f"A2 resident is refused on {len(denied)} staff / retired API endpoints (403)", not bad, bad)
missing = {k: v.status_code for k, v in denied.items() if v.status_code == 404}
check("A2b every refused endpoint exists (no 404 masking a missing file)", not missing, missing)
check("A3 resident cannot change official coordinates (unchanged in DB)",
      one(f"SELECT CONCAT(latitude,',',longitude) FROM households WHERE household_id={H6}") != "13.1500000,123.7100000")

hh = J(R6.get(OFF + "households/get_households.php"))
check("A4 resident sees only their own household", hh["_status"] == 200 and [int(h["household_id"]) for h in hh["data"]] == [H6], hh)
check("A4b no priority score / DSS data in the resident household view",
      not any(k for h in hh["data"] for k in h if "priority" in k or "score" in k), list(hh["data"][0].keys()) if hh.get("data") else hh)
m_other = J(R6.get(OFF + "households/members/get_members.php", params={"household_id": H4}))
check("A5 resident cannot read another household's members", m_other["_status"] in (403, 404) or not m_other.get("data"), m_other)
al = J(R6.get(OFF + "relief/get_allocations.php"))
check("A6 resident allocations: own household only, with display_status",
      al["_status"] == 200 and all(int(a["household_id"]) == H6 for a in al["data"]) and all("display_status" in a for a in al["data"]), al)
check("A6b staff-only fields hidden from the resident", all("approved_by" not in a and "recommendation_reason" not in a for a in al["data"]))
nt = J(R6.get(OFF + "notifications/get_notifications.php"))
check("A7 notifications: resident sees only their own", nt["_status"] == 200 and all(int(n.get("user_id", U6)) == U6 for n in nt["data"]), nt)

# profile: contact number + password only
prof = J(R6.get(OFF + "users/get_my_profile.php"))["data"]
r = J(R6.put(OFF + "users/update_my_profile.php", {"full_name": "Hacked Name", "email": prof["email"], "contact_number": prof["contact_number"]}))
check("A8 resident cannot change their registered name (403)", r["_status"] == 403 and one(f"SELECT full_name FROM users WHERE user_id={U6}") == prof["full_name"], r)
r = J(R6.put(OFF + "users/update_my_profile.php", {"full_name": prof["full_name"], "email": "other@example.test", "contact_number": prof["contact_number"]}))
check("A9 resident cannot change their email (403)", r["_status"] == 403 and one(f"SELECT email FROM users WHERE user_id={U6}") == prof["email"], r)
r = J(R6.put(OFF + "users/update_my_profile.php", {"full_name": prof["full_name"], "email": prof["email"], "contact_number": "12345"}))
check("A10 invalid contact number refused (400)", r["_status"] == 400, r)
r = J(R6.put(OFF + "users/update_my_profile.php", {"full_name": prof["full_name"], "email": prof["email"], "contact_number": "09000001199"}))
check("A11 resident can update their contact number", r.get("success") and one(f"SELECT contact_number FROM users WHERE user_id={U6}") == "09000001199", r)
R6.put(OFF + "users/update_my_profile.php", {"full_name": prof["full_name"], "email": prof["email"], "contact_number": prof["contact_number"]})
r = J(R6.post(OFF + "users/change_my_password.php", {"current_password": PW, "new_password": "TempPass2026!"}))
ok_new = JS().post(OFF + "auth/login.php", json={"email": "binitayan.test06@gmail.com", "password": "TempPass2026!"}).json().get("success")
R6.post(OFF + "users/change_my_password.php", {"current_password": "TempPass2026!", "new_password": PW})
ok_back = JS().post(OFF + "auth/login.php", json={"email": "binitayan.test06@gmail.com", "password": PW}).json().get("success")
check("A12 resident can change their password (and it works)", r.get("success") and ok_new and ok_back, r)

# ================================================================== B. staff record reports / assessments
r = J(P.post(OFF + "disasters/create_report.php", {"household_id": H6, "disaster_type": "Flood", "severity": "Medium",
                                                  "location": "Purok 6, near the creek", "description": "[DEFENSE TEST] Phase 21 field record",
                                                  "report_date": TODAY.isoformat(), "report_time": "08:30"}))
NEWREP = int(r.get("report_id") or 0)
row = sql(f"SELECT status, household_id, user_id FROM disaster_reports WHERE report_id={NEWREP or 0}").split("\t")
PID = one("SELECT user_id FROM users WHERE email='personnel.binitayan.test@gmail.com'")
check("B1 Relief Personnel records a disaster report for a household (Pending, linked to household, recorded by personnel)",
      r["_status"] == 201 and row == ["Pending", str(H6), PID], (r, row))
check("B2 missing household refused (400)", J(A.post(OFF + "disasters/create_report.php", {"disaster_type": "Flood", "severity": "Low", "location": "abc", "report_date": TODAY.isoformat()}))["_status"] == 400)
check("B3 unknown household refused (404)", J(A.post(OFF + "disasters/create_report.php", {"household_id": 999999, "disaster_type": "Flood", "severity": "Low", "location": "abc", "report_date": TODAY.isoformat()}))["_status"] == 404)
check("B4 future report date refused (400)", J(A.post(OFF + "disasters/create_report.php", {"household_id": H6, "disaster_type": "Flood", "severity": "Low", "location": "abc", "report_date": (TODAY + datetime.timedelta(days=3)).isoformat()}))["_status"] == 400)
check("B5 invalid household id format refused (400)", J(A.post(OFF + "disasters/create_report.php", {"household_id": "6abc", "disaster_type": "Flood", "severity": "Low", "location": "abc", "report_date": TODAY.isoformat()}))["_status"] == 400)
up = J(requests.Session.post(P, OFF + "disasters/upload_photos.php", data={"report_id": NEWREP}, files={"photos[]": ("field.png", PNG, "image/png")}))
check("B6 Relief Personnel can attach a photo", up["_status"] == 200 and one(f"SELECT COUNT(*) FROM report_photos WHERE report_id={NEWREP}") == "1", up)
r = J(P.post(OFF + "disasters/save_damage_assessment.php", {"report_id": NEWREP, "house_damage": "Minor", "infrastructure_damage": "None",
                                                           "property_damage": "Minor", "agricultural_damage": "None", "estimated_severity": "Medium", "remarks": "Field check"}))
check("B7 Relief Personnel records the field damage assessment", r.get("success") and one(f"SELECT CONCAT(house_damage,'/',assessed_by) FROM damage_assessments WHERE report_id={NEWREP}") == f"Minor/{PID}", r)
r = J(P.post(OFF + "disasters/update_report.php", {"report_id": NEWREP, "disaster_type": "Flood", "severity": "High", "location": "Purok 6, near the creek",
                                                  "description": "[DEFENSE TEST] Phase 21 field record (updated)", "report_date": TODAY.isoformat(), "report_time": "08:30"}))
check("B8 Relief Personnel updates report details; audit log records old -> new",
      r.get("changed") and one(f"SELECT severity FROM disaster_reports WHERE report_id={NEWREP}") == "High"
      and one(f"SELECT COUNT(*) FROM audit_logs WHERE action='Disaster report updated' AND details LIKE 'report_id: {NEWREP} %severity: Medium -> High%'") == "1", r)
check("B9 Relief Personnel cannot verify a report (403)", J(P.post(OFF + "disasters/verify_report.php", {"report_id": NEWREP}))["_status"] == 403)
sms0 = one("SELECT COUNT(*) FROM sms_logs")
r = J(A.post(OFF + "disasters/verify_report.php", {"report_id": NEWREP, "remarks": "Confirmed"}))
check("B10 Administrator verifies it; no resident SMS / notification for report events",
      r.get("success") and one(f"SELECT status FROM disaster_reports WHERE report_id={NEWREP}") == "Verified"
      and one("SELECT COUNT(*) FROM sms_logs") == sms0 and one(f"SELECT COUNT(*) FROM notifications WHERE event_key='report:{NEWREP}:verified'") == "0", r)
r = J(P.post(OFF + "disasters/update_report.php", {"report_id": NEWREP, "disaster_type": "Flood", "severity": "High", "location": "Purok 6, near the creek (verified)",
                                                  "description": "[DEFENSE TEST] Phase 21 field record (updated)", "report_date": TODAY.isoformat(), "report_time": "08:30"}))
check("B11 verified information can be updated by personnel; status stays Verified",
      r.get("changed") and one(f"SELECT status FROM disaster_reports WHERE report_id={NEWREP}") == "Verified", r)
ps = J(P.get(OFF + "disasters/get_reports.php"))
check("B12 Relief Personnel can list disaster reports", ps["_status"] == 200 and any(int(x["report_id"]) == NEWREP for x in ps["data"]))

# ================================================================== C. Ready for Distribution (SMS off)
rank_c = ranking()
ap4 = [int(x) for x in sql(f"SELECT allocation_id FROM relief_allocations WHERE household_id={H4} AND status='Approved' ORDER BY allocation_id").split()]
check("C0 test data: H04 has approved allocations", len(ap4) >= 1, ap4)
pend = one("SELECT allocation_id FROM relief_allocations WHERE status='Pending' LIMIT 1")
avail0 = J(A.get(OFF + "inventory/get_items.php"))["data"]
avail0 = {i["item_id"]: (i.get("committed_quantity"), i["quantity"]) for i in avail0}
good = {"allocation_ids": ap4, "distribution_date": TOMORROW, "distribution_time": "09:00",
        "location": "Binitayan Evacuation Center", "instructions": "Bring a valid ID.", "confirmed": True}
for name, change, code in [
    ("not confirmed", {"confirmed": False}, 400),
    ("past date", {"distribution_date": (TODAY - datetime.timedelta(days=1)).isoformat()}, 400),
    ("no location", {"location": "  "}, 400),
    ("bad time", {"distribution_time": "25:99"}, 400),
    ("bad id", {"allocation_ids": ["1x"]}, 400),
    ("unknown id", {"allocation_ids": [999999]}, 404),
]:
    r = J(P.post(OFF + "relief/mark_ready.php", {**good, **change}))
    check(f"C1 refused: {name} ({code})", r["_status"] == code, r)
if pend:
    r = J(P.post(OFF + "relief/mark_ready.php", {**good, "allocation_ids": ap4 + [int(pend)]}))
    check("C2 batch with a Pending allocation refused (409) and NOTHING changed",
          r["_status"] == 409 and one(f"SELECT COUNT(*) FROM relief_allocations WHERE ready_at IS NOT NULL") == "0", r)
# a Distributed allocation: distribute one approved allocation of another household first
other = one(f"SELECT allocation_id FROM relief_allocations WHERE status='Approved' AND household_id<>{H4} ORDER BY allocation_id DESC LIMIT 1")
J(P.post(OFF + "relief/distribute.php", {"allocation_id": int(other)}))
dist_any = one("SELECT allocation_id FROM relief_allocations WHERE status='Distributed' LIMIT 1")
r = J(P.post(OFF + "relief/mark_ready.php", {**good, "allocation_ids": ap4 + [int(dist_any)]}))
check("C3 batch with a Distributed allocation refused (409), nothing changed",
      dist_any != "" and r["_status"] == 409 and one("SELECT COUNT(*) FROM relief_allocations WHERE ready_at IS NOT NULL") == "0", r)

rank_c = ranking()
avail0 = {i["item_id"]: (i.get("committed_quantity"), i["quantity"]) for i in J(A.get(OFF + "inventory/get_items.php"))["data"]}
r = J(P.post(OFF + "relief/mark_ready.php", good))
FIRST = ap4[0]
check("C4 Relief Personnel marks H04's approved allocations Ready for Distribution",
      r.get("success") and one(f"SELECT COUNT(*) FROM relief_allocations WHERE allocation_id IN ({','.join(map(str, ap4))}) AND status='Approved' AND ready_at IS NOT NULL AND ready_location='Binitayan Evacuation Center'") == str(len(ap4)), r)
srow = sql(f"SELECT status, event_type, allocation_id, household_id, category, message FROM sms_logs WHERE event_key='allocation:{FIRST}:ready'").split("\t")
check("C5 ONE automated SMS event for the household: ALLOCATION_READY_FOR_DISTRIBUTION, logged honestly as Not Configured",
      len(srow) == 6 and srow[:5] == ["Not Configured", "ALLOCATION_READY_FOR_DISTRIBUTION", str(FIRST), str(H4), "Relief Allocation Update"]
      and one(f"SELECT COUNT(*) FROM sms_logs WHERE event_key='allocation:{FIRST}:ready'") == "1", srow)
msg = srow[5] if len(srow) == 6 else ""
check("C6 SMS text built from verified data: ready, items, schedule, location, instructions",
      "ready for distribution" in msg and "Schedule:" in msg and "9:00 AM" in msg and "Location: Binitayan Evacuation Center" in msg
      and "Instructions: Bring a valid ID." in msg, msg)
check("C7 response says SMS is disabled (no false 'sent' claim)", "SMS notifications are currently disabled." in r.get("message", "") and "were sent" not in r.get("message", ""), r)
check("C8 in-app notification created for the resident of H04",
      one(f"SELECT COUNT(*) FROM notifications n JOIN households h ON h.user_id=n.user_id WHERE h.household_id={H4} AND n.event_key='allocation:{FIRST}:ready'") == "1")
r2 = J(P.post(OFF + "relief/mark_ready.php", good))
check("C9 repeated Mark Ready refused (409); still one SMS log and one notification",
      r2["_status"] == 409 and one(f"SELECT COUNT(*) FROM sms_logs WHERE event_key='allocation:{FIRST}:ready'") == "1"
      and one(f"SELECT COUNT(*) FROM notifications WHERE event_key='allocation:{FIRST}:ready'") == "1", r2)
a4 = J(R4.get(OFF + "relief/get_allocations.php"))["data"]
rd = [a for a in a4 if int(a["allocation_id"]) in ap4]
check("C10 resident H04 sees 'Ready for Distribution' with the verified schedule and location",
      rd and all(a["display_status"] == "Ready for Distribution" and a["ready_location"] == "Binitayan Evacuation Center" and a["ready_schedule_date"] == TOMORROW for a in rd), rd)
check("C11 resident H06 cannot see H04's allocations", not any(int(a["household_id"]) == H4 for a in J(R6.get(OFF + "relief/get_allocations.php"))["data"]))
avail1 = {i["item_id"]: (i.get("committed_quantity"), i["quantity"]) for i in J(A.get(OFF + "inventory/get_items.php"))["data"]}
check("C12 Ready does not change stock or reserved (committed) quantities", avail0 == avail1, (avail0, avail1))
check("C13 DSS scores unchanged by Ready for Distribution", ranking() == rank_c)
r = J(P.post(OFF + "relief/distribute.php", {"allocation_id": FIRST}))
d4 = {int(a["allocation_id"]): a["display_status"] for a in J(R4.get(OFF + "relief/get_allocations.php"))["data"]}
check("C14 a Ready allocation is distributed normally (Distributed, stock deducted once)",
      r.get("success") and d4.get(FIRST) == "Distributed", (r, d4))

# ================================================================== D. Ready SMS through the (mock) gateway
others = sql("SELECT household_id, GROUP_CONCAT(allocation_id ORDER BY allocation_id) FROM relief_allocations WHERE status='Approved' AND ready_at IS NULL GROUP BY household_id ORDER BY household_id LIMIT 2").splitlines()
groups = [(int(l.split("\t")[0]), [int(x) for x in l.split("\t")[1].split(",")]) for l in others]
check("D0 test data: two more households with approved allocations", len(groups) == 2, groups)
ids = [i for _, g in groups for i in g]
c0 = mock_calls()
r = J(AM.post(ON + "relief/mark_ready.php", {**good, "allocation_ids": ids, "distribution_time": "", "instructions": ""}))
rows = [sql(f"SELECT status, household_id, message FROM sms_logs WHERE event_key='allocation:{g[0]}:ready'").split("\t") for _, g in groups]
check("D1 Administrator marks 2 households in one action: one SMS per household, Accepted by Gateway (mock)",
      r.get("success") and all(x[0] == "Accepted by Gateway" for x in rows) and [int(x[1]) for x in rows] == [h for h, _ in groups]
      and mock_calls() == c0 + 2, (r, rows, mock_calls() - c0))
check("D2 without instructions the SMS does not invent any; without a time only the date is sent",
      all("Instructions:" not in x[2] and "For inquiries, contact the barangay office." in x[2] and " AM" not in x[2] and " PM" not in x[2] for x in rows), rows)
check("D3 response says the gateway accepted the SMS (delivery not claimed)", "accepted by the TextBee gateway" in r.get("message", ""), r)

# failure: create + approve a new allocation for H06, then Mark Ready while the gateway fails
item = one("SELECT item_id FROM relief_items ORDER BY item_id LIMIT 1")
ca = J(A.post(OFF + "relief/create_allocation.php", {"household_id": H6, "item_id": int(item), "quantity": 1, "allocation_date": TODAY.isoformat()}))
NEWA = int(ca.get("allocation_id") or one(f"SELECT MAX(allocation_id) FROM relief_allocations WHERE household_id={H6}"))
J(A.post(OFF + "relief/approve_allocation.php", {"allocation_id": NEWA}))
open(FAIL_FLAG, "w").close()
r = J(PM.post(ON + "relief/mark_ready.php", {**good, "allocation_ids": [NEWA]}))
os.remove(FAIL_FLAG)
frow = sql(f"SELECT sms_id, status FROM sms_logs WHERE event_key='allocation:{NEWA}:ready'").split("\t")
check("D4 gateway failure: Ready status is kept, SMS logged as Failed, response says so",
      r.get("success") and one(f"SELECT ready_at IS NOT NULL FROM relief_allocations WHERE allocation_id={NEWA}") == "1"
      and len(frow) == 2 and frow[1] == "Failed" and "could not be sent" in r.get("message", ""), (r, frow))
c1 = mock_calls()
rt = J(AM.post(ON + "sms/retry.php", {"sms_id": int(frow[0])}))
check("D5 retry from SMS Logs sends it: same row becomes Accepted by Gateway, no duplicate row",
      rt.get("success") and one(f"SELECT status FROM sms_logs WHERE sms_id={frow[0]}") == "Accepted by Gateway"
      and one(f"SELECT COUNT(*) FROM sms_logs WHERE event_key='allocation:{NEWA}:ready'") == "1" and mock_calls() == c1 + 1, rt)
check("D6 no duplicate successful SMS per event + number",
      one("SELECT COUNT(*) FROM (SELECT event_key, recipient_number FROM sms_logs WHERE status IN ('Sent','Accepted by Gateway','Delivered') AND event_key IS NOT NULL GROUP BY 1,2 HAVING COUNT(*)>1) x") == "0")
check("D7 audit log records each Ready action", one("SELECT COUNT(*) FROM audit_logs WHERE action='Relief allocations marked Ready for Distribution'") == "3")
check("D8 integrity: ready rows always have a date and location; ready_by is a real user",
      one("SELECT COUNT(*) FROM relief_allocations a LEFT JOIN users u ON u.user_id=a.ready_by WHERE a.ready_at IS NOT NULL AND (a.ready_schedule_date IS NULL OR a.ready_location IS NULL OR u.user_id IS NULL)") == "0")

print()
print(f"PHASE 21 RESIDENT SCOPE TEST: {sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
