"""Verify the DEFENSE demonstration dataset (database/seed_defense_demo.php).

Read-only: it runs SELECT queries and GET requests and logs in (logins add
login_history rows). It never changes defense records.

Usage:
  python3 tests/verify_defense_dataset.py [api_base_url] [database_name]
  defaults: http://127.0.0.1:8081/barangay-disaster/backend/  barangay_defense_db
Needs the `mysql` command-line client (local root, no password, as on XAMPP).
"""
import os, sys, json, subprocess, requests

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8081/barangay-disaster/backend/"
DB = sys.argv[2] if len(sys.argv) > 2 else "barangay_defense_db"
PW = "BinitayanTest2026!"
ROOT = __file__.rsplit("/tests/", 1)[0]
res = []


def check(group, name, ok, detail=""):
    res.append((group, name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + f"[{group}] {name}" + ("" if ok else f" -> {str(detail)[:300]}"))


def sql(q):
    out = subprocess.run(["mysql", "-uroot", "-N", "-B", DB, "-e", q], capture_output=True, text=True, check=True).stdout
    return [line.split("\t") for line in out.strip().split("\n") if line != ""]


def one(q):
    rows = sql(q)
    return rows[0][0] if rows else None


def login(email):
    s = requests.Session()
    r = s.post(BASE + "auth/login.php", json={"email": email, "password": PW}).json()
    return s, r


HEADS = {"H01": "Ramon Dizon", "H02": "Gloria Mendoza", "H03": "Eduardo Salazar", "H04": "Jerome Pascual",
         "H05": "Corazon Villanueva", "H06": "Wilfredo Ocampo", "H07": "Leonora Castillo", "H08": "Ernesto Dimaculangan"}
KEY = {v: k for k, v in HEADS.items()}

# ------------------------------------------------------------------ accounts
admin, r = login("admin.binitayan.test@gmail.com")
check("Accounts", "admin test account logs in with role admin", r.get("success") and r["user"]["role"] == "admin", r)
per, r = login("personnel.binitayan.test@gmail.com")
check("Accounts", "personnel test account logs in with role relief_personnel", r.get("success") and r["user"]["role"] == "relief_personnel", r)
residents = {}
for i in range(1, 9):
    s, r = login(f"binitayan.test{i:02d}@gmail.com")
    residents[f"H{i:02d}"] = s
    check("Accounts", f"resident H{i:02d} logs in with role resident", r.get("success") and r["user"]["role"] == "resident", r)
check("Accounts", "no duplicate e-mail addresses", one("SELECT COUNT(*) FROM (SELECT email FROM users GROUP BY email HAVING COUNT(*) > 1) d") == "0")
check("Accounts", "exactly 10 test accounts (1 admin, 1 personnel, 8 residents)",
      sql("SELECT role, COUNT(*) FROM users GROUP BY role ORDER BY role") == [["admin", "1"], ["resident", "8"], ["relief_personnel", "1"]],
      sql("SELECT role, COUNT(*) FROM users GROUP BY role"))
check("Accounts", "every password is a bcrypt/argon hash, none stored as plaintext",
      one("SELECT COUNT(*) FROM users WHERE password NOT LIKE '$2y$%' AND password NOT LIKE '$argon2%'") == "0"
      and one(f"SELECT COUNT(*) FROM users WHERE password = '{PW}'") == "0")
check("Accounts", "all contact numbers are synthetic 0900 numbers",
      one("SELECT COUNT(*) FROM users WHERE contact_number NOT LIKE '0900%'") == "0"
      and one("SELECT COUNT(*) FROM households WHERE contact_number NOT LIKE '0900%'") == "0")

# ------------------------------------------------------------------ orphans / foreign keys
orphans = {
    "households.user_id": "SELECT COUNT(*) FROM households h LEFT JOIN users u ON h.user_id = u.user_id WHERE h.user_id IS NOT NULL AND u.user_id IS NULL",
    "household_members": "SELECT COUNT(*) FROM household_members m LEFT JOIN households h ON m.household_id = h.household_id WHERE h.household_id IS NULL",
    "disaster_reports.household": "SELECT COUNT(*) FROM disaster_reports r LEFT JOIN households h ON r.household_id = h.household_id WHERE h.household_id IS NULL",
    "report_photos": "SELECT COUNT(*) FROM report_photos p LEFT JOIN disaster_reports r ON p.report_id = r.report_id WHERE r.report_id IS NULL",
    "damage_assessments": "SELECT COUNT(*) FROM damage_assessments d LEFT JOIN disaster_reports r ON d.report_id = r.report_id WHERE r.report_id IS NULL",
    "relief_requests": "SELECT COUNT(*) FROM relief_requests q LEFT JOIN households h ON q.household_id = h.household_id WHERE h.household_id IS NULL",
    "relief_request_items": "SELECT COUNT(*) FROM relief_request_items i LEFT JOIN relief_requests q ON i.request_id = q.request_id LEFT JOIN relief_items it ON i.item_id = it.item_id WHERE q.request_id IS NULL OR it.item_id IS NULL",
    "relief_allocations": "SELECT COUNT(*) FROM relief_allocations a LEFT JOIN households h ON a.household_id = h.household_id LEFT JOIN relief_items it ON a.item_id = it.item_id WHERE h.household_id IS NULL OR it.item_id IS NULL",
    "allocations.request_item": "SELECT COUNT(*) FROM relief_allocations a LEFT JOIN relief_request_items i ON a.request_item_id = i.request_item_id WHERE a.request_item_id IS NOT NULL AND i.request_item_id IS NULL",
    "inventory_logs": "SELECT COUNT(*) FROM inventory_logs l LEFT JOIN relief_items it ON l.item_id = it.item_id WHERE it.item_id IS NULL",
    "distribution_beneficiaries": "SELECT COUNT(*) FROM distribution_beneficiaries b LEFT JOIN distribution_schedules s ON b.schedule_id = s.schedule_id LEFT JOIN households h ON b.household_id = h.household_id WHERE s.schedule_id IS NULL OR h.household_id IS NULL",
    "delivery_reports": "SELECT COUNT(*) FROM delivery_reports d LEFT JOIN distribution_beneficiaries b ON d.beneficiary_id = b.beneficiary_id WHERE b.beneficiary_id IS NULL",
    "relief_feedback": "SELECT COUNT(*) FROM relief_feedback f LEFT JOIN households h ON f.household_id = h.household_id WHERE h.household_id IS NULL",
    "notifications": "SELECT COUNT(*) FROM notifications n LEFT JOIN users u ON n.user_id = u.user_id WHERE u.user_id IS NULL",
}
for name, q in orphans.items():
    check("Integrity", f"no orphan rows: {name}", one(q) == "0", one(q))
fk = sql("SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY'")[0][0]
check("Integrity", f"foreign keys are present in the schema ({fk})", int(fk) > 20, fk)

# ------------------------------------------------------------------ households
hh = {r[0]: r for r in sql("SELECT head_of_family, household_id, purok, number_of_members, children_count, seniors_count, pwd_count, pregnant_count, vulnerable_members, latitude, longitude, user_id FROM households")}
check("Households", "8 households, one per required purok",
      sorted(r[2] for r in hh.values()) == sorted(["Purok 1", "Purok 2", "Purok 3", "Purok 4", "Purok 5A", "Purok 5B", "Purok 6", "Purok 7"]))
mem = dict(sql("SELECT household_id, COUNT(*) FROM household_members GROUP BY household_id"))
check("Households", "member rows match number_of_members for every household", all(mem.get(r[1]) == r[3] for r in hh.values()), {r[0]: (r[3], mem.get(r[1])) for r in hh.values()})
expected = {"H01": (2, 0, 0, 0, 0), "H02": (4, 0, 1, 0, 0), "H03": (6, 1, 0, 1, 0), "H04": (5, 0, 0, 0, 1),
            "H05": (3, 0, 1, 0, 0), "H06": (7, 1, 1, 0, 0), "H07": (4, 0, 0, 1, 0), "H08": (8, 1, 1, 1, 0)}
got = {KEY[h]: tuple(int(x) for x in r[3:8]) for h, r in hh.items()}
check("Households", "members and vulnerability counts match the requested profiles", got == expected, got)
check("Households", "vulnerable_members equals the sum of the category counts", all(int(r[8]) == sum(int(x) for x in r[4:8]) for r in hh.values()))
links = sql("SELECT h.head_of_family, u.full_name, u.role FROM households h JOIN users u ON h.user_id = u.user_id")
check("Households", "each household is linked to its own resident account", len(links) == 8 and all(a == b and role == "resident" for a, b, role in links), links)

# ------------------------------------------------------------------ coordinates
pts = [(h, r[9], r[10]) for h, r in hh.items()] + [(n, a, b) for n, a, b in sql("SELECT name, latitude, longitude FROM evacuation_centers")] \
    + [("schedule " + s, a, b) for s, a, b in sql("SELECT schedule_id, latitude, longitude FROM distribution_schedules")]
php = "require '" + ROOT + "/backend/utils/boundary_validator.php'; $o=[]; foreach (json_decode($argv[1], true) as $p) { $o[$p[0]] = validate_household_coordinates((string)$p[1], (string)$p[2])['valid']; } echo json_encode($o);"
v = json.loads(subprocess.run(["php", "-r", php, json.dumps(pts)], capture_output=True, text=True, check=True).stdout)
check("Map", f"all {len(pts)} household / center / distribution-site coordinates pass the Binitayan boundary validator", all(v.values()) and len(v) == len(pts), v)
bad = json.loads(subprocess.run(["php", "-r", php, json.dumps([["outside", "13.30", "123.90"]])], capture_output=True, text=True).stdout)
check("Map", "validator still rejects an outside point (13.30, 123.90)", bad == {"outside": False}, bad)
mh = admin.get(BASE + "households/get_households.php").json()["data"]
check("Map", "admin household list (map source) returns all 8 households with coordinates", len(mh) == 8 and all(x["latitude"] and x["longitude"] for x in mh))
for k, s in residents.items():
    own = s.get(BASE + "households/get_households.php").json()["data"]
    check("Map", f"resident {k} sees only their own household", len(own) == 1 and own[0]["head_of_family"] == HEADS[k], [x["head_of_family"] for x in own])
upd = one("SELECT COUNT(*) FROM audit_logs WHERE action LIKE '%ousehold updated%' OR action LIKE '%pdate%household%'")
check("Map", "H06 coordinates were added through Update Household (audit log entry exists)", int(upd) >= 1, upd)

# ------------------------------------------------------------------ reports, photos, assessments
reps = {KEY[h]: (sev, st, t) for h, sev, st, t in sql("SELECT h.head_of_family, r.severity, r.status, r.disaster_type FROM disaster_reports r JOIN households h ON r.household_id = h.household_id")}
check("Reports", "8 reports, all Typhoon and linked to the scenario", len(reps) == 8 and all(x[2] == "Typhoon" for x in reps.values())
      and one("SELECT COUNT(*) FROM disaster_reports WHERE description LIKE '%Typhoon Binitayan Defense Demonstration 2026%'") == "8")
check("Reports", "severities H01 Low ... H08 High as specified",
      {k: x[0] for k, x in reps.items()} == {"H01": "Low", "H02": "Medium", "H03": "High", "H04": "Critical", "H05": "Medium", "H06": "High", "H07": "Critical", "H08": "High"})
check("Reports", "H01–H07 Verified, H08 Pending", all(reps[k][1] == "Verified" for k in HEADS if k != "H08") and reps["H08"][1] == "Pending")
check("Reports", "Phase 21: every report is linked to a household and recorded by Relief Personnel (not by a resident)",
      one("SELECT COUNT(*) FROM disaster_reports r JOIN users u ON u.user_id = r.user_id WHERE r.household_id IS NULL OR u.role <> 'relief_personnel'") == "0")
ph = dict(sql("SELECT h.head_of_family, COUNT(p.photo_id) FROM disaster_reports r JOIN households h ON r.household_id = h.household_id LEFT JOIN report_photos p ON p.report_id = r.report_id GROUP BY h.head_of_family"))
check("Reports", "photos: H03 one, H04 three (multiple), others none", {KEY[k]: int(v) for k, v in ph.items()} == {"H01": 0, "H02": 0, "H03": 1, "H04": 3, "H05": 0, "H06": 0, "H07": 0, "H08": 0}, ph)
import os
files = sql("SELECT file_path FROM report_photos")
check("Reports", "every stored photo file exists on disk (uploaded through upload_photos.php)", all(os.path.isfile(os.path.join(ROOT, "backend", f[0])) for f in files), files)
da = {KEY[h]: (a, b, c, d, e) for h, a, b, c, d, e in sql("SELECT h.head_of_family, d.house_damage, d.infrastructure_damage, d.property_damage, d.agricultural_damage, d.estimated_severity FROM damage_assessments d JOIN disaster_reports r ON d.report_id = r.report_id JOIN households h ON r.household_id = h.household_id")}
check("Reports", "8 damage assessments using only supported levels", len(da) == 8 and all(set(x[:4]) <= {"None", "Minor", "Major", "Totally Damaged"} for x in da.values()), da)

# ------------------------------------------------------------------ DSS (independent recomputation from raw tables)
pl = {KEY[h["head_of_family"]]: h for h in admin.get(BASE + "dashboard/priority_list.php").json()["data"]}
# Phase 22 weighted DSS: compare the API with an independent recomputation (tests/dss_reference.py)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dss_reference import recompute
mine, api = {}, {}
for k, x in pl.items():
    m = recompute(sql, x["household_id"])
    mine[k] = (m[1], m[2], m[0]) if m else (None, "Not Assessed", {})
    api[k] = (x["priority_score"], x["priority_level"], x.get("ratings") or {})
print("\nDSS priority list (API) vs independent recomputation:")
for k in sorted(api, key=lambda k: pl[k]["rank"] or 99):
    print(f"  #{pl[k]['rank']} {k} {HEADS[k]:22} API {api[k][0]} {api[k][1]:17} {api[k][2]}   recomputed {mine[k][0]}")
check("DSS", "API scores, categories and all 5 ratings equal an independent recomputation from the raw tables", api == mine, {k: (api[k], mine[k]) for k in api if api[k] != mine[k]})
order = [(k, api[k][0]) for k in sorted(api, key=lambda k: pl[k]["rank"] or 99)]
check("DSS", "expected ranking H08 79 > H07 76 > H03 72 = H06 72 (tie: earlier report first) > H04 71 > H05 52 > H02 49 > H01 36",
      order == [("H08", 79), ("H07", 76), ("H03", 72), ("H06", 72), ("H04", 71), ("H05", 52), ("H02", 49), ("H01", 36)], order)
check("DSS", "exactly the 5 weighted criteria (no Estimated Severity, no request urgency)",
      all([c["key"] for c in x["criteria"]] == ["disaster_severity", "damage_unmet_needs", "vulnerable_members", "household_size", "assessment_confidence"] for x in pl.values()))
check("DSS", "H08 (report pending verification) is flagged for manual review", pl["H08"]["needs_review"] and not pl["H04"]["needs_review"])
rec = admin.get(BASE + "dashboard/relief_recommendations.php").json()
check("DSS", "Relief Recommendations endpoint runs without errors", rec.get("success") is True, rec.get("message"))
shortages = [(h["head_of_family"], it["item_name"], it["shortage"]) for h in rec["data"] for it in h["recommendations"] if it["shortage"] > 0]
check("DSS", "Relief Recommendations show at least one shortage", len(shortages) > 0, shortages)
print("  recommendation shortages:", shortages)

# ------------------------------------------------------------------ requests / allocations
rq = {KEY[h]: (s, u) for h, s, u in sql("SELECT h.head_of_family, q.status, q.urgency FROM relief_requests q JOIN households h ON q.household_id = h.household_id")}
check("Relief", "requests: H03 Distributed, H04 Allocated, H07 Allocated, H08 Pending",
      {k: v[0] for k, v in rq.items()} == {"H03": "Distributed", "H04": "Allocated", "H07": "Allocated", "H08": "Pending"}, rq)
check("Relief", "urgency: H03 High, H04 Critical, H07 Critical, H08 High", {k: v[1] for k, v in rq.items()} == {"H03": "High", "H04": "Critical", "H07": "Critical", "H08": "High"})
check("Relief", "every request is linked to its own household's report",
      one("SELECT COUNT(*) FROM relief_requests q JOIN disaster_reports r ON q.report_id = r.report_id WHERE r.household_id <> q.household_id") == "0"
      and one("SELECT COUNT(*) FROM relief_requests WHERE report_id IS NULL") == "0")
check("Relief", "approved quantity never exceeds requested", one("SELECT COUNT(*) FROM relief_request_items WHERE approved_quantity > requested_quantity") == "0")
part = sql("SELECT it.item_name, i.requested_quantity, i.approved_quantity FROM relief_request_items i JOIN relief_items it ON i.item_id = it.item_id JOIN relief_requests q ON i.request_id = q.request_id JOIN households h ON q.household_id = h.household_id WHERE h.head_of_family = 'Leonora Castillo'")
check("Relief", "H07 Partially Approved by the administrator: Hygiene Kit 2 of 3", ["Hygiene Kit [DEFENSE TEST]", "3", "2"] in part, part)
check("Relief", "each allocation matches its request item (same household, item and approved quantity)",
      one("SELECT COUNT(*) FROM relief_allocations a JOIN relief_request_items i ON a.request_item_id = i.request_item_id JOIN relief_requests q ON i.request_id = q.request_id WHERE q.household_id <> a.household_id OR i.item_id <> a.item_id OR i.approved_quantity <> a.quantity") == "0")
alloc = sql("SELECT h.head_of_family, a.status, COUNT(*) FROM relief_allocations a JOIN households h ON a.household_id = h.household_id GROUP BY h.head_of_family, a.status ORDER BY h.head_of_family")
print("  allocations:", alloc)
check("Relief", "allocations: H03 2 Distributed, H04 3 Approved, H07 2 Approved, H05 3 Distributed (scheduled delivery)",
      sorted((KEY[a], b, int(c)) for a, b, c in alloc) == sorted([("H03", "Distributed", 2), ("H04", "Approved", 3), ("H07", "Approved", 2), ("H05", "Distributed", 3)]), alloc)
check("Relief", "distributed allocations have distributed_by and distributed_at", one("SELECT COUNT(*) FROM relief_allocations WHERE status = 'Distributed' AND (distributed_by IS NULL OR distributed_at IS NULL)") == "0")

# ------------------------------------------------------------------ inventory
inv = {n: (int(q), int(m)) for n, q, m in sql("SELECT item_name, quantity, minimum_level FROM relief_items")}
check("Inventory", "no negative stock", all(q >= 0 for q, _ in inv.values()), inv)
logsum = dict(sql("SELECT it.item_name, SUM(l.quantity_change) FROM inventory_logs l JOIN relief_items it ON l.item_id = it.item_id GROUP BY it.item_name"))
check("Inventory", "current stock = sum of all inventory log movements for every item", all(int(logsum.get(n, 0)) == q for n, (q, _) in inv.items()), {n: (q, logsum.get(n)) for n, (q, _) in inv.items()})
dist = dict(sql("SELECT it.item_name, SUM(a.quantity) FROM relief_allocations a JOIN relief_items it ON a.item_id = it.item_id WHERE a.status = 'Distributed' GROUP BY it.item_name"))
out = dict(sql("SELECT it.item_name, -SUM(l.quantity_change) FROM inventory_logs l JOIN relief_items it ON l.item_id = it.item_id WHERE l.log_type = 'Stock Out' GROUP BY it.item_name"))
check("Inventory", "distributed allocations match Stock Out log totals item by item", dist == out, (dist, out))
committed = dict(sql("SELECT it.item_name, SUM(a.quantity) FROM relief_allocations a JOIN relief_items it ON a.item_id = it.item_id WHERE a.status = 'Approved' GROUP BY it.item_name"))
check("Inventory", "Approved (reserved) quantities never exceed current stock", all(int(c) <= inv[n][0] for n, c in committed.items()), committed)
items_api = {x["item_name"]: x for x in admin.get(BASE + "inventory/get_items.php").json()["data"]}
print("  inventory (stock, committed, available):", {n.replace(" [DEFENSE TEST]", ""): (x["quantity"], int(x["committed_quantity"]), x["quantity"] - int(x["committed_quantity"])) for n, x in items_api.items()})
check("Inventory", "expected stock: Rice 98, Water 102, Food Pack 16, Hygiene Kit 6, Blanket 10, First Aid Kit 4",
      {n.replace(" [DEFENSE TEST]", ""): q for n, (q, _) in inv.items()} == {"Rice": 98, "Bottled Water": 102, "Family Food Pack": 16, "Hygiene Kit": 6, "Blanket": 10, "First Aid Kit": 4})
check("Inventory", "Hygiene Kit: 4 reserved, 2 available (shortage scenario for H08's 5)", int(items_api["Hygiene Kit [DEFENSE TEST]"]["committed_quantity"]) == 4)
check("Inventory", "low-stock flags on Hygiene Kit and First Aid Kit only", {n for n, x in items_api.items() if x["low_stock"]} == {"Hygiene Kit [DEFENSE TEST]", "First Aid Kit [DEFENSE TEST]"})
det = admin.get(BASE + "requests/get_request_detail.php", params={"request_id": one("SELECT q.request_id FROM relief_requests q JOIN households h ON q.household_id = h.household_id WHERE h.head_of_family = 'Ernesto Dimaculangan'")}).json()["data"]
hk = next(i for i in det["items"] if i["item_name"].startswith("Hygiene Kit"))
check("Inventory", "H08 review screen: Hygiene Kit requested 5, available 2, shortage 3", (hk["requested_quantity"], hk["available_stock"], hk["shortage"]) == (5, 2, 3), hk)
print("  H08 review lines:", [(i["item_name"], i["requested_quantity"], i["available_stock"], i["shortage"], i["dss_needs_estimate"], i["dss_recommended_quantity"]) for i in det["items"]])

# ------------------------------------------------------------------ schedule / delivery / feedback
sch = sql("SELECT h.head_of_family, b.status, b.is_verified FROM distribution_beneficiaries b JOIN households h ON b.household_id = h.household_id")
check("Distribution", "Batch 1 beneficiaries: H05 Delivered (verified), H02 and H06 Pending",
      sorted((KEY[a], b, c) for a, b, c in sch) == [("H02", "Pending", "0"), ("H05", "Delivered", "1"), ("H06", "Pending", "0")], sch)
check("Distribution", "schedule assigned to the test Relief Personnel, location Binitayan Barangay Hall",
      sql("SELECT s.location, u.email FROM distribution_schedules s JOIN users u ON s.assigned_personnel = u.user_id") == [["Binitayan Barangay Hall", "personnel.binitayan.test@gmail.com"]])
check("Distribution", "delivery report with recipient name and 1 photo", sql("SELECT d.recipient_name, COUNT(p.photo_id) FROM delivery_reports d LEFT JOIN delivery_report_photos p ON p.report_id = d.report_id GROUP BY d.report_id") == [["Corazon Villanueva", "1"]])
fb = sql("SELECT h.head_of_family, f.received, f.rating, f.sufficiency FROM relief_feedback f JOIN households h ON f.household_id = h.household_id ORDER BY h.head_of_family")
check("Distribution", "Phase 21: no resident feedback records (resident feedback retired)", fb == [], fb)
ps = per.get(BASE + "relief/schedules/get_schedules.php").json()
check("Distribution", "personnel sees the Batch 1 schedule", ps.get("success") and len(ps["data"]) == 1, ps)

# ------------------------------------------------------------------ evacuation
ev = sql("SELECT name, status, capacity, current_occupancy, facilities FROM evacuation_centers ORDER BY center_id")
check("Evacuation", "Center A Open 18/50 and Center B Open 8/30 with the five facilities",
      [(e[0], e[1], e[2], e[3]) for e in ev] == [("Binitayan Defense Demonstration Evacuation Center", "Open", "50", "18"), ("Binitayan Defense Demonstration Evacuation Center B", "Open", "30", "8")]
      and all(e[4] == "Water, Restrooms, Electricity, First Aid, Sleeping Area" for e in ev), ev)
check("Evacuation", "occupancy never exceeds capacity", one("SELECT COUNT(*) FROM evacuation_centers WHERE current_occupancy > capacity") == "0")
check("Evacuation", "occupancy history logged (added + 12 → 18 update)", int(one("SELECT COUNT(*) FROM evacuation_center_logs")) >= 3)
# Phase 21: the evacuation-center API is staff-only; residents get 403.
check("Evacuation", "residents cannot read the evacuation-center API (Phase 21, 403)", residents["H03"].get(BASE + "evacuation/get_centers.php").status_code == 403)

# ------------------------------------------------------------------ hazards
hz = sql("SELECT hazard_type, status, IFNULL(affected_purok, ''), is_active FROM hazard_alerts ORDER BY alert_id")
check("Hazards", "3 alerts: Typhoon barangay-wide (resolved), Flood Purok 7 (active), Landslide Purok 5A (active)",
      hz == [["Typhoon", "Critical", "", "0"], ["Flood", "Critical", "Purok 7", "1"], ["Landslide", "Warning", "Purok 5A", "1"]], hz)
check("Hazards", "3 manual weather logs, no API-sourced logs", sql("SELECT source, COUNT(*) FROM weather_logs GROUP BY source") == [["Manual", "3"]])
check("Hazards", "residents cannot read the hazard-alert API (Phase 21, 403)", residents["H08"].get(BASE + "hazards/alerts/get_alerts.php").status_code == 403)

# ------------------------------------------------------------------ SMS
sms = sql("SELECT status, COUNT(*) FROM sms_logs GROUP BY status")
check("SMS", "every SMS log is 'Not Configured' — nothing claims 'Sent'", sms and all(s == "Not Configured" for s, _ in sms) and one("SELECT COUNT(*) FROM sms_logs WHERE status = 'Sent'") == "0", sms)
cats = sql("SELECT category, COUNT(*) FROM sms_logs GROUP BY category ORDER BY category")
print("  SMS logs by category:", cats)
check("SMS", "the two manual admin messages are logged (3 recipients each)",
      one("SELECT COUNT(*) FROM sms_logs WHERE message LIKE 'Binitayan Disaster Response:%'") == "6")
check("SMS", "all SMS recipients are synthetic 0900 numbers", one("SELECT COUNT(*) FROM sms_logs WHERE recipient_number NOT LIKE '0900%'") == "0")
nt = residents["H03"].get(BASE + "notifications/get_notifications.php").json()
check("SMS", "residents received in-app notifications from the workflow", nt.get("success") and len(nt.get("data", [])) > 0, nt.get("unread_count"))

# ------------------------------------------------------------------ audit
acts = dict(sql("SELECT action, COUNT(*) FROM audit_logs GROUP BY action"))
print("  audit actions:", acts)
need = ["Disaster report verified", "Relief request Approved", "Relief request Partially Approved"]
check("Audit", "audit log has verification and approval actions", all(any(n.lower() in a.lower() for a in acts) for n in need), need)
check("Audit", "audit log has distribution and household update actions",
      any("distribut" in a.lower() for a in acts) and any("household" in a.lower() and "updat" in a.lower() for a in acts))
check("Audit", "login history recorded successful logins", int(one("SELECT COUNT(*) FROM login_history WHERE login_status = 'Success'")) >= 10)
al = admin.get(BASE + "audit/get_logs.php").json()
check("Audit", "Audit Logs page endpoint returns entries", al.get("success") and len(al.get("data", al.get("logs", []))) > 0, str(al)[:200])

# ------------------------------------------------------------------ dashboards / reports / endpoints
st = admin.get(BASE + "dashboard/statistics.php").json()["data"]
check("Dashboard", "statistics: 8 households, 8 residents, 8 reports, 2 low-stock items",
      (st["total_households"], st["total_residents"], st["total_disaster_reports"], st["low_stock_items"]) == (8, 8, 8, 2), st)
an = admin.get(BASE + "reports/dashboard_analytics.php").json()["data"]["summary"]
check("Dashboard", "analytics summary: 2 active hazard alerts, 2 beneficiaries, 24 distributed units",
      (an["active_hazard_alerts"], an["total_beneficiaries"], an["total_distributed_items"]) == (2, 2, 24), an)
gets = {
    admin: ["dashboard/statistics.php", "dashboard/household_statistics.php", "dashboard/priority_list.php", "dashboard/relief_recommendations.php",
            "reports/dashboard_analytics.php", "reports/disaster_reports.php", "reports/household_reports.php", "reports/inventory_reports.php",
            "reports/relief_reports.php", "disasters/get_reports.php", "households/get_households.php", "inventory/get_items.php", "inventory/get_logs.php",
            "inventory/donations/get_donations.php", "requests/get_requests.php", "relief/get_allocations.php", "relief/packages/get_packages.php",
            "relief/schedules/get_schedules.php", "relief/delivery/get_completed_deliveries.php", "evacuation/get_centers.php", "evacuation/get_center_logs.php?center_id=1",
            "hazards/alerts/get_alerts.php", "hazards/weather/get_weather_logs.php", "sms/get_logs.php", "feedback/get_feedback.php", "audit/get_logs.php",
            "audit/get_login_history.php", "users/get_users.php", "notifications/get_notifications.php", "settings/get_settings.php", "settings/get_puroks.php"],
    per: ["dashboard/personnel_stats.php", "relief/get_allocations.php", "relief/schedules/get_schedules.php", "relief/delivery/get_completed_deliveries.php",
          "households/get_households.php", "evacuation/get_centers.php", "hazards/alerts/get_alerts.php", "notifications/get_notifications.php"],
    # Phase 21: residents read only their own household, allocations, notifications and profile
    residents["H03"]: ["households/get_households.php", "relief/get_allocations.php", "notifications/get_notifications.php", "users/get_my_profile.php"],
}
broken = []
total = 0
for s, paths in gets.items():
    for p in paths:
        total += 1
        r = s.get(BASE + p)
        try:
            ok = r.status_code == 200 and r.json().get("success") is True
        except ValueError:
            ok = False
        if not ok:
            broken.append((p, r.status_code, r.text[:120]))
check("Endpoints", f"{total} read endpoints across the three roles return 200 + success", not broken, broken)

groups = []
for g, _, _ in res:
    if g not in groups:
        groups.append(g)
print("\nSUMMARY BY AREA")
for g in groups:
    rows = [ok for gg, _, ok in res if gg == g]
    print(f"  {g:13} {sum(rows)}/{len(rows)}")
print(f"SUMMARY: {sum(1 for _, _, ok in res if ok)}/{len(res)} passed")
sys.exit(0 if all(ok for _, _, ok in res) else 1)
