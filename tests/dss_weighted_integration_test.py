"""
Phase 22 — weighted DSS integration test through the real PHP API.

    python3 tests/dss_weighted_integration_test.py <api_base> <db_containing_rehearsal> <admin_email> <admin_password>

The database must be loaded with barangay_disaster_db_FINAL.sql + an Administrator +
defense_scenarios/defensedata_typhoon_flood.sql (it CHANGES data; rehearsal copies only).
Every score is also recomputed independently in Python from the database rows
(the "manual calculation") and compared with the API.
"""
import math, subprocess, sys, datetime
import requests

if len(sys.argv) != 5 or "rehearsal" not in sys.argv[2]:
    sys.exit(__doc__)
B, DB, AE, AP = sys.argv[1].rstrip("/") + "/", sys.argv[2], sys.argv[3], sys.argv[4]
PW = "BinitayanTest2026!"
res = []


def check(name, ok, detail=""):
    res.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  -> {str(detail)[:400]}"))


def sql(q):
    out = subprocess.run(["mysql", "-N", "-B", DB, "-e", q], capture_output=True, text=True).stdout.strip()
    return [l.split("\t") for l in out.splitlines()] if out else []


def one(q):
    r = sql(q)
    return r[0][0] if r else ""


def login(e, p=PW):
    s = requests.Session()
    assert s.post(B + "auth/login.php", json={"email": e, "password": p}).json().get("success"), e
    return s


A = login(AE, AP)
P = login("personnel.binitayan.test@gmail.com")
R = login("binitayan.test06@gmail.com")
W = {"disaster_severity": 30, "damage_unmet_needs": 25, "vulnerable_members": 20, "household_size": 15, "assessment_confidence": 10}


def plist():
    return A.get(B + "dashboard/priority_list.php").json()


def by_name():
    return {r["head_of_family"]: r for r in plist()["data"]}


# ------------------------------------------------------------------ independent recomputation (manual calculation)
def ceil_div(a, b):
    return -(-a // b)


def manual(hid):
    h = sql(f"SELECT number_of_members, vulnerable_members, purok, latitude IS NOT NULL AND longitude IS NOT NULL, "
            f"(SELECT COUNT(*) FROM household_members m WHERE m.household_id=h.household_id) FROM households h WHERE household_id={hid}")[0]
    members, vuln, purok, coords, mrows = int(h[0]), int(h[1]), h[2], h[3] == "1", int(h[4])
    vuln = min(vuln, max(1, members))
    rep = sql(f"SELECT report_id, severity, status, report_date FROM disaster_reports WHERE household_id={hid} AND status<>'Rejected' "
              f"ORDER BY (status='Verified') DESC, FIELD(severity,'Critical','High','Medium','Low'), report_date DESC, report_id DESC LIMIT 1")
    if not rep:
        return None
    rid, sev, status, rdate = rep[0]
    alerts = [a[0] for a in sql("SELECT IFNULL(affected_purok,'') FROM hazard_alerts WHERE is_active=1")]
    norm = lambda p: p.replace("Purok ", "").strip().upper()
    hazard = any(a == "" or norm(a) == norm(purok) for a in alerts)
    S = min(5, {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}[sev] + (1 if hazard else 0))
    da = sql(f"SELECT house_damage, infrastructure_damage, property_damage, agricultural_damage FROM damage_assessments WHERE report_id={rid}")
    if da:
        house, *others = da[0]
        lvl = 5 if house == "Totally Damaged" else 4 if house == "Major" or "Totally Damaged" in others else 3 if "Major" in others \
            else 2 if house == "Minor" or "Minor" in others else 1
    else:
        lvl = 3
    got = dict((c, int(q)) for c, q in sql(
        f"SELECT i.category, SUM(a.quantity) FROM relief_allocations a JOIN relief_items i ON i.item_id=a.item_id "
        f"WHERE a.household_id={hid} AND a.status IN ('Approved','Distributed') AND a.allocation_date >= '{rdate}' GROUP BY i.category"))
    inv = [c[0] for c in sql("SELECT DISTINCT category FROM relief_items")]
    need = {"Food": ceil_div(members, 2), "Water": 3 * members, "Hygiene": 1, "Shelter": ceil_div(members, 3), "Medical": 1 if vuln > 0 else 0}
    ratios = [min(1, got.get(c, 0) / n) for c, n in need.items() if c in inv and n > 0]
    cov = sum(ratios) / len(ratios) if ratios else 0
    adj = 2 if cov >= 0.999 else 1 if cov >= 0.5 else 0
    D = max(1, lvl - adj)
    V = min(5, vuln + 1)
    H = 5 if members >= 8 else 4 if members >= 6 else 3 if members >= 4 else 2 if members >= 2 else 1
    complete = members >= 1 and coords and mrows == members
    ver = status == "Verified"
    C = (5 if complete else 4) if ver and da else 3 if ver else 2 if da else 1
    ratings = {"disaster_severity": S, "damage_unmet_needs": D, "vulnerable_members": V, "household_size": H, "assessment_confidence": C}
    return ratings, sum(r / 5 * W[k] for k, r in ratings.items())


def all_match():
    bad = []
    for r in plist()["data"]:
        m = manual(r["household_id"])
        if m is None:
            if r["priority_score"] is not None or r["eligible"]:
                bad.append((r["head_of_family"], "expected Not Assessed"))
        elif r["ratings"] != m[0] or abs(r["priority_score"] - m[1]) > 1e-9:
            bad.append((r["head_of_family"], r["ratings"], r["priority_score"], m))
    return bad


# ------------------------------------------------------------------ 1. shape and baseline
d = plist()
rows = d["data"]
check("1 every household has rank, score, category, assessment status, explanation, review flag and calculation time",
      all(all(k in r for k in ["rank", "priority_score", "priority_level", "assessment_status", "explanation", "needs_review", "calculated_at", "purok"]) for r in rows), rows[0])
check("1b five criteria with weights 30/25/20/15/10 and contribution = rating/5 x weight",
      all([(c["key"], c["weight"]) for c in r["criteria"]] == list(W.items()) and all(c["contribution"] == c["rating"] / 5 * c["weight"] for c in r["criteria"]) for r in rows if r["eligible"]))
check("1c score = sum of contributions, within 20-100", all(r["priority_score"] == sum(c["contribution"] for c in r["criteria"]) and 20 <= r["priority_score"] <= 100 for r in rows if r["eligible"]))
check("1d API scores equal the independent manual calculation for every household", not all_match(), all_match())
n = {r["head_of_family"]: (r["rank"], r["priority_score"], r["priority_level"]) for r in rows}
exp = {"Ernesto Dimaculangan": (1, 79, "High Priority"), "Leonora Castillo": (2, 76, "High Priority"), "Eduardo Salazar": (3, 72, "High Priority"),
       "Wilfredo Ocampo": (4, 72, "High Priority"), "Jerome Pascual": (5, 71, "High Priority"), "Corazon Villanueva": (6, 52, "Moderate Priority"),
       "Gloria Mendoza": (7, 49, "Moderate Priority"), "Ramon Dizon": (8, 36, "Low Priority")}
check("1e defense data ranking: 79, 76, 72, 72, 71, 52, 49, 36", n == exp, n)
check("1f tie-break: Salazar and Ocampo both 72 with equal ratings -> earlier report (Sep 28) ranks first", n["Eduardo Salazar"][0] < n["Wilfredo Ocampo"][0])
check("1g list sorted by rank", [r["rank"] for r in rows if r["eligible"]] == list(range(1, 9)))
h8 = by_name()["Ernesto Dimaculangan"]
check("1h unverified report flagged for manual review (H08), confidence rating 2", h8["needs_review"] and h8["ratings"]["assessment_confidence"] == 2
      and any("not yet verified" in x for x in h8["review_reasons"]), h8["review_reasons"])
check("1i explanation is concise and mentions severity, damage, needs, members", all(len(r["explanation"]) < 260 for r in rows) and "essential needs covered" in h8["explanation"])

# ------------------------------------------------------------------ 2. access and server-side only
check("2 resident cannot read the priority list (403)", R.get(B + "dashboard/priority_list.php").status_code == 403)
check("2b Relief Personnel can read it", P.get(B + "dashboard/priority_list.php").json().get("success"))
alloc0 = one("SELECT COUNT(*) FROM relief_allocations")
r = A.post(B + "dashboard/priority_list.php", json={"household_id": 1, "priority_score": 100, "ratings": {"disaster_severity": 5}})
check("2c scores sent by the browser are ignored (score still calculated from the database)",
      [x["priority_score"] for x in r.json()["data"]] == [x["priority_score"] for x in rows])
check("2d calculating priorities creates no allocation (no automatic approval)", one("SELECT COUNT(*) FROM relief_allocations") == alloc0)

# ------------------------------------------------------------------ 3. recommendations follow the rank
rec = A.get(B + "dashboard/relief_recommendations.php").json()["data"]
ranks = [x["rank"] for x in rec]
# Phase 25 (audit F-ALLOC-02): Low-priority households are no longer excluded; they are
# recommended LAST (after every higher-ranked household), only from stock that remains.
check("3 recommendations follow DSS rank order (Low included, served last; Not Assessed excluded)",
      ranks == sorted(ranks) and all(x["priority_level"] != "Not Assessed" for x in rec), [(x["head_of_family"], x["rank"]) for x in rec])
check("3b Low-priority household (Ramon Dizon, 36) is ranked after every higher-priority household",
      all(x["priority_level"] == "Low Priority" for x in rec if x["rank"] > min([y["rank"] for y in rec if y["priority_level"] == "Low Priority"] or [99])),
      [(x["head_of_family"], x["priority_level"]) for x in rec])

# ------------------------------------------------------------------ 4. missing information
r = A.post(B + "households/add_household.php", json={"head_of_family": "DSS Test Household", "purok": "Purok 2", "address": "Test lot", "number_of_members": 4,
                                                "children_count": 1, "seniors_count": 0, "latitude": "13.1555", "longitude": "123.7150"})
NEWH = int(r.json().get("household_id") or 0)
t = by_name().get("DSS Test Household", {})
check("4 household with no disaster report: Not Assessed, no score, not ranked (not given the lowest priority)",
      t.get("priority_level") == "Not Assessed" and t.get("priority_score") is None and t.get("rank") is None and t.get("needs_review"), t)
r = P.post(B + "disasters/create_report.php", json={"household_id": NEWH, "disaster_type": "Flood", "severity": "High", "location": "Purok 2",
                                                     "report_date": datetime.date.today().isoformat()})
NEWR = int(r.json().get("report_id") or 0)
t = by_name()["DSS Test Household"]
check("4b report recorded but not verified and not assessed: scored with provisional damage 3, confidence 1, flagged",
      t["eligible"] and t["ratings"]["damage_unmet_needs"] == 3 and t["ratings"]["assessment_confidence"] == 1 and t["needs_review"]
      and t["criteria"][1]["provisional"] and len(t["review_reasons"]) >= 2, t)
# 4 members, 1 vulnerable, member list empty (profile incomplete) -> S3 D3 V2 H3 C1 = 18+15+8+9+2 = 52
check("4c provisional score = 18 + 15 + 8 + 9 + 2 = 52 (Moderate)", t["priority_score"] == 52 and t["priority_level"] == "Moderate Priority", t["priority_score"])
check("4d incomplete household profile reported as a review reason", any("profile incomplete" in x for x in t["review_reasons"]), t["review_reasons"])
P.post(B + "disasters/save_damage_assessment.php", json={"report_id": NEWR, "house_damage": "Major", "infrastructure_damage": "None", "property_damage": "None",
                                                          "agricultural_damage": "None", "estimated_severity": "High", "remarks": "test"})
A.post(B + "disasters/verify_report.php", json={"report_id": NEWR, "remarks": "ok"})
t = by_name()["DSS Test Household"]
# verified + assessed, profile still incomplete -> C4; D = level 4 -> S3 D4 V2 H3 C4 = 18+20+8+9+8 = 63
check("4e after assessment and verification the score is recalculated: 18 + 20 + 8 + 9 + 8 = 63 (High), still flagged for the profile",
      t["priority_score"] == 63 and t["ratings"]["assessment_confidence"] == 4 and t["needs_review"], (t["priority_score"], t["ratings"]))
A.post(B + "disasters/reject_report.php", json={"report_id": NEWR, "remarks": "test cleanup"})
t = by_name()["DSS Test Household"]
check("4f rejected report is ignored: household back to Not Assessed", t["priority_level"] == "Not Assessed")

# ------------------------------------------------------------------ 5. recalculation when verified information changes
rid8 = int(one("SELECT report_id FROM disaster_reports r JOIN households h ON h.household_id=r.household_id WHERE h.head_of_family='Ernesto Dimaculangan'"))
A.post(B + "disasters/verify_report.php", json={"report_id": rid8, "remarks": "Verified"})
h8 = by_name()["Ernesto Dimaculangan"]
check("5 verifying H08's report: confidence 2 -> 5, score 79 -> 85 Critical, no longer flagged",
      (h8["priority_score"], h8["priority_level"], h8["needs_review"]) == (85, "Critical Priority", False), (h8["priority_score"], h8["review_reasons"]))
rid1 = int(one("SELECT report_id FROM disaster_reports r JOIN households h ON h.household_id=r.household_id WHERE h.head_of_family='Ramon Dizon'"))
orig = sql(f"SELECT house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, IFNULL(remarks,'') FROM damage_assessments WHERE report_id={rid1}")[0]
P.post(B + "disasters/save_damage_assessment.php", json={"report_id": rid1, "house_damage": "Totally Damaged", "infrastructure_damage": "None", "property_damage": "None",
                                                         "agricultural_damage": "None", "estimated_severity": "High", "remarks": "test"})
h1 = by_name()["Ramon Dizon"]
check("5b damage assessment changed (house Totally Damaged): H01 36 -> 6 + 25 + 4 + 6 + 10 = 51", h1["priority_score"] == 51, h1["priority_score"])
P.post(B + "disasters/save_damage_assessment.php", json=dict(zip(["house_damage", "infrastructure_damage", "property_damage", "agricultural_damage", "estimated_severity", "remarks"], orig), report_id=rid1))
check("5c assessment restored: H01 back to 36", by_name()["Ramon Dizon"]["priority_score"] == 36)

# hazard alert raises severity by one level
a = A.post(B + "hazards/alerts/add_alert.php", json={"hazard_type": "Flood", "status": "Alert", "title": "Test Purok 2 alert", "affected_purok": "Purok 2"}).json()
h2 = by_name()["Gloria Mendoza"]
check("5d active Purok 2 hazard alert: severity rating 2 -> 3, score 49 -> 55", (h2["ratings"]["disaster_severity"], h2["priority_score"]) == (3, 55), h2["ratings"])
A.post(B + "hazards/alerts/update_status.php", json={"alert_id": int(a.get("alert_id")), "resolve": True})
check("5e alert resolved: back to 49", by_name()["Gloria Mendoza"]["priority_score"] == 49)

# unmet essential needs: approved relief covering 60% of H02's needs lowers the damage/needs rating by 1
hid2 = int(one("SELECT household_id FROM households WHERE head_of_family='Gloria Mendoza'"))
items = dict((n, int(i)) for i, n in sql("SELECT item_id, category FROM relief_items WHERE item_name LIKE 'Family Food Pack%' OR item_name LIKE 'Bottled Water%' OR item_name LIKE 'Hygiene Kit%'"))
for cat, q in [("Food", 2), ("Water", 12), ("Hygiene", 1)]:
    al = A.post(B + "relief/create_allocation.php", json={"household_id": hid2, "item_id": items[cat], "quantity": q, "allocation_date": datetime.date.today().isoformat()}).json()
    A.post(B + "relief/approve_allocation.php", json={"allocation_id": int(al["allocation_id"])})
h2 = by_name()["Gloria Mendoza"]
check("5f approved relief covers 3 of 5 essential categories (60%): damage/needs 2 -> 1, score 49 -> 44 (Moderate)",
      (h2["unmet_needs"]["coverage_percent"], h2["ratings"]["damage_unmet_needs"], h2["priority_score"]) == (60, 1, 44), (h2["unmet_needs"], h2["ratings"]))
check("5g after all changes, API scores still equal the manual calculation", not all_match(), all_match())

print(f"\nDSS WEIGHTED INTEGRATION TEST: {sum(res)}/{len(res)} passed")
sys.exit(0 if all(res) else 1)
