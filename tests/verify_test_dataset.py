"""Verify the seeded 8-household TEST dataset through the real API (read-mostly).
Usage: python3 tests/verify_test_dataset.py [base_url]   (default http://127.0.0.1:8080/barangay-disaster/backend/)
Only reads data and logs in; it does not change records (logins add login_history rows)."""
import sys, json, requests
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080/barangay-disaster/backend/"
PW = "BinitayanTest2026!"
res = []
def check(n, ok, d=""):
    res.append((n, ok)); print(("PASS " if ok else "FAIL ") + n + ("" if ok else f" -> {str(d)[:250]}"))
def login(email):
    s = requests.Session(); r = s.post(BASE + "auth/login.php", json={"email": email, "password": PW}); return s, r.json()
admin, r = login("admin.binitayan.test@gmail.com"); check("test admin logs in (role admin)", r.get("success") and r["user"]["role"] == "admin", r)
per, r = login("personnel.binitayan.test@gmail.com"); check("test personnel logs in (role relief_personnel)", r.get("success") and r["user"]["role"] == "relief_personnel", r)
residents = {}
for i in range(1, 9):
    s, r = login(f"binitayan.test{i:02d}@gmail.com"); residents[f"H{i}"] = s
    check(f"resident H{i} logs in", r.get("success") and r["user"]["role"] == "resident", r)
pl = {h["head_of_family"]: h for h in admin.get(BASE + "dashboard/priority_list.php").json()["data"]}
heads = ["Rogelio Abenojar", "Teresita Llagas", "Danilo Barcena", "Arnel Cabrera", "Felisa Navarro", "Rodrigo Villafuerte", "Lourdes Ibarrientos", "Efren Dela Rosa"]
print("\nDSS (live):")
for i, hd in enumerate(heads, 1):
    h = pl[hd]; r = h.get("ratings") or {}
    print(f"  H{i} {hd:22} {h['purok']:9} S{r.get('disaster_severity')} D{r.get('damage_unmet_needs')} V{r.get('vulnerable_members')} H{r.get('household_size')} C{r.get('assessment_confidence')} = {h['priority_score']} {h['priority_level']:17} rank {h['rank']} review {h['needs_review']} vuln {h['vulnerability_score']} {h['vulnerability_level']}")
# Phase 22 weighted DSS (score 0-100)
check("DSS produces all four priority categories across the 8 test households", {pl[h]["priority_level"] for h in heads} == {"Low Priority", "Moderate Priority", "High Priority", "Critical Priority"}, {h: pl[h]["priority_level"] for h in heads})
cov = {i: pl[hd]["unmet_needs"]["coverage_percent"] for i, hd in enumerate(heads, 1)}
check("unmet needs: relief already received counted (H1 distributed 25%, H3 approved 40%), others 0%", cov[1] == 25 and cov[3] == 40 and all(cov[i] == 0 for i in (2, 4, 5, 6, 7, 8)), cov)
check("exactly the 5 weighted criteria (Estimated Severity and request urgency are not criteria)", all([c["key"] for c in pl[h]["criteria"]] == ["disaster_severity", "damage_unmet_needs", "vulnerable_members", "household_size", "assessment_confidence"] for h in heads))
check("H8 rejected duplicate report ignored (selected report is the verified Critical one, confidence 5)", pl["Efren Dela Rosa"]["latest_report_status"] == "Verified" and pl["Efren Dela Rosa"]["ratings"]["assessment_confidence"] == 5)
check("missing information flagged for manual review, not scored lowest (H1, H5, H7)", all(pl[heads[i - 1]]["needs_review"] and pl[heads[i - 1]]["ratings"]["damage_unmet_needs"] >= 2 for i in (1, 5, 7)))
for i in range(1, 9):
    hh = residents[f"H{i}"].get(BASE + "households/get_households.php").json()["data"]
    check(f"resident H{i} sees only own household", len(hh) == 1 and hh[0]["head_of_family"] == heads[i - 1], [x["head_of_family"] for x in hh])
items = {x["item_name"]: x for x in admin.get(BASE + "inventory/get_items.php").json()["data"] if "[TEST]" in x["item_name"]}
print("\nInventory:", {k: (v["quantity"], int(v["committed_quantity"]), v["low_stock"]) for k, v in items.items()})
check("6 [TEST] items; Hygiene Kit and First Aid Kit flagged low stock", len(items) == 6 and items["Hygiene Kit [TEST]"]["low_stock"] and items["First Aid Kit [TEST]"]["low_stock"])
check("Rice [TEST] = 48 after H1 distribution; Water committed 18 by H3 allocation", items["Rice [TEST]"]["quantity"] == 48 and int(items["Bottled Water [TEST]"]["committed_quantity"]) == 18)
reqs = {r["head_of_family"] if "head_of_family" in r else r["household_id"]: r["status"] for r in admin.get(BASE + "requests/get_requests.php").json()["data"]}
print("\nRequests:", reqs)
check("request statuses varied (Pending, Under Review, Rejected, Allocated, Distributed)", {"Pending", "Under Review", "Rejected", "Allocated", "Distributed"} <= set(reqs.values()))
rq = {r["head_of_family"]: r for r in admin.get(BASE + "requests/get_requests.php").json()["data"] if "head_of_family" in r}
det = admin.get(BASE + "requests/get_request_detail.php", params={"request_id": rq["Efren Dela Rosa"]["request_id"]}).json()["data"]
fa = next(i for i in det["items"] if i["item_name"] == "First Aid Kit [TEST]")
check("H8 review screen: First Aid Kit requested 3, available 2, shortage 1", fa["requested_quantity"] == 3 and fa["available_stock"] == 2 and fa["shortage"] == 1, fa)
# Phase 21: resident feedback and evacuation-center API are retired / staff-only
check("residents cannot use the retired feedback API (403)", residents["H1"].get(BASE + "feedback/get_my_deliveries.php").status_code == 403)
check("residents cannot read the evacuation-center API (403)", residents["H3"].get(BASE + "evacuation/get_centers.php").status_code == 403)
c = per.get(BASE + "evacuation/get_centers.php").json()["data"]
check("personnel see both test evacuation centers", {x["name"] for x in c} >= {"Binitayan Test Evacuation Center A", "Binitayan Test Evacuation Center B"})
st = {x["name"]: x["status"] for x in c}; check("Center A Open, Center B Full", st.get("Binitayan Test Evacuation Center A") == "Open" and st.get("Binitayan Test Evacuation Center B") == "Full", st)
s = per.get(BASE + "relief/schedules/get_schedules.php").json()["data"]
check("test personnel sees the assigned [TEST] schedule with 2 Pending beneficiaries", any(x["package_name"] == "Family Relief Pack [TEST]" and x["beneficiary_counts"]["Pending"] == 2 for x in s), s)
rec = admin.get(BASE + "dashboard/relief_recommendations.php").json()["data"]
sh = sum(it["shortage"] for h in rec for it in h["recommendations"] if "[TEST]" in it["item_name"])
check("DSS recommendations show a shortage on scarce [TEST] stock", sh > 0, sh)
n = residents["H4"].get(BASE + "notifications/get_notifications.php").json()
check("seed sent no notifications (direct inserts)", n.get("unread_count") == 0 and len(n.get("data", [])) == 0, n.get("unread_count"))
print(f"\nSUMMARY: {sum(1 for _, ok in res if ok)}/{len(res)} passed")
