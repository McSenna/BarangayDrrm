#!/bin/bash
# Runs every automated suite of the complete system test on a FRESH LOCAL database and saves raw
# outputs to docs/test-results/. LOCAL TEST ENVIRONMENT ONLY — this script drops and recreates
# barangay_disaster_db and seedtest (via /home/claude/fresh_install.sh). Never run against real data.
# Needs: PHP API on :8080 (normal), :8081 (DB_NAME=seedtest), :8082 (display_errors=On),
# :8083 (PHP_CLI_SERVER_WORKERS=8), mock TextBee on :8090, Vite on :5173.
cd "$(dirname "$0")/.."; R=docs/test-results; mkdir -p $R
bash /home/claude/fresh_install.sh; PW=$(cat /tmp/adminpw)
python3 tests/full_test.py "$PW"              > $R/01_full_test.txt 2>&1
python3 tests/system_test_supplement.py "$PW" > $R/02_system_test_supplement.txt 2>&1
python3 tests/ui_session_test.py "$PW"        > $R/03_ui_session_test.txt 2>&1
python3 tests/concurrency_test.py "$PW"       > $R/04_concurrency_test.txt 2>&1
python3 tests/ui_responsive_test.py "$PW"     > $R/05_ui_responsive_test.txt 2>&1
python3 tests/error_leak_fuzz.py "$PW"        > $R/06_error_leak_fuzz.txt 2>&1
bash tests/seed_safety_test.sh                > $R/07_seed_safety_test.txt 2>&1
{ php database/seed_test_data_8_households.php --check; php database/seed_test_data_8_households.php; php database/seed_test_data_8_households.php
  echo "--- verify on the fully-tested database (:8080)"; python3 tests/verify_test_dataset.py; } > $R/08_seed_and_verify_tested_db.txt 2>&1
{ mysql -uroot -e "DROP DATABASE IF EXISTS seedtest; CREATE DATABASE seedtest"; mysql -uroot seedtest < database/barangay_disaster_db_FINAL.sql
  DB_NAME=seedtest php backend/setup_admin.php >/dev/null; DB_NAME=seedtest php backend/setup_demo_data.php >/dev/null
  DB_NAME=seedtest php database/seed_test_data_8_households.php
  echo "--- verify on a fresh demo database (:8081)"; python3 tests/verify_test_dataset.py http://127.0.0.1:8081/barangay-disaster/backend/; } > $R/09_seed_and_verify_fresh_db.txt 2>&1
python3 tests/ui_testdata_smoke.py           > $R/10_ui_testdata_smoke.txt 2>&1
php tests/dss_weighted_unit_test.php          > $R/dss_weighted_unit_test.txt 2>&1
php tests/purok_boundaries_unit_test.php      > $R/phase24_purok_boundaries_unit_test.txt 2>&1
node tests/purok_boundaries_js_test.mjs       > $R/phase24_purok_boundaries_js_test.txt 2>&1
php tests/flood_zones_unit_test.php            > $R/gis_flood_zones_unit_test.txt 2>&1
python3 tests/purok_geojson_validation_test.py > $R/phase24_purok_geojson_validation_test.txt 2>&1
python3 - > $R/11_integrity_seeded_dbs.txt 2>&1 <<'PY'
import subprocess
t = open('tests/system_test_supplement.py').read(); ns = {}
exec(t[t.index("I = ["):t.index("]\nfor name, q in I:") + 1], ns)
for db in ("barangay_disaster_db", "seedtest"):
    f = 0
    for n, q in ns['I']:
        v = subprocess.run(["mysql", "-uroot", "-N", db, "-e", q], capture_output=True, text=True).stdout.strip()
        print(("PASS " if v == "0" else "FAIL ") + f"[{db}] {n}" + ("" if v == "0" else f" = {v}")); f += v != "0"
    print(f"SUMMARY [{db}]: {len(ns['I']) - f}/{len(ns['I'])} passed")
PY
{ cd frontend && npm run build 2>&1 | tail -6; cd ..; echo "--- PHP lint"; n=0; f=0
  for x in $(git ls-files '*.php'); do n=$((n+1)); php -l "$x" >/dev/null 2>&1 || { f=$((f+1)); echo "LINT FAIL $x"; }; done; echo "PHP files linted: $n, errors: $f"; } > $R/12_build_and_lint.txt 2>&1
for f in $R/*.txt; do echo "$(basename $f): $(grep -E 'SUMMARY|requests sent|built in|PHP files linted|ROUTE VISITS|CHECKS:' $f | tr '\n' ' ')"; done > $R/00_SUMMARY.txt
cat $R/00_SUMMARY.txt
