"""Phase 24 — independent geometry check of the candidate Purok GeoJSON with
Shapely (pip install shapely). Read-only. Usage: python3 tests/purok_geojson_validation_test.py"""
import json, subprocess, sys, tempfile, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = tempfile.mktemp(suffix=".json")
subprocess.run([sys.executable, "-W", "ignore", os.path.join(root, "docs/purok_boundaries/validate_purok_geojson.py"), "--json", out], check=True, capture_output=True)
r = json.load(open(out)); res = []
def ok(c, m): res.append(c); print(("PASS " if c else "FAIL ") + m)
f = {x["name"]: x for x in r["features"]}
ok(list(f) == ["Purok 1", "Purok 2", "Purok 3", "Purok 4", "Purok 5A", "Purok 5B", "Purok 6", "Purok 7"], "eight features with the correct names")
ok(all(x["ring_closed"] for x in f.values()), "every ring is closed")
ok(all(x["lnglat_order_ok"] for x in f.values()), "every position is [longitude, latitude]")
ok(all(x["valid"] for x in f.values()), "Shapely: all eight Puroks valid (Purok 1 after the approved end-vertex removal)")
ok(all(x["outside_barangay_m2"] == 0 for x in f.values()), "no Purok extends outside the barangay boundary")
ok(r["summary"]["overlaps"] == 0, "no overlaps between Purok polygons (> 0.5 m2)")
print(f"     barangay area not covered by any valid Purok: {r['summary']['barangay_not_covered_by_any_purok_m2']:,.0f} m2 ({r['summary']['barangay_not_covered_pct']}%)")
print(f"\nPUROK GEOJSON VALIDATION TEST: {sum(res)}/{len(res)} passed")
sys.exit(0 if all(res) else 1)
