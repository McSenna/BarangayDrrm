"""
System audit — relief allocation scenario (500 affected households, 300 relief packs).

    python3 tests/audit/allocation_scenario_audit_test.py <api_sms_off> <api_sms_mock> <rehearsal_db>

Setup (REHEARSAL database only; name must contain "rehearsal"):
  barangay_disaster_db_FINAL.sql
  + users audit.admin1 / audit.admin2 (admin), audit.personnel (relief_personnel),
    audit.resident (resident), all with password AuditPass2026!
  + tests/audit/gen_500_household_scenario.py output (500 synthetic households,
    one relief item "Relief Pack [AUDIT]" with 300 packs, category Other = 1 pack per household).
  api_sms_mock: same database, TextBee pointed at the LOCAL mock gateway (no real SMS).

Each check prints PASS / FAIL. Lines marked FINDING record behaviour the audit
reports as a defect or gap. A FINDING line is not a test failure: it documents
what the system does today, and it is counted separately.
"""
import os, subprocess, sys, threading, datetime
import requests

if len(sys.argv) != 4 or "rehearsal" not in sys.argv[3]:
    sys.exit(__doc__)
OFF, ON, DB = sys.argv[1].rstrip("/") + "/", sys.argv[2].rstrip("/") + "/", sys.argv[3]
PW = "AuditPass2026!"
FAIL_FLAG = "/tmp/textbee_fail"
results, findings = [], []


def check(n, c, d=""):
    results.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ("" if c else f"  -> {str(d)[:400]}"))


def finding(fid, text):
    findings.append(fid); print(f"FINDING {fid}: {text}")


def sql(q):
    return subprocess.run(["mysql", "-N", "-B", DB, "-e", q], capture_output=True, text=True).stdout.strip()


def sess(base, email):
    s = requests.Session()
    r = s.post(base + "auth/login.php", json={"email": email, "password": PW})
    assert r.json().get("success"), (email, r.text)
    return s


A1, A2 = sess(OFF, "audit.admin1@example.test"), sess(OFF, "audit.admin2@example.test")
P, R = sess(OFF, "audit.personnel@example.test"), sess(OFF, "audit.resident@example.test")
AM = sess(ON, "audit.admin1@example.test")
ITEM = int(sql("SELECT item_id FROM relief_items WHERE item_name='Relief Pack [AUDIT]'"))
TOMORROW = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()

print("== S1. Recommendation for 500 households / 300 packs")
pl = A1.get(OFF + "dashboard/priority_list.php").json()["data"]
rec = A1.get(OFF + "dashboard/relief_recommendations.php").json()
summ = next(s for s in rec["item_summary"] if s["item_id"] == ITEM)
rows = [(h, r) for h in rec["data"] for r in h["recommendations"] if r["item_id"] == ITEM]
total_rec = sum(r["quantity_to_allocate"] for _, r in rows)
check("S1.1 recommended total never exceeds available stock (<= 300)", total_rec <= 300 and summ["total_recommended"] == total_rec, (total_rec, summ))
served = [h for h, r in rows if r["quantity_to_allocate"] > 0]
short = [h for h, r in rows if r["shortage"] > 0]
check("S1.2 exactly 300 households receive 1 pack; the rest are listed with their shortage",
      len(served) == 300 and len(short) == len(rows) - 300 and summ["shortage"] == len(rows) - 300, (len(served), len(short), summ["shortage"]))
ranks_served = sorted(h["rank"] for h in served)
ranks_short = sorted(h["rank"] for h in short)
check("S1.3 packs go strictly by DSS rank (every served household outranks every unserved one)", max(ranks_served) < min(ranks_short), (max(ranks_served), min(ranks_short)))
check("S1.4 every unserved household gets a written reason", all("not covered" in r["reason"] for h, r in rows if r["shortage"] > 0))
elig = [p for p in pl if p["eligible"]]
not_assessed = [p for p in pl if not p["eligible"]]
low = [p for p in elig if p["priority_level"] == "Low Priority"]
check("S1.5 households without a usable report stay listed as Not Assessed (not dropped)",
      len(not_assessed) == int(sql("SELECT COUNT(*) FROM households h WHERE NOT EXISTS (SELECT 1 FROM disaster_reports r WHERE r.household_id=h.household_id AND r.status<>'Rejected')"))
      and all(p["priority_level"] == "Not Assessed" for p in not_assessed), len(not_assessed))
check("S1.6 the 500 households are all in the priority list", len(pl) == 500, len(pl))
rec_ids = {h["household_id"] for h, _ in rows}
if low and not (rec_ids & {p["household_id"] for p in low}):
    finding("F-ALLOC-02", f"{len(low)} eligible Low-priority households (score < 40) are never offered a recommendation, "
            f"even for items that still have stock; {len(not_assessed)} Not Assessed households are not offered one either.")
by_purok = {}
for h in served:
    by_purok[h["purok"]] = by_purok.get(h["purok"], 0) + 1
need_purok = {}
for h, _ in rows:
    need_purok[h["purok"]] = need_purok.get(h["purok"], 0) + 1
print("     packs recommended by Purok (served / households needing):", {k: f"{by_purok.get(k, 0)}/{need_purok[k]}" for k in sorted(need_purok)})
check("S1.7 packs are NOT split equally by Purok (follow assessed need)", len(set(by_purok.values())) > 1, by_purok)
check("S1.8 viewing recommendations reserves nothing", sql("SELECT COUNT(*) FROM relief_allocations") == "0")

print("== S2. Manual allocation path (Add Allocation -> Approve)")
r = A1.post(OFF + "inventory/add_item.php", json={"item_name": "Hygiene Kit [AUDIT]", "category": "Hygiene", "quantity": 10, "unit": "kit", "minimum_level": 2})
KIT = int(sql("SELECT item_id FROM relief_items WHERE item_name='Hygiene Kit [AUDIT]'"))
low_h = low[0]["household_id"] if low else not_assessed[0]["household_id"]
a = A1.post(OFF + "relief/create_allocation.php", json={"household_id": low_h, "item_id": KIT, "quantity": 2}).json()
b = A1.post(OFF + "relief/create_allocation.php", json={"household_id": low_h, "item_id": KIT, "quantity": 2}).json()
both_pending = a.get("success") and b.get("success")
ra = A1.post(OFF + "relief/approve_allocation.php", json={"allocation_id": int(a["allocation_id"])}).json() if a.get("success") else {}
rb = A1.post(OFF + "relief/approve_allocation.php", json={"allocation_id": int(b["allocation_id"])}).json() if b.get("success") else {}
dups = int(sql(f"SELECT COUNT(*) FROM relief_allocations WHERE household_id={low_h} AND item_id={KIT} AND status='Approved'"))
check("S2.1 a second Pending allocation for the same household and item is refused, or its approval is refused",
      dups <= 1, f"two Pending created={both_pending}; approved twice: {ra.get('success')} / {rb.get('success')}; Approved rows={dups}")
if dups > 1:
    finding("F-ALLOC-01", f"Manual path creates DUPLICATE Approved allocations: household {low_h} now has {dups} Approved "
            "Hygiene Kit allocations (create_allocation.php has no duplicate check; approve_allocation.php does not re-check).")
r = P.post(OFF + "relief/create_allocation.php", json={"household_id": low_h, "item_id": KIT, "quantity": 1})
check("S2.2 Relief Personnel cannot create allocations (403)", r.status_code == 403, r.status_code)
reason = sql(f"SELECT recommendation_reason FROM relief_allocations WHERE household_id={low_h} AND item_id={KIT} LIMIT 1")
if reason in ("", "NULL"):
    finding("F-DSS-04", "Manually created allocations store no reason, DSS score or rank (recommendation_reason is NULL), "
            "so a later reviewer cannot see why that household was served out of DSS order.")
# exception path: a household the DSS does not recommend (Not Assessed) needs relief urgently
na = not_assessed[0]["household_id"]
r = A1.post(OFF + "relief/approve_recommendation.php", json={"household_id": na, "item_id": KIT, "quantity": 1})
plain_ok = r.status_code == 201
ov_exists = A1.post(OFF + "relief/emergency_override.php", json={}).status_code != 404
if plain_ok or not ov_exists:
    finding("F-DSS-02", "There is no explicit emergency override: an unrecommended household was approved through the ordinary "
            "approval with no stated reason and no override label.")
else:
    check("S2.3a ordinary approval of an unrecommended household is refused and points to the Emergency Override (409)",
          r.status_code == 409 and "Emergency Override" in r.json().get("message", ""), r.text[:200])
    r = A1.post(OFF + "relief/emergency_override.php", json={"household_id": na, "item_id": KIT, "quantity": 1, "reason": ""})
    check("S2.3b Emergency Override without a reason is refused (400)", r.status_code == 400, r.text[:150])
    r = A1.post(OFF + "relief/emergency_override.php", json={"household_id": na, "item_id": KIT, "quantity": 1,
                "reason": "Family found without food after landslide; verified on site by kagawad [AUDIT]"})
    oid = int(r.json().get("allocation_id") or 0)
    row = sql(f"SELECT CONCAT_WS('|', is_emergency_override, status, dss_category, IFNULL(dss_model_version,'-')) FROM relief_allocations WHERE allocation_id={oid}")
    check("S2.3c Emergency Override with a reason: Approved, labelled as override, DSS snapshot (Not Assessed) stored",
          r.status_code == 201 and row.startswith("1|Approved|Not Assessed|weighted-v1"), (r.text[:150], row))
    check("S2.3d the override is in the audit log with its reason",
          sql(f"SELECT COUNT(*) FROM audit_logs WHERE action='Emergency override allocation' AND details LIKE '%allocation_id: {oid},%' AND details LIKE '%verified on site%'") == "1")
    r = P.post(OFF + "relief/emergency_override.php", json={"household_id": na, "item_id": KIT, "quantity": 1, "reason": "Personnel trying an override [AUDIT]"})
    check("S2.3e Relief Personnel cannot use the Emergency Override (403)", r.status_code == 403, r.status_code)
    r = A1.post(OFF + "relief/emergency_override.php", json={"household_id": low_h, "item_id": KIT, "quantity": 999, "reason": "Testing that the override respects stock [AUDIT]"})
    check("S2.3f an override can never exceed available stock (409)", r.status_code == 409 and "available" in r.text, r.text[:150])

print("== S3. Two Administrators approving the same 300 packs at the same time")
order = [(h["household_id"]) for h, _ in rows]
outcome = {"ok": 0, "409": 0, "other": 0}
lock = threading.Lock()


def worker(s, ids):
    for hid in ids:
        r = s.post(OFF + "relief/approve_recommendation.php", json={"household_id": hid, "item_id": ITEM, "quantity": 1})
        with lock:
            outcome["ok" if r.status_code == 201 else "409" if r.status_code == 409 else "other"] += 1


t1 = threading.Thread(target=worker, args=(A1, order))
t2 = threading.Thread(target=worker, args=(A2, list(reversed(order))))
t1.start(); t2.start(); t1.join(); t2.join()
approved = int(sql(f"SELECT COALESCE(SUM(quantity),0) FROM relief_allocations WHERE item_id={ITEM} AND status='Approved'"))
dup_pairs = sql(f"SELECT COUNT(*) FROM (SELECT household_id FROM relief_allocations WHERE item_id={ITEM} AND status IN ('Pending','Approved') GROUP BY household_id HAVING COUNT(*)>1) x")
print(f"     {len(order) * 2} approval requests: {outcome}")
check("S3.1 total approved packs never exceed 300 under concurrent approval", approved <= 300, approved)
check("S3.2 exactly 300 packs approved (every pack used, none twice)", approved == 300 and outcome["ok"] == 300, (approved, outcome))
check("S3.3 no household received two packs (no duplicate household+item)", dup_pairs == "0", dup_pairs)
check("S3.4 refused approvals return 409 (not 500)", outcome["other"] == 0, outcome)
r = A1.post(OFF + "relief/approve_recommendation.php", json={"household_id": order[0], "item_id": ITEM, "quantity": 1})
check("S3.5 repeating an approval (double click / retry) is refused with 409", r.status_code == 409, r.status_code)
check("S3.6 Relief Personnel cannot approve (403)", P.post(OFF + "relief/approve_recommendation.php", json={"household_id": order[-1], "item_id": ITEM, "quantity": 1}).status_code == 403)
check("S3.7 Resident cannot approve (403)", R.post(OFF + "relief/approve_recommendation.php", json={"household_id": order[-1], "item_id": ITEM, "quantity": 1}).status_code == 403)
appr_sms = int(sql("SELECT COUNT(*) FROM sms_logs WHERE event_type='ALLOCATION_APPROVED'"))
if appr_sms:
    finding("F-SMS-01", f"Approval alone already produced {appr_sms} SMS attempts (event ALLOCATION_APPROVED; logged 'Not Configured' "
            "because SMS is off here). With SMS on, households are texted before readiness is confirmed.")
unserved = int(sql(f"SELECT COUNT(*) FROM households h WHERE NOT EXISTS (SELECT 1 FROM relief_allocations a WHERE a.household_id=h.household_id AND a.item_id={ITEM})"))
check("S3.8 unserved households remain identifiable (500 - 300 = 200 without a pack)", unserved == 200, unserved)

print("== S4. Stock can never go negative or below what is reserved")
r = A1.post(OFF + "inventory/stock_out.php", json={"item_id": ITEM, "quantity": 1, "reference": "audit"})
check("S4.1 Stock Out refused while all 300 packs are reserved", r.status_code in (400, 409), (r.status_code, r.text[:150]))
r = A1.post(OFF + "inventory/adjust_quantity.php", json={"item_id": ITEM, "new_quantity": 250, "reason": "audit"})
check("S4.2 Adjustment below the reserved 300 refused", r.status_code in (400, 409) and sql(f"SELECT quantity FROM relief_items WHERE item_id={ITEM}") == "300", r.text[:150])
check("S4.3 Personnel cannot change stock (403)", P.post(OFF + "inventory/stock_in.php", json={"item_id": ITEM, "quantity": 5}).status_code == 403)

print("== S5. Ready for Distribution and SMS (local mock gateway)")
ready_ids = [int(x) for x in sql(f"SELECT allocation_id FROM relief_allocations WHERE item_id={ITEM} AND status='Approved' ORDER BY allocation_id LIMIT 6").split()]
if os.path.exists(FAIL_FLAG): os.remove(FAIL_FLAG)
payload = lambda ids: {"allocation_ids": ids, "distribution_date": TOMORROW, "distribution_time": "09:00", "location": "Barangay Hall [AUDIT]", "instructions": "Bring a valid ID.", "confirmed": True}
r = AM.post(ON + "relief/mark_ready.php", json={**payload(ready_ids[:3]), "confirmed": False})
check("S5.1 Ready refused unless the schedule and location are confirmed", r.status_code == 400 and sql(f"SELECT COUNT(*) FROM relief_allocations WHERE ready_at IS NOT NULL") == "0")
r = AM.post(ON + "relief/mark_ready.php", json=payload(ready_ids[:3]))
sent = int(sql("SELECT COUNT(*) FROM sms_logs WHERE event_type='ALLOCATION_READY_FOR_DISTRIBUTION' AND status IN ('Sent','Accepted by Gateway')"))
check("S5.2 marking 3 allocations Ready queues one SMS per household, accepted by the gateway", r.status_code == 200 and sent == 3, (r.status_code, sent, r.text[:200]))
msg = sql("SELECT message FROM sms_logs WHERE event_type='ALLOCATION_READY_FOR_DISTRIBUTION' LIMIT 1")
check("S5.3 the SMS carries item, date, time, location and instructions, but no score or personal data",
      all(x in msg for x in ["Relief Pack", "9:00 AM", "Barangay Hall", "Bring a valid ID"]) and "score" not in msg.lower() and "Audit HH" not in msg, msg)
r = AM.post(ON + "relief/mark_ready.php", json=payload(ready_ids[:3]))
again = int(sql("SELECT COUNT(*) FROM sms_logs WHERE event_type='ALLOCATION_READY_FOR_DISTRIBUTION'"))
check("S5.4 repeating Ready (refresh / retry) is refused and sends no second SMS", r.status_code == 409 and again == 3, (r.status_code, again))
open(FAIL_FLAG, "w").close()
r = AM.post(ON + "relief/mark_ready.php", json=payload(ready_ids[3:4]))
failed = sql("SELECT sms_id FROM sms_logs WHERE event_type='ALLOCATION_READY_FOR_DISTRIBUTION' AND status='Failed' LIMIT 1")
check("S5.5 gateway failure: Ready status is kept, SMS logged Failed with the error", r.status_code == 200 and failed != ""
      and sql(f"SELECT ready_at IS NOT NULL FROM relief_allocations WHERE allocation_id={ready_ids[3]}") == "1", r.text[:200])
os.remove(FAIL_FLAG)
r = AM.post(ON + "sms/retry.php", json={"sms_id": int(failed or 0)})
check("S5.6 retry after the gateway recovers: same log row becomes accepted by the gateway, attempts = 2",
      r.status_code == 200 and sql(f"SELECT CONCAT(status,'/',attempts) FROM sms_logs WHERE sms_id={int(failed or 0)}") in ("Sent/2", "Accepted by Gateway/2"), (r.text[:200], sql(f"SELECT CONCAT(status,'/',attempts) FROM sms_logs WHERE sms_id={int(failed or 0)}")))
r = AM.post(ON + "sms/retry.php", json={"sms_id": int(failed or 0)})
check("S5.7 an accepted message cannot be retried again (no duplicate)", r.status_code in (400, 409), r.status_code)
bad_h = sql(f"SELECT household_id FROM relief_allocations WHERE allocation_id={ready_ids[4]}")
sql(f"UPDATE households SET contact_number='12345' WHERE household_id={bad_h}")  # rehearsal DB only
r = AM.post(ON + "relief/mark_ready.php", json=payload(ready_ids[4:5]))
st = sql(f"SELECT CONCAT(status,'|',error_message) FROM sms_logs WHERE household_id={bad_h} AND event_type='ALLOCATION_READY_FOR_DISTRIBUTION'")
check("S5.8 invalid contact number: logged Failed, never sent to the gateway", st.startswith("Failed|Invalid mobile number"), st)
check("S5.9 Resident cannot mark Ready (403)", R.post(OFF + "relief/mark_ready.php", json=payload(ready_ids[5:6])).status_code == 403)
cols = sql("SHOW COLUMNS FROM sms_logs")
if "delivered" not in cols.lower() and "provider_message_id" not in cols.lower():
    finding("F-SMS-02", "'Sent' means the TextBee API accepted the request (HTTP 2xx). No provider message ID or delivery "
            "receipt is stored, so actual delivery to the phone is never confirmed.")

print("== S6. Distribution and inventory reconciliation")
dist_ids = [int(x) for x in sql(f"SELECT allocation_id FROM relief_allocations WHERE item_id={ITEM} AND status='Approved' ORDER BY allocation_id LIMIT 40").split()]
ok = sum(1 for i in dist_ids if P.post(OFF + "relief/distribute.php", json={"allocation_id": i}).status_code == 200)
check("S6.1 Relief Personnel distributes 40 allocations", ok == 40, ok)
check("S6.2 distributing the same allocation again is refused (stock deducted once)", P.post(OFF + "relief/distribute.php", json={"allocation_id": dist_ids[0]}).status_code == 409)
stock = int(sql(f"SELECT quantity FROM relief_items WHERE item_id={ITEM}"))
ledger = int(sql(f"SELECT COALESCE(SUM(CASE WHEN log_type IN ('Stock In','Donation') THEN quantity_change WHEN log_type='Stock Out' THEN -ABS(quantity_change) ELSE 0 END),0) FROM inventory_logs WHERE item_id={ITEM}"))
check("S6.3 stock = opening 300 - 40 issued = 260, and equals the inventory ledger", stock == 260 and ledger == 260, (stock, ledger))
committed = int(sql(f"SELECT COALESCE(SUM(quantity),0) FROM relief_allocations WHERE item_id={ITEM} AND status='Approved'"))
check("S6.4 reconciliation: in stock (260) = still reserved (260); available = 0", committed == 260, committed)
check("S6.5 every distribution records who and when", sql(f"SELECT COUNT(*) FROM relief_allocations WHERE status='Distributed' AND (distributed_by IS NULL OR distributed_at IS NULL)") == "0")
cols = sql("SHOW COLUMNS FROM relief_allocations")
if "received_quantity" not in cols and "Cancelled" not in sql("SHOW COLUMNS FROM relief_allocations LIKE 'status'"):
    finding("F-ALLOC-03", "Allocations cannot be Cancelled or partially received: status is only Pending/Approved/Distributed, "
            "so packs reserved for an unreachable household stay reserved until the Administrator edits the database.")

print("== S7. Report totals across the Puroks")
sr = A1.get(OFF + "reports/situation_report.php", params={"date_from": "2026-09-01", "date_to": datetime.date.today().isoformat()}).json()
d = sr.get("data", sr)
bp = d["households"]["by_purok"]
expect = dict(l.split("\t") for l in sql("SELECT h.purok, COUNT(DISTINCT h.household_id) FROM households h JOIN disaster_reports r ON r.household_id=h.household_id AND r.status<>'Rejected' GROUP BY h.purok").splitlines())
check("S7.1 Situation Report affected households per Purok equal the database counts", {k: int(v) for k, v in expect.items()} == {k: int(v) for k, v in bp.items()}, (bp, expect))
check("S7.2 Purok totals add up to the overall affected total", sum(bp.values()) == d["households"]["total_affected"], (sum(bp.values()), d["households"]["total_affected"]))

print(f"\nFINDINGS RECORDED: {len(findings)} ({', '.join(findings)})")
print(f"AUDIT SCENARIO CHECKS: {sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
