"""Concurrency: 10 parallel distribute requests for ONE allocation, and 10 parallel
Delivered updates for ONE beneficiary. Expect exactly one success and stock deducted once.
Uses demo data only (not the [TEST] dataset). Usage: python3 tests/concurrency_test.py <admin_pw>"""
import sys, subprocess, requests
from concurrent.futures import ThreadPoolExecutor
B = "http://127.0.0.1:8083/barangay-disaster/backend/"  # 8083 = PHP_CLI_SERVER_WORKERS=8 (truly parallel)
q = lambda x: subprocess.run(["mysql", "-uroot", "-N", "barangay_disaster_db", "-e", x], capture_output=True, text=True).stdout.strip()
def sess(e, p):
    s = requests.Session(); assert s.post(B + "auth/login.php", json={"email": e, "password": p}).json().get("success"); return s
admin = sess("admin@binitayan.gov.ph", sys.argv[1]); per = sess("demo.personnel1@binitayan.gov.ph", "demo1234")
# 10 SEPARATE sessions: PHP locks a session file per request, so one shared session would serialize the calls.
pers = [sess("demo.personnel1@binitayan.gov.ph", "demo1234") for _ in range(10)]
ok_all = True
r = admin.post(B + "inventory/add_item.php", json={"item_name": "Concurrency Probe Item", "category": "Other", "quantity": 50, "unit": "pc", "minimum_level": 1}).json()
item = int(q("SELECT MAX(item_id) FROM relief_items WHERE item_name='Concurrency Probe Item'"))
hh = int(q("SELECT household_id FROM households WHERE head_of_family='Maria Santos' LIMIT 1"))
r = admin.post(B + "relief/approve_recommendation.php", json={"household_id": hh, "item_id": item, "quantity": 7}).json()
aid = int(q(f"SELECT allocation_id FROM relief_allocations WHERE item_id={item} AND status='Approved'"))
with ThreadPoolExecutor(10) as ex:
    codes = list(ex.map(lambda i: pers[i].post(B + "relief/distribute.php", json={"allocation_id": aid}).status_code, range(10)))
stock = q(f"SELECT quantity FROM relief_items WHERE item_id={item}"); logs = q(f"SELECT COUNT(*) FROM inventory_logs WHERE item_id={item} AND log_type='Stock Out'")
ok = codes.count(200) == 1 and stock == "43" and logs == "1"; ok_all &= ok
print(("PASS" if ok else "FAIL"), f"10 parallel distribute calls -> statuses {sorted(codes)}, stock 50->{stock}, Stock Out logs {logs}")
# parallel Delivered on one beneficiary
pkg = admin.post(B + "relief/packages/add_package.php", json={"package_name": "Concurrency Pack", "description": "", "items": [{"item_id": item, "quantity": 2}]}).json()
pid = int(q("SELECT MAX(package_id) FROM relief_packages WHERE package_name='Concurrency Pack'"))
pu = int(q("SELECT user_id FROM users WHERE email='demo.personnel1@binitayan.gov.ph'"))
hh2 = int(q("SELECT household_id FROM households WHERE head_of_family='Luzviminda Cruz' LIMIT 1"))
sid = admin.post(B + "relief/schedules/add_schedule.php", json={"package_id": pid, "distribution_date": "2026-10-20", "location": "Hall", "latitude": "13.1562", "longitude": "123.7164", "assigned_personnel": pu, "household_ids": [hh2]}).json()["schedule_id"]
bid = int(q(f"SELECT beneficiary_id FROM distribution_beneficiaries WHERE schedule_id={sid}"))
per.post(B + "relief/schedules/verify_beneficiary.php", json={"beneficiary_id": bid})
for st in ("Prepared", "Dispatched"):
    per.post(B + "relief/schedules/update_beneficiary_status.php", json={"beneficiary_id": bid, "status": st})
with ThreadPoolExecutor(10) as ex:
    codes = list(ex.map(lambda i: pers[i].post(B + "relief/schedules/update_beneficiary_status.php", json={"beneficiary_id": bid, "status": "Delivered", "recipient_name": "Luzviminda Cruz"}).status_code, range(10)))
stock = q(f"SELECT quantity FROM relief_items WHERE item_id={item}"); reps = q(f"SELECT COUNT(*) FROM delivery_reports WHERE beneficiary_id={bid}")
ok = codes.count(200) == 1 and stock == "41" and reps == "1"; ok_all &= ok
print(("PASS" if ok else "FAIL"), f"10 parallel Delivered updates -> statuses {sorted(codes)}, stock 43->{stock}, delivery reports {reps}")
print("SUMMARY:", "2/2 passed" if ok_all else "FAILED")
