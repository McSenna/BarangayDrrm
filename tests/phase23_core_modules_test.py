"""
Phase 23 test — six core modules (reporting, DSS, hazard monitoring, geographic
coordinates, relief allocation, SMS) after the simplification.

    python3 tests/phase23_core_modules_test.py <api> <db> <admin_email> <admin_password>

  api : backend URL (TextBee OFF) on a REHEARSAL database (name must contain
        "rehearsal") loaded with barangay_disaster_db_FINAL.sql + an Administrator
        + defensedata_typhoon_flood.sql. No SMS is sent by this test.
"""
import re, subprocess, sys, datetime
import requests

if len(sys.argv) != 5 or "rehearsal" not in sys.argv[2]:
    sys.exit(__doc__)
API, DB, AE, AP = sys.argv[1].rstrip("/") + "/", sys.argv[2], sys.argv[3], sys.argv[4]
PW = "BinitayanTest2026!"
TODAY = datetime.date.today().isoformat()
results = []


def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {str(detail)[:400]}"))


def sql(q):
    return subprocess.run(["mysql", "-N", "-B", DB, "-e", q], capture_output=True, text=True)


def one(q):
    v = sql(q).stdout.strip()
    return v.splitlines()[0] if v else ""


def sess(email, pw):
    s = requests.Session()
    r = s.post(API + "auth/login.php", json={"email": email, "password": pw})
    assert r.json().get("success"), (email, r.text)
    return s


def J(r):
    try:
        d = r.json()
    except Exception:
        d = {"_raw": r.text[:200]}
    d["_status"] = r.status_code
    return d


TABLES = ["users", "households", "household_members", "disaster_reports", "damage_assessments", "relief_items",
          "relief_allocations", "inventory_logs", "sms_logs", "relief_requests", "audit_logs"]
before = {t: int(one(f"SELECT COUNT(*) FROM {t}")) for t in TABLES}
report_ids_before = one("SELECT GROUP_CONCAT(report_id ORDER BY report_id) FROM disaster_reports")

A = sess(AE, AP)
P = sess("personnel.binitayan.test@gmail.com", PW)
R = sess("binitayan.test04@gmail.com", PW)
H2 = 2

print("== A. Schema (migration_phase23_core_modules.sql / FINAL)")
cols = sql("SHOW COLUMNS FROM disaster_reports").stdout
check("A1 disaster_reports has latitude, longitude, reported_needs", all(c in cols for c in ("latitude", "longitude", "reported_needs")))
check("A2 disaster_affected_areas.area_type exists", "area_type" in sql("SHOW COLUMNS FROM disaster_affected_areas").stdout)
check("A3 event_id is nullable", one("SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='disaster_affected_areas' AND COLUMN_NAME='event_id'") == "YES")
check("A4 CHECK chk_affected_area_event present",
      one("SELECT COUNT(*) FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='chk_affected_area_event'") == "1")
bad = sql("INSERT INTO disaster_affected_areas (event_id, area_type, hazard_type, area_name, geojson, vertex_count) "
          "VALUES (NULL, 'Recorded Affected Area', 'Flood', 'zz-check', '{}', 3)")
check("A5 DB refuses a Recorded Affected Area without an event", bad.returncode != 0 and one("SELECT COUNT(*) FROM disaster_affected_areas WHERE area_name='zz-check'") == "0", bad.stderr)

print("== B. Automation of Reporting")
base = {"household_id": H2, "disaster_type": "Flood", "location": "Purok 2 riverside", "description": "Phase 23 test report",
        "report_date": TODAY, "report_time": "08:30", "severity": "High"}
r = J(P.post(API + "disasters/create_report.php", json={**base, "latitude": "13.1557", "longitude": "123.7154", "reported_needs": "Food,Water,Medical"}))
rid = r.get("report_id")
check("B1 personnel records a report (201/200)", r["_status"] in (200, 201) and rid, r)
check("B2 reference number RPT-<year>-<5 digits> returned", re.fullmatch(r"RPT-\d{4}-\d{5}", str(r.get("reference_no"))) and r["reference_no"].endswith(f"{int(rid):05d}"), r)
row = one(f"SELECT CONCAT_WS('|', latitude, longitude, reported_needs, status, created_at IS NOT NULL) FROM disaster_reports WHERE report_id={int(rid or 0)}")
check("B3 coordinates, needs, Pending status and timestamp stored", row.startswith("13.1557000|123.7154000|Food,Water,Medical|Pending|1"), row)
r = J(P.post(API + "disasters/create_report.php", json={**base, "latitude": "14.5995", "longitude": "120.9842"}))
check("B4 coordinates outside Barangay Binitayan refused (400)", r["_status"] == 400 and "outside" in r.get("message", "").lower(), r)
r = J(P.post(API + "disasters/create_report.php", json={**base, "latitude": "13.1557"}))
check("B5 one coordinate without the other refused (400)", r["_status"] == 400, r)
r = J(P.post(API + "disasters/create_report.php", json={**base, "reported_needs": "Food,Cash"}))
check("B6 unknown need refused (400)", r["_status"] == 400, r)
# Phase 25: a second report for the same household, type and date is flagged as a
# possible duplicate (409) until the official confirms it is a different assessment.
r = J(P.post(API + "disasters/create_report.php", json={**base, "reported_needs": ["Food", "Water"]}))
check("B6b same household + type + date -> 409 possible_duplicate (Phase 25)", r["_status"] == 409 and r.get("code") == "possible_duplicate", r)
r = J(P.post(API + "disasters/create_report.php", json={**base, "reported_needs": ["Food", "Water"], "confirm_not_duplicate": True}))
check("B7 needs given as a list are accepted", r["_status"] in (200, 201), r)
extra_rid = r.get("report_id")
r = J(P.post(API + "disasters/create_report.php", json={**base, "confirm_not_duplicate": True}))
check("B8 report without coordinates or needs still accepted (optional fields)", r["_status"] in (200, 201), r)
extra2 = r.get("report_id")
r = J(R.post(API + "disasters/create_report.php", json=base))
check("B9 resident cannot submit a disaster report (403)", r["_status"] == 403, r)
r = J(A.post(API + "disasters/update_report.php", json={**base, "report_id": rid, "reported_needs": "Food,Shelter", "latitude": "13.1558", "longitude": "123.7155"}))
row = one(f"SELECT CONCAT_WS('|', latitude, longitude, reported_needs) FROM disaster_reports WHERE report_id={int(rid or 0)}")
check("B10 admin updates needs and coordinates", r["_status"] == 200 and row == "13.1558000|123.7155000|Food,Shelter", (r, row))
r = J(A.post(API + "disasters/update_report.php", json={**base, "report_id": rid, "latitude": "1", "longitude": "1"}))
check("B11 update with outside coordinates refused, values unchanged", r["_status"] == 400 and one(f"SELECT latitude FROM disaster_reports WHERE report_id={int(rid or 0)}") == "13.1558000", r)
r = J(A.post(API + "disasters/verify_report.php", json={"report_id": rid}))
check("B12 admin verifies the report", r["_status"] == 200 and one(f"SELECT status FROM disaster_reports WHERE report_id={int(rid or 0)}") == "Verified", r)
r = J(P.post(API + "disasters/verify_report.php", json={"report_id": extra_rid}))
check("B13 personnel cannot verify (403)", r["_status"] == 403, r)
lst = J(P.get(API + "disasters/get_reports.php"))
rows = lst.get("data", [])
check("B14 every listed report has a reference number", rows and all(re.fullmatch(r"RPT-\d{4}-\d{5}", x.get("reference_no") or "") for x in rows), rows[:1])
mine = next((x for x in rows if int(x["report_id"]) == int(rid or 0)), {})
check("B15 list carries household coordinates and assessment flag", "household_latitude" in mine and "has_assessment" in mine, list(mine)[:40])
hi = J(P.get(API + "disasters/get_reports.php", params={"severity": "Critical"})).get("data", [])
check("B16 severity filter returns only Critical", hi and all(x["severity"] == "Critical" for x in hi), [x["severity"] for x in hi])
check("B17 resident cannot list reports (403)", R.get(API + "disasters/get_reports.php").status_code == 403)

print("== C. Dashboard statistics (one card per module)")
st = J(A.get(API + "dashboard/statistics.php")).get("data", {})
w = st.get("workflow", {})
for k in ("dss_needs_review", "incidents_by_severity", "ready_for_distribution", "households_without_coordinates"):
    check(f"C1 workflow.{k} present", k in w, list(w))
check("C2 sms.failed_total present", "failed_total" in w.get("sms", {}), w.get("sms"))
check("C3 recent reports carry reference numbers", all(x.get("reference_no") for x in st.get("recent_reports", [])), st.get("recent_reports", [])[:1])
check("C4 resident cannot read staff statistics (403)", R.get(API + "dashboard/statistics.php").status_code == 403)

print("== D. Geographic coordinates — flood-prone zones vs recorded affected areas")
lat2, lng2 = 13.1556932, 123.7153845  # household 2
d = 0.0003
poly = {"type": "Polygon", "coordinates": [[[lng2 - d, lat2 - d], [lng2 + d, lat2 - d], [lng2 + d, lat2 + d], [lng2 - d, lat2 + d], [lng2 - d, lat2 - d]]]}
r = J(A.post(API + "hazards/areas/save_area.php", json={"area_type": "Flood-Prone Zone", "area_name": "P23 riverbank flood-prone zone", "hazard_type": "Flood", "geojson": poly}))
zone = (r.get("data") or {}).get("area_id") if isinstance(r.get("data"), dict) else None
zone = zone or one("SELECT area_id FROM disaster_affected_areas WHERE area_name='P23 riverbank flood-prone zone'")
check("D1 admin records a flood-prone zone without an event", r["_status"] in (200, 201) and one(f"SELECT CONCAT(area_type,'|',IFNULL(event_id,'NULL')) FROM disaster_affected_areas WHERE area_id={int(zone or 0)}") == "Flood-Prone Zone|NULL", r)
r = J(A.post(API + "hazards/areas/save_area.php", json={"area_type": "Recorded Affected Area", "area_name": "P23 no event", "hazard_type": "Flood", "geojson": poly}))
check("D2 recorded affected area without an event refused (400)", r["_status"] == 400, r)
r = J(A.post(API + "hazards/areas/save_area.php", json={"area_type": "Active Flood", "area_name": "P23 bad type", "hazard_type": "Flood", "geojson": poly}))
check("D3 unknown area type refused (400)", r["_status"] == 400, r)
r = J(P.post(API + "hazards/areas/save_area.php", json={"area_type": "Flood-Prone Zone", "area_name": "P23 personnel", "hazard_type": "Flood", "geojson": poly}))
check("D4 personnel cannot record areas (403)", r["_status"] == 403, r)
ev = J(A.post(API + "disasters/events/save_event.php", json={"event_name": "P23 Test Flood", "disaster_type": "Flood", "start_date": TODAY}))
eid = ev.get("event_id") or one("SELECT event_id FROM disaster_events WHERE event_name='P23 Test Flood'")
lat7, lng7 = 13.1552189, 123.7169349  # household 8 (Ernesto)
poly8 = {"type": "Polygon", "coordinates": [[[lng7 - d, lat7 - d], [lng7 + d, lat7 - d], [lng7 + d, lat7 + d], [lng7 - d, lat7 + d], [lng7 - d, lat7 - d]]]}
r = J(A.post(API + "hazards/areas/save_area.php", json={"area_type": "Recorded Affected Area", "event_id": int(eid), "area_name": "P23 recorded area", "hazard_type": "Flood", "geojson": poly8}))
check("D5 recorded affected area with its event accepted", r["_status"] in (200, 201), r)
ah = J(P.get(API + "hazards/areas/get_affected_households.php", params={"status": "Active"}))
s = ah.get("summary", {})
check("D6 summary splits recorded areas and flood-prone zones",
      s.get("households_in_flood_prone_zones") == 1 and s.get("households_in_recorded_affected_areas") == 1
      and s.get("flood_prone_zones") == 1 and s.get("recorded_affected_areas") == 1, s)
check("D7 flood-prone note says it is not confirmed flooding", "not confirmed" in s.get("flood_prone_note", ""), s.get("flood_prone_note"))
h2 = next((h for h in ah.get("inside", []) if h["household_id"] == H2), {})
check("D8 household 2 is inside the flood-prone zone (point-in-polygon on the server)",
      [a.get("area_type") for a in h2.get("areas", [])] == ["Flood-Prone Zone"], h2)
fz = J(P.get(API + "hazards/areas/get_areas.php", params={"area_type": "Flood-Prone Zone", "status": "all"})).get("data", [])
check("D9 area_type filter returns only flood-prone zones with event_id null",
      len(fz) == 1 and fz[0]["area_type"] == "Flood-Prone Zone" and fz[0]["event_id"] is None, fz)
sr = J(A.get(API + "reports/situation_report.php", params={"event_id": int(eid)}))
hh = (sr.get("data") or sr).get("households", {}) if isinstance(sr.get("data") or sr, dict) else {}
check("D10 situation report counts only the recorded affected area (flood-prone zone excluded)",
      hh.get("inside_recorded_areas") == 1, hh)
check("D11 resident cannot read affected households (403)", R.get(API + "hazards/areas/get_affected_households.php").status_code == 403)

print("== E. Geographic coordinates — set a household's map location")
orig = one("SELECT CONCAT(latitude,',',longitude) FROM households WHERE household_id=1")
r = J(P.post(API + "households/update_coordinates.php", json={"household_id": 1, "latitude": "13.1563", "longitude": "123.7145"}))
check("E1 personnel sets coordinates inside the boundary", r["_status"] == 200 and one("SELECT CONCAT(latitude,',',longitude) FROM households WHERE household_id=1") == "13.1563000,123.7145000", r)
check("E2 change is audit-logged with old and new values",
      one("SELECT COUNT(*) FROM audit_logs WHERE action='Household coordinates updated' AND details LIKE '%household_id: 1 %' AND details LIKE '%to: 13.1563%'") == "1")
r = J(P.post(API + "households/update_coordinates.php", json={"household_id": 1, "latitude": "14.5995", "longitude": "120.9842"}))
check("E3 outside the boundary refused; coordinates unchanged", r["_status"] == 400 and one("SELECT latitude FROM households WHERE household_id=1") == "13.1563000", r)
for name, payload, code in [("E4 non-numeric id '1abc'", {"household_id": "1abc", "latitude": "13.1563", "longitude": "123.7145"}, 400),
                            ("E5 missing longitude", {"household_id": 1, "latitude": "13.1563"}, 400),
                            ("E6 array value", {"household_id": 1, "latitude": ["13.1"], "longitude": "123.7"}, 400),
                            ("E7 unknown household", {"household_id": 999999, "latitude": "13.1563", "longitude": "123.7145"}, 404)]:
    r = J(P.post(API + "households/update_coordinates.php", json=payload))
    check(f"{name} -> {code}", r["_status"] == code, r)
r = J(R.post(API + "households/update_coordinates.php", json={"household_id": 4, "latitude": "13.1563", "longitude": "123.7145"}))
check("E8 resident cannot change coordinates (403)", r["_status"] == 403, r)
check("E9 GET not allowed (405)", P.get(API + "households/update_coordinates.php").status_code == 405)
check("E10 anonymous request refused (401)", requests.post(API + "households/update_coordinates.php", json={"household_id": 1, "latitude": "13.1563", "longitude": "123.7145"}).status_code == 401)
o_lat, o_lng = orig.split(",")
A.post(API + "households/update_coordinates.php", json={"household_id": 1, "latitude": o_lat, "longitude": o_lng})
check("E11 original coordinates restored", one("SELECT CONCAT(latitude,',',longitude) FROM households WHERE household_id=1") == orig)

print("== F. DSS and relief allocation still answer; retired screens keep their backend secured")
pl = J(P.get(API + "dashboard/priority_list.php")).get("data", [])
check("F1 priority list ranks eligible households 1..n", [x["rank"] for x in pl if x.get("eligible")] == list(range(1, 1 + sum(1 for x in pl if x.get("eligible")))), pl[:2])
check("F2 scores are 20..100 or null (Not Assessed)", all((x["priority_score"] is None and x["priority_level"] == "Not Assessed") or 20 <= x["priority_score"] <= 100 for x in pl))
check("F3 recommendations endpoint answers for admin", A.get(API + "dashboard/relief_recommendations.php").status_code == 200)
check("F4 allocations endpoint answers for personnel", P.get(API + "relief/get_allocations.php").status_code == 200)
for ep in ["relief/schedules/get_schedules.php", "inventory/donations/get_donations.php", "relief/packages/get_packages.php",
           "dashboard/household_statistics.php", "hazards/weather/get_weather_logs.php", "feedback/get_feedback.php",
           "reports/dashboard_analytics.php"]:
    code = R.get(API + ep).status_code
    check(f"F5 retired-screen endpoint {ep} kept and still refuses residents ({code})", code == 403, code)

print("== G. Existing records preserved")
after = {t: int(one(f"SELECT COUNT(*) FROM {t}")) for t in TABLES}
added = {"disaster_reports": 3}
for t in TABLES:
    if t == "audit_logs":
        check("G audit_logs only grew", after[t] >= before[t], (before[t], after[t]))
    else:
        check(f"G {t}: {before[t]} -> {after[t]} (expected +{added.get(t, 0)})", after[t] == before[t] + added.get(t, 0))
check("G original report ids intact", one(f"SELECT GROUP_CONCAT(report_id ORDER BY report_id) FROM disaster_reports WHERE report_id <= {max(map(int, report_ids_before.split(',')))}") == report_ids_before)

print(f"SUMMARY: {sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
