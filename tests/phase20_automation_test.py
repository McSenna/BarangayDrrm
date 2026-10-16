"""
Phase 20 automation test — situation report, affected-area identification, automated SMS.

    python3 tests/phase20_automation_test.py <api_sms_off> <api_sms_mock> <db> <admin_email> <admin_password>

  api_sms_off  : backend URL with TextBee OFF (SMS logged "Not Configured")
  api_sms_mock : backend URL, same database, TextBee ON pointing to the LOCAL MOCK
                 gateway (/home/claude/mock; fails while /tmp/textbee_fail exists).
                 No real SMS is ever sent.
  db           : a REHEARSAL database (name must contain "rehearsal") loaded with
                 barangay_disaster_db_FINAL.sql + an Administrator + defensedata_typhoon_flood.sql

Phase 25: SMS at approval / distribution is now an OPT-IN barangay policy
(default: SMS only when relief is marked Ready). This suite tests that optional
path, so BOTH servers must run with SMS_ON_APPROVAL_AND_DISTRIBUTION=true.
A gateway acceptance is logged as "Accepted by Gateway" (not "Delivered").
The default (no SMS at approval) is covered by tests/phase25_official_assessment_test.py.
"""
import json, os, subprocess, sys
import requests

if len(sys.argv) != 6 or "rehearsal" not in sys.argv[3]:
    sys.exit(__doc__)
OFF, ON, DB, AE, AP = sys.argv[1].rstrip("/") + "/", sys.argv[2].rstrip("/") + "/", sys.argv[3], sys.argv[4], sys.argv[5]
PW = "BinitayanTest2026!"
FAIL_FLAG = "/tmp/textbee_fail"
MOCK_LOG = "/tmp/textbee_calls.log"
results = []


def check(name, cond, detail=""):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name + ("" if cond else f"  -> {str(detail)[:300]}"))


def sql(q):
    return subprocess.run(["mysql", "-N", "-B", DB, "-e", q], capture_output=True, text=True).stdout.strip()


def one(q):
    v = sql(q)
    return v.splitlines()[0] if v else ""


class JS(requests.Session):
    """Session whose post/put send a dict passed positionally as JSON."""
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


def ray(lat, lng, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


if os.path.exists(FAIL_FLAG):
    os.remove(FAIL_FLAG)
A = sess(OFF, AE, AP)          # admin, SMS off
AM = sess(ON, AE, AP)          # admin, SMS -> mock gateway
P = sess(ON, "personnel.binitayan.test@gmail.com", PW)
R8 = sess(OFF, "binitayan.test08@gmail.com", PW)
ANON = JS()

# ------------------------------------------------------------------ baseline DSS (must not change)
def ranking(s=A):
    return {p["head_of_family"]: p["priority_score"] for p in s.get(OFF + "dashboard/priority_list.php").json()["data"]}
base = ranking()
check("17a DSS works (Phase 22 weighted model): baseline 79, 76, 72, 72, 71, 52, 49, 36",
      sorted(base.values(), reverse=True) == [79, 76, 72, 72, 71, 52, 49, 36], base)

# ------------------------------------------------------------------ 1. event
r = J(A.post(OFF + "disasters/events/save_event.php", {"event_name": "Typhoon Binitayan Defense Demonstration 2026", "disaster_type": "Typhoon",
                                                      "start_date": "2026-09-28", "end_date": "2026-09-30",
                                                      "description": "Simulated strong typhoon; flooding in low-lying puroks. [DEFENSE TEST]"}))
EID = r.get("event_id")
check("1 disaster event created", r["_status"] == 201 and EID, r)
check("1b duplicate event name refused (409)", J(A.post(OFF + "disasters/events/save_event.php", {"event_name": "Typhoon Binitayan Defense Demonstration 2026", "disaster_type": "Typhoon", "start_date": "2026-09-28"}))["_status"] == 409)
check("1c end date before start refused (400)", J(A.post(OFF + "disasters/events/save_event.php", {"event_name": "X", "disaster_type": "Typhoon", "start_date": "2026-09-28", "end_date": "2026-09-01"}))["_status"] == 400)
ev = J(A.get(OFF + "disasters/events/get_events.php"))["data"]
check("1d event listed with 8 reports in its period", ev and ev[0]["reports_in_period"] == 8, ev)

# ------------------------------------------------------------------ 2-4 data present
check("2 reports exist (8 in period: 7 Verified, 1 Pending)", one("SELECT CONCAT(COUNT(*),'/',SUM(status='Verified'),'/',SUM(status='Pending')) FROM disaster_reports WHERE report_date BETWEEN '2026-09-28' AND '2026-09-30'") == "8/7/1")
check("3 damage assessments exist (8)", one("SELECT COUNT(*) FROM damage_assessments") == "8")
r = J(A.post(OFF + "households/add_household.php", {"head_of_family": "Phase20 NoCoords Test", "purok": "Purok 2", "address": "Purok 2 [DEFENSE TEST] P20 no coordinates",
                                                     "number_of_members": 3, "contact_number": "09000002001", "latitude": "", "longitude": ""}))
NOC = int(r.get("household_id") or 0)
check("4 households: 8 with coordinates + 1 test household without coordinates", NOC > 0 and one("SELECT COUNT(*) FROM households WHERE latitude IS NOT NULL") == "8", r)

# ------------------------------------------------------------------ 5. areas + validation
polyA = {"type": "Polygon", "coordinates": [[[123.7140, 13.1550], [123.7159, 13.1550], [123.7159, 13.1576], [123.7140, 13.1574]]]}
polyB = {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [[[123.7166, 13.1540], [123.7174, 13.1542], [123.7175, 13.1559], [123.7166, 13.1558], [123.7166, 13.1540]]]}}
ra = J(A.post(OFF + "hazards/areas/save_area.php", {"event_id": EID, "hazard_type": "Flood", "area_name": "Low-lying western zone (Purok 1-3)", "description": "[DEFENSE TEST] demonstration area", "geojson": polyA}))
rb = J(A.post(OFF + "hazards/areas/save_area.php", {"event_id": EID, "hazard_type": "Flood", "area_name": "Purok 7 riverside zone", "description": "[DEFENSE TEST] demonstration area", "geojson": json.dumps(polyB)}))
check("5 two affected areas recorded (Polygon object and Feature as JSON text)", ra["_status"] == 201 and rb["_status"] == 201, (ra, rb))
check("5b save reports households inside (3 and 1)", ra.get("households_inside") == 3 and rb.get("households_inside") == 1, (ra, rb))
bad = {
    "point geometry": {"type": "Point", "coordinates": [123.715, 13.156]},
    "self-intersecting (bow-tie)": {"type": "Polygon", "coordinates": [[[123.714, 13.155], [123.716, 13.157], [123.716, 13.155], [123.714, 13.157]]]},
    "far outside Binitayan": {"type": "Polygon", "coordinates": [[[120, 13], [120.1, 13], [120.1, 13.1]]]},
    "only 2 points": {"type": "Polygon", "coordinates": [[[123.714, 13.155], [123.715, 13.155]]]},
    "non-numeric coordinate": {"type": "Polygon", "coordinates": [[["a", 13.155], [123.715, 13.155], [123.715, 13.156]]]},
    "invalid JSON text": "{not json",
    "near but not overlapping": {"type": "Polygon", "coordinates": [[[123.7100, 13.1505], [123.7110, 13.1505], [123.7110, 13.1512]]]},
}
for label, g in bad.items():
    rr = J(A.post(OFF + "hazards/areas/save_area.php", {"event_id": EID, "hazard_type": "Flood", "area_name": "bad", "geojson": g}))
    check(f"5c invalid GeoJSON refused (400): {label}", rr["_status"] == 400, rr)
check("5d unknown event refused", J(A.post(OFF + "hazards/areas/save_area.php", {"event_id": 99999, "hazard_type": "Flood", "area_name": "x", "geojson": polyA}))["_status"] == 404)
check("5e invalid hazard type refused", J(A.post(OFF + "hazards/areas/save_area.php", {"event_id": EID, "hazard_type": "Tsunami", "area_name": "x", "geojson": polyA}))["_status"] == 400)
check("5f no area row created by the invalid attempts", one("SELECT COUNT(*) FROM disaster_affected_areas") == "2")
stored = json.loads(one(f"SELECT geojson FROM disaster_affected_areas WHERE area_id={ra['area_id']}"))
check("5g stored geometry is normalized and closed", stored["type"] == "Polygon" and stored["coordinates"][0][0] == stored["coordinates"][0][-1], stored)

# ------------------------------------------------------------------ 6-8 map + point-in-polygon
areas = J(A.get(OFF + "hazards/areas/get_areas.php", params={"event_id": EID}))["data"]
check("6 map data: areas returned with GeoJSON geometry", len(areas) == 2 and all(a["geometry"]["type"] == "Polygon" for a in areas))
res = J(A.get(OFF + "hazards/areas/get_affected_households.php"))
inside = sorted(h["head_of_family"] for h in res["inside"])
check("7 point-in-polygon: inside = H01, H02, H03 (west zone) + H08 (riverside)",
      inside == sorted(["Ramon Dizon", "Gloria Mendoza", "Eduardo Salazar", "Ernesto Dimaculangan"]), inside)
rows = [l.split("\t") for l in sql("SELECT household_id, latitude, longitude FROM households WHERE latitude IS NOT NULL").splitlines()]
indep = sorted(int(i) for i, la, lo in rows if ray(float(la), float(lo), polyA["coordinates"][0]) or ray(float(la), float(lo), polyB["geometry"]["coordinates"][0]))
check("7b independent Python ray-casting gives the same households", indep == sorted(h["household_id"] for h in res["inside"]), (indep, res["inside"]))
check("7c outside households = H04, H05, H06, H07", sorted(h["head_of_family"] for h in res["outside"]) == sorted(["Jerome Pascual", "Corazon Villanueva", "Wilfredo Ocampo", "Leonora Castillo"]))
check("7d household without coordinates listed separately, not inside/outside",
      [h["household_id"] for h in res["missing_coordinates"]] == [NOC] and NOC not in [h["household_id"] for h in res["inside"] + res["outside"]], res["missing_coordinates"])
s = res["summary"]
check("8 counts: 4 affected, 4 outside, 1 without coordinates, 9 total", (s["affected_households"], s["outside_households"], s["households_without_coordinates"], s["total_households"]) == (4, 4, 1, 9), s)
h8 = next(h for h in res["inside"] if h["head_of_family"] == "Ernesto Dimaculangan")
check("8b affected household details: priority from DSS, report, damage, request", h8["priority_score"] == base["Ernesto Dimaculangan"] and h8["report"]["status"] == "Pending"
      and h8["damage"]["house"] == "Major" and h8["request"]["status"] == "Pending", h8)
check("17b recording areas did NOT change any DSS score (original 8 households)", {k: v for k, v in ranking().items() if k in base} == base, ranking())
rr = J(A.post(OFF + "hazards/areas/set_area_status.php", {"area_id": rb["area_id"], "status": "Resolved"}))
check("8c resolving the riverside area: active identification drops to 3", rr.get("success") and J(A.get(OFF + "hazards/areas/get_affected_households.php"))["summary"]["affected_households"] == 3)
J(A.post(OFF + "hazards/areas/set_area_status.php", {"area_id": rb["area_id"], "status": "Active"}))

# ------------------------------------------------------------------ 9. situation report (before relief actions)
rep = J(A.get(OFF + "reports/situation_report.php", params={"event_id": EID}))
check("9 situation report generated for the event", rep.get("success") and rep["disaster"]["event_name"].startswith("Typhoon Binitayan"), rep.get("message"))
check("9a report counts match the database (8 reports, 7/1/0, by type Flood 4 Typhoon 4)",
      rep["reports"]["total"] == 8 and rep["reports"]["by_status"] == {"Pending": 1, "Verified": 7, "Rejected": 0} and rep["reports"]["by_type"] == {"Flood": 4, "Typhoon": 4}, rep["reports"])
check("9b severity counts match (Critical 2, High 3, Medium 2, Low 1)", rep["reports"]["by_severity"] == {"Critical": 2, "High": 3, "Medium": 2, "Low": 1}, rep["reports"]["by_severity"])
check("9c households: 8 reported, 4 inside areas, 39 persons", (rep["households"]["reported_affected"], rep["households"]["inside_recorded_areas"], rep["households"]["persons"]) == (8, 4, 39), rep["households"])
check("9d damage: 8 assessed, 2 with totally damaged, 4 with major", (rep["damage"]["assessed_reports"], rep["damage"]["with_totally_damaged"], rep["damage"]["with_major_damage"]) == (8, 2, 4), rep["damage"])
check("9e evacuation: 18 persons, 32 available, evacuated households = not available (null)",
      rep["evacuation"]["current_occupancy_persons"] == 18 and rep["evacuation"]["available_capacity_open_centers"] == 32 and rep["evacuation"]["evacuated_households"] is None)
hyg = next(i for i in rep["inventory"]["list"] if i["item_name"].startswith("Hygiene"))
check("9f inventory: Hygiene Kit stock 6, reserved 4, available 2, shortage 3 (H08 open request)", (hyg["stock"], hyg["reserved"], hyg["available"], hyg["shortage"]) == (6, 4, 2, 3), hyg)
check("9g allocations: 7 Approved, 0 Distributed; schedule incl. upcoming = 1", rep["allocations"]["by_status"]["Approved"]["count"] == 7 and rep["allocations"]["by_status"]["Distributed"]["count"] == 0
      and rep["distribution"]["schedules"] == 1, (rep["allocations"]["by_status"], rep["distribution"]))
check("9h no hardcoded values: area list comes from the database", sorted(a["area_name"] for a in rep["affected_areas"]["list"]) == sorted(a["area_name"] for a in areas))
empty = J(A.get(OFF + "reports/situation_report.php", params={"date_from": "2020-01-01", "date_to": "2020-01-31"}))
check("9i empty period handled: zeros + 'Not available in recorded data' notes",
      empty.get("success") and empty["reports"]["total"] == 0 and empty["reports"]["note"].startswith("Not available") and empty["sms"]["note"].startswith("Not available")
      and empty["affected_areas"]["note"].startswith("Not available"), {k: empty.get(k, {}).get("note") for k in ("reports", "sms", "affected_areas")})
check("9j bad period refused (400)", J(A.get(OFF + "reports/situation_report.php", params={"date_from": "2026-10-01", "date_to": "2026-09-01"}))["_status"] == 400)
check("9k unknown event (404) and injection-style id rejected", J(A.get(OFF + "reports/situation_report.php", params={"event_id": "999"}))["_status"] == 404
      and J(A.get(OFF + "reports/situation_report.php", params={"event_id": "1 OR 1=1"}))["_status"] == 400)

# ------------------------------------------------------------------ security / roles
check("SEC resident cannot open report / areas / events / save area (403)",
      all(J(x)["_status"] == 403 for x in [R8.get(OFF + "reports/situation_report.php", params={"event_id": EID}), R8.get(OFF + "hazards/areas/get_areas.php"),
                                           R8.get(OFF + "hazards/areas/get_affected_households.php"), R8.get(OFF + "disasters/events/get_events.php"),
                                           R8.post(OFF + "hazards/areas/save_area.php", json={"event_id": EID, "hazard_type": "Flood", "area_name": "x", "geojson": polyA})]))
check("SEC relief personnel can view areas/affected households but not record areas or report",
      J(P.get(ON + "hazards/areas/get_affected_households.php"))["_status"] == 200
      and J(P.post(ON + "hazards/areas/save_area.php", json={"event_id": EID, "hazard_type": "Flood", "area_name": "x", "geojson": polyA}))["_status"] == 403
      and J(P.get(ON + "reports/situation_report.php", params={"event_id": EID}))["_status"] == 403)
check("SEC not logged in -> 401", J(ANON.get(OFF + "hazards/areas/get_affected_households.php"))["_status"] == 401 and J(ANON.post(OFF + "sms/retry.php", json={"sms_id": 1}))["_status"] == 401)
check("SEC SMS status never returns the key", "key" not in json.dumps(J(AM.get(ON + "sms/status.php"))).lower().replace("api key", ""), "")

# ------------------------------------------------------------------ 11-13. ALLOCATION_APPROVED
st_off = J(A.get(OFF + "sms/status.php")); st_on = J(AM.get(ON + "sms/status.php"))
check("SMS status: OFF server says disabled, mock server says enabled",
      st_off["enabled"] is False and "SMS notifications are currently disabled." in st_off["message"] and st_on["enabled"] is True, (st_off, st_on))
items = dict(l.split("\t")[::-1] for l in sql("SELECT item_id, REPLACE(item_name,' [DEFENSE TEST]','') FROM relief_items").splitlines())
h06 = one("SELECT household_id FROM households WHERE head_of_family='Wilfredo Ocampo'")
r = J(A.post(OFF + "relief/create_allocation.php", {"household_id": int(h06), "item_id": int(items["Blanket"]), "quantity": 3}))
ALLOC = int(r.get("allocation_id") or one("SELECT MAX(allocation_id) FROM relief_allocations WHERE status='Pending'"))
check("10/11 setup: Pending allocation created for H06 (Blanket 3)", one(f"SELECT status FROM relief_allocations WHERE allocation_id={ALLOC}") == "Pending", r)
ap = J(A.post(OFF + "relief/approve_allocation.php", {"allocation_id": ALLOC}))
check("11 allocation approved (Pending -> Approved) with SMS disabled", ap.get("success") and one(f"SELECT status FROM relief_allocations WHERE allocation_id={ALLOC}") == "Approved", ap)
row = sql(f"SELECT status, event_type, allocation_id, household_id, category FROM sms_logs WHERE event_key='allocation:{ALLOC}:approved'").split("\t")
check("12 automated SMS event triggered: ALLOCATION_APPROVED logged with allocation and household IDs", row[1:5] == ["ALLOCATION_APPROVED", str(ALLOC), h06, "Relief Allocation Update"], row)
check("13 disabled SMS logged honestly as 'Not Configured' and message says 'SMS notifications are currently disabled.'",
      row[0] == "Not Configured" and "SMS notifications are currently disabled." in ap.get("message", ""), (row, ap.get("message")))
check("13b no gateway call while disabled", mock_calls() == 0, mock_calls())
dup = J(A.post(OFF + "relief/approve_allocation.php", {"allocation_id": ALLOC}))
check("16a repeated approval refused (409) and no second SMS log", dup["_status"] == 409 and one(f"SELECT COUNT(*) FROM sms_logs WHERE event_key='allocation:{ALLOC}:approved'") == "1")

# request flow on the mock gateway (success)
req8 = one("SELECT request_id FROM relief_requests r JOIN households h ON h.household_id=r.household_id WHERE h.head_of_family='Ernesto Dimaculangan'")
d = J(AM.get(ON + "requests/get_request_detail.php", params={"request_id": req8}))["data"]
lines = {i["item_name"].replace(" [DEFENSE TEST]", ""): i["request_item_id"] for i in d["items"]}
AM.post(ON + "requests/start_review.php", json={"request_id": int(req8)})
J(AM.post(ON + "requests/decide_request.php", {"request_id": int(req8), "decision": "approve", "remarks": "Phase 20 test", "items": [
    {"request_item_id": lines["Bottled Water"], "approved_quantity": 24}, {"request_item_id": lines["Family Food Pack"], "approved_quantity": 4},
    {"request_item_id": lines["Hygiene Kit"], "approved_quantity": 2}]}))
calls0 = mock_calls()
pr = J(AM.post(ON + "requests/process_request.php", {"request_id": int(req8)}))
row = sql(f"SELECT status, event_type, request_id, LEFT(message,200) FROM sms_logs WHERE event_key='request:{req8}:allocated'").split("\t")
check("11b Create Allocations -> ONE ALLOCATION_APPROVED SMS for the request, Accepted by Gateway (mock)", pr.get("success") and row[0] == "Accepted by Gateway" and row[1] == "ALLOCATION_APPROVED" and row[2] == req8, (pr.get("message"), row))
check("11c SMS lists the approved items; gateway called once", "Bottled Water [DEFENSE TEST] 24" in row[3] and mock_calls() == calls0 + 1, (row[3], mock_calls() - calls0))
check("11d provider response saved, API key not stored", one(f"SELECT provider_response FROM sms_logs WHERE event_key='request:{req8}:allocated'") != ""
      and "key" not in one(f"SELECT CONCAT(IFNULL(provider_response,''),IFNULL(error_message,'')) FROM sms_logs WHERE event_key='request:{req8}:allocated'").lower())
check("16b repeated Create Allocations refused (409), still one SMS, no extra gateway call",
      J(AM.post(ON + "requests/process_request.php", {"request_id": int(req8)}))["_status"] == 409
      and one(f"SELECT COUNT(*) FROM sms_logs WHERE event_key='request:{req8}:allocated'") == "1" and mock_calls() == calls0 + 1)

# ------------------------------------------------------------------ 14-15. ALLOCATION_DISTRIBUTED
# (a) TextBee failure: the direct allocation is distributed while the mock fails
open(FAIL_FLAG, "w").close()
stock_b = int(one(f"SELECT quantity FROM relief_items WHERE item_id={items['Blanket']}"))
dr = J(P.post(ON + "relief/distribute.php", {"allocation_id": ALLOC}))
os.remove(FAIL_FLAG)
check("14 distribution completed despite TextBee failure: Distributed, stock 10 -> 7, Stock Out logged",
      dr.get("success") and one(f"SELECT status FROM relief_allocations WHERE allocation_id={ALLOC}") == "Distributed"
      and int(one(f"SELECT quantity FROM relief_items WHERE item_id={items['Blanket']}")) == stock_b - 3
      and one(f"SELECT COUNT(*) FROM inventory_logs WHERE log_type='Stock Out' AND item_id={items['Blanket']}") == "1", dr)
frow = sql(f"SELECT sms_id, status, event_type, allocation_id, error_message FROM sms_logs WHERE event_key='allocation:{ALLOC}:distributed'").split("\t")
check("15a ALLOCATION_DISTRIBUTED SMS triggered and logged as Failed with the provider's reason (admin can see it)",
      frow[1:4] == ["Failed", "ALLOCATION_DISTRIBUTED", str(ALLOC)] and "500" in frow[4] and "could not be sent" in dr.get("message", ""), (frow, dr.get("message")))
check("16c repeated distribution refused (409); no new SMS row", J(P.post(ON + "relief/distribute.php", {"allocation_id": ALLOC}))["_status"] == 409
      and one(f"SELECT COUNT(*) FROM sms_logs WHERE event_key='allocation:{ALLOC}:distributed'") == "1")
# (b) safe retry
c1 = mock_calls()
rt = J(AM.post(ON + "sms/retry.php", {"sms_id": int(frow[0])}))
check("16d retry of the failed SMS: same row becomes Accepted by Gateway, attempts = 2, no new row",
      rt.get("success") and one(f"SELECT CONCAT(status,'/',attempts) FROM sms_logs WHERE sms_id={frow[0]}") == "Accepted by Gateway/2"
      and one(f"SELECT COUNT(*) FROM sms_logs WHERE event_key='allocation:{ALLOC}:distributed'") == "1" and mock_calls() == c1 + 1, rt)
check("16e retrying an already-Sent SMS is refused (no duplicate send)", J(AM.post(ON + "sms/retry.php", {"sms_id": int(frow[0])}))["_status"] == 409 and mock_calls() == c1 + 1)
nc = one("SELECT sms_id FROM sms_logs WHERE status='Not Configured' LIMIT 1")
check("16f retry while SMS is disabled is refused with the disabled message", "currently disabled" in J(A.post(OFF + "sms/retry.php", {"sms_id": int(nc)})).get("message", ""))
check("16g retry rejects bad ids", J(AM.post(ON + "sms/retry.php", {"sms_id": "1 OR 1=1"}))["_status"] == 400 and J(AM.post(ON + "sms/retry.php", {"sms_id": 999999}))["_status"] == 404)
# (c) request-linked: ONE SMS when the whole request is distributed
h04 = one("SELECT household_id FROM households WHERE head_of_family='Jerome Pascual'")
a04 = [a for a in J(P.get(ON + "relief/get_allocations.php"))["data"] if str(a["household_id"]) == h04 and a["status"] == "Approved"]
c2 = mock_calls()
msgs = [J(P.post(ON + "relief/distribute.php", {"allocation_id": int(a["allocation_id"])})).get("message", "") for a in a04]
req4 = one(f"SELECT request_id FROM relief_requests WHERE household_id={h04}")
check("15b H04 request distributed item by item -> exactly ONE SMS (when complete), Accepted by Gateway, ALLOCATION_DISTRIBUTED",
      len(a04) == 3 and one(f"SELECT COUNT(*) FROM sms_logs WHERE event_key='request:{req4}:distributed'") == "1"
      and one(f"SELECT CONCAT(status,'/',event_type,'/',request_id) FROM sms_logs WHERE event_key='request:{req4}:distributed'") == f"Accepted by Gateway/ALLOCATION_DISTRIBUTED/{req4}"
      and mock_calls() == c2 + 1 and "SMS accepted by the gateway" in msgs[-1], (msgs, mock_calls() - c2))

# ------------------------------------------------------------------ 9 again: report reflects the new state
rep2 = J(A.get(OFF + "reports/situation_report.php", params={"event_id": EID}))
check("9l report reflects updates: Distributed allocations 0 -> 4, H04 request Distributed, SMS counted",
      rep2["allocations"]["by_status"]["Distributed"]["count"] == 4 and rep2["requests"]["by_status"]["Distributed"] == 1 and rep2["sms"]["total"] >= 4,
      (rep2["allocations"]["by_status"], rep2["requests"]["by_status"], rep2["sms"]))

# ------------------------------------------------------------------ 17-20 regression of existing features
now = ranking()
check("17c DSS changes only through unmet needs (Phase 22): H08 79 -> 74 (approved relief covers 60%), H04 71 and H06 72 unchanged (coverage 60% / 20%), H01 36",
      now["Jerome Pascual"] == 71 and now["Ernesto Dimaculangan"] == 74 and now["Wilfredo Ocampo"] == 72 and now["Ramon Dizon"] == 36, now)
check("18 inventory: water 120 -> 102, food 20 -> 16, hygiene 6 -> 4 (H04 distributed once)",
      [int(one(f"SELECT quantity FROM relief_items WHERE item_id={items[n]}")) for n in ("Bottled Water", "Family Food Pack", "Hygiene Kit")] == [102, 16, 4])
check("19 existing map data still served (households, centers, schedules, hazard alerts)",
      all(J(A.get(OFF + p))["_status"] == 200 for p in ["households/get_households.php", "evacuation/get_centers.php", "relief/schedules/get_schedules.php", "hazards/alerts/get_alerts.php"]))
hh = next(h for h in J(A.get(OFF + "households/get_households.php"))["data"] if h["head_of_family"] == "Jerome Pascual")
check("19b existing boundary validation still refuses outside coordinates", J(A.put(OFF + "households/update_household.php", {**hh, "latitude": 13.30, "longitude": 123.90}))["_status"] == 400)
c = J(A.get(OFF + "evacuation/get_centers.php"))["data"][0]
J(A.post(OFF + "evacuation/update_occupancy.php", {"center_id": c["center_id"], "current_occupancy": 50}))
check("20 evacuation center still becomes Full at capacity", J(A.get(OFF + "evacuation/get_centers.php"))["data"][0]["status"] == "Full")
J(A.post(OFF + "evacuation/update_occupancy.php", {"center_id": c["center_id"], "current_occupancy": 18}))

# ------------------------------------------------------------------ integrity
fk = sql("""SELECT COUNT(*) FROM sms_logs s LEFT JOIN households h ON h.household_id=s.household_id WHERE s.household_id IS NOT NULL AND h.household_id IS NULL
            UNION ALL SELECT COUNT(*) FROM disaster_affected_areas a LEFT JOIN disaster_events e ON e.event_id=a.event_id WHERE e.event_id IS NULL""").split()
check("DB no orphan sms_logs.household_id / affected areas", fk == ["0", "0"], fk)
check("DB no duplicate successful SMS per event+number", one("SELECT COUNT(*) FROM (SELECT event_key, recipient_number FROM sms_logs WHERE event_key IS NOT NULL AND status IN ('Sent','Accepted by Gateway','Delivered') GROUP BY 1,2 HAVING COUNT(*)>1) x") == "0")
check("DB area delete keeps households", J(A.post(OFF + "hazards/areas/delete_area.php", {"area_id": rb["area_id"]})).get("success") and one("SELECT COUNT(*) FROM households") == "9")

print(f"\nPHASE 20 AUTOMATION TEST: {sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
