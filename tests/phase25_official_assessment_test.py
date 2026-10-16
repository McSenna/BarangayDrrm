"""
Phase 25 test — official-led assessment, DSS accountability, allocation
corrections, honest SMS statuses and security hardening.

    python3 tests/phase25_official_assessment_test.py <api_sms_off> <api_sms_mock> <db> <admin_email> <admin_password>

  api_sms_off  : backend URL with TextBee OFF
  api_sms_mock : same database, TextBee ON pointed at the LOCAL MOCK gateway
                 (/home/claude/mock; fails while /tmp/textbee_fail exists). No real SMS.
  db           : a REHEARSAL database (name must contain "rehearsal") loaded with
                 barangay_disaster_db_FINAL.sql (Phase 25) + an Administrator
                 + defense_scenarios/defensedata_typhoon_flood.sql (synthetic data).
"""
import concurrent.futures as cf
import datetime, glob, os, re, subprocess, sys
import requests

if len(sys.argv) != 6 or "rehearsal" not in sys.argv[3]:
    sys.exit(__doc__)
OFF, ON, DB, AE, AP = sys.argv[1].rstrip("/") + "/", sys.argv[2].rstrip("/") + "/", sys.argv[3], sys.argv[4], sys.argv[5]
PW = "BinitayanTest2026!"
FAIL_FLAG = "/tmp/textbee_fail"
TODAY = datetime.date.today()
res = []


def check(n, c, d=""):
    res.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ("" if c else f"  -> {str(d)[:400]}"))


def sql(q):
    return subprocess.run(["mysql", "-N", "-B", DB, "-e", q], capture_output=True, text=True).stdout.strip()


def one(q):
    v = sql(q); return v.splitlines()[0] if v else ""


def sess(base, e, p):
    s = requests.Session(); r = s.post(base + "auth/login.php", json={"email": e, "password": p})
    assert r.json().get("success"), (e, r.text); return s


if os.path.exists(FAIL_FLAG): os.remove(FAIL_FLAG)
TABLES = ["users", "households", "household_members", "disaster_reports", "damage_assessments", "relief_items", "hazard_alerts", "evacuation_centers"]
before = {t: one(f"SELECT COUNT(*) FROM {t}") for t in TABLES}
A, AM = sess(OFF, AE, AP), sess(ON, AE, AP)
P, PM = sess(OFF, "personnel.binitayan.test@gmail.com", PW), sess(ON, "personnel.binitayan.test@gmail.com", PW)
R = sess(OFF, "binitayan.test04@gmail.com", PW)
HH = {n: int(one(f"SELECT household_id FROM households WHERE head_of_family='{n}'")) for n in
      ["Ramon Dizon", "Gloria Mendoza", "Eduardo Salazar", "Jerome Pascual", "Corazon Villanueva", "Wilfredo Ocampo", "Leonora Castillo", "Ernesto Dimaculangan"]}
add_item = lambda name, cat, qty, unit="pack": (A.post(OFF + "inventory/add_item.php", json={"item_name": name, "category": cat, "quantity": qty, "unit": unit, "minimum_level": 1}),
                                               int(one(f"SELECT item_id FROM relief_items WHERE item_name='{name}'")))[1]
stock = lambda i: int(one(f"SELECT quantity FROM relief_items WHERE item_id={i}"))
reserved = lambda i: int(one(f"SELECT COALESCE(SUM(quantity),0) FROM relief_allocations WHERE item_id={i} AND status='Approved'"))
sms_n = lambda: int(one("SELECT COUNT(*) FROM sms_logs"))

print("== 0. Migration / schema")
cols = sql("SHOW COLUMNS FROM relief_allocations")
check("0.1 allocation snapshot / override / cancel / receipt columns exist",
      all(c in cols for c in ["dss_score", "dss_category", "dss_rank", "dss_ratings", "dss_model_version", "is_emergency_override", "override_reason", "cancel_reason", "received_quantity"]))
check("0.2 status 'Cancelled' and SMS statuses 'Queued' / 'Accepted by Gateway' / 'Delivered' available",
      "Cancelled" in one("SHOW COLUMNS FROM relief_allocations LIKE 'status'") and "Accepted by Gateway" in one("SHOW COLUMNS FROM sms_logs LIKE 'status'"))
bad = subprocess.run(["mysql", DB, "-e", f"INSERT INTO relief_allocations (household_id,item_id,quantity,status,allocation_date,is_emergency_override) VALUES ({HH['Ramon Dizon']}, (SELECT MIN(item_id) FROM relief_items), 1, 'Pending', CURDATE(), 1)"], capture_output=True, text=True)
check("0.3 database refuses an emergency override without a reason (CHECK)", bad.returncode != 0, bad.stdout)

print("== 1. Duplicate allocation prevention (F-ALLOC-01)")
KIT = add_item("P25 Kit [TEST]", "Hygiene", 10, "kit")
h = HH["Ramon Dizon"]
r1 = A.post(OFF + "relief/create_allocation.php", json={"household_id": h, "item_id": KIT, "quantity": 1, "reason": "P25 test"})
r2 = A.post(OFF + "relief/create_allocation.php", json={"household_id": h, "item_id": KIT, "quantity": 1})
check("1.1 manual Add Allocation: first 201, duplicate refused with 409", r1.status_code == 201 and r2.status_code == 409 and "already has" in r2.json()["message"], (r1.status_code, r2.text[:200]))
check("1.2 manual allocation stores its reason", one(f"SELECT recommendation_reason FROM relief_allocations WHERE allocation_id={r1.json().get('allocation_id', 0)}").startswith("Manual allocation"))
check("1.3 quantity above available stock refused (409)", A.post(OFF + "relief/create_allocation.php", json={"household_id": HH["Gloria Mendoza"], "item_id": KIT, "quantity": 11}).status_code == 409)
check("1.4 non-numeric / zero input refused (400)", A.post(OFF + "relief/create_allocation.php", json={"household_id": "1abc", "item_id": KIT, "quantity": 1}).status_code == 400
      and A.post(OFF + "relief/create_allocation.php", json={"household_id": h, "item_id": KIT, "quantity": 0}).status_code == 400)
# a legacy duplicate Pending row (created before Phase 25) cannot be approved twice
sql(f"INSERT INTO relief_allocations (household_id,item_id,quantity,status,allocation_date) VALUES ({h},{KIT},1,'Pending',CURDATE())")
legacy = int(one("SELECT MAX(allocation_id) FROM relief_allocations"))
a1 = A.post(OFF + "relief/approve_allocation.php", json={"allocation_id": r1.json()["allocation_id"]})
a2 = A.post(OFF + "relief/approve_allocation.php", json={"allocation_id": legacy})
check("1.5 approving a second Pending duplicate is refused with 409 (only one Approved)", a1.status_code == 200 and a2.status_code == 409
      and one(f"SELECT COUNT(*) FROM relief_allocations WHERE household_id={h} AND item_id={KIT} AND status='Approved'") == "1", (a1.text[:120], a2.text[:160]))
A.post(OFF + "relief/cancel_allocation.php", json={"allocation_id": legacy, "reason": "Legacy duplicate removed in test"})
h2 = HH["Gloria Mendoza"]
with cf.ThreadPoolExecutor(8) as ex:
    codes = list(ex.map(lambda _: A.post(OFF + "relief/create_allocation.php", json={"household_id": h2, "item_id": KIT, "quantity": 1}).status_code, range(8)))
check("1.6 8 simultaneous Add Allocation requests for the same household/item create exactly one", codes.count(201) == 1 and codes.count(409) == 7
      and one(f"SELECT COUNT(*) FROM relief_allocations WHERE household_id={h2} AND item_id={KIT} AND status IN ('Pending','Approved')") == "1", codes)

print("== 2. SMS only when Ready (F-SMS-01), honest statuses")
n0, notif0 = sms_n(), int(one("SELECT COUNT(*) FROM notifications"))
pend = int(one(f"SELECT allocation_id FROM relief_allocations WHERE household_id={h2} AND item_id={KIT} AND status='Pending'"))
r = AM.post(ON + "relief/approve_allocation.php", json={"allocation_id": pend})
rec = AM.get(ON + "dashboard/relief_recommendations.php").json()
pair = next((hh, it) for hh in rec["data"] for it in hh["recommendations"] if it["quantity_to_allocate"] > 0)
r2 = AM.post(ON + "relief/approve_recommendation.php", json={"household_id": pair[0]["household_id"], "item_id": pair[1]["item_id"], "quantity": pair[1]["quantity_to_allocate"]})
check("2.1 approvals (Add Allocation and DSS recommendation) create NO SMS, even with TextBee on", r.status_code == 200 and r2.status_code == 201 and sms_n() == n0, (r.text[:100], r2.text[:100], sms_n() - n0))
check("2.2 approvals still create in-app notifications", int(one("SELECT COUNT(*) FROM notifications")) >= notif0 + 1)
appr_id = r2.json()["allocation_id"]
DAY = (TODAY + datetime.timedelta(days=1)).isoformat()
ready = lambda s, base, ids: s.post(base + "relief/mark_ready.php", json={"allocation_ids": ids, "distribution_date": DAY, "distribution_time": "08:30", "location": "Barangay Hall [TEST]", "instructions": "Bring the household card.", "confirmed": True})
rr = ready(AM, ON, [appr_id])
row = sql(f"SELECT status, provider_message_id FROM sms_logs WHERE allocation_id={appr_id} AND event_type='ALLOCATION_READY_FOR_DISTRIBUTION'").split("\t")
check("2.3 Ready queues the SMS and records it as 'Accepted by Gateway' with the provider's ID (never 'Delivered')",
      rr.status_code == 200 and row[0] == "Accepted by Gateway" and row[1].startswith("mock-"), (rr.text[:200], row))
check("2.4 response wording does not claim delivery", "not confirmed" in rr.json()["message"], rr.json()["message"])
check("2.5 no SMS log anywhere is marked Delivered", one("SELECT COUNT(*) FROM sms_logs WHERE status='Delivered'") == "0")
n1 = sms_n()
check("2.6 Ready again (refresh / retry) refused, no second SMS", ready(AM, ON, [appr_id]).status_code == 409 and sms_n() == n1)
dd = PM.post(ON + "relief/distribute.php", json={"allocation_id": appr_id})
check("2.7 distribution creates no SMS (no duplicate readiness SMS)", dd.status_code == 200 and sms_n() == n1, (dd.text[:120], sms_n() - n1))
# household contact preferred over the resident account's own number
hh5 = HH["Corazon Villanueva"]
sql(f"UPDATE households SET contact_number='09170000555' WHERE household_id={hh5}")
sql(f"UPDATE users u JOIN households h ON h.user_id=u.user_id SET u.contact_number='09170000999' WHERE h.household_id={hh5}")
ov = A.post(OFF + "relief/emergency_override.php", json={"household_id": hh5, "item_id": KIT, "quantity": 1, "reason": "Contact preference test — urgent need verified [TEST]"})
ready(AM, ON, [ov.json()["allocation_id"]])
check("2.8 the SMS goes to the household's recorded contact first (not the account's own number)",
      one(f"SELECT recipient_number FROM sms_logs WHERE allocation_id={ov.json()['allocation_id']}") == "09170000555")
# queue survives a gateway failure; Send now from the log
open(FAIL_FLAG, "w").close()
ov2 = A.post(OFF + "relief/emergency_override.php", json={"household_id": HH["Wilfredo Ocampo"], "item_id": KIT, "quantity": 1, "reason": "Gateway failure test — urgent need verified [TEST]"})
ready(AM, ON, [ov2.json()["allocation_id"]])
failed = one(f"SELECT CONCAT(sms_id,'|',status) FROM sms_logs WHERE allocation_id={ov2.json()['allocation_id']}")
os.remove(FAIL_FLAG)
sid = int(failed.split("|")[0]) if failed else 0
rt = AM.post(ON + "sms/retry.php", json={"sms_id": sid})
check("2.9 gateway down: logged Failed; retry later: same row Accepted by Gateway, attempts 2",
      failed.endswith("|Failed") and rt.status_code == 200 and one(f"SELECT CONCAT(status,'/',attempts) FROM sms_logs WHERE sms_id={sid}") == "Accepted by Gateway/2", (failed, rt.text[:150]))
sql(f"INSERT INTO sms_logs (recipient_type, recipient_name, recipient_number, message, category, status, sent_by) VALUES ('Custom','Queue test','09171234567','Queued test [TEST]','General','Queued',NULL)")
qid = int(one("SELECT MAX(sms_id) FROM sms_logs"))
rq = AM.post(ON + "sms/retry.php", json={"sms_id": qid})
check("2.10 a message left Queued (interrupted request) can be sent from SMS Logs", rq.status_code == 200 and one(f"SELECT status FROM sms_logs WHERE sms_id={qid}") == "Accepted by Gateway", rq.text[:150])
check("2.11 an accepted message cannot be sent again (409)", AM.post(ON + "sms/retry.php", json={"sms_id": qid}).status_code == 409)

print("== 3. Emergency override (F-DSS-02)")
FOOD = add_item("P25 Food Pack [TEST]", "Food", 6)
na_hh = int(one("SELECT h.household_id FROM households h WHERE NOT EXISTS (SELECT 1 FROM disaster_reports r WHERE r.household_id=h.household_id) LIMIT 1") or 0)
if not na_hh:
    A.post(OFF + "households/add_household.php", json={"head_of_family": "P25 Unassessed Family", "purok": "Purok 3", "address": "P25 test address", "number_of_members": 4, "contact_number": "09171112222", "latitude": "", "longitude": ""})
    na_hh = int(one("SELECT household_id FROM households WHERE head_of_family='P25 Unassessed Family'"))
ap = A.post(OFF + "relief/approve_recommendation.php", json={"household_id": na_hh, "item_id": FOOD, "quantity": 1})
check("3.1 ordinary approval of a household the DSS does not recommend is refused, pointing to the override (409)", ap.status_code == 409 and ap.json().get("code") == "no_recommendation", ap.text[:150])
for name, payload, code in [("3.2 no reason", {"reason": ""}, 400), ("3.3 reason too short", {"reason": "urgent"}, 400)]:
    check(f"{name} -> {code}", A.post(OFF + "relief/emergency_override.php", json={"household_id": na_hh, "item_id": FOOD, "quantity": 2, **payload}).status_code == code)
check("3.4 Relief Personnel cannot override (403)", P.post(OFF + "relief/emergency_override.php", json={"household_id": na_hh, "item_id": FOOD, "quantity": 2, "reason": "Personnel attempt [TEST] long enough"}).status_code == 403)
check("3.5 Resident cannot override (403)", R.post(OFF + "relief/emergency_override.php", json={"household_id": na_hh, "item_id": FOOD, "quantity": 2, "reason": "Resident attempt [TEST] long enough"}).status_code == 403)
s0 = stock(FOOD)
o = A.post(OFF + "relief/emergency_override.php", json={"household_id": na_hh, "item_id": FOOD, "quantity": 2, "reason": "Family of 4 found without food after the landslide; verified by Kagawad [TEST]"})
oid = o.json().get("allocation_id", 0)
row = one(f"SELECT CONCAT_WS('|', status, is_emergency_override, dss_category, IFNULL(dss_score,'null'), dss_model_version, approved_by IS NOT NULL, approved_at IS NOT NULL) FROM relief_allocations WHERE allocation_id={oid}")
check("3.6 override (unassessed household): Approved, labelled, reason, DSS snapshot 'Not Assessed', approver and time",
      o.status_code == 201 and row.startswith("Approved|1|Not Assessed|null|weighted-v1") and row.endswith("|1|1"), (o.text[:150], row))
check("3.7 override is in the audit log with the reason", one(f"SELECT COUNT(*) FROM audit_logs WHERE action='Emergency override allocation' AND details LIKE '%allocation_id: {oid},%' AND details LIKE '%verified by Kagawad%'") == "1")
check("3.8 override reserves stock but does not deduct it", stock(FOOD) == s0 and reserved(FOOD) == 2)
check("3.9 override can never exceed available stock (409)", A.post(OFF + "relief/emergency_override.php", json={"household_id": HH["Ernesto Dimaculangan"], "item_id": FOOD, "quantity": 5, "reason": "Exceeds available stock check [TEST]"}).status_code == 409)
check("3.10 override still obeys the one-active-allocation rule (409)", A.post(OFF + "relief/emergency_override.php", json={"household_id": na_hh, "item_id": FOOD, "quantity": 1, "reason": "Second override for same item [TEST]"}).status_code == 409)
sr = A.get(OFF + "reports/situation_report.php", params={"date_from": (TODAY - datetime.timedelta(days=30)).isoformat(), "date_to": TODAY.isoformat()}).json()
ovs = (sr.get("data") or sr)["allocations"].get("emergency_overrides", [])
check("3.11 overrides are listed with their reasons in the Situation Report", any(x["allocation_id"] == oid and "Kagawad" in x["reason"] for x in ovs), ovs[:2])

print("== 4. DSS snapshot on every approval path (F-DSS-04)")
snap = lambda aid: one(f"SELECT CONCAT_WS('|', IFNULL(dss_score,'null'), dss_category, IFNULL(dss_rank,'null'), dss_ratings IS NOT NULL, dss_model_version) FROM relief_allocations WHERE allocation_id={aid}")
pl = {p["household_id"]: p for p in A.get(OFF + "dashboard/priority_list.php").json()["data"]}
s_rec = snap(appr_id).split("|")
exp = pl[pair[0]["household_id"]]
check("4.1 DSS recommendation approval stores score, category, rank, ratings and model version", s_rec[1] == exp["priority_level"] and s_rec[3] == "1" and s_rec[4].startswith("weighted-v1"), (s_rec, exp["priority_score"]))
s_man = snap(pend).split("|")
check("4.2 Add Allocation -> Approve stores the snapshot too", s_man[1] in ("Low Priority", "Moderate Priority", "High Priority", "Critical Priority") and s_man[4].startswith("weighted-v1"), s_man)
RQ_HH = int(one("SELECT h.household_id FROM households h WHERE EXISTS (SELECT 1 FROM disaster_reports r WHERE r.household_id=h.household_id AND r.status<>'Rejected') "
                "AND NOT EXISTS (SELECT 1 FROM relief_requests q WHERE q.household_id=h.household_id AND q.status NOT IN ('Distributed','Rejected')) ORDER BY h.household_id LIMIT 1"))
req = A.post(OFF + "requests/create_request.php", json={"household_id": RQ_HH, "urgency": "High", "reason": "P25 test request [TEST]", "items": [{"item_id": FOOD, "quantity": 1}]})
rid = req.json().get("request_id")
A.post(OFF + "requests/start_review.php", json={"request_id": rid})
lines = A.get(OFF + "requests/get_request_detail.php", params={"request_id": rid}).json()["data"]["items"]
A.post(OFF + "requests/decide_request.php", json={"request_id": rid, "decision": "approve", "remarks": "ok", "items": [{"request_item_id": lines[0]["request_item_id"], "approved_quantity": 1}]})
pr = A.post(OFF + "requests/process_request.php", json={"request_id": rid})
aid = pr.json().get("allocation_ids", [0])[0]
s_req = snap(aid).split("|")
check("4.3 relief-request path stores the snapshot", pr.status_code in (200, 201) and s_req[1] == pl[RQ_HH]["priority_level"] and s_req[0] == str(pl[RQ_HH]["priority_score"]), (pr.text[:150], s_req))
check("4.4 relief-request processing sent no SMS", one(f"SELECT COUNT(*) FROM sms_logs WHERE request_id={rid}") == "0")

print("== 5. Cancellation and partial receipt (F-ALLOC-03)")
cx_id = aid  # approved via request, 1 Food pack reserved
r0, st0, led0 = reserved(FOOD), stock(FOOD), one(f"SELECT COUNT(*) FROM inventory_logs WHERE item_id={FOOD}")
check("5.1 cancel without a reason refused (400)", A.post(OFF + "relief/cancel_allocation.php", json={"allocation_id": cx_id, "reason": ""}).status_code == 400)
check("5.2 Relief Personnel cannot cancel (403)", P.post(OFF + "relief/cancel_allocation.php", json={"allocation_id": cx_id, "reason": "Personnel attempt"}).status_code == 403)
with cf.ThreadPoolExecutor(4) as ex:
    cc = list(ex.map(lambda _: A.post(OFF + "relief/cancel_allocation.php", json={"allocation_id": cx_id, "reason": "Household relocated outside the barangay [TEST]"}).status_code, range(4)))
check("5.3 4 simultaneous cancel requests: exactly one succeeds, the rest 409", cc.count(200) == 1 and cc.count(409) == 3, cc)
check("5.4 cancelling releases the reservation; stock and ledger unchanged; record kept with reason, user and time",
      reserved(FOOD) == r0 - 1 and stock(FOOD) == st0 and one(f"SELECT COUNT(*) FROM inventory_logs WHERE item_id={FOOD}") == led0
      and one(f"SELECT CONCAT_WS('|',status,cancel_reason IS NOT NULL,cancelled_by IS NOT NULL,cancelled_at IS NOT NULL) FROM relief_allocations WHERE allocation_id={cx_id}") == "Cancelled|1|1|1")
check("5.5 a cancelled allocation cannot be marked Ready or distributed (409)", ready(A, OFF, [cx_id]).status_code == 409
      and P.post(OFF + "relief/distribute.php", json={"allocation_id": cx_id}).status_code == 409)
check("5.6 a distributed allocation cannot be cancelled (409)", A.post(OFF + "relief/cancel_allocation.php", json={"allocation_id": appr_id, "reason": "Trying to cancel a distributed one"}).status_code == 409)
check("5.7 cancellation is in the audit log", one(f"SELECT COUNT(*) FROM audit_logs WHERE action='Relief allocation cancelled' AND details LIKE '%allocation_id: {cx_id},%'") == "1")
# partial receipt on the override (2 packs reserved)
s1, res1 = stock(FOOD), reserved(FOOD)
check("5.8 received more than allocated refused (400)", P.post(OFF + "relief/distribute.php", json={"allocation_id": oid, "received_quantity": 3, "remarks": "x"}).status_code == 400)
check("5.9 partial receipt without a remark refused (400)", P.post(OFF + "relief/distribute.php", json={"allocation_id": oid, "received_quantity": 1}).status_code == 400)
check("5.10 received 0 refused (cancel instead) (400)", P.post(OFF + "relief/distribute.php", json={"allocation_id": oid, "received_quantity": 0, "remarks": "none"}).status_code == 400)
pr_ = P.post(OFF + "relief/distribute.php", json={"allocation_id": oid, "received_quantity": 1, "remarks": "Only 1 pack left at the site [TEST]"})
check("5.11 partial receipt 1 of 2: stock -1 only, the other unit released, received_quantity recorded",
      pr_.status_code == 200 and stock(FOOD) == s1 - 1 and reserved(FOOD) == res1 - 2
      and one(f"SELECT CONCAT(status,'/',received_quantity) FROM relief_allocations WHERE allocation_id={oid}") == "Distributed/1", (pr_.text[:150],))
check("5.12 the Stock Out ledger row is for the received quantity (1)", one(f"SELECT quantity_change FROM inventory_logs WHERE item_id={FOOD} AND reference LIKE '%allocation #{oid},%'") == "-1")
check("5.13 distributing again is refused (stock deducted once)", P.post(OFF + "relief/distribute.php", json={"allocation_id": oid}).status_code == 409 and stock(FOOD) == s1 - 1)
rc = A.get(OFF + "reports/inventory_reconciliation.php").json()
food = next(i for i in rc["items"] if i["item_id"] == FOOD)
check("5.14 reconciliation: stock = ledger, distributed received = distribution Stock Out, reserve within stock", food["reconciled"] and food["distributed_received"] == 1 and food["shortfall_from_partial_receipts"] == 1, food)
check("5.15 reconciliation for every item in the defense data", rc["summary"]["items_with_differences"] == 0, [i["notes"] for i in rc["items"] if not i["reconciled"]])
check("5.16 residents cannot read the reconciliation (403)", R.get(OFF + "reports/inventory_reconciliation.php").status_code == 403)

print("== 6. Fair sharing preview (F-ALLOC-04) and visibility (F-ALLOC-02)")
FP = add_item("P25 Scarce Food [TEST]", "Food", 5)
full = A.get(OFF + "dashboard/relief_recommendations.php", params={"mode": "full_need"}).json()
mini = A.get(OFF + "dashboard/relief_recommendations.php", params={"mode": "minimum_share"}).json()
f_sum = next(i for i in full["item_summary"] if i["item_id"] == FP)
m_sum = next(i for i in mini["item_summary"] if i["item_id"] == FP)
check("6.1 default mode is full_need; neither mode recommends more than the 5 available", full["mode"] == "full_need" and f_sum["total_recommended"] <= 5 and m_sum["total_recommended"] <= 5, (f_sum, m_sum))
check("6.2 minimum-share-first reaches at least as many households", m_sum["households_reached"] >= f_sum["households_reached"] and m_sum["households_reached"] == min(5, m_sum["households_requesting"]), (f_sum["households_reached"], m_sum["households_reached"]))
qty_by_hh = lambda d: {h["household_id"]: it["quantity_to_allocate"] for h in d["data"] for it in h["recommendations"] if it["item_id"] == FP}
check("6.3 coverage preview matches the recommendations (households reached)", sum(1 for v in qty_by_hh(mini).values() if v > 0) == m_sum["households_reached"]
      and {c["item_id"]: c["households_reached"] for c in full["coverage_preview"]["minimum_share"]}[FP] == m_sum["households_reached"])
mq = qty_by_hh(mini)
served = [h["rank"] for h in mini["data"] if mq.get(h["household_id"], 0) > 0]
unserved = [h["rank"] for h in mini["data"] if h["household_id"] in mq and mq[h["household_id"]] == 0]
check("6.4 minimum share still follows DSS rank (served households outrank unserved)", not unserved or max(served) < min(unserved), (served, unserved))
check("6.5 unserved households and shortage are shown", m_sum["shortage"] == m_sum["total_requested"] - 5 and (m_sum["households_requesting"] - m_sum["households_reached"]) == len(unserved))
check("6.6 households without an assessment are listed under assess_first, not hidden",
      any(x["household_id"] == na_hh for x in full["assess_first"]) and "approved by the barangay DRRM" in full["policy_note"])
lows = [p for p in A.get(OFF + "dashboard/priority_list.php").json()["data"] if p["priority_level"] == "Low Priority"]
check("6.7 Low-priority households now appear in recommendations", not lows or any(h["household_id"] == lows[0]["household_id"] for h in full["data"]), [p["head_of_family"] for p in lows])

print("== 7. Official / paper assessment encoding")
base = {"household_id": HH["Ramon Dizon"], "disaster_type": "Flood", "location": "Purok 1 riverside", "description": "Paper form encoded [TEST]",
        "report_date": (TODAY - datetime.timedelta(days=3)).isoformat(), "report_time": "07:15", "severity": "High",
        "reported_needs": "Food,Water", "displacement_status": "Staying with Relatives", "field_assessor": "Purok 1 leader [TEST]"}
r = P.post(OFF + "disasters/create_report.php", json={**base, "collection_method": "Paper Form"})
check("7.1 paper form without a form number refused (400)", r.status_code == 400 and "form number" in r.json()["message"], r.text[:150])
r = P.post(OFF + "disasters/create_report.php", json={**base, "collection_method": "Paper Form", "paper_form_no": "p1-0007"})
rid1 = r.json().get("report_id", 0)
row = one(f"SELECT CONCAT_WS('|', report_date, DATE(created_at), collection_method, paper_form_no, displacement_status, field_assessor, user_id IS NOT NULL) FROM disaster_reports WHERE report_id={rid1}")
check("7.2 paper form encoded by Relief Personnel: original assessment date and encoding date kept separately, form no. normalised",
      r.status_code == 201 and row == f"{base['report_date']}|{TODAY}|Paper Form|P1-0007|Staying with Relatives|Purok 1 leader [TEST]|1", (r.text[:150], row))
r = A.post(OFF + "disasters/create_report.php", json={**base, "household_id": HH["Gloria Mendoza"], "collection_method": "Paper Form", "paper_form_no": "P1-0007"})
check("7.3 the same paper form number cannot be encoded twice (409)", r.status_code == 409 and r.json().get("code") == "duplicate_paper_form", r.text[:150])
r = P.post(OFF + "disasters/create_report.php", json={**base, "collection_method": "Field Visit"})
check("7.4 same household + date + type: possible duplicate flagged (409), nothing saved", r.status_code == 409 and r.json().get("code") == "possible_duplicate"
      and one(f"SELECT COUNT(*) FROM disaster_reports WHERE household_id={HH['Ramon Dizon']} AND report_date='{base['report_date']}'") == "1", r.text[:150])
r = P.post(OFF + "disasters/create_report.php", json={**base, "collection_method": "Field Visit", "confirm_not_duplicate": True})
check("7.5 after confirming it is a different assessment, it is saved and the confirmation is audit-logged", r.status_code == 201
      and one(f"SELECT COUNT(*) FROM audit_logs WHERE action='Disaster report recorded' AND details LIKE '%report_id: {r.json().get('report_id')},%' AND details LIKE '%NOT a duplicate%'") == "1")
check("7.6 resident still cannot submit reports (403)", R.post(OFF + "disasters/create_report.php", json=base).status_code == 403)
check("7.7 unknown collection method refused (400)", P.post(OFF + "disasters/create_report.php", json={**base, "report_date": TODAY.isoformat(), "collection_method": "SMS"}).status_code == 400)
up = A.post(OFF + "disasters/update_report.php", json={**base, "report_id": rid1, "displacement_status": "In Evacuation Center", "collection_method": "Paper Form", "paper_form_no": "P1-0007"})
check("7.8 update keeps the form number and records updated_at", up.status_code == 200 and one(f"SELECT CONCAT(displacement_status,'|',updated_at IS NOT NULL) FROM disaster_reports WHERE report_id={rid1}") == "In Evacuation Center|1", up.text[:150])
check("7.9 a report with no resident account behind the household is fine (official-led)",
      one(f"SELECT COUNT(*) FROM disaster_reports r JOIN users u ON u.user_id=r.user_id WHERE r.report_id={rid1} AND u.role='relief_personnel'") == "1")

print("== 8. Security hardening")
import random
bad_email = f"p25.lock.{random.randint(1000, 9999)}@example.test"
codes = [requests.post(OFF + "auth/login.php", json={"email": bad_email, "password": "wrong"}).status_code for _ in range(9)]
check("8.1 after 8 failed sign-ins the address is temporarily locked (429)", codes[:8] == [401] * 8 and codes[8] == 429, codes)
evil = requests.Session(); evil.cookies.update(A.cookies)
r = evil.post(OFF + "relief/cancel_allocation.php", json={"allocation_id": pend, "reason": "cross-site attempt"}, headers={"Origin": "http://evil.example"})
check("8.2 a state-changing request from another site's page is refused (403)", r.status_code == 403 and one(f"SELECT status FROM relief_allocations WHERE allocation_id={pend}") != "Cancelled", r.status_code)
r = A.post(OFF + "relief/create_allocation.php", json={"household_id": HH["Jerome Pascual"], "item_id": KIT, "quantity": 1}, headers={"Origin": "http://localhost:5173"})
check("8.3 the configured frontend origin is still allowed", r.status_code == 201, r.text[:120])
idle = sess(OFF, "binitayan.test06@gmail.com", PW)
sid = idle.cookies.get("PHPSESSID")
files = glob.glob(f"/var/lib/php/sessions/sess_{sid}")
if files:
    data = open(files[0]).read()
    open(files[0], "w").write(re.sub(r"last_activity\|i:\d+;", f"last_activity|i:{int(datetime.datetime.now().timestamp()) - 31 * 60};", data))
    check("8.4 a session idle for 31 minutes is ended on the server (401)", idle.get(OFF + "relief/get_allocations.php").status_code == 401)
else:
    check("8.4 server idle timeout (session file not found — cannot run here)", False, "session storage not visible to the test")
for ep, body in [("relief/create_allocation.php", {"household_id": h, "item_id": KIT, "quantity": 1}), ("relief/approve_allocation.php", {"allocation_id": pend}),
                 ("relief/cancel_allocation.php", {"allocation_id": pend, "reason": "nope nope"}), ("relief/emergency_override.php", {"household_id": h, "item_id": KIT, "quantity": 1, "reason": "nope nope nope"})]:
    check(f"8.5 Relief Personnel refused on {ep} (403)", P.post(OFF + ep, json=body).status_code == 403)
    check(f"8.6 Resident refused on {ep} (403)", R.post(OFF + ep, json=body).status_code == 403)
check("8.7 residents do not receive staff-only DSS / override fields", not any(k in a for a in R.get(OFF + "relief/get_allocations.php").json()["data"] for k in ("dss_score", "override_reason", "recommendation_reason")))

print("== 9. Existing records intact")
after = {t: one(f"SELECT COUNT(*) FROM {t}") for t in TABLES}
grow = {"relief_items": 3, "disaster_reports": 2, "households": 1 if one("SELECT COUNT(*) FROM households WHERE head_of_family='P25 Unassessed Family'") == "1" else 0}
for t in TABLES:
    check(f"9 {t}: {before[t]} -> {after[t]}", int(after[t]) == int(before[t]) + grow.get(t, 0))
print(f"\nPHASE 25 TEST: {sum(res)}/{len(res)} passed")
sys.exit(0 if all(res) else 1)
