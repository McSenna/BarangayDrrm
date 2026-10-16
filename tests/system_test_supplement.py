"""
Supplemental system test (complete-system-test pass, Phase 19).

Run AFTER tests/full_test.py on the same LOCAL test database:
    python3 tests/full_test.py <admin_pw>
    python3 tests/system_test_supplement.py <admin_pw>

Covers areas the regression suite does not: login/logout/deactivation, user
management guards, disaster report + photo upload (report_id regression),
damage assessment vs. DSS, DSS recommendations and greedy allocation,
relief-request validation and rejection, inventory operations, scheduled
distribution lifecycle, evacuation CRUD, notifications, SMS (not configured,
then a LOCAL MOCK gateway only), security probes, analytics endpoints,
settings, audit logs and database integrity.

SMS: phase A runs with SMS not configured. Phase B temporarily installs the
TEST config (mock gateway on 127.0.0.1:8090) and removes it afterwards. No
real SMS is sent and no real API key is used.
"""
import io, json, os, shutil, subprocess, sys, time, requests

BASE = "http://127.0.0.1:8080/barangay-disaster/backend/"
ROOT = "http://127.0.0.1:8080/barangay-disaster/"
DB = "barangay_disaster_db"
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCAL_CFG = os.path.join(REPO, "backend/config/app_config.local.php")
TEST_CFG = "/tmp/app_config.local.php.test"
MOCK_LOG = "/tmp/textbee_calls.log"
results = []
section = ["?"]


def sec(name):
    section[0] = name
    print(f"\n== {name}")


def check(name, cond, detail="", status=None):
    st = status or ("PASS" if cond else "FAIL")
    results.append({"section": section[0], "check": name, "status": st, "detail": "" if st == "PASS" else str(detail)[:300]})
    print(f"{st} {name}" + ("" if st == "PASS" else f"  -> {str(detail)[:300]}"))


def warn(name, detail):
    check(name, False, detail, status="WARNING")


def sql(q):
    out = subprocess.run(["mysql", "-uroot", "-N", DB, "-e", q], capture_output=True, text=True)
    return out.stdout.strip()


class S:
    def __init__(self, email=None, pw=None):
        self.s = requests.Session()
        self.login_resp = None
        if email:
            self.login_resp = self.post("auth/login.php", {"email": email, "password": pw})

    def _j(self, r):
        try:
            d = r.json()
            if not isinstance(d, dict):
                d = {"_list": d}
        except Exception:
            d = {"_raw": r.text[:500]}
        d["_status"] = r.status_code
        d["_headers"] = dict(r.headers)
        d["_text"] = r.text
        return d

    def get(self, p, params=None, **kw): return self._j(self.s.get(BASE + p, params=params, **kw))
    def post(self, p, data=None, **kw): return self._j(self.s.post(BASE + p, json=data, **kw))
    def put(self, p, data=None): return self._j(self.s.put(BASE + p, json=data))
    def delete(self, p, data=None): return self._j(self.s.delete(BASE + p, json=data))
    def upload(self, p, fields, files): return self._j(self.s.post(BASE + p, data=fields, files=files))
    def raw(self, method, p, **kw): return self.s.request(method, BASE + p, **kw)


def png_bytes(w=40, h=30, noise=False):
    from PIL import Image
    if noise:
        img = Image.frombytes("RGB", (w, h), os.urandom(w * h * 3))
    else:
        img = Image.new("RGB", (w, h), (200, 30, 30))
    b = io.BytesIO()
    img.save(b, "PNG")
    return b.getvalue()


def uid(email):
    return int(sql(f"SELECT user_id FROM users WHERE email='{email}'") or 0)


def hh_of(email):
    return int(sql(f"SELECT household_id FROM households WHERE user_id={uid(email)}") or 0)


ADMIN_PW = sys.argv[1]
admin = S("admin@binitayan.gov.ph", ADMIN_PW)
res1 = S("demo.resident1@binitayan.gov.ph", "demo1234")
res2 = S("demo.resident2@binitayan.gov.ph", "demo1234")
res3 = S("demo.resident3@binitayan.gov.ph", "demo1234")
per1 = S("demo.personnel1@binitayan.gov.ph", "demo1234")
per2 = S("demo.personnel2@binitayan.gov.ph", "demo1234")
anon = S()
ADMIN_ID = uid("admin@binitayan.gov.ph")

# =====================================================================
sec("Authentication and sessions")
for who, s, role in [("admin", admin, "admin"), ("resident", res1, "resident"), ("personnel", per1, "relief_personnel")]:
    check(f"{who} login succeeds", s.login_resp.get("success"), s.login_resp)
    se = s.get("auth/session.php")
    check(f"{who} session reports role {role}", se.get("authenticated") and (se.get("user") or {}).get("role") == role, se)
check("login response never contains the password hash", all("$2y$" not in s.login_resp["_text"] for s in (admin, res1, per1)))
r = anon.post("auth/login.php", {"email": "nobody@example.com", "password": "whatever1"})
check("unknown email rejected with 401 and a generic message", r["_status"] == 401 and "nobody" not in r.get("message", ""), r)
r = anon.post("auth/login.php", {"email": "", "password": ""})
check("empty login fields rejected (4xx)", 400 <= r["_status"] < 500, r)
r = anon.get("auth/login.php")
check("GET on login.php rejected (405)", r["_status"] == 405, r["_status"])
r = anon.post("auth/login.php", {"email": "' OR '1'='1", "password": "' OR '1'='1"})
check("SQL injection in login rejected (401, no SQL error)", r["_status"] == 401 and "SQL" not in r["_text"], r)
tmp = S("demo.resident3@binitayan.gov.ph", "demo1234")
tmp.get("auth/logout.php")
check("logout ends the session", tmp.get("auth/session.php").get("authenticated") is False and tmp.get("requests/get_requests.php")["_status"] == 401)
check("passwords stored as bcrypt hashes (no plaintext)", sql("SELECT COUNT(*) FROM users WHERE password NOT LIKE '$2y$%'") == "0")
check("login history records successful logins", int(sql("SELECT COUNT(*) FROM login_history WHERE login_status='Success'")) >= 5)

# =====================================================================
sec("User management")
r = admin.post("users/add_user.php", {"full_name": "Test Personnel Temp", "email": "temp.personnel@test.local", "password": "abc12345", "role": "relief_personnel", "contact_number": "09170000001"})
check("admin creates a relief personnel user", r.get("success"), r)
tmp_uid = uid("temp.personnel@test.local")
r = admin.post("users/add_user.php", {"full_name": "Dup", "email": "temp.personnel@test.local", "password": "abc12345", "role": "resident"})
check("duplicate email rejected", not r.get("success") and r["_status"] in (400, 409), r)
r = admin.post("users/add_user.php", {"full_name": "Short", "email": "short.pw@test.local", "password": "123", "role": "resident"})
check("password shorter than 6 characters rejected", r["_status"] == 400, r)
r = admin.post("users/update_user.php", {"user_id": tmp_uid, "full_name": "Test Personnel Renamed", "email": "temp.personnel@test.local", "role": "relief_personnel", "contact_number": "09170000002"})
check("admin edits a user", r.get("success") and sql(f"SELECT full_name FROM users WHERE user_id={tmp_uid}") == "Test Personnel Renamed", r)
r = admin.post("users/toggle_status.php", {"user_id": ADMIN_ID, "is_active": 0})
check("admin cannot deactivate own account", not r.get("success") and sql(f"SELECT is_active FROM users WHERE user_id={ADMIN_ID}") == "1", r)
r = admin.post("users/delete_user.php", {"user_id": ADMIN_ID})
if r["_status"] == 405:
    r = admin.delete("users/delete_user.php", {"user_id": ADMIN_ID})
check("admin cannot delete own account", not r.get("success") and sql(f"SELECT COUNT(*) FROM users WHERE user_id={ADMIN_ID}") == "1", r)
r = admin.post("users/update_user.php", {"user_id": ADMIN_ID, "full_name": "System Admin", "email": "admin@binitayan.gov.ph", "role": "resident"})
check("admin cannot demote own role", sql(f"SELECT role FROM users WHERE user_id={ADMIN_ID}") == "admin", r)
tp = S("temp.personnel@test.local", "abc12345")
check("new personnel can log in", tp.login_resp.get("success"), tp.login_resp)
r = admin.post("users/toggle_status.php", {"user_id": tmp_uid, "is_active": 0})
check("admin deactivates a user", r.get("success") and sql(f"SELECT is_active FROM users WHERE user_id={tmp_uid}") == "0", r)
r = S("temp.personnel@test.local", "abc12345").login_resp
check("deactivated account cannot log in", not r.get("success") and r["_status"] in (401, 403), r)
# Order matters: call a protected API BEFORE auth/session.php (session.php destroys
# a deactivated session, which would hide the result). BUG-04 regression.
r = tp.get("relief/schedules/get_schedules.php")
check("deactivated user's existing session is refused by protected APIs (BUG-04 regression)", r["_status"] == 401, r["_status"])
check("deactivated user's session is reported as ended by session check", tp.get("auth/session.php").get("authenticated") is False)
tp2 = S("demo.resident3@binitayan.gov.ph", "demo1234")
admin.post("users/toggle_status.php", {"user_id": uid("demo.resident3@binitayan.gov.ph"), "is_active": 0})
r = tp2.post("disasters/create_report.php", {"disaster_type": "Flood", "severity": "Low", "location": "x"})
check("deactivated resident's open session cannot create a report", r["_status"] == 401 and sql(f"SELECT COUNT(*) FROM disaster_reports WHERE location='x' AND user_id={uid('demo.resident3@binitayan.gov.ph')}") == "0", r["_status"])
admin.post("users/toggle_status.php", {"user_id": uid("demo.resident3@binitayan.gov.ph"), "is_active": 1})
res3 = S("demo.resident3@binitayan.gov.ph", "demo1234")
admin.post("users/toggle_status.php", {"user_id": tmp_uid, "is_active": 1})
r = admin.post("users/delete_user.php", {"user_id": tmp_uid})
if r["_status"] == 405:
    r = admin.delete("users/delete_user.php", {"user_id": tmp_uid})
check("admin deletes a user without history", r.get("success") and sql(f"SELECT COUNT(*) FROM users WHERE user_id={tmp_uid}") == "0", r)
r2_uid = uid("demo.resident2@binitayan.gov.ph")
rep_before = sql(f"SELECT COUNT(*) FROM disaster_reports WHERE user_id={r2_uid}")
r = admin.post("users/delete_user.php", {"user_id": r2_uid})
check("resident with reports/household cannot be deleted (409); reports preserved (BUG-02 regression)", r["_status"] == 409 and sql(f"SELECT COUNT(*) FROM users WHERE user_id={r2_uid}") == "1" and sql(f"SELECT COUNT(*) FROM disaster_reports WHERE user_id={r2_uid}") == rep_before and rep_before != "0", (r.get("message"), rep_before))
r = admin.post("users/delete_user.php", {"user_id": uid("demo.personnel1@binitayan.gov.ph")})
check("personnel with distribution history cannot be deleted (409)", r["_status"] == 409, r.get("message"))
for s, who in [(res1, "resident"), (per1, "personnel")]:
    check(f"{who} cannot list users", s.get("users/get_users.php")["_status"] == 403)
    check(f"{who} cannot create users", s.post("users/add_user.php", {"full_name": "x", "email": "x@x.x", "password": "abcdef", "role": "admin"})["_status"] == 403)
    check(f"{who} cannot read audit logs", s.get("audit/get_logs.php")["_status"] == 403)
    check(f"{who} cannot read login history", s.get("audit/get_login_history.php")["_status"] == 403)
    check(f"{who} cannot change system settings", s.post("settings/update_settings.php", {"barangay_name": "Hacked"})["_status"] == 403)
r = res1.get("users/get_my_profile.php")
check("resident views own profile", r.get("success") and r["data"]["email"] == "demo.resident1@binitayan.gov.ph", r)
r = res1.post("users/update_my_profile.php", {"full_name": "Maria Santos", "contact_number": "09171111111", "role": "admin", "user_id": ADMIN_ID})
check("profile update cannot change role or another user", sql(f"SELECT role FROM users WHERE user_id={uid('demo.resident1@binitayan.gov.ph')}") == "resident" and sql(f"SELECT full_name FROM users WHERE user_id={ADMIN_ID}") == "System Admin")

# =====================================================================
sec("Disaster reports and photos")
types = {t["type_name"] for t in per1.get("settings/disaster_types/get_types.php")["data"]}
HH1 = hh_of("demo.resident1@binitayan.gov.ph")
HH2 = hh_of("demo.resident2@binitayan.gov.ph")
# Phase 21: reports are recorded by authorized personnel for a household; residents cannot submit them.
check("Phase 21: resident cannot submit a disaster report (403)", res1.post("disasters/create_report.php", {"disaster_type": "Flood", "severity": "High", "location": "Purok 3", "household_id": HH1})["_status"] == 403)
check("disaster types Flood/Typhoon/Landslide/Earthquake/Fire/Other available", {"Flood", "Typhoon", "Landslide", "Earthquake", "Fire", "Other"} <= types, types)
r = per1.post("disasters/create_report.php", {"household_id": HH1, "disaster_type": "Flood", "severity": "High", "location": "Purok 3 riverside", "description": "Water rose to knee level."})
rid = int(r.get("report_id") or 0)
max_rid = int(sql("SELECT MAX(report_id) FROM disaster_reports"))
max_audit = int(sql("SELECT MAX(log_id) FROM audit_logs") or 0)
check("create report returns 201 and the new disaster report_id", r["_status"] == 201 and rid == max_rid, (r, max_rid))
check("returned report_id is not the audit-log id (regression)", rid != max_audit or rid == max_rid, (rid, max_audit))
check("report linked to the selected household (recorded by Relief Personnel)", sql(f"SELECT household_id FROM disaster_reports WHERE report_id={rid}") == str(HH1))
up = per1.upload("disasters/upload_photos.php", {"report_id": str(rid)}, [("photos[]", ("a.png", png_bytes(), "image/png")), ("photos[]", ("b.png", png_bytes(50, 50), "image/png"))])
check("multiple photos upload to that exact report_id", up.get("success") and len(up.get("data", [])) == 2 and sql(f"SELECT COUNT(*) FROM report_photos WHERE report_id={rid}") == "2", up)
check("stored photo path is under uploads/reports/<report_id>/", all(p["file_path"].startswith(f"uploads/reports/{rid}/") for p in up.get("data", [])))
img = requests.get(BASE + up["data"][0]["file_path"]) if up.get("data") else None
check("uploaded photo is served as an image", img is not None and img.status_code == 200 and img.content[:4] == b"\x89PNG")
up = per1.upload("disasters/upload_photos.php", {"report_id": str(rid)}, [("photos[]", ("fake.jpg", b"this is not an image" * 20, "image/jpeg"))])
check("invalid photo (text renamed .jpg) rejected", len(up.get("data", [])) == 0 and up.get("errors"), up)
up = per1.upload("disasters/upload_photos.php", {"report_id": str(rid)}, [("photos[]", ("doc.pdf", b"%PDF-1.4 fake", "application/pdf"))])
check("unsupported file type (.pdf) rejected", len(up.get("data", [])) == 0 and up.get("errors"), up)
up = per1.upload("disasters/upload_photos.php", {"report_id": str(rid)}, [("photos[]", ("shell.php", b"<?php echo 1; ?>", "image/png"))])
check("PHP file disguised as image rejected", len(up.get("data", [])) == 0, up)
big = png_bytes(1600, 1300, noise=True)
up = per1.upload("disasters/upload_photos.php", {"report_id": str(rid)}, [("photos[]", ("big.png", big, "image/png"))])
check(f"oversized photo ({len(big)//1048576} MB > 5 MB) rejected", len(up.get("data", [])) == 0 and any("5 MB" in e for e in up.get("errors", [])), up)
up = per1.upload("disasters/upload_photos.php", {"report_id": str(rid)}, [("photos[]", (f"p{i}.png", png_bytes(), "image/png")) for i in range(4)])
check("more than 5 photos per report rejected", up["_status"] == 400 and sql(f"SELECT COUNT(*) FROM report_photos WHERE report_id={rid}") == "2", up)
up = res1.upload("disasters/upload_photos.php", {"report_id": str(rid)}, [("photos[]", ("x.png", png_bytes(), "image/png"))])
check("Phase 21: resident cannot upload report photos, even for their own household", up["_status"] == 403)
check("Phase 21: resident cannot view report photos", res1.get("disasters/get_report_photos.php", {"report_id": rid})["_status"] == 403)
pid = sql(f"SELECT photo_id FROM report_photos WHERE report_id={rid} LIMIT 1")
check("resident cannot delete report photos", res2.post("disasters/delete_photo.php", {"photo_id": int(pid)})["_status"] == 403)
check("Relief Personnel cannot delete a photo of a report recorded by someone else", per2.post("disasters/delete_photo.php", {"photo_id": int(pid)})["_status"] == 403)
r = per1.post("disasters/create_report.php", {"household_id": HH1, "disaster_type": "", "severity": "High", "location": ""})
check("report with missing required fields rejected (400)", r["_status"] == 400, r)
r = per1.post("disasters/create_report.php", {"household_id": HH1, "disaster_type": "Flood", "severity": "Extreme", "location": "x"})
check("report with invalid severity rejected", r["_status"] == 400, r)
r = per1.post("disasters/create_report.php", {"household_id": HH1, "disaster_type": "Meteor", "severity": "Low", "location": "x"})
check("report with unknown disaster type rejected", r["_status"] == 400, r)
check("Phase 21: report without a household rejected (400)", admin.post("disasters/create_report.php", {"disaster_type": "Flood", "severity": "Low", "location": "x"})["_status"] == 400)
xss = '<script>alert(1)</script><img src=x onerror=alert(2)>'
r = admin.post("disasters/create_report.php", {"household_id": HH2, "disaster_type": "Other", "severity": "Low", "location": "XSS test", "description": xss})
xrid = int(r.get("report_id") or 0)
got = admin.get("disasters/get_reports.php")
check("XSS payload is stored as plain text and returned JSON-encoded (React escapes on render)", xrid and any(x["report_id"] == xrid and x["description"] == xss for x in got["data"]) and "application/json" in got["_headers"].get("Content-Type", ""))
check("resident cannot verify reports", res1.post("disasters/verify_report.php", {"report_id": rid})["_status"] == 403)
check("personnel cannot verify reports", per1.post("disasters/verify_report.php", {"report_id": rid})["_status"] == 403)
r = admin.post("disasters/verify_report.php", {"report_id": rid, "remarks": "Confirmed by purok leader."})
check("admin verifies report with remarks", r.get("success") and sql(f"SELECT status FROM disaster_reports WHERE report_id={rid}") == "Verified", r)
check("verification remarks stored", "purok leader" in sql(f"SELECT verification_remarks FROM disaster_reports WHERE report_id={rid}"))
r = admin.post("disasters/reject_report.php", {"report_id": xrid, "remarks": "Not a disaster; test entry."})
check("admin rejects report with remarks", r.get("success") and sql(f"SELECT status FROM disaster_reports WHERE report_id={xrid}") == "Rejected", r)
r = admin.post("disasters/verify_report.php", {"report_id": 999999})
check("verify non-existent report returns 404", r["_status"] == 404, r)
r = admin.post("disasters/reject_report.php", {"report_id": 999999, "remarks": "x"})
check("reject non-existent report returns 404", r["_status"] == 404, r)
n = sql(f"SELECT COUNT(*) FROM notifications WHERE event_key='report:{xrid}:rejected'")
check("Phase 21: report rejection sends no resident notification (reports are staff-recorded)", n == "0", n)

# =====================================================================
sec("Damage assessment and DSS")
hh1 = hh_of("demo.resident1@binitayan.gov.ph")


def score(hid):
    return next(h for h in admin.get("dashboard/priority_list.php")["data"] if h["household_id"] == hid)


dss_rid = int(sql(f"SELECT report_id FROM disaster_reports WHERE household_id={hh1} AND status<>'Rejected' ORDER BY (status='Verified') DESC, FIELD(severity,'Critical','High','Medium','Low'), report_date DESC, report_id DESC LIMIT 1"))
orig_da = sql(f"SELECT house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, COALESCE(remarks,'') FROM damage_assessments WHERE report_id={dss_rid}").split("\t")
print("DSS-selected report for household", hh1, "=", dss_rid, "original assessment", orig_da)
base = {"report_id": dss_rid, "house_damage": "None", "infrastructure_damage": "None", "property_damage": "None", "agricultural_damage": "None", "remarks": "baseline"}
admin.post("disasters/save_damage_assessment.php", dict(base, estimated_severity="Low"))
s0 = score(hh1)
admin.post("disasters/save_damage_assessment.php", dict(base, estimated_severity="Critical", remarks="different remarks"))
s1 = score(hh1)
check("Estimated Severity and remarks do NOT change the priority score", s0["priority_score"] == s1["priority_score"] and s0["score_breakdown"] == s1["score_breakdown"], (s0["score_breakdown"], s1["score_breakdown"]))
check("estimated_severity is stored", sql(f"SELECT estimated_severity FROM damage_assessments WHERE report_id={dss_rid}") == "Critical")
# Phase 22 damage level (criterion 2): house Totally 5; house Major or other Totally 4; other Major 3; Minor only 2; none 1.
lvl = lambda: score(hh1)["damage"]["level"]
check("no damage recorded -> damage level 1", lvl() == 1, score(hh1).get("damage"))
expect = {"house_damage": (4, 5), "infrastructure_damage": (3, 4), "property_damage": (3, 4), "agricultural_damage": (3, 4)}
for field in expect:
    admin.post("disasters/save_damage_assessment.php", dict(base, estimated_severity="Low", **{field: "Major"}))
    a = lvl()
    admin.post("disasters/save_damage_assessment.php", dict(base, estimated_severity="Low", **{field: "Totally Damaged"}))
    b = lvl()
    check(f"{field}: Major -> level {expect[field][0]}, Totally Damaged -> level {expect[field][1]}", (a, b) == expect[field], (a, b))
admin.post("disasters/save_damage_assessment.php", dict(base, estimated_severity="High", house_damage="Totally Damaged", infrastructure_damage="Totally Damaged", property_damage="Totally Damaged", agricultural_damage="Major"))
check("damage level capped at 5 (rating scale 1-5)", lvl() == 5 and 1 <= score(hh1)["ratings"]["damage_unmet_needs"] <= 5)
admin.post("disasters/save_damage_assessment.php", dict(base, estimated_severity="Medium", house_damage="Minor"))
check("Minor damage only -> level 2", lvl() == 2)
admin.post("disasters/save_damage_assessment.php", dict(base, estimated_severity="High", house_damage="Major", property_damage="Major", remarks="Kitchen flooded."))
r = admin.post("disasters/save_damage_assessment.php", dict(base, house_damage="Exploded"))
v = sql(f"SELECT house_damage FROM damage_assessments WHERE report_id={dss_rid}")
if r.get("success") and v == "None":
    warn("invalid damage value is silently stored as 'None' instead of being rejected", "save_damage_assessment.php falls back to None/Low for unknown values; UI only offers valid options")
if len(orig_da) == 6:
    admin.post("disasters/save_damage_assessment.php", {"report_id": dss_rid, "house_damage": orig_da[0], "infrastructure_damage": orig_da[1], "property_damage": orig_da[2], "agricultural_damage": orig_da[3], "estimated_severity": orig_da[4], "remarks": orig_da[5]})
check("original assessment restored after DSS probes", sql(f"SELECT house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, COALESCE(remarks,'') FROM damage_assessments WHERE report_id={dss_rid}").split("\t") == orig_da)
admin.post("disasters/save_damage_assessment.php", {"report_id": rid, "house_damage": "Major", "infrastructure_damage": "None", "property_damage": "Major", "agricultural_damage": "None", "estimated_severity": "High", "remarks": "Kitchen flooded."})
check("assessment saved on the newly verified report", sql(f"SELECT house_damage FROM damage_assessments WHERE report_id={rid}") == "Major")
check("resident cannot save damage assessment", res1.post("disasters/save_damage_assessment.php", dict(base, estimated_severity="Low"))["_status"] == 403)
check("Phase 21: residents cannot read damage assessments (staff data)", res1.get("disasters/get_damage_assessment.php", {"report_id": rid})["_status"] == 403 and res2.get("disasters/get_damage_assessment.php", {"report_id": rid})["_status"] == 403)
r = per1.post("disasters/save_damage_assessment.php", {"report_id": rid, "house_damage": "Major", "infrastructure_damage": "None", "property_damage": "Major", "agricultural_damage": "None", "estimated_severity": "High", "remarks": "Kitchen flooded (field check)."})
check("Phase 21: Relief Personnel records a field damage assessment", r.get("success") and "field check" in sql(f"SELECT remarks FROM damage_assessments WHERE report_id={rid}"), r)
dss_src = open(os.path.join(REPO, "backend/dashboard/priority_list.php")).read() + open(os.path.join(REPO, "backend/lib/dss.php")).read()
check("DSS code does not reference estimated_severity", "estimated_severity" not in dss_src)
check("DSS code does not read relief requests (request urgency is not scored)", "relief_requests" not in dss_src and "r.urgency" not in dss_src and "'urgency'" not in dss_src)

pl = admin.get("dashboard/priority_list.php")["data"]
elig = [h for h in pl if h["eligible"]]
check("priority list sorted by score (highest first) among assessed households", all(elig[i]["priority_score"] >= elig[i + 1]["priority_score"] for i in range(len(elig) - 1)))
ok = True
for h in pl:
    hrow = sql(f"SELECT number_of_members, children_count+seniors_count+pwd_count+pregnant_count+medical_needs_count+other_vulnerable_count FROM households WHERE household_id={h['household_id']}").split()
    m, vul = int(hrow[0]), int(hrow[1])
    size_rating = 5 if m >= 8 else 4 if m >= 6 else 3 if m >= 4 else 2 if m >= 2 else 1
    if (h["eligible"] and h["ratings"]["household_size"] != size_rating) or h["vulnerability_score"] != vul + min(2, m // 5):
        ok = False
check("household-size rating (1/2-3/4-5/6-7/8+) and vulnerability score recomputed independently for all households", ok)
alloc_before = sql("SELECT COUNT(*), COALESCE(SUM(quantity),0) FROM relief_allocations")
rec = admin.get("dashboard/relief_recommendations.php")
check("DSS recommendations do NOT create allocations (no automatic approval)", sql("SELECT COUNT(*), COALESCE(SUM(quantity),0) FROM relief_allocations") == alloc_before)
recs = rec["data"]
check("recommendations only for Moderate priority and above", all(h["priority_level"] in ("Moderate Priority", "High Priority", "Critical Priority") for h in recs), [h["priority_level"] for h in recs])
check("recommendation households ordered by DSS rank", all(recs[i]["rank"] < recs[i + 1]["rank"] for i in range(len(recs) - 1)))
greedy_ok, seen = True, {}
for h in recs:
    for it in h["recommendations"]:
        iid = it["item_id"]
        if iid in seen and it["available_stock"] != seen[iid]:
            greedy_ok = False
        if it["quantity_to_allocate"] != min(it["recommended_quantity"], it["available_stock"]) or it["shortage"] != it["recommended_quantity"] - it["quantity_to_allocate"]:
            greedy_ok = False
        seen[iid] = it["available_stock"] - it["quantity_to_allocate"]
check("scarce stock allocated greedily: higher priority households served first, shortage = need - allocated", greedy_ok)
committed = {int(r.split()[0]): int(r.split()[1]) for r in sql("SELECT item_id, quantity - (SELECT COALESCE(SUM(quantity),0) FROM relief_allocations a WHERE a.item_id=i.item_id AND a.status='Approved') FROM relief_items i").splitlines()}
first_avail = {}
for h in recs:
    for it in h["recommendations"]:
        first_avail.setdefault(it["item_id"], it["available_stock"])
check("available stock = physical stock - Approved (committed) allocations", all(first_avail[i] == committed[i] for i in first_avail), (first_avail, committed))
check("needs estimate: Water = 3 x members", all(it["recommended_quantity"] == 3 * h["number_of_members"] for h in recs for it in h["recommendations"] if it["category"] == "Water"))

# =====================================================================
sec("Relief requests: validation and rejection")
items = {i["item_name"]: i for i in admin.get("inventory/get_items.php")["data"]}
rice = items["Rice"]["item_id"]
hh2 = hh_of("demo.resident2@binitayan.gov.ph")
check("Phase 21: resident cannot submit a relief request (403)", res2.post("requests/create_request.php", {"urgency": "High", "reason": "Validation test request.", "household_id": hh2, "items": [{"item_id": rice, "quantity": 1}]})["_status"] == 403)
check("Phase 21: Relief Personnel cannot record a relief request (403)", per1.post("requests/create_request.php", {"urgency": "High", "reason": "Validation test request.", "household_id": hh2, "items": [{"item_id": rice, "quantity": 1}]})["_status"] == 403)
for label, qty in [("zero", 0), ("negative", -3), ("decimal", 1.5), ("text", "abc"), ("too large", 10001)]:
    r = admin.post("requests/create_request.php", {"urgency": "High", "reason": "Validation test request.", "household_id": hh2, "items": [{"item_id": rice, "quantity": qty}]})
    check(f"request with {label} quantity rejected", r["_status"] == 400, r)
r = admin.post("requests/create_request.php", {"urgency": "High", "reason": "Validation test request.", "household_id": hh2, "items": []})
check("request with no items rejected", r["_status"] == 400, r)
r = admin.post("requests/create_request.php", {"urgency": "Extreme", "reason": "Validation test request.", "household_id": hh2, "items": [{"item_id": rice, "quantity": 1}]})
check("request with invalid urgency rejected", r["_status"] == 400, r)
r = admin.post("requests/create_request.php", {"urgency": "High", "reason": "Validation test request.", "household_id": hh2, "items": [{"item_id": rice, "quantity": 1}, {"item_id": rice, "quantity": 2}]})
check("duplicate item lines rejected", r["_status"] == 400, r)
r = admin.post("requests/create_request.php", {"urgency": "High", "reason": "Validation test request.", "household_id": hh2, "items": [{"item_id": 999999, "quantity": 1}]})
check("non-existent item rejected", r["_status"] in (400, 404), r)
r = admin.get("requests/create_request.php")
check("GET on create_request rejected (405)", r["_status"] == 405, r["_status"])
r = admin.post("requests/create_request.php", {"urgency": "Medium", "reason": "Roof leaking, need tarpaulin and food.", "household_id": hh2, "user_id": uid("demo.resident1@binitayan.gov.ph"),
                                              "items": [{"item_id": rice, "quantity": 3}, {"item_id": items["Tarpaulin"]["item_id"], "quantity": 1}]})
req2 = int(r.get("request_id") or 0)
row = sql(f"SELECT household_id, user_id FROM relief_requests WHERE request_id={req2}").split()
check("request saved for the selected household; recorder taken from the session (user_id in body ignored)", req2 and row == [str(hh2), str(ADMIN_ID)], row)
check("Phase 21: resident cannot list relief requests (403)", res2.get("requests/get_requests.php")["_status"] == 403)
check("personnel cannot start review", per1.post("requests/start_review.php", {"request_id": req2})["_status"] == 403)
r = admin.post("requests/start_review.php", {"request_id": req2})
check("Mark Under Review sets status Under Review", sql(f"SELECT status FROM relief_requests WHERE request_id={req2}") == "Under Review", r)
d = admin.get("requests/get_request_detail.php", {"request_id": req2})["data"]
lines = {i["item_name"]: i for i in d["items"]}
r = admin.post("requests/decide_request.php", {"request_id": req2, "decision": "approve", "items": [{"request_item_id": lines["Rice"]["request_item_id"], "approved_quantity": 99}, {"request_item_id": lines["Tarpaulin"]["request_item_id"], "approved_quantity": 1}]})
check("approved quantity above requested quantity rejected", r["_status"] == 400, r)
r = admin.post("requests/decide_request.php", {"request_id": req2, "decision": "approve", "items": [{"request_item_id": lines["Rice"]["request_item_id"], "approved_quantity": -1}, {"request_item_id": lines["Tarpaulin"]["request_item_id"], "approved_quantity": 1}]})
check("negative approved quantity rejected", r["_status"] == 400, r)
r = admin.post("requests/decide_request.php", {"request_id": req2, "decision": "reject", "remarks": ""})
check("rejection without a reason rejected", r["_status"] == 400, r)
r = admin.post("requests/decide_request.php", {"request_id": req2, "decision": "reject", "remarks": "Household already covered by scheduled distribution."})
check("admin rejects request with reason", r.get("success") and sql(f"SELECT status FROM relief_requests WHERE request_id={req2}") == "Rejected", r)
check("rejected request cannot be processed into allocations", admin.post("requests/process_request.php", {"request_id": req2})["_status"] in (400, 409))
check("resident notified of rejection", sql(f"SELECT COUNT(*) FROM notifications WHERE event_key LIKE 'request:{req2}:%'") != "0")
r = admin.post("requests/create_request.php", {"urgency": "Low", "reason": "New request after rejection.", "household_id": hh2, "items": [{"item_id": rice, "quantity": 1}]})
check("a new request can be recorded for the household after a rejection", r.get("success"), r)
req3 = int(r.get("request_id") or 0)

# =====================================================================
sec("Inventory")
r = admin.post("inventory/add_item.php", {"item_name": "Flashlight", "category": "Other", "quantity": 12, "unit": "pc", "minimum_level": 5})
check("add inventory item", r.get("success"), r)
fl = int(sql("SELECT item_id FROM relief_items WHERE item_name='Flashlight'"))
check("initial stock logged", sql(f"SELECT COUNT(*) FROM inventory_logs WHERE item_id={fl}") != "0")
r = admin.post("inventory/update_item.php", {"item_id": fl, "item_name": "Flashlight (LED)", "category": "Other", "unit": "pc", "minimum_level": 6})
check("edit item name/unit/minimum level", r.get("success") and sql(f"SELECT minimum_level FROM relief_items WHERE item_id={fl}") == "6", r)
check("edit item does not change quantity", sql(f"SELECT quantity FROM relief_items WHERE item_id={fl}") == "12")
r = admin.post("inventory/stock_in.php", {"item_id": fl, "quantity": 8, "reference": "Test donation"})
check("stock in adds quantity and logs Stock In", r.get("success") and sql(f"SELECT quantity FROM relief_items WHERE item_id={fl}") == "20" and sql(f"SELECT COUNT(*) FROM inventory_logs WHERE item_id={fl} AND log_type='Stock In'") != "0", r)
r = admin.post("inventory/stock_in.php", {"item_id": fl, "quantity": -5})
check("negative stock in rejected", r["_status"] == 400 and sql(f"SELECT quantity FROM relief_items WHERE item_id={fl}") == "20", r)
r = admin.post("inventory/stock_out.php", {"item_id": fl, "quantity": 5, "reference": "Damaged units"})
check("stock out deducts and logs Stock Out", r.get("success") and sql(f"SELECT quantity FROM relief_items WHERE item_id={fl}") == "15", r)
r = admin.post("inventory/stock_out.php", {"item_id": fl, "quantity": 999})
check("stock out above available rejected", r["_status"] in (400, 409) and sql(f"SELECT quantity FROM relief_items WHERE item_id={fl}") == "15", r)
r = admin.post("inventory/adjust_quantity.php", {"item_id": fl, "new_quantity": 4, "reason": "Physical count"})
check("adjustment sets quantity and logs Adjustment", r.get("success") and sql(f"SELECT quantity FROM relief_items WHERE item_id={fl}") == "4" and sql(f"SELECT COUNT(*) FROM inventory_logs WHERE item_id={fl} AND log_type='Adjustment'") != "0", r)
it = next(i for i in admin.get("inventory/get_items.php")["data"] if i["item_id"] == fl)
check("low-stock flag when quantity <= minimum level", it["low_stock"] is True, it)
hyg = items["Hygiene Kit"]["item_id"]
comm = int(sql(f"SELECT COALESCE(SUM(quantity),0) FROM relief_allocations WHERE item_id={hyg} AND status='Approved'"))
if comm > 0:
    r = admin.post("inventory/adjust_quantity.php", {"item_id": hyg, "new_quantity": comm - 1, "reason": "test"})
    check("adjustment below committed (Approved) stock blocked", r["_status"] in (400, 409), r)
else:
    check("adjustment below committed stock (no committed stock to test)", False, "no Approved allocation", status="NOT TESTED")
r = admin.post("inventory/donations/add_donation.php", {"donor_name": "Test Donor", "item_id": fl, "quantity": 3, "donation_date": "2026-10-02"})
check("donation recorded and stock increased", r.get("success") and sql(f"SELECT quantity FROM relief_items WHERE item_id={fl}") == "7", r)
check("personnel cannot stock in", per1.post("inventory/stock_in.php", {"item_id": fl, "quantity": 1})["_status"] == 403)
check("resident cannot add item", res1.post("inventory/add_item.php", {"item_name": "x", "category": "Food", "quantity": 1, "unit": "pc"})["_status"] == 403)
check("inventory log readable by admin", len(admin.get("inventory/get_logs.php").get("data", [])) > 0)

# =====================================================================
sec("Scheduled distribution lifecycle")
pkg = admin.post("relief/packages/add_package.php", {"package_name": "Lifecycle Pack", "description": "test", "items": [{"item_id": rice, "quantity": 1}, {"item_id": fl, "quantity": 1}]})
pkg_id = int(pkg.get("package_id") or sql("SELECT MAX(package_id) FROM relief_packages"))
check("relief package created", pkg.get("success"), pkg)
p1 = uid("demo.personnel1@binitayan.gov.ph")
hh3 = hh_of("demo.resident3@binitayan.gov.ph")
check("personnel cannot create schedules", per1.post("relief/schedules/add_schedule.php", {"package_id": pkg_id, "distribution_date": "2026-10-12", "location": "Hall", "household_ids": [hh2]})["_status"] == 403)
r = admin.post("relief/schedules/add_schedule.php", {"package_id": pkg_id, "distribution_date": "2026-10-12", "distribution_time": "09:00", "location": "Barangay Hall", "latitude": "13.1562", "longitude": "123.7164", "assigned_personnel": p1, "household_ids": [hh2, hh3]})
sid = int(r.get("schedule_id") or 0)
check("schedule with 2 beneficiaries created", r.get("success") and sql(f"SELECT COUNT(*) FROM distribution_beneficiaries WHERE schedule_id={sid}") == "2", r)
check("beneficiaries notified of schedule", sql(f"SELECT COUNT(*) FROM notifications WHERE event_key LIKE 'schedule:{sid}:%'") != "0" or sql(f"SELECT COUNT(*) FROM notifications WHERE event_key LIKE 'beneficiary:%'") != "0")
b2 = int(sql(f"SELECT beneficiary_id FROM distribution_beneficiaries WHERE schedule_id={sid} AND household_id={hh2}"))
b3 = int(sql(f"SELECT beneficiary_id FROM distribution_beneficiaries WHERE schedule_id={sid} AND household_id={hh3}"))
check("assigned personnel sees the schedule", per1.get("relief/schedules/get_schedule_detail.php", {"schedule_id": sid}).get("success"))
check("unassigned personnel cannot see the schedule", per2.get("relief/schedules/get_schedule_detail.php", {"schedule_id": sid})["_status"] == 403)
r = per2.post("relief/schedules/update_beneficiary_status.php", {"beneficiary_id": b2, "status": "Prepared"})
check("unassigned personnel cannot change beneficiary status", r["_status"] == 403, r)
r = per1.post("relief/schedules/update_beneficiary_status.php", {"beneficiary_id": b2, "status": "Delivered", "recipient_name": "X"})
check("skipping Pending -> Delivered rejected", r["_status"] == 409, r)
r = per1.post("relief/schedules/update_beneficiary_status.php", {"beneficiary_id": b2, "status": "Shipped"})
check("unknown status rejected", r["_status"] == 400, r)
check("Pending -> Prepared", per1.post("relief/schedules/update_beneficiary_status.php", {"beneficiary_id": b2, "status": "Prepared"}).get("success"))
check("Prepared -> Dispatched", per1.post("relief/schedules/update_beneficiary_status.php", {"beneficiary_id": b2, "status": "Dispatched"}).get("success"))
r = per1.post("relief/schedules/update_beneficiary_status.php", {"beneficiary_id": b2, "status": "Delivered", "recipient_name": "Pedro Ramirez"})
check("Delivered blocked before beneficiary verification", r["_status"] == 409, r)
r = per1.post("relief/schedules/verify_beneficiary.php", {"beneficiary_id": b2})
check("personnel verifies beneficiary", r.get("success"), r)
r = per1.post("relief/schedules/update_beneficiary_status.php", {"beneficiary_id": b2, "status": "Delivered", "recipient_name": ""})
check("Delivered requires recipient name", r["_status"] == 400, r)
q_rice, q_fl = sql(f"SELECT quantity FROM relief_items WHERE item_id={rice}"), sql(f"SELECT quantity FROM relief_items WHERE item_id={fl}")
r = per1.post("relief/schedules/update_beneficiary_status.php", {"beneficiary_id": b2, "status": "Delivered", "recipient_name": "Pedro Ramirez", "remarks": "Received at hall"})
drep = int(r.get("report_id") or 0)
check("Dispatched -> Delivered with recipient", r.get("success") and drep > 0, r)
check("delivery deducts each package item exactly once", int(sql(f"SELECT quantity FROM relief_items WHERE item_id={rice}")) == int(q_rice) - 1 and int(sql(f"SELECT quantity FROM relief_items WHERE item_id={fl}")) == int(q_fl) - 1)
check("delivery creates Distributed allocations linked to schedule", sql(f"SELECT COUNT(*) FROM relief_allocations WHERE schedule_id={sid} AND household_id={hh2} AND status='Distributed'") == "2")
check("delivery writes Stock Out inventory logs", int(sql(f"SELECT COUNT(*) FROM inventory_logs WHERE log_type='Stock Out' AND item_id IN ({rice},{fl})")) >= 2)
check("delivery report row created with recipient", sql(f"SELECT recipient_name FROM delivery_reports WHERE report_id={drep}") == "Pedro Ramirez")
r = per1.post("relief/schedules/update_beneficiary_status.php", {"beneficiary_id": b2, "status": "Delivered", "recipient_name": "Pedro Ramirez"})
check("duplicate Delivered blocked; stock unchanged", r["_status"] == 409 and int(sql(f"SELECT quantity FROM relief_items WHERE item_id={rice}")) == int(q_rice) - 1, r)
up = per1.upload("relief/delivery/upload_delivery_photo.php", {"report_id": str(drep)}, [("photos[]", ("proof.png", png_bytes(), "image/png"))])
check("delivery photo uploaded to delivery report", up.get("success") and sql(f"SELECT COUNT(*) FROM delivery_report_photos WHERE report_id={drep}") == "1", up)
up = per1.upload("relief/delivery/upload_delivery_photo.php", {"report_id": str(drep)}, [("photos[]", ("bad.jpg", b"not image", "image/jpeg"))])
check("invalid delivery photo rejected", sql(f"SELECT COUNT(*) FROM delivery_report_photos WHERE report_id={drep}") == "1", up)
check("delivery report readable by admin", admin.get("relief/delivery/get_delivery_report.php", {"report_id": drep}).get("success") or admin.get("relief/delivery/get_delivery_report.php", {"beneficiary_id": b2}).get("success"))
r = per1.post("relief/schedules/update_beneficiary_status.php", {"beneficiary_id": b3, "status": "Cancelled", "remarks": "Family evacuated elsewhere"})
check("Pending -> Cancelled", r.get("success") and sql(f"SELECT status FROM distribution_beneficiaries WHERE beneficiary_id={b3}") == "Cancelled", r)
r = per1.post("relief/schedules/update_beneficiary_status.php", {"beneficiary_id": b3, "status": "Prepared"})
check("Cancelled is final", r["_status"] == 409, r)
check("cancelled beneficiary deducts no stock", sql(f"SELECT COUNT(*) FROM relief_allocations WHERE schedule_id={sid} AND household_id={hh3}") == "0")
check("resident cannot change beneficiary status", res2.post("relief/schedules/update_beneficiary_status.php", {"beneficiary_id": b2, "status": "Prepared"})["_status"] == 403)
fb0 = sql("SELECT COUNT(*) FROM relief_feedback")
for who, sess_, ref in [("resident 3 (cancelled)", res3, b3), ("resident 2 (delivered, own household)", res2, b2), ("resident 1 (other household)", res1, b2)]:
    r = sess_.post("feedback/submit_feedback.php", {"type": "schedule", "ref_id": ref, "received": "Yes", "rating": 4, "sufficiency": "Sufficient", "experience": "Good"})
    check(f"Phase 21: resident feedback submission retired — {who} refused (403)", r["_status"] == 403, r)
check("Phase 21: no feedback row created by residents", sql("SELECT COUNT(*) FROM relief_feedback") == fb0)
fb = admin.get("feedback/get_feedback.php")
check("admin feedback page still returns existing rows and summary", fb.get("success") and "data" in fb and ("summary" in fb or "stats" in fb), list(fb.keys()))
check("feedback rating filter works", all(int(f["rating"]) == 4 for f in admin.get("feedback/get_feedback.php", {"rating": 4}).get("data", [])))

# =====================================================================
sec("Evacuation centers")
base_c = {"name": "Sup Test Center", "address": "Purok 2", "purok": "Purok 2", "latitude": "13.1555", "longitude": "123.7150", "capacity": 50, "current_occupancy": 0, "status": "Open", "facilities": "Toilets, water", "contact_person": "Kagawad Test", "contact_number": "09170000009"}
r = admin.post("evacuation/save_center.php", dict(base_c, latitude="13.50", longitude="123.20"))
check("center outside Binitayan boundary rejected", r["_status"] == 400, r)
r = admin.post("evacuation/save_center.php", dict(base_c, name=""))
check("center without name rejected", r["_status"] == 400, r)
r = admin.post("evacuation/save_center.php", dict(base_c, capacity=0))
check("center with capacity 0 rejected", r["_status"] == 400, r)
r = admin.post("evacuation/save_center.php", base_c)
cid = int(r.get("center_id") or 0)
check("center created with facilities and contact", r.get("success") and sql(f"SELECT contact_person FROM evacuation_centers WHERE center_id={cid}") == "Kagawad Test", r)
r = admin.post("evacuation/save_center.php", dict(base_c, center_id=cid, capacity=60, name="Sup Test Center Edited"))
check("center edited", r.get("success") and sql(f"SELECT capacity FROM evacuation_centers WHERE center_id={cid}") == "60", r)
r = admin.post("evacuation/update_occupancy.php", {"center_id": cid, "current_occupancy": 30, "remarks": "Evening count"})
check("occupancy updated and logged", r.get("success") and sql(f"SELECT COUNT(*) FROM evacuation_center_logs WHERE center_id={cid}") != "0", r)
r = admin.post("evacuation/update_occupancy.php", {"center_id": cid, "current_occupancy": -1})
check("negative occupancy rejected", r["_status"] == 400, r)
r = admin.post("evacuation/update_occupancy.php", {"center_id": cid, "current_occupancy": 0})
r = admin.post("evacuation/set_status.php", {"center_id": cid, "status": "Closed"})
check("empty center can be closed", r.get("success") and sql(f"SELECT status FROM evacuation_centers WHERE center_id={cid}") == "Closed", r)
r = admin.post("evacuation/update_occupancy.php", {"center_id": cid, "current_occupancy": 5})
check("occupancy cannot be added to a closed center", r["_status"] in (400, 409), r)
r = admin.post("evacuation/set_status.php", {"center_id": cid, "status": "Open", "notify_residents": True})
check("center reopened and residents notified", r.get("success") and sql(f"SELECT COUNT(*) FROM notifications WHERE event_key LIKE 'evac:{cid}:%' OR event_key LIKE 'evacuation:{cid}:%'") != "0", r)
check("personnel can view centers", len(per1.get("evacuation/get_centers.php").get("data", [])) >= 1)
check("resident cannot delete a center", res1.post("evacuation/delete_center.php", {"center_id": cid})["_status"] == 403)
check("personnel cannot edit a center", per1.post("evacuation/save_center.php", dict(base_c, center_id=cid))["_status"] == 403)
r = admin.post("evacuation/delete_center.php", {"center_id": cid})
check("admin deletes a center", r.get("success") and sql(f"SELECT COUNT(*) FROM evacuation_centers WHERE center_id={cid}") == "0", r)

# =====================================================================
sec("Households and map data")
r = admin.post("households/members/add_member.php", {"household_id": hh2, "full_name": "Test Member", "age": 70, "relationship": "Parent"})
mid = int(r.get("member_id") or sql(f"SELECT MAX(member_id) FROM household_members WHERE household_id={hh2}"))
check("admin adds household member", r.get("success"), r)
check("resident cannot add household member", res2.post("households/members/add_member.php", {"household_id": hh2, "full_name": "X", "age": 1, "relationship": "Child"})["_status"] == 403)
check("resident cannot read another household's members", res1.get("households/members/get_members.php", {"household_id": hh2})["_status"] == 403)
r = admin.post("households/members/delete_member.php", {"member_id": mid})
if r["_status"] == 405:
    r = admin.delete("households/members/delete_member.php", {"member_id": mid})
check("admin deletes household member", r.get("success"), r)
r = admin.put("households/update_household.php", {"household_id": hh2, "head_of_family": "Pedro Ramirez", "purok": "Purok 2", "address": "x", "number_of_members": 4, "latitude": "14.0", "longitude": "121.0"})
check("household update outside boundary rejected", r["_status"] == 400, r)
hl = res1.get("households/get_households.php")["data"]
check("resident map data: only own household returned", len(hl) == 1)
hp = per1.get("households/get_households.php")
check("personnel can read household list for field work", hp.get("success") and len(hp["data"]) >= 3)
bfile = open(os.path.join(REPO, "backend/utils/boundary_validator.php")).read()
check("boundary validator uses a fixed Binitayan polygon (no generated purok polygons)", "13.1" in bfile and "purok" not in bfile.lower().split("function")[0][-200:])
pub = anon.get("hazards/get_public_status.php")
check("public hazard status works without login", pub.get("success"), pub)
before_alert = {h["household_id"]: h for h in admin.get("dashboard/priority_list.php")["data"] if h["eligible"]}
r = admin.post("hazards/alerts/add_alert.php", {"hazard_type": "Typhoon", "status": "Warning", "title": "Signal No. 2 test", "affected_purok": ""})
after_alert = {h["household_id"]: h for h in admin.get("dashboard/priority_list.php")["data"] if h["eligible"]}
check("barangay-wide alert raises the severity rating by one level (max 5) for every assessed household",
      r.get("success") and all(after_alert[k]["ratings"]["disaster_severity"] == min(5, v["ratings"]["disaster_severity"] + (0 if "active hazard alert" in v["criteria"][0]["basis"] else 1)) for k, v in before_alert.items()), r)
aid = int(sql("SELECT MAX(alert_id) FROM hazard_alerts"))
r = admin.post("hazards/alerts/update_status.php", {"alert_id": aid, "resolve": True})
check("alert deactivated", sql(f"SELECT is_active FROM hazard_alerts WHERE alert_id={aid}") == "0", r)
r = admin.post("hazards/weather/add_weather_log.php", {"temperature": 28, "humidity": 85, "rainfall": 12.5, "wind_speed": 40, "weather_condition": "Rain", "remarks": "test"})
check("manual weather log recorded", r.get("success"), r)

# =====================================================================
sec("Notifications")
n = res2.get("notifications/get_notifications.php")
check("resident notifications list with unread count", n.get("success") and "unread_count" in n, n)
unread = n.get("unread_count", 0)
first_unread = next((x for x in n.get("data", []) if not int(x.get("is_read", 0))), None)
if first_unread:
    res2.post("notifications/mark_read.php", {"notification_id": first_unread["notification_id"]})
    check("marking one notification read decrements unread count by 1", res2.get("notifications/get_notifications.php")["unread_count"] == unread - 1)
other = sql(f"SELECT notification_id FROM notifications WHERE user_id={uid('demo.resident1@binitayan.gov.ph')} AND is_read=0 LIMIT 1")
if other:
    res2.post("notifications/mark_read.php", {"notification_id": int(other)})
    check("resident cannot mark another user's notification read", sql(f"SELECT is_read FROM notifications WHERE notification_id={other}") == "0")
pn = per1.get("notifications/get_notifications.php")
check("personnel notifications available (assignment)", pn.get("success") and len(pn.get("data", [])) >= 1, pn.get("unread_count"))
res2.post("notifications/mark_read.php", {"all": True})
check("mark all read sets unread to 0", res2.get("notifications/get_notifications.php")["unread_count"] == 0)

# =====================================================================
sec("SMS - not configured")
check("SMS local config absent during phase A", not os.path.exists(LOCAL_CFG))
r = admin.post("sms/send.php", {"recipient_mode": "custom", "message": "Test message", "category": "General", "custom_recipients": [{"name": "T", "number": "09171234567"}]})
check("manual SMS with gateway not configured: no crash, logged as Not Configured", r["_status"] < 500 and sql("SELECT status FROM sms_logs ORDER BY sms_id DESC LIMIT 1") == "Not Configured", r)
check("automatic SMS logged as Not Configured while disabled", sql("SELECT COUNT(*) FROM sms_logs WHERE event_key IS NOT NULL AND status='Not Configured'") != "0")
r = admin.post("sms/send.php", {"recipient_mode": "custom", "message": "", "custom_recipients": [{"number": "09171234567"}]})
check("empty SMS message rejected", r["_status"] == 400)
check("SMS logs readable by admin", admin.get("sms/get_logs.php").get("success"))

sec("SMS - local mock gateway")
if not os.path.exists(TEST_CFG):
    check("mock SMS phase", False, "test config missing", status="BLOCKED")
else:
    shutil.copy(TEST_CFG, LOCAL_CFG)
    try:
        open(MOCK_LOG, "w").close()
        if os.path.exists("/tmp/textbee_fail"):
            os.remove("/tmp/textbee_fail")
        r = admin.post("sms/send.php", {"recipient_mode": "custom", "message": "Mock test message", "category": "General", "custom_recipients": [{"name": "T", "number": "09171234567"}, {"name": "Bad", "number": "12345"}]})
        st = sql("SELECT GROUP_CONCAT(status ORDER BY sms_id) FROM (SELECT status, sms_id FROM sms_logs ORDER BY sms_id DESC LIMIT 2) t")
        check("manual SMS via mock: valid number Accepted by Gateway, invalid number Failed", "Accepted by Gateway" in st and "Failed" in st, (r, st))
        calls = open(MOCK_LOG).read()
        check("invalid number never sent to the gateway", "12345\"" not in calls and calls.count("send-sms") >= 1, calls[:300])
        check("API key not returned in any response body", "test-key-123" not in r["_text"])
        open("/tmp/textbee_fail", "w").close()
        admin.post("sms/send.php", {"recipient_mode": "custom", "message": "Mock failure", "custom_recipients": [{"number": "09171234567"}]})
        os.remove("/tmp/textbee_fail")
        check("gateway error logged as Failed without crash", sql("SELECT status FROM sms_logs ORDER BY sms_id DESC LIMIT 1") == "Failed")
        # automatic SMS events through the mock
        HH3 = hh_of("demo.resident3@binitayan.gov.ph")
        r = per1.post("disasters/create_report.php", {"household_id": HH3, "disaster_type": "Landslide", "severity": "Medium", "location": "Hillside", "description": "Soil slid near house."})
        r_new = int(r.get("report_id") or 0)
        admin.post("disasters/verify_report.php", {"report_id": r_new, "remarks": "ok"})
        check("Phase 21: report verified -> no resident SMS (reports are staff-recorded)", r_new and sql(f"SELECT COUNT(*) FROM sms_logs WHERE event_key='report:{r_new}:verified'") == "0")
        r = per1.post("disasters/create_report.php", {"household_id": HH3, "disaster_type": "Fire", "severity": "Low", "location": "Kitchen", "description": "Small kitchen fire."})
        r_rej = int(r.get("report_id") or 0)
        admin.post("disasters/reject_report.php", {"report_id": r_rej, "remarks": "Duplicate report."})
        check("Phase 21: report rejected -> no resident SMS", r_rej and sql(f"SELECT COUNT(*) FROM sms_logs WHERE event_key='report:{r_rej}:rejected'") == "0")
        d = admin.get("requests/get_request_detail.php", {"request_id": req3})["data"]
        admin.post("requests/decide_request.php", {"request_id": req3, "decision": "approve", "items": [{"request_item_id": d["items"][0]["request_item_id"], "approved_quantity": 1}]})
        # Phase 25 policy (default): SMS only when relief is marked Ready; approvals, rejections and
        # distribution notify in-app only. The opt-in path is tested by phase20_automation_test.py.
        check("Phase 25: request approved -> in-app notice, no SMS (SMS only when Ready)", sql(f"SELECT COUNT(*) FROM sms_logs WHERE event_key LIKE 'request:{req3}:%'") == "0"
              and sql(f"SELECT COUNT(*) FROM notifications WHERE event_key LIKE 'request:{req3}:%'") != "0")
        admin.post("requests/process_request.php", {"request_id": req3})
        aids = sql(f"SELECT a.allocation_id FROM relief_allocations a JOIN relief_request_items ri ON ri.request_item_id=a.request_item_id WHERE ri.request_id={req3}").split()
        for a in aids:
            per1.post("relief/distribute.php", {"allocation_id": int(a)})
        check("Phase 25: request distributed -> Distributed, no SMS", sql(f"SELECT status FROM relief_requests WHERE request_id={req3}") == "Distributed" and sql(f"SELECT COUNT(*) FROM sms_logs WHERE event_key LIKE 'request:{req3}:distributed%'") == "0",
              sql(f"SELECT GROUP_CONCAT(event_key) FROM sms_logs WHERE event_key LIKE 'request:{req3}:%'"))
        r = admin.post("requests/create_request.php", {"urgency": "High", "reason": "Landslide damaged our kitchen.", "household_id": HH3, "items": [{"item_id": rice, "quantity": 2}, {"item_id": fl, "quantity": 1}]})
        req4 = int(r.get("request_id") or 0)
        d = admin.get("requests/get_request_detail.php", {"request_id": req4})["data"]
        admin.post("requests/decide_request.php", {"request_id": req4, "decision": "approve", "items": [{"request_item_id": d["items"][0]["request_item_id"], "approved_quantity": 1}, {"request_item_id": d["items"][1]["request_item_id"], "approved_quantity": 0}], "remarks": "Flashlight not needed"})
        check("Phase 25: partial approval -> Partially Approved, no SMS", sql(f"SELECT status FROM relief_requests WHERE request_id={req4}") == "Partially Approved" and sql(f"SELECT COUNT(*) FROM sms_logs WHERE event_key LIKE 'request:{req4}:%'") == "0")
        admin.post("requests/decide_request.php", {"request_id": req4, "decision": "reject", "remarks": "Changed decision for test."})
        check("Phase 25: request rejected -> in-app notice, no SMS", sql(f"SELECT COUNT(*) FROM sms_logs WHERE event_key = 'request:{req4}:decision:rejected'") == "0"
              and sql(f"SELECT COUNT(*) FROM notifications WHERE event_key LIKE 'request:{req4}:%'") != "0", sql(f"SELECT GROUP_CONCAT(event_key) FROM sms_logs WHERE event_key LIKE 'request:{req4}:%'"))
        r = admin.post("relief/schedules/add_schedule.php", {"package_id": pkg_id, "distribution_date": "2026-10-15", "location": "Covered Court", "latitude": "13.1562", "longitude": "123.7164", "assigned_personnel": p1, "household_ids": [hh3]})
        sid2 = int(r.get("schedule_id") or 0)
        check("beneficiary scheduled -> automatic SMS Accepted by Gateway", sql(f"SELECT COUNT(*) FROM sms_logs WHERE (event_key LIKE 'schedule:{sid2}:%' OR event_key LIKE 'beneficiary:%') AND status IN ('Sent','Accepted by Gateway','Delivered')") != "0", sql("SELECT GROUP_CONCAT(event_key) FROM sms_logs ORDER BY sms_id DESC LIMIT 3"))
        before = sql("SELECT COUNT(*) FROM sms_logs")
        admin.put("relief/schedules/update_schedule.php", {"schedule_id": sid2, "distribution_date": "2026-10-16", "distribution_time": "10:00", "location": "Covered Court", "assigned_personnel": p1})
        check("schedule date change -> SMS to beneficiaries", int(sql("SELECT COUNT(*) FROM sms_logs")) > int(before))
        b = int(sql(f"SELECT beneficiary_id FROM distribution_beneficiaries WHERE schedule_id={sid2}"))
        per1.post("relief/schedules/verify_beneficiary.php", {"beneficiary_id": b})
        for stt in ["Prepared", "Dispatched"]:
            per1.post("relief/schedules/update_beneficiary_status.php", {"beneficiary_id": b, "status": stt})
        per1.post("relief/schedules/update_beneficiary_status.php", {"beneficiary_id": b, "status": "Delivered", "recipient_name": "Luzviminda Cruz"})
        check("delivery completed -> automatic SMS Accepted by Gateway", sql(f"SELECT COUNT(*) FROM sms_logs WHERE event_key LIKE '%{b}%deliver%' AND status IN ('Sent','Accepted by Gateway','Delivered')") != "0", sql("SELECT GROUP_CONCAT(event_key) FROM (SELECT event_key FROM sms_logs ORDER BY sms_id DESC LIMIT 3) t"))
        cr = admin.post("evacuation/save_center.php", dict(base_c, name="SMS Test Center", status="Closed"))
        c2 = int(cr.get("center_id") or 0)
        admin.post("evacuation/set_status.php", {"center_id": c2, "status": "Open", "notify_residents": True, "send_sms": True})
        check("evacuation center opened with SMS option -> SMS Accepted by Gateway for residents", sql(f"SELECT COUNT(*) FROM sms_logs WHERE event_key LIKE '%{c2}%' AND status IN ('Sent','Accepted by Gateway','Delivered')") != "0", sql("SELECT GROUP_CONCAT(event_key) FROM (SELECT event_key FROM sms_logs ORDER BY sms_id DESC LIMIT 3) t"))
        admin.post("evacuation/set_status.php", {"center_id": c2, "status": "Closed", "notify_residents": True, "send_sms": False})
        check("center closed without SMS option -> no new SMS for close event", sql(f"SELECT COUNT(*) FROM sms_logs WHERE event_key LIKE '%{c2}%clos%'") == "0")
        admin.post("evacuation/delete_center.php", {"center_id": c2})
        check("no duplicate automatic SMS (event_key, number)", sql("SELECT COUNT(*) FROM (SELECT event_key, recipient_number, COUNT(*) c FROM sms_logs WHERE event_key IS NOT NULL GROUP BY event_key, recipient_number HAVING c>1) t") == "0")
        check("API key never written to SMS logs or audit logs", sql("SELECT COUNT(*) FROM sms_logs WHERE CONCAT_WS(' ',message,error_message) LIKE '%test-key-123%'") == "0" and sql("SELECT COUNT(*) FROM audit_logs WHERE details LIKE '%test-key-123%'") == "0")
        sl = admin.get("sms/get_logs.php")
        check("SMS log API does not expose the API key", "test-key-123" not in sl["_text"])
        check("settings API does not expose the API key", "test-key-123" not in admin.get("settings/get_settings.php")["_text"])
    finally:
        os.remove(LOCAL_CFG)
check("test SMS config removed after phase B", not os.path.exists(LOCAL_CFG))

# =====================================================================
sec("Security probes")
r = requests.post(BASE + "requests/get_requests.php", headers={"Origin": "https://evil.example.com"})
check("CORS: unknown origin not echoed", "Access-Control-Allow-Origin" not in r.headers)
r = requests.get(BASE + "auth/session.php", headers={"Origin": "http://localhost:5173"})
check("CORS: configured dev origin echoed with credentials", r.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173" and r.headers.get("Access-Control-Allow-Credentials") == "true")
r = admin.get("disasters/get_reports.php", {"status": "Pending' OR '1'='1", "search": "'; DROP TABLE users; --"})
check("SQL injection in report filters harmless", r["_status"] < 500 and sql("SELECT COUNT(*) FROM users") != "", r["_status"])
r = admin.raw("POST", "requests/decide_request.php", data="{not json", headers={"Content-Type": "application/json"})
check("malformed JSON returns a clean 4xx without stack trace", 400 <= r.status_code < 500 and "Stack trace" not in r.text and "#0 " not in r.text and ".php on line" not in r.text, (r.status_code, r.text[:200]))
r = requests.get(BASE + "config/app_config.php")
check("direct request to config file outputs nothing sensitive", "DB_PASS" not in r.text and "TEXTBEE" not in r.text, r.text[:100])
r = requests.get(BASE + "lib/dss.php")
check("direct request to lib file outputs no code or data (Apache .htaccess additionally denies it)", len(r.text.strip()) == 0 or r.status_code == 403, r.text[:100])
check("uploads folder blocks PHP execution (.htaccess present)", os.path.exists(os.path.join(REPO, "backend/uploads/.htaccess")) and "php" in open(os.path.join(REPO, "backend/uploads/.htaccess")).read())
src = subprocess.run(["grep", "-rn", "dangerouslySetInnerHTML", os.path.join(REPO, "frontend/src")], capture_output=True, text=True).stdout
check("frontend has no dangerouslySetInnerHTML (React escapes user text)", src.strip() == "", src[:200])
leak = subprocess.run(["git", "-C", REPO, "grep", "-nIE", "TEXTBEE_API_KEY'\\s*=>\\s*'[A-Za-z0-9]{8,}"], capture_output=True, text=True).stdout
check("no TextBee API key committed in the repository", leak.strip() == "", leak[:200])
check("app_config.local.php is git-ignored", "app_config.local.php" in open(os.path.join(REPO, ".gitignore")).read())
dist = os.path.join(REPO, "frontend/dist")
if os.path.isdir(dist):
    hits = subprocess.run(["grep", "-rl", "test-key-123\\|DB_PASS", dist], capture_output=True, text=True).stdout
    check("built frontend bundle contains no secrets", hits.strip() == "", hits)
check("personnel cannot approve recommendations", per1.post("relief/approve_recommendation.php", {"household_id": hh1, "item_id": rice, "quantity": 1})["_status"] == 403)
check("personnel cannot delete households", per1.post("households/delete_household.php", {"household_id": hh2})["_status"] == 403)
check("resident cannot distribute allocations", res1.post("relief/distribute.php", {"allocation_id": 1})["_status"] == 403)
check("resident cannot read priority list", res1.get("dashboard/priority_list.php")["_status"] == 403)
check("resident cannot read recommendations", res1.get("dashboard/relief_recommendations.php")["_status"] == 403)
check("resident cannot read SMS logs", res1.get("sms/get_logs.php")["_status"] == 403)
check("resident cannot read analytics", res1.get("reports/dashboard_analytics.php")["_status"] == 403)
check("resident cannot read another household's allocations via filter", all(a["household_id"] == hh1 for a in res1.get("relief/get_allocations.php", {"household_id": hh2}).get("data", [])))
check("resident cannot read another household via filter", all(h["household_id"] == hh1 for h in res1.get("households/get_households.php", {"household_id": hh2}).get("data", [])))

# =====================================================================
sec("Analytics, reports, settings, audit")
for ep in ["reports/dashboard_analytics.php", "reports/disaster_reports.php", "reports/household_reports.php", "reports/inventory_reports.php", "reports/relief_reports.php", "dashboard/statistics.php", "dashboard/household_statistics.php"]:
    r = admin.get(ep)
    check(f"admin analytics endpoint {ep}", r.get("success"), r.get("message") or r.get("_raw"))
r = admin.get("reports/disaster_reports.php", {"date_from": "2020-01-01", "date_to": "2020-01-31"})
r2 = admin.get("reports/disaster_reports.php")
check("date filter narrows disaster report analytics", r.get("success") and json.dumps(r.get("data"), sort_keys=True) != json.dumps(r2.get("data"), sort_keys=True))
r3 = admin.get("reports/disaster_reports.php", {"severity": "Critical"})
check("severity filter changes disaster analytics", r3.get("success") and json.dumps(r3.get("data"), sort_keys=True) != json.dumps(r2.get("data"), sort_keys=True))
r = admin.get("reports/household_reports.php", {"purok": "Purok 3"})
check("purok filter accepted on household report", r.get("success"))
ps = per1.get("dashboard/personnel_stats.php")
check("personnel dashboard stats", ps.get("success"), ps)
r = admin.post("settings/update_settings.php", {"emergency_hotline": "911 / MDRRMO Daraga"})
check("admin updates system settings", r.get("success") and "MDRRMO" in sql("SELECT setting_value FROM system_settings WHERE setting_key='emergency_hotline'"), r)
r = admin.post("settings/categories/add_category.php", {"category_name": "Tools", "description": "test"})
check("admin adds inventory category", r.get("success"), r)
r = admin.post("settings/disaster_types/add_type.php", {"type_name": "Volcanic Ashfall"})
check("admin adds disaster type", r.get("success"), r)
check("puroks endpoint lists the 8 standard puroks", [p if isinstance(p, str) else p.get("name", p.get("value")) for p in admin.get("settings/get_puroks.php").get("data", [])] == ["Purok 1", "Purok 2", "Purok 3", "Purok 4", "Purok 5A", "Purok 5B", "Purok 6", "Purok 7"])
al = admin.get("audit/get_logs.php")
check("audit log lists actions", al.get("success") and len(al.get("data", [])) > 10)
lh = admin.get("audit/get_login_history.php")
check("login history lists attempts with status", lh.get("success") and any(x.get("login_status") == "Failed" for x in lh.get("data", [])))

# =====================================================================
sec("Database integrity")
I = [
    ("orphan household_members", "SELECT COUNT(*) FROM household_members m LEFT JOIN households h ON h.household_id=m.household_id WHERE h.household_id IS NULL"),
    ("households linked to missing users", "SELECT COUNT(*) FROM households h LEFT JOIN users u ON u.user_id=h.user_id WHERE h.user_id IS NOT NULL AND u.user_id IS NULL"),
    ("households linked to non-resident users", "SELECT COUNT(*) FROM households h JOIN users u ON u.user_id=h.user_id WHERE u.role<>'resident'"),
    ("residents linked to more than one household", "SELECT COUNT(*) FROM (SELECT user_id FROM households WHERE user_id IS NOT NULL GROUP BY user_id HAVING COUNT(*)>1) t"),
    ("orphan disaster_reports (user)", "SELECT COUNT(*) FROM disaster_reports d LEFT JOIN users u ON u.user_id=d.user_id WHERE u.user_id IS NULL"),
    ("orphan report_photos", "SELECT COUNT(*) FROM report_photos p LEFT JOIN disaster_reports d ON d.report_id=p.report_id WHERE d.report_id IS NULL"),
    ("orphan damage_assessments", "SELECT COUNT(*) FROM damage_assessments a LEFT JOIN disaster_reports d ON d.report_id=a.report_id WHERE d.report_id IS NULL"),
    ("duplicate damage assessments per report", "SELECT COUNT(*) FROM (SELECT report_id FROM damage_assessments GROUP BY report_id HAVING COUNT(*)>1) t"),
    ("orphan allocations (household)", "SELECT COUNT(*) FROM relief_allocations a LEFT JOIN households h ON h.household_id=a.household_id WHERE h.household_id IS NULL"),
    ("orphan allocations (item)", "SELECT COUNT(*) FROM relief_allocations a LEFT JOIN relief_items i ON i.item_id=a.item_id WHERE i.item_id IS NULL"),
    ("allocations with non-positive quantity", "SELECT COUNT(*) FROM relief_allocations WHERE quantity<=0"),
    ("Distributed allocations without distributed_at", "SELECT COUNT(*) FROM relief_allocations WHERE status='Distributed' AND distributed_at IS NULL"),
    ("negative inventory", "SELECT COUNT(*) FROM relief_items WHERE quantity<0"),
    ("committed stock above physical stock", "SELECT COUNT(*) FROM relief_items i WHERE i.quantity < (SELECT COALESCE(SUM(quantity),0) FROM relief_allocations a WHERE a.item_id=i.item_id AND a.status='Approved')"),
    ("orphan inventory_logs", "SELECT COUNT(*) FROM inventory_logs l LEFT JOIN relief_items i ON i.item_id=l.item_id WHERE l.item_id IS NOT NULL AND i.item_id IS NULL"),
    ("Distributed allocations without a Stock Out log (by count)", "SELECT GREATEST(0,(SELECT COUNT(*) FROM relief_allocations WHERE status='Distributed') - (SELECT COUNT(*) FROM inventory_logs WHERE log_type='Stock Out' AND (reference LIKE 'Relief distribution%' OR reference LIKE '%Delivered%' OR reference LIKE '%schedule%' OR reference LIKE '%deliver%')))"),
    ("orphan request items", "SELECT COUNT(*) FROM relief_request_items ri LEFT JOIN relief_requests r ON r.request_id=ri.request_id WHERE r.request_id IS NULL"),
    ("requests with no items", "SELECT COUNT(*) FROM relief_requests r WHERE NOT EXISTS (SELECT 1 FROM relief_request_items ri WHERE ri.request_id=r.request_id)"),
    ("more than one open request per household", "SELECT COUNT(*) FROM (SELECT household_id FROM relief_requests WHERE status IN ('Pending','Under Review','Approved','Partially Approved','Allocated') GROUP BY household_id HAVING COUNT(*)>1) t"),
    ("approved quantity above requested", "SELECT COUNT(*) FROM relief_request_items WHERE approved_quantity > requested_quantity"),
    ("Distributed requests with undistributed allocations", "SELECT COUNT(*) FROM relief_requests r JOIN relief_request_items ri ON ri.request_id=r.request_id JOIN relief_allocations a ON a.request_item_id=ri.request_item_id WHERE r.status='Distributed' AND a.status<>'Distributed'"),
    ("duplicate beneficiaries per schedule", "SELECT COUNT(*) FROM (SELECT schedule_id, household_id FROM distribution_beneficiaries GROUP BY schedule_id, household_id HAVING COUNT(*)>1) t"),
    ("Delivered beneficiaries without delivery report", "SELECT COUNT(*) FROM distribution_beneficiaries b WHERE b.status='Delivered' AND NOT EXISTS (SELECT 1 FROM delivery_reports d WHERE d.beneficiary_id=b.beneficiary_id)"),
    ("Delivered beneficiaries not verified", "SELECT COUNT(*) FROM distribution_beneficiaries WHERE status='Delivered' AND is_verified=0"),
    ("duplicate delivery reports per beneficiary", "SELECT COUNT(*) FROM (SELECT beneficiary_id FROM delivery_reports GROUP BY beneficiary_id HAVING COUNT(*)>1) t"),
    ("orphan delivery_report_photos", "SELECT COUNT(*) FROM delivery_report_photos p LEFT JOIN delivery_reports d ON d.report_id=p.report_id WHERE d.report_id IS NULL"),
    ("evacuation occupancy outside 0..capacity", "SELECT COUNT(*) FROM evacuation_centers WHERE current_occupancy<0 OR current_occupancy>capacity"),
    ("evacuation status inconsistent with occupancy", "SELECT COUNT(*) FROM evacuation_centers WHERE (status='Full' AND current_occupancy<capacity) OR (status='Open' AND current_occupancy>=capacity) OR (status='Closed' AND current_occupancy>0)"),
    ("orphan evacuation_center_logs", "SELECT COUNT(*) FROM evacuation_center_logs l LEFT JOIN evacuation_centers c ON c.center_id=l.center_id WHERE c.center_id IS NULL"),
    ("feedback for undelivered records", "SELECT COUNT(*) FROM relief_feedback f LEFT JOIN distribution_beneficiaries b ON b.beneficiary_id=f.beneficiary_id LEFT JOIN relief_requests r ON r.request_id=f.request_id LEFT JOIN relief_allocations a ON a.allocation_id=f.allocation_id WHERE NOT (COALESCE(b.status='Delivered',0) OR COALESCE(r.status='Distributed',0) OR COALESCE(a.status='Distributed',0))"),
    ("feedback rating outside 1..5", "SELECT COUNT(*) FROM relief_feedback WHERE rating NOT BETWEEN 1 AND 5"),
    ("duplicate notifications (user, event_key)", "SELECT COUNT(*) FROM (SELECT user_id, event_key FROM notifications WHERE event_key IS NOT NULL GROUP BY user_id, event_key HAVING COUNT(*)>1) t"),
    ("notifications for missing users", "SELECT COUNT(*) FROM notifications n LEFT JOIN users u ON u.user_id=n.user_id WHERE u.user_id IS NULL"),
    ("duplicate automatic SMS (event_key, number)", "SELECT COUNT(*) FROM (SELECT event_key, recipient_number FROM sms_logs WHERE event_key IS NOT NULL GROUP BY event_key, recipient_number HAVING COUNT(*)>1) t"),
    ("audit logs referencing missing users", "SELECT COUNT(*) FROM audit_logs a LEFT JOIN users u ON u.user_id=a.user_id WHERE a.user_id IS NOT NULL AND u.user_id IS NULL"),
]
for name, q in I:
    v = sql(q)
    check(f"integrity: {name} = 0", v == "0", v)
fk = sql("SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='barangay_disaster_db'")
ck = sql("SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='barangay_disaster_db'")
tb = sql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='barangay_disaster_db'")
check(f"schema: {tb} tables, {fk} foreign keys, {ck} CHECK constraints", int(fk) >= 68 and int(ck) >= 5 and int(tb) == 33, (tb, fk, ck))  # Phase 20: +disaster_events, +disaster_affected_areas
check("audit trail recorded for this run", int(sql("SELECT COUNT(*) FROM audit_logs")) > 50)

# =====================================================================
counts = {}
for r in results:
    counts[r["status"]] = counts.get(r["status"], 0) + 1
print("\nSUMMARY:", ", ".join(f"{k}={v}" for k, v in sorted(counts.items())), f"TOTAL={len(results)}")
json.dump(results, open("/home/claude/tests/supplement_results.json", "w"), indent=1)
