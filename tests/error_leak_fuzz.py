"""Error-leak probe: sends malformed / wrong-type input to every endpoint (as admin,
resident and personnel) and flags any response that contains PHP errors, warnings,
stack traces or SQL error text. LOCAL test database only. Usage: python3 tests/error_leak_fuzz.py <admin_pw>"""
import os, re, sys, json, requests
B = os.environ.get("API_BASE", "http://127.0.0.1:8082/barangay-disaster/backend/")  # 8082 = PHP with display_errors=On, like XAMPP
ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
LEAK = re.compile(r"Fatal error|Stack trace|Uncaught|Warning:|Notice:|Deprecated:|SQLSTATE|PDOException|on line \d+|/home/|C:\\\\xampp", re.I)
SKIP = {"auth/logout.php", "setup_admin.php", "setup_demo_data.php", "sms/sms_helper.php", "hazards/weather/fetch_external_weather.php"}
eps = sorted(os.path.relpath(os.path.join(d, f), ROOT) for d, _, fs in os.walk(ROOT) for f in fs
             if f.endswith(".php") and "/lib" not in d and "/config" not in d and "/utils" not in d and "/uploads" not in d)
eps = [e for e in eps if e not in SKIP]
def sess(email, pw):
    s = requests.Session(); s.post(B + "auth/login.php", json={"email": email, "password": pw}); return s
S = {"admin": sess("admin@binitayan.gov.ph", sys.argv[1]), "resident": sess("demo.resident1@binitayan.gov.ph", "demo1234"), "personnel": sess("demo.personnel1@binitayan.gov.ph", "demo1234")}
payloads = [None, {}, {"x": 1}, "[1,2", [1, 2, 3],
            {k: [1] for k in ["id", "user_id", "household_id", "report_id", "request_id", "item_id", "center_id", "schedule_id", "beneficiary_id", "allocation_id", "alert_id", "package_id", "photo_id", "category_id", "type_id", "member_id", "log_id", "notification_id", "status", "items", "quantity", "email", "password", "message", "decision", "remarks"]},
            {k: "abc" for k in ["id", "user_id", "household_id", "report_id", "request_id", "item_id", "center_id", "schedule_id", "beneficiary_id", "allocation_id", "alert_id", "package_id", "photo_id", "quantity", "capacity", "latitude", "longitude", "distribution_date", "items", "household_ids", "custom_recipients", "user_ids"]},
            {k: {"a": "b"} for k in ["full_name", "email", "name", "location", "description", "reason", "message", "head_of_family", "purok", "item_name", "title", "remarks", "recipient_mode", "category", "urgency", "severity", "disaster_type"]},
            {"items": [{"item_id": "x", "quantity": [1]}, "bad"], "household_ids": ["a", None], "custom_recipients": ["x", {"number": [1]}], "request_id": 1, "decision": "approve"},
            {"report_id": 10**12, "item_id": -1, "quantity": 10**15, "user_id": 0, "latitude": "1e999", "longitude": "NaN"}]
leaks = []; n = 0
for role, s in S.items():
    for ep in eps:
        for p in payloads:
            for method in ("GET", "POST", "PUT", "DELETE"):
                if method in ("GET", "DELETE") and p not in (None, {}) and not isinstance(p, dict): continue
                kw = {}
                if method == "GET" and isinstance(p, dict):
                    kw["params"] = {k: (json.dumps(v) if not isinstance(v, str) else v) for k, v in p.items()}
                elif isinstance(p, str):
                    kw["data"] = p; kw["headers"] = {"Content-Type": "application/json"}
                elif p is not None:
                    kw["json"] = p
                try:
                    r = s.request(method, B + ep, timeout=20, **kw)
                except Exception as e:
                    leaks.append((role, method, ep, str(p)[:60], "EXC " + str(e)[:80])); continue
                n += 1
                if LEAK.search(r.text) or r.status_code >= 500:
                    m = LEAK.search(r.text)
                    leaks.append((role, method, ep, str(p)[:60], r.status_code, (r.text[max(0, (m.start() if m else 0) - 40):(m.start() if m else 0) + 160]).replace("\n", " ")))
print(f"requests sent: {n}, endpoints: {len(eps)}, leaking/5xx responses: {len(leaks)}")
seen = set()
for l in leaks:
    k = (l[2], l[-1][:60])
    if k in seen: continue
    seen.add(k); print(" ", l)
json.dump([list(map(str, l)) for l in leaks], open("/home/claude/tests/fuzz_results.json", "w"), indent=1)
