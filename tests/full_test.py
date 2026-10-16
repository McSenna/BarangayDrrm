"""
Full system API test (Phase 19). Runs against a FRESH database created from
database/barangay_disaster_db_FINAL.sql + setup_admin + setup_demo_data.
Prints PASS/FAIL per check and a summary.
"""
import json, subprocess, sys, os, requests

BASE = "http://127.0.0.1:8080/barangay-disaster/backend/"
DB = "barangay_disaster_db"
results = []

def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {detail}"))

def sql(q):
    out = subprocess.run(["mysql", "-uroot", "-N", DB, "-e", q], capture_output=True, text=True)
    return out.stdout.strip()

class S:
    def __init__(self, email=None, pw=None):
        self.s = requests.Session()
        if email:
            r = self.post("auth/login.php", {"email": email, "password": pw})
            assert r.get("success"), (email, r)
    def _j(self, r):
        try:
            d = r.json()
        except Exception:
            d = {"_raw": r.text[:300]}
        d["_status"] = r.status_code
        return d
    def get(self, p, params=None): return self._j(self.s.get(BASE + p, params=params))
    def post(self, p, data=None): return self._j(self.s.post(BASE + p, json=data))
    def put(self, p, data=None): return self._j(self.s.put(BASE + p, json=data))
    def delete(self, p, data=None): return self._j(self.s.delete(BASE + p, json=data))

ADMIN_PW = sys.argv[1]
admin = S("admin@binitayan.gov.ph", ADMIN_PW)
res1 = S("demo.resident1@binitayan.gov.ph", "demo1234")   # household linked
res2 = S("demo.resident2@binitayan.gov.ph", "demo1234")
res3 = S("demo.resident3@binitayan.gov.ph", "demo1234")
per1 = S("demo.personnel1@binitayan.gov.ph", "demo1234")
per2 = S("demo.personnel2@binitayan.gov.ph", "demo1234")
anon = S()

# ---------------- Authentication ----------------
r = anon.post("auth/login.php", {"email": "admin@binitayan.gov.ph", "password": "wrong"})
check("login rejects wrong password (401)", r["_status"] == 401)
check("failed login recorded in login_history", sql("SELECT COUNT(*) FROM login_history WHERE login_status='Failed'") != "0")
r = anon.post("auth/register.php", {"full_name": "Role Hack", "email": "hack@test.ph", "password": "secret12", "role": "admin"})
check("public registration ignores role (always resident)", sql("SELECT role FROM users WHERE email='hack@test.ph'") == "resident")
unlinked = S("hack@test.ph", "secret12")

# ---------------- Unauthenticated access ----------------
for ep in ["requests/get_requests.php", "evacuation/get_centers.php", "notifications/get_notifications.php",
           "feedback/get_feedback.php", "dashboard/priority_list.php", "maintenance/get_purok_values.php"]:
    check(f"anonymous blocked: {ep}", anon.get(ep)["_status"] == 401)

# ---------------- Role authorization ----------------
admin_only = [("GET", "requests/get_requests.php", None, [per1]), ("POST", "requests/decide_request.php", {"request_id": 1, "decision": "reject", "remarks": "xxx"}, [res1, per1]),
              ("POST", "requests/process_request.php", {"request_id": 1}, [res1, per1]), ("POST", "evacuation/save_center.php", {}, [res1, per1]),
              ("POST", "evacuation/set_status.php", {}, [res1, per1]), ("GET", "feedback/get_feedback.php", None, [res1, per1]),
              ("GET", "maintenance/get_purok_values.php", None, [res1, per1]), ("POST", "maintenance/apply_purok_mapping.php", {}, [res1, per1]),
              ("GET", "dashboard/statistics.php", None, [res1, per1]), ("POST", "sms/send.php", {}, [res1, per1]),
              ("GET", "dashboard/priority_list.php", None, [res1]), ("POST", "relief/approve_recommendation.php", {}, [res1, per1]),
              # Phase 21: relief requests are recorded by the Administrator; resident feedback / report submission retired
              ("POST", "requests/create_request.php", {}, [res1, per1]), ("POST", "feedback/submit_feedback.php", {}, [admin, per1, res1]),
              ("POST", "disasters/create_report.php", {}, [res1]), ("POST", "relief/mark_ready.php", {}, [res1]),
              ("GET", "requests/get_request_detail.php", None, [res1, per1])]
for m, ep, data, sessions in admin_only:
    for sess in sessions:
        r = sess.get(ep) if m == "GET" else sess.post(ep, data or {})
        check(f"forbidden role blocked: {ep}", r["_status"] == 403, r)

# ---------------- Purok ----------------
r = admin.post("households/add_household.php", {"head_of_family": "Juan Dela Cruz", "purok": "purok 5a", "address": "Zone 5", "number_of_members": 7,
                                                   "children_count": 2, "seniors_count": 1, "latitude": "13.1560", "longitude": "123.7160"})
check("household purok 'purok 5a' normalized to 'Purok 5A'", r.get("success") and sql(f"SELECT purok FROM households WHERE household_id={r.get('household_id')}") == "Purok 5A", r)
hh_new = int(r.get("household_id", 0))
r = admin.post("households/add_household.php", {"head_of_family": "X", "purok": "Riverside", "address": "x", "number_of_members": 1, "latitude": "", "longitude": ""})
check("invalid purok rejected", r["_status"] == 400)
r = admin.post("households/add_household.php", {"head_of_family": "X", "purok": "Purok 1", "address": "x", "number_of_members": 1, "latitude": "13.30", "longitude": "123.90"})
check("household outside boundary rejected", r["_status"] == 400)
vals = admin.get("maintenance/get_purok_values.php")
check("purok cleanup lists non-standard values", vals.get("non_standard_count", 0) >= 1)

# ---------------- DSS (Phase 22 weighted five-criterion model) ----------------
W = {"disaster_severity": 30, "damage_unmet_needs": 25, "vulnerable_members": 20, "household_size": 15, "assessment_confidence": 10}
def cat(sc):
    return "Critical Priority" if sc >= 80 else "High Priority" if sc >= 60 else "Moderate Priority" if sc >= 40 else "Low Priority"
pl = admin.get("dashboard/priority_list.php")["data"]
ok = True
for h in pl:
    if h["eligible"]:
        if [(c["key"], c["weight"]) for c in h["criteria"]] != list(W.items()): ok = False
        if h["priority_score"] != sum(c["rating"] / 5 * c["weight"] for c in h["criteria"]): ok = False
        if not all(1 <= c["rating"] <= 5 for c in h["criteria"]) or h["priority_level"] != cat(h["priority_score"]): ok = False
    elif h["priority_score"] is not None or h["priority_level"] != "Not Assessed" or h["rank"] is not None:
        ok = False
check("DSS: score = sum((rating/5) x weight) over 5 criteria (30/25/20/15/10); categories 80/60/40; unassessed = Not Assessed", ok)
check("DSS: weights total 100%", sum(W.values()) == 100)
check("DSS: eligible households ranked 1..n by score", [h["rank"] for h in pl if h["eligible"]] == list(range(1, 1 + sum(1 for h in pl if h["eligible"]))))
juan = next(h for h in pl if h["household_id"] == hh_new)
check("DSS: new household without a report is Not Assessed (not ranked, not lowest priority)", juan["priority_level"] == "Not Assessed" and juan["rank"] is None and juan["needs_review"], juan)
per1.post("disasters/create_report.php", {"household_id": hh_new, "disaster_type": "Flood", "severity": "Low", "location": "Zone 5", "report_date": "2026-09-30"})
admin.post("hazards/alerts/add_alert.php", {"hazard_type": "Flood", "status": "Warning", "title": "Flood 5A", "affected_purok": "5A"})
juan = next(h for h in admin.get("dashboard/priority_list.php")["data"] if h["household_id"] == hh_new)
check("DSS: purok alert entered as '5A' matches household 'Purok 5A' (severity Low 1 + 1 = 2)", juan["ratings"]["disaster_severity"] == 2, juan.get("ratings"))
check("DSS: pending report without assessment -> provisional damage 3, confidence 1, needs review; V=3 vulnerable -> 4, H=7 members -> 4",
      juan["ratings"] == {"disaster_severity": 2, "damage_unmet_needs": 3, "vulnerable_members": 4, "household_size": 4, "assessment_confidence": 1}
      and juan["priority_score"] == 12 + 15 + 16 + 12 + 2 and juan["needs_review"], juan.get("ratings"))

# ---------------- Inventory setup ----------------
for name, cat, qty, unit in [("Rice", "Food", 40, "kg"), ("Bottled Water", "Water", 30, "bottle"), ("Hygiene Kit", "Hygiene", 2, "kit"), ("Tarpaulin", "Shelter", 5, "pc")]:
    admin.post("inventory/add_item.php", {"item_name": name, "category": cat, "quantity": qty, "unit": unit, "minimum_level": 1})
items = {i["item_name"]: i for i in admin.get("inventory/get_items.php")["data"]}

# ---------------- Relief request workflow ----------------
r = unlinked.post("requests/create_request.php", {"urgency": "High", "reason": "Need help please now.", "items": [{"item_id": items["Rice"]["item_id"], "quantity": 2}]})
check("Phase 21: a resident cannot submit a relief request (403)", r["_status"] == 403, r)
res1_hh = int(sql("SELECT household_id FROM households WHERE user_id=(SELECT user_id FROM users WHERE email='demo.resident1@binitayan.gov.ph')"))
r = admin.post("requests/create_request.php", {"urgency": "Critical", "reason": "Flooded house, need food and water.", "household_id": 9999,
                                               "items": [{"item_id": items["Rice"]["item_id"], "quantity": 6}]})
check("Phase 21: request for an unknown household refused (404)", r["_status"] == 404, r)
r = admin.post("requests/create_request.php", {"urgency": "Critical", "reason": "Flooded house, need food and water.", "household_id": res1_hh,
                                               "items": [{"item_id": items["Rice"]["item_id"], "quantity": 6}, {"item_id": items["Bottled Water"]["item_id"], "quantity": 20},
                                                         {"item_id": items["Hygiene Kit"]["item_id"], "quantity": 2}]})
check("Phase 21: Administrator records a relief request for the selected household", r.get("success") and sql(f"SELECT household_id FROM relief_requests WHERE request_id={r.get('request_id')}") == str(res1_hh), r)
req1 = r.get("request_id")
r = admin.post("requests/create_request.php", {"urgency": "Low", "reason": "Second request test.", "household_id": res1_hh, "items": [{"item_id": items["Rice"]["item_id"], "quantity": 1}]})
check("only one open request per household", r["_status"] == 409, r)
r = res2.get("requests/get_request_detail.php", {"request_id": req1})
check("Phase 21: residents cannot open relief request details (403)", r["_status"] == 403, r)
r = res1.get("requests/get_request_detail.php", {"request_id": req1})
check("Phase 21: not even for their own household (DSS internals stay staff-only)", r["_status"] == 403, r)
d = admin.get("requests/get_request_detail.php", {"request_id": req1})["data"]
check("admin review shows DSS score, needs estimate, available stock, shortage", d["dss"] is not None and all(k in d["items"][0] for k in ["dss_needs_estimate", "available_stock", "shortage", "dss_recommended_quantity"]))
lines = {i["item_name"]: i for i in d["items"]}
check("DSS needs estimate uses existing rule (Food: ceil(members/2))", lines["Rice"]["dss_needs_estimate"] == -(-int(sql(f"SELECT number_of_members FROM households WHERE household_id={res1_hh}")) // 2))
before = admin.get("dashboard/priority_list.php")
check("request does not change DSS score", next(h for h in before["data"] if h["household_id"] == res1_hh)["priority_score"] == next(h for h in pl if h["household_id"] == res1_hh)["priority_score"])
admin.post("requests/start_review.php", {"request_id": req1})
approve = [{"request_item_id": lines["Rice"]["request_item_id"], "approved_quantity": 6}, {"request_item_id": lines["Bottled Water"]["request_item_id"], "approved_quantity": 15},
           {"request_item_id": lines["Hygiene Kit"]["request_item_id"], "approved_quantity": 2}]
r = admin.post("requests/decide_request.php", {"request_id": req1, "decision": "approve", "items": approve, "remarks": "Water limited"})
check("partial approval -> Partially Approved (server-computed)", r.get("status") == "Partially Approved", r)

# stock race: another approved allocation consumes hygiene kits before processing
res3_hh = int(sql("SELECT household_id FROM households WHERE user_id=(SELECT user_id FROM users WHERE email='demo.resident3@binitayan.gov.ph')"))
r = admin.post("relief/approve_recommendation.php", {"household_id": res3_hh, "item_id": items["Hygiene Kit"]["item_id"], "quantity": 1})
r = admin.post("requests/process_request.php", {"request_id": req1})
check("processing rejected when stock no longer available (no partial writes)", r["_status"] == 409 and sql(f"SELECT COUNT(*) FROM relief_allocations WHERE household_id={res1_hh}") == "0", r)
approve[2]["approved_quantity"] = 1
admin.post("requests/decide_request.php", {"request_id": req1, "decision": "approve", "items": approve})
r = admin.post("requests/process_request.php", {"request_id": req1})
check("processing creates Approved allocations via existing stock logic", r.get("success") and len(r.get("allocation_ids", [])) == 3, r)
check("request status Allocated", sql(f"SELECT status FROM relief_requests WHERE request_id={req1}") == "Allocated")
check("stock reserved, not deducted, on processing", sql(f"SELECT quantity FROM relief_items WHERE item_id={items['Rice']['item_id']}") == "40")
r = admin.post("requests/process_request.php", {"request_id": req1})
check("double processing blocked", r["_status"] == 409)
r = admin.post("relief/approve_recommendation.php", {"household_id": res1_hh, "item_id": items["Rice"]["item_id"], "quantity": 1})
check("duplicate open allocation blocked", r["_status"] == 409)
r = admin.post("inventory/stock_out.php", {"item_id": items["Hygiene Kit"]["item_id"], "quantity": 1})
check("stock-out cannot take reserved stock", r["_status"] == 409, r)

# distribute
alloc_ids = r_ids = [int(x) for x in sql(f"SELECT allocation_id FROM relief_allocations WHERE household_id={res1_hh} AND request_item_id IS NOT NULL").split()]
for i, aid in enumerate(alloc_ids):
    r = per1.post("relief/distribute.php", {"allocation_id": aid})
    check(f"personnel distributes allocation {aid}", r.get("success"), r)
    if i == 0:
        r2 = per1.post("relief/distribute.php", {"allocation_id": aid})
        check("double distribution blocked", r2["_status"] == 409)
check("request becomes Distributed after all allocations distributed", sql(f"SELECT status FROM relief_requests WHERE request_id={req1}") == "Distributed")
check("stock deducted exactly once", sql(f"SELECT quantity FROM relief_items WHERE item_id={items['Rice']['item_id']}") == "34")
check("no negative stock anywhere", sql("SELECT COUNT(*) FROM relief_items WHERE quantity < 0") == "0")
check("inventory log Stock Out written per distribution", int(sql("SELECT COUNT(*) FROM inventory_logs WHERE log_type='Stock Out' AND reference LIKE 'Relief distribution%'")) >= 3)

# ---------------- Feedback ----------------
r = res2.post("feedback/submit_feedback.php", {"type": "request", "ref_id": req1, "received": "Yes", "rating": 5, "sufficiency": "Sufficient", "experience": "Good"})
check("Phase 21: resident feedback submission retired (403)", r["_status"] == 403)
r = res1.post("feedback/submit_feedback.php", {"type": "request", "ref_id": req1, "received": "Yes", "rating": 2, "sufficiency": "Insufficient", "experience": "Fair", "comments": "Not enough water"})
check("Phase 21: also for the household's own delivery (403), nothing saved", r["_status"] == 403 and sql(f"SELECT COUNT(*) FROM relief_feedback WHERE request_id={req1}") in ("0", ""), r)
fb = admin.get("feedback/get_feedback.php", {"complaints_only": "1"})
check("existing feedback records still listed for the Administrator", fb["_status"] == 200 and "data" in fb)

# ---------------- Evacuation centers ----------------
r = admin.post("evacuation/save_center.php", {"name": "Court", "address": "Rizal St", "purok": "3", "latitude": "13.1562", "longitude": "123.7164", "capacity": 10, "current_occupancy": 0, "status": "Open"})
cid = r.get("center_id")
check("evacuation center created", r.get("success"), r)
check("occupancy above capacity rejected", admin.post("evacuation/update_occupancy.php", {"center_id": cid, "current_occupancy": 11})["_status"] == 400)
check("full at capacity", admin.post("evacuation/update_occupancy.php", {"center_id": cid, "current_occupancy": 10}).get("status") == "Full")
check("cannot close with evacuees", admin.post("evacuation/set_status.php", {"center_id": cid, "status": "Closed"})["_status"] == 409)
check("database CHECK blocks occupancy > capacity", subprocess.run(["mysql", "-uroot", DB, "-e", f"UPDATE evacuation_centers SET current_occupancy=99 WHERE center_id={cid}"], capture_output=True).returncode != 0)
check("Phase 21: evacuation center API is staff-only (resident 403)", res2.get("evacuation/get_centers.php")["_status"] == 403)
check("relief personnel can view centers", len(per1.get("evacuation/get_centers.php")["data"]) >= 1)

# ---------------- Privacy ----------------
r = res1.get("households/get_households.php")
check("resident sees only own household", len(r["data"]) == 1 and r["data"][0]["household_id"] == res1_hh, len(r["data"]))
r = res1.get("relief/get_allocations.php")
check("resident sees only own allocations", all(a["household_id"] == res1_hh for a in r["data"]))
r = res1.get("disasters/get_reports.php")
check("Phase 21: residents cannot list disaster reports (403)", r["_status"] == 403, r)
r = res2.post("notifications/mark_read.php", {"all": True})
mine = res1.get("notifications/get_notifications.php")
check("notifications are per-user (resident 2 cannot mark resident 1's as read)", mine["unread_count"] > 0, mine.get("unread_count"))
check("resident 1 received request notifications", any(n["event_key"].startswith(f"request:{req1}:") for n in mine["data"]))

# ---------------- Notifications / SMS dedupe ----------------
dups = sql("SELECT COUNT(*) FROM (SELECT user_id, event_key, COUNT(*) c FROM notifications GROUP BY user_id, event_key HAVING c > 1) t")
check("no duplicate notifications", dups == "0")
dups = sql("SELECT COUNT(*) FROM (SELECT event_key, recipient_number, COUNT(*) c FROM sms_logs WHERE event_key IS NOT NULL GROUP BY event_key, recipient_number HAVING c > 1) t")
check("no duplicate automatic SMS", dups == "0")
rep = sql("SELECT report_id FROM disaster_reports WHERE status='Pending' LIMIT 1")
if rep:
    admin.post("disasters/verify_report.php", {"report_id": int(rep)})
    n1 = sql(f"SELECT COUNT(*) FROM notifications WHERE event_key='report:{rep}:verified'")
    s1 = sql(f"SELECT COUNT(*) FROM sms_logs WHERE event_key='report:{rep}:verified'")
    admin.post("disasters/verify_report.php", {"report_id": int(rep)})
    check("re-verifying a report sends no second notification/SMS", n1 == sql(f"SELECT COUNT(*) FROM notifications WHERE event_key='report:{rep}:verified'") and s1 == sql(f"SELECT COUNT(*) FROM sms_logs WHERE event_key='report:{rep}:verified'"))
mode = sql("SELECT status FROM sms_logs WHERE event_key IS NOT NULL ORDER BY sms_id DESC LIMIT 1")
# Phase 25: approval/distribution no longer text by default (SMS only when Ready), so there may be no
# automatic SMS row yet at this point; any row present must have an honest status.
check(f"automatic SMS status honest (latest: {mode or 'none yet - SMS only when Ready'})", mode in ("", "Sent", "Accepted by Gateway", "Queued", "Not Configured", "Failed"))
check("API key never stored in SMS logs", sql("SELECT COUNT(*) FROM sms_logs WHERE error_message LIKE '%test-key-123%' OR message LIKE '%test-key-123%'") == "0")

# ---------------- Map / schedule coordinates ----------------
pkg = admin.post("relief/packages/add_package.php", {"package_name": "Family Pack", "description": "", "items": [{"item_id": items["Rice"]["item_id"], "quantity": 2}]})
pid = pkg.get("package_id") or sql("SELECT MAX(package_id) FROM relief_packages")
r = admin.post("relief/schedules/add_schedule.php", {"package_id": int(pid), "distribution_date": "2026-10-10", "location": "Court", "latitude": "13.40", "longitude": "123.71", "household_ids": [res1_hh]})
check("schedule coordinates outside boundary rejected", r["_status"] == 400)
r = admin.post("relief/schedules/add_schedule.php", {"package_id": int(pid), "distribution_date": "2026-10-10", "location": "Court", "latitude": "13.1562", "longitude": "123.7164", "assigned_personnel": int(sql("SELECT user_id FROM users WHERE email='demo.personnel1@binitayan.gov.ph'")), "household_ids": [res1_hh]})
sid = r.get("schedule_id")
check("schedule with site coordinates created", r.get("success") and sql(f"SELECT latitude FROM distribution_schedules WHERE schedule_id={sid}") == "13.1562000", r)
r = admin.put("relief/schedules/update_schedule.php", {"schedule_id": int(sid), "distribution_date": "2026-10-10", "location": "Court", "notes": "no coords sent"})
check("older forms that omit coordinates do not erase them", sql(f"SELECT latitude FROM distribution_schedules WHERE schedule_id={sid}") == "13.1562000")
check("personnel 2 cannot see personnel 1's schedule", per2.get("relief/schedules/get_schedule_detail.php", {"schedule_id": sid})["_status"] == 403)

# ---------------- Integrity ----------------
check("foreign keys: no orphan relief_request_items", sql("SELECT COUNT(*) FROM relief_request_items ri LEFT JOIN relief_requests r ON r.request_id=ri.request_id WHERE r.request_id IS NULL") == "0")
check("foreign keys: no orphan allocations -> request items", sql("SELECT COUNT(*) FROM relief_allocations a LEFT JOIN relief_request_items ri ON ri.request_item_id=a.request_item_id WHERE a.request_item_id IS NOT NULL AND ri.request_item_id IS NULL") == "0")
check("feedback rows reference exactly one delivery", sql("SELECT COUNT(*) FROM relief_feedback WHERE (beneficiary_id IS NOT NULL)+(request_id IS NOT NULL)+(allocation_id IS NOT NULL) <> 1") == "0")
check("allocated/distributed requests all have allocations", sql("SELECT COUNT(*) FROM relief_requests r WHERE r.status IN ('Allocated','Distributed') AND NOT EXISTS (SELECT 1 FROM relief_request_items ri JOIN relief_allocations a ON a.request_item_id=ri.request_item_id WHERE ri.request_id=r.request_id)") == "0")
check("committed stock never exceeds physical stock", sql("SELECT COUNT(*) FROM relief_items i WHERE i.quantity < (SELECT COALESCE(SUM(quantity),0) FROM relief_allocations a WHERE a.item_id=i.item_id AND a.status='Approved')") == "0")
check("household with request history cannot be deleted", admin.delete("households/delete_household.php", {"household_id": res1_hh})["_status"] == 409)
fk_bad = subprocess.run(["mysql", "-uroot", DB, "-e", "INSERT INTO relief_request_items (request_id,item_id,requested_quantity) VALUES (999999,1,1)"], capture_output=True)
check("database FK rejects orphan insert", fk_bad.returncode != 0)

passed = sum(1 for _, ok, _ in results if ok)
print(f"\nSUMMARY: {passed}/{len(results)} passed")
json.dump([{"check": n, "pass": ok} for n, ok, _ in results], open("/home/claude/tests/results.json", "w"), indent=1)
