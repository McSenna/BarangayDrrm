"""
Phase 25 code on an UN-MIGRATED Phase 24 database (rollback / staged-deploy safety).

    python3 tests/phase25_premigration_compat_test.py <api> <db> <admin_email> <admin_password>

db: a REHEARSAL database (name contains "rehearsal") built from the Phase 24
barangay_disaster_db_FINAL.sql (git tag backup-before-phase25) + an Administrator
+ defense_scenarios/defensedata_typhoon_flood.sql. Synthetic data only.
"""
import datetime, subprocess, sys
import requests

if len(sys.argv) != 5 or "rehearsal" not in sys.argv[2]:
    sys.exit(__doc__)
B, DB = sys.argv[1].rstrip("/") + "/", sys.argv[2]
s = requests.Session()
s.post(B + "auth/login.php", json={"email": sys.argv[3], "password": sys.argv[4]})
q = lambda x: subprocess.run(["mysql", "-N", DB, "-e", x], capture_output=True, text=True).stdout.strip()
res = []
def chk(n, c, d=""):
    res.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ("" if c else f"  -> {str(d)[:300]}"))

chk("database is un-migrated (no relief_allocations.dss_score)", q("SHOW COLUMNS FROM relief_allocations LIKE 'dss_score'") == "")
eid = q("SELECT event_id FROM disaster_events ORDER BY event_id LIMIT 1")
for p, params in [("dashboard/priority_list.php", {}), ("dashboard/relief_recommendations.php", {}), ("dashboard/relief_recommendations.php", {"mode": "minimum_share"}),
                  ("relief/get_allocations.php", {}), ("reports/situation_report.php", {"event_id": eid} if eid else {"date_from": "2026-01-01", "date_to": datetime.date.today().isoformat()}), ("reports/inventory_reconciliation.php", {}),
                  ("sms/get_logs.php", {}), ("disasters/get_reports.php", {}), ("dashboard/statistics.php", {})]:
    r = s.get(B + p, params=params)
    chk(f"GET {p} {params or ''} works (200)", r.status_code == 200 and r.json().get("success", True) is not False, r.text[:200])
hh = q("SELECT household_id FROM households WHERE head_of_family='Ramon Dizon'"); item = q("SELECT item_id FROM relief_items ORDER BY item_id LIMIT 1")
r = s.post(B + "relief/emergency_override.php", json={"household_id": int(hh), "item_id": int(item), "quantity": 1, "reason": "Compat test override reason"})
chk("emergency override -> 503 naming the migration file", r.status_code == 503 and "migration_phase25" in r.text, r.text)
aid = q("SELECT allocation_id FROM relief_allocations WHERE status='Approved' LIMIT 1")
r = s.post(B + "relief/cancel_allocation.php", json={"allocation_id": int(aid), "reason": "compat test"})
chk("cancel -> 503 naming the migration file, allocation unchanged", r.status_code == 503 and "migration_phase25" in r.text and q(f"SELECT status FROM relief_allocations WHERE allocation_id={aid}") == "Approved", r.text)
r = s.post(B + "disasters/create_report.php", json={"household_id": int(hh), "disaster_type": "Flood", "severity": "Low", "location": "Compat", "description": "Compat report",
                                                  "report_date": datetime.date.today().isoformat(), "collection_method": "Paper Form", "paper_form_no": "P1-0001"})
chk("report saved (new assessment fields ignored)", r.status_code in (200, 201), r.text)
r = s.post(B + "relief/create_allocation.php", json={"household_id": int(hh), "item_id": int(item), "quantity": 1}); nid = r.json().get("allocation_id")
chk("manual allocation created (Pending)", r.status_code in (200, 201) and nid, r.text)
chk("duplicate manual allocation refused (409) before migration too", s.post(B + "relief/create_allocation.php", json={"household_id": int(hh), "item_id": int(item), "quantity": 1}).status_code == 409)
r = s.post(B + "relief/approve_allocation.php", json={"allocation_id": int(nid)})
chk("approval works (no snapshot columns)", r.status_code == 200, r.text)
r = s.post(B + "relief/distribute.php", json={"allocation_id": int(nid), "received_quantity": 1})
chk("full distribution works", r.status_code == 200 and q(f"SELECT status FROM relief_allocations WHERE allocation_id={nid}") == "Distributed", r.text)
print(f"\nPHASE 25 PRE-MIGRATION COMPAT TEST: {sum(res)}/{len(res)} passed")
