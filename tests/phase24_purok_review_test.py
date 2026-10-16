"""
Phase 24 — Purok location review endpoint (households/purok_classification.php).

    python3 tests/phase24_purok_review_test.py <api> <rehearsal_db> <admin_email> <admin_password>

Needs a REHEARSAL database (name contains "rehearsal") with
barangay_disaster_db_FINAL.sql + an Administrator + defensedata_typhoon_flood.sql.
The test adds two synthetic households to that rehearsal DB only.
"""
import subprocess, sys, requests
if len(sys.argv) != 5 or "rehearsal" not in sys.argv[2]:
    sys.exit(__doc__)
API, DB, AE, AP = sys.argv[1].rstrip("/") + "/", sys.argv[2], sys.argv[3], sys.argv[4]
PW = "BinitayanTest2026!"
res = []
def check(n, c, d=""):
    res.append(bool(c)); print(("PASS " if c else "FAIL ") + n + ("" if c else f"  -> {str(d)[:300]}"))
def sql(q): return subprocess.run(["mysql", "-N", "-B", DB, "-e", q], capture_output=True, text=True).stdout.strip()
def sess(e, p):
    s = requests.Session(); r = s.post(API + "auth/login.php", json={"email": e, "password": p}); assert r.json().get("success"), r.text; return s
EP = API + "households/purok_classification.php"

# two synthetic households: one with a non-standard Purok spelling inside Purok 4, one with no coordinates
sql("INSERT INTO households (head_of_family, address, purok, number_of_members, latitude, longitude) VALUES "
    "('P24 Spelling Test', 'Test address [P24]', 'purok 4', 2, 13.1568, 123.7163), ('P24 No Coords', 'Test address [P24]', 'Purok 6', 3, NULL, NULL)")
snap = lambda: sql("SELECT GROUP_CONCAT(CONCAT_WS(':', household_id, purok, IFNULL(latitude,'-'), IFNULL(longitude,'-')) ORDER BY household_id) FROM households")
before = snap()

A = sess(AE, AP); P = sess("personnel.binitayan.test@gmail.com", PW); R = sess("binitayan.test04@gmail.com", PW)
audit_before = sql("SELECT COUNT(*) FROM audit_logs")  # after the logins (login is audit-logged)
r = A.get(EP); d = r.json()
check("admin can open the review (200)", r.status_code == 200 and d.get("success"), r.text[:200])
check("personnel can open the review (200)", P.get(EP).status_code == 200)
check("resident refused (403)", R.get(EP).status_code == 403)
check("anonymous refused (401)", requests.get(EP).status_code == 401)
check("POST refused (405)", A.post(EP, json={}).status_code == 405)
check("unknown Purok filter refused (400)", A.get(EP, params={"purok": "Purok 9"}).status_code == 400)
b = d["boundaries"]
check("8 boundaries reported, all 8 valid (Purok 1 after the approved end-vertex removal)", b["total"] == 8 and b["valid_count"] == 8, b)
check("mode is review_only with candidate note", b["classification_mode"] == "review_only" and "not an official survey" in b["note"])
H = {h["head_of_family"]: h for h in d["households"]}
check("H04 Jerome Pascual: match (Purok 4)", H["Jerome Pascual"]["status"] == "match" and H["Jerome Pascual"]["spatial_purok"] == "Purok 4", H["Jerome Pascual"])
for name, pk in [("Corazon Villanueva", "Purok 5A"), ("Wilfredo Ocampo", "Purok 5B"), ("Leonora Castillo", "Purok 6"), ("Ernesto Dimaculangan", "Purok 7")]:
    check(f"{name}: match ({pk})", H[name]["status"] == "match" and H[name]["spatial_purok"] == pk, H[name])
check("H02 Gloria Mendoza (stored Purok 2, location in Purok 3): mismatch flagged", H["Gloria Mendoza"]["status"] == "mismatch" and H["Gloria Mendoza"]["spatial_purok"] == "Purok 3", H["Gloria Mendoza"])
check("H01 / H03 near a Purok edge: on_boundary", H["Ramon Dizon"]["status"] == "on_boundary" and H["Eduardo Salazar"]["status"] == "on_boundary",
      (H["Ramon Dizon"], H["Eduardo Salazar"]))
check("non-standard spelling 'purok 4' inside Purok 4: match (comparison normalised)", H["P24 Spelling Test"]["status"] == "match", H["P24 Spelling Test"])
check("no-coordinate household: no_coordinates, not classified", H["P24 No Coords"]["status"] == "no_coordinates" and H["P24 No Coords"]["matches"] == [] and H["P24 No Coords"]["spatial_purok"] is None)
s = d["summary"]
check("summary counts add up to households", sum(v for k, v in s.items() if k != "households") == s["households"] == len(d["households"]), s)
f5 = A.get(EP, params={"purok": "Purok 5A"}).json()["households"]
check("?purok=Purok 5A lists only stored Purok 5A households", f5 and all(h["stored_purok"] == "Purok 5A" for h in f5), f5)
f5b = A.get(EP, params={"purok": "Purok 5B"}).json()["households"]
check("?purok=Purok 5B lists only stored Purok 5B households", f5b and all(h["stored_purok"] == "Purok 5B" for h in f5b), f5b)
check("no household record changed (stored Purok and coordinates identical)", snap() == before)
check("no audit or other writes from viewing the review", sql("SELECT COUNT(*) FROM audit_logs") == audit_before)
check("coordinate edits still validated by the server (outside barangay refused)",
      P.post(API + "households/update_coordinates.php", json={"household_id": 1, "latitude": "14.6", "longitude": "120.98"}).status_code == 400)
sql("DELETE FROM households WHERE address = 'Test address [P24]'")  # rehearsal DB only
print(f"\nPHASE 24 PUROK REVIEW TEST: {sum(res)}/{len(res)} passed")
sys.exit(0 if all(res) else 1)
