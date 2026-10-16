"""
Verifies database/DEFENSE_TEST_DATA.sql after it was imported into a
REHEARSAL copy of the database, by running the REAL application against it.

    python3 tests/verify_defense_sql_import.py <backend_url> <database_name>
    e.g. python3 tests/verify_defense_sql_import.py http://127.0.0.1:8090/backend/ defense_sql_rehearsal

It CHANGES data (verifies H08's report, approves and allocates H08's request,
distributes H04's relief), so it refuses to run unless the database name
contains "rehearsal". Requires the mysql client on PATH. TextBee must be OFF.
"""
import subprocess
import sys

import requests

if len(sys.argv) != 3:
    sys.exit(__doc__)
BASE = sys.argv[1].rstrip("/") + "/"
DB = sys.argv[2]
if "rehearsal" not in DB:
    sys.exit("Refusing: the database name must contain 'rehearsal' (this test changes data).")
PW = "BinitayanTest2026!"

passed = failed = 0


def check(cond, label):
    global passed, failed
    if cond:
        passed += 1
        print(f"PASS {label}")
    else:
        failed += 1
        print(f"FAIL {label}")


def sql(q):
    out = subprocess.run(["mysql", "-N", "-B", DB, "-e", q], capture_output=True, text=True, check=True).stdout
    return [line.split("\t") for line in out.strip().splitlines()] if out.strip() else []


def one(q):
    return sql(q)[0][0]


def login(email):
    s = requests.Session()
    r = s.post(BASE + "auth/login.php", json={"email": email, "password": PW}, timeout=30)
    return s, r


def j(r):
    try:
        return r.json()
    except Exception:
        return {"success": False, "message": r.text[:200]}


# ---------------------------------------------------------------- 1. accounts
emails = ["admin.binitayan.test@gmail.com", "personnel.binitayan.test@gmail.com"] + [f"binitayan.test{i:02d}@gmail.com" for i in range(1, 9)]
sessions = {}
for e in emails:
    s, r = login(e)
    sessions[e] = s
    check(r.status_code == 200 and j(r).get("success") is True, f"login with the test password works: {e}")
A = sessions["admin.binitayan.test@gmail.com"]
P = sessions["personnel.binitayan.test@gmail.com"]
R8 = sessions["binitayan.test08@gmail.com"]
check(one("SELECT COUNT(*) FROM users WHERE password LIKE '$2y$%%' AND email IN (%s)" % ",".join(f"'{e}'" for e in emails)) == "10",
      "all 10 passwords are bcrypt hashes (no plaintext)")

# ---------------------------------------------------------------- 2. households / privacy / map
hh = j(A.get(BASE + "households/get_households.php"))["data"]
mine = [h for h in hh if "[DEFENSE TEST] H0" in h["address"]]
check(len(mine) == 8, "admin sees the 8 defense households")
check(all(h["latitude"] and h["longitude"] for h in mine), "every defense household has coordinates for the map")
check(sorted(h["purok"] for h in mine) == sorted(["Purok 1", "Purok 2", "Purok 3", "Purok 4", "Purok 5A", "Purok 5B", "Purok 6", "Purok 7"]),
      "households are spread over Purok 1, 2, 3, 4, 5A, 5B, 6, 7")
r8 = j(R8.get(BASE + "households/get_households.php"))["data"]
check(len(r8) == 1 and r8[0]["head_of_family"] == "Ernesto Dimaculangan", "resident H08 sees ONLY his own household")
check(R8.get(BASE + "dashboard/priority_list.php").status_code == 403, "resident cannot open the DSS priority list (403)")
centers = j(A.get(BASE + "evacuation/get_centers.php"))["data"]
c = [x for x in centers if x["name"] == "Binitayan Defense Demonstration Evacuation Center"]
check(len(c) == 1 and c[0]["status"] == "Open" and int(c[0]["capacity"]) == 50 and int(c[0]["current_occupancy"]) == 18,
      "evacuation center: Open, capacity 50, occupancy 18")

# ---------------------------------------------------------------- 3. DSS priority (calculated by the app)
def priority():
    data = j(A.get(BASE + "dashboard/priority_list.php"))["data"]
    return {p["head_of_family"]: p for p in data}

pr = priority()
order = [p for p in j(A.get(BASE + "dashboard/priority_list.php"))["data"]]
print("     DSS ranking computed by the application (Phase 22 weighted model, 0-100):")
for p in order:
    r = p["ratings"]
    print(f"       #{p['rank']} {p['head_of_family']:<22} {p['priority_score']:>3} {p['priority_level']:<18} "
          f"S{r['disaster_severity']} D{r['damage_unmet_needs']} V{r['vulnerable_members']} H{r['household_size']} C{r['assessment_confidence']}"
          f"{'  needs review' if p.get('needs_review') else ''}")
check(len([p for p in order if p["head_of_family"] in {h["head_of_family"] for h in mine}]) == 8, "priority list loads with all 8 households")
expected = {"Ernesto Dimaculangan": 79, "Leonora Castillo": 76, "Eduardo Salazar": 72, "Wilfredo Ocampo": 72,
            "Jerome Pascual": 71, "Corazon Villanueva": 52, "Gloria Mendoza": 49, "Ramon Dizon": 36}
check(all(pr[n]["priority_score"] == v for n, v in expected.items()),
      "scores match the manual calculation: H08 79, H07 76, H03 72, H06 72, H04 71, H05 52, H02 49, H01 36")
r4 = pr["Jerome Pascual"]["ratings"]
check(r4 == {"disaster_severity": 4, "damage_unmet_needs": 4, "vulnerable_members": 2, "household_size": 3, "assessment_confidence": 5}
      and 6 * 4 + 5 * 4 + 4 * 2 + 3 * 3 + 2 * 5 == 71, "H04: ratings S4 D4 V2 H3 C5 -> 24+20+8+9+10 = 71 (High)")
r8 = pr["Ernesto Dimaculangan"]
check(r8["ratings"]["assessment_confidence"] == 2 and r8["needs_review"] and r8["rank"] == 1,
      "H08: Pending report -> confidence 2, flagged for manual review, ranked #1 (79)")
check(pr["Corazon Villanueva"]["ratings"]["disaster_severity"] == 3, "H05: Medium severity + active Purok 5A landslide alert -> severity rating 3")
check(pr["Ramon Dizon"]["ratings"]["disaster_severity"] == 1, "resolved barangay-wide typhoon alert adds nothing (H01 severity rating 1)")
levels = {p["priority_level"] for p in order}
check({"Low Priority", "Moderate Priority", "High Priority"} <= levels, "data gives Low, Moderate and High priority households")
check(sql("SHOW COLUMNS FROM households LIKE '%priority%'") == [], "no priority score is stored in the database (calculated live)")

# ---------------------------------------------------------------- 4. needs, availability, shortage (H08 request)
req8 = one("SELECT request_id FROM relief_requests q JOIN households h ON h.household_id=q.household_id WHERE h.address LIKE '%[DEFENSE TEST] H08'")
d = j(A.get(BASE + "requests/get_request_detail.php", params={"request_id": req8}))["data"]
items = {i["item_name"].replace(" [DEFENSE TEST]", ""): i for i in d["items"]}
print("     H08 request review (item: requested / DSS need / DSS recommends / available / shortage):")
for n, i in items.items():
    print(f"       {n}: {i['requested_quantity']} / {i['dss_needs_estimate']} / {i['dss_recommended_quantity']} / {i['available_stock']} / {i['shortage']}")
check(d["request"]["status"] == "Pending", "H08 request is Pending (ready for the live review)")
check(items["Bottled Water"]["dss_needs_estimate"] == 24 and items["Family Food Pack"]["dss_needs_estimate"] == 4 and items["Hygiene Kit"]["dss_needs_estimate"] == 1,
      "needs estimation works: water 3x8=24, food packs 8/2=4, hygiene 1 per household")
check(items["Bottled Water"]["available_stock"] == 90 and items["Family Food Pack"]["available_stock"] == 10 and items["Hygiene Kit"]["available_stock"] == 2,
      "availability = stock - reserved: water 120-30=90, food 20-10=10, hygiene 6-4=2")
check(items["Hygiene Kit"]["requested_quantity"] == 5 and items["Hygiene Kit"]["shortage"] == 3, "shortage works: Hygiene Kit requested 5, available 2, shortage 3")
rec = j(A.get(BASE + "dashboard/relief_recommendations.php"))
check(rec.get("success") is True and len(rec["data"]) > 0 and rec["data"][0]["head_of_family"] == "Ernesto Dimaculangan",
      "relief recommendations load; highest priority household (H08) is served first")

# ---------------------------------------------------------------- 5. admin review -> availability validation -> approval -> allocation
rid8 = one("SELECT report_id FROM relief_requests WHERE request_id=%s" % req8)
r = A.post(BASE + "disasters/verify_report.php", json={"report_id": int(rid8), "remarks": "Verified during the rehearsal."})
check(j(r).get("success") is True, "Administrator verifies H08's report")
after_v = priority()["Ernesto Dimaculangan"]
check(after_v["priority_score"] == 85 and after_v["priority_level"] == "Critical Priority",
      "verifying H08's report raises the score 79 -> 85 (confidence 2 -> 5), now Critical")
check(j(A.post(BASE + "requests/start_review.php", json={"request_id": int(req8)})).get("success") is True, "Mark Under Review")
lines = {i["item_name"].replace(" [DEFENSE TEST]", ""): i["request_item_id"] for i in d["items"]}

def decide(water, pack, hyg):
    return A.post(BASE + "requests/decide_request.php", json={"request_id": int(req8), "decision": "approve", "remarks": "Rehearsal decision.",
        "items": [{"request_item_id": lines["Bottled Water"], "approved_quantity": water},
                  {"request_item_id": lines["Family Food Pack"], "approved_quantity": pack},
                  {"request_item_id": lines["Hygiene Kit"], "approved_quantity": hyg}]})

r = decide(24, 4, 5)
check(j(r).get("success") is True, "Administrator may approve more than the DSS recommends (quantity adjustment)")
before = one("SELECT COUNT(*) FROM relief_allocations")
r = A.post(BASE + "requests/process_request.php", json={"request_id": int(req8)})
check(r.status_code == 409 and one("SELECT COUNT(*) FROM relief_allocations") == before,
      "availability validation: allocating 5 Hygiene Kits with only 2 available is refused (409), nothing saved")
r = decide(24, 4, 2)
check(j(r).get("status") == "Partially Approved", "approval of Water 24 / Food 4 / Hygiene 2 -> Partially Approved")
stock_before = dict(sql("SELECT REPLACE(item_name,' [DEFENSE TEST]',''), quantity FROM relief_items"))
r = A.post(BASE + "requests/process_request.php", json={"request_id": int(req8)})
check(j(r).get("success") is True, "Create Allocations for H08 succeeds")
stock_after = dict(sql("SELECT REPLACE(item_name,' [DEFENSE TEST]',''), quantity FROM relief_items"))
check(stock_before == stock_after, "allocation RESERVES stock only (no deduction)")
d2 = j(A.get(BASE + "requests/get_request_detail.php", params={"request_id": req8}))["data"]
check([i for i in d2["items"] if "Hygiene" in i["item_name"]][0]["available_stock"] == 0, "Hygiene Kit available drops to 0 after the reservation")

# ---------------------------------------------------------------- 6. distribution (relief personnel)
h04 = one("SELECT household_id FROM households WHERE address LIKE '%[DEFENSE TEST] H04'")
allocs = j(P.get(BASE + "relief/get_allocations.php"))["data"]
a04 = [a for a in allocs if str(a["household_id"]) == h04 and a["status"] == "Approved"]
check(len(a04) == 3, "Relief Personnel sees H04's 3 Approved allocations")
s_before = dict(sql("SELECT REPLACE(item_name,' [DEFENSE TEST]',''), quantity FROM relief_items"))
logs_before = int(one("SELECT COUNT(*) FROM inventory_logs WHERE log_type='Stock Out'"))
ok = all(j(P.post(BASE + "relief/distribute.php", json={"allocation_id": int(a["allocation_id"])})).get("success") for a in a04)
check(ok, "Mark as Distributed x3 for H04")
s_after = dict(sql("SELECT REPLACE(item_name,' [DEFENSE TEST]',''), quantity FROM relief_items"))
check(int(s_before["Bottled Water"]) - int(s_after["Bottled Water"]) == 18 and int(s_before["Family Food Pack"]) - int(s_after["Family Food Pack"]) == 4
      and int(s_before["Hygiene Kit"]) - int(s_after["Hygiene Kit"]) == 2, "stock deducted once: water -18, food -4, hygiene -2")
check(int(one("SELECT COUNT(*) FROM inventory_logs WHERE log_type='Stock Out'")) - logs_before == 3, "3 Stock Out inventory logs created by the application")
check(one("SELECT status FROM relief_requests WHERE household_id=%s" % h04) == "Distributed", "H04 request becomes Distributed")
r = P.post(BASE + "relief/distribute.php", json={"allocation_id": int(a04[0]["allocation_id"])})
check(r.status_code >= 400 and int(dict(sql("SELECT REPLACE(item_name,' [DEFENSE TEST]',''), quantity FROM relief_items"))["Bottled Water"]) == int(s_after["Bottled Water"]),
      "second distribution of the same allocation is refused (no double deduction)")
p4 = priority()["Jerome Pascual"]
check(p4["priority_score"] == pr["Jerome Pascual"]["priority_score"] and p4["unmet_needs"]["coverage_percent"] > 0,
      "DSS: H04's relief already counts toward needs coverage from approval, so distributing it leaves the score unchanged (71)")

# ---------------------------------------------------------------- 7. SMS (TextBee off)
st = sql("SELECT status, COUNT(*) FROM sms_logs GROUP BY status")
check(all(row[0] == "Not Configured" for row in st), f"SMS: automatic messages are logged as Not Configured, none claimed Sent ({st})")

print(f"\nDEFENSE SQL IMPORT VERIFICATION: {passed}/{passed + failed} passed")
sys.exit(1 if failed else 0)
