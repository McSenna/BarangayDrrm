#!/bin/bash
# Seed safety test for database/seed_test_data_8_households.php (LOCAL throwaway databases only).
# Builds a fresh demo DB, then checks: --check mode, create, idempotent re-run, partial-conflict abort,
# forced mid-transaction failure rollback, and that every pre-existing row is unchanged.
set -u
cd "$(dirname "$0")/.."
T=$(mktemp -d); pass=0; fail=0
ok() { echo "PASS $1"; pass=$((pass+1)); }; ko() { echo "FAIL $1"; fail=$((fail+1)); }
fresh() { mysql -uroot -e "DROP DATABASE IF EXISTS $1; CREATE DATABASE $1"; mysql -uroot $1 < "$T/before.sql"; }
mysql -uroot -e "DROP DATABASE IF EXISTS seedsafe_base; CREATE DATABASE seedsafe_base"
mysql -uroot seedsafe_base < database/barangay_disaster_db_FINAL.sql
DB_NAME=seedsafe_base php backend/setup_admin.php >/dev/null; DB_NAME=seedsafe_base php backend/setup_demo_data.php >/dev/null
mysqldump -uroot --skip-dump-date --skip-extended-insert seedsafe_base > "$T/before.sql"
fresh seedsafe1
out=$(DB_NAME=seedsafe1 php database/seed_test_data_8_households.php --check); [[ "$out" == CHECK\ ONLY* ]] && [ "$(mysql -uroot -N seedsafe1 -e 'select count(*) from users')" = "$(mysql -uroot -N seedsafe_base -e 'select count(*) from users')" ] && ok "--check reports and changes nothing" || ko "--check: $out"
out=$(DB_NAME=seedsafe1 php database/seed_test_data_8_households.php); [[ "$out" == TEST\ DATA\ CREATED* ]] && ok "create: dataset created" || ko "create: $out"
c1=$(mysql -uroot -N seedsafe1 -e "select (select count(*) from users)+(select count(*) from households)+(select count(*) from relief_items)+(select count(*) from disaster_reports)+(select count(*) from relief_requests)")
out=$(DB_NAME=seedsafe1 php database/seed_test_data_8_households.php); c2=$(mysql -uroot -N seedsafe1 -e "select (select count(*) from users)+(select count(*) from households)+(select count(*) from relief_items)+(select count(*) from disaster_reports)+(select count(*) from relief_requests)")
[[ "$out" == TEST\ DATA\ ALREADY\ EXISTS* ]] && [ "$c1" = "$c2" ] && ok "re-run: ALREADY EXISTS, no duplicates ($c1 = $c2 rows)" || ko "re-run: $out ($c1 vs $c2)"
mysqldump -uroot --skip-dump-date --skip-extended-insert seedsafe1 > "$T/after.sql"
changed=$(python3 -c "
b=[l for l in open('$T/before.sql') if l.startswith('INSERT')]; a=set(l for l in open('$T/after.sql') if l.startswith('INSERT'))
print(sum(1 for l in b if l not in a), len(b))")
set -- $changed; [ "$1" = "0" ] && ok "all $2 pre-existing rows byte-for-byte unchanged" || ko "$1 of $2 pre-existing rows changed"
fresh seedsafe2; mysql -uroot seedsafe2 -e "INSERT INTO users (full_name,email,password,role) VALUES ('Existing','binitayan.test03@gmail.com','x','resident')"
u1=$(mysql -uroot -N seedsafe2 -e "select count(*) from users"); out=$(DB_NAME=seedsafe2 php database/seed_test_data_8_households.php); rc=$?; u2=$(mysql -uroot -N seedsafe2 -e "select count(*) from users")
[ $rc -ne 0 ] && [[ "$out" == ABORT* ]] && [ "$u1" = "$u2" ] && ok "partial conflict: aborts, nothing changed" || ko "partial conflict: rc=$rc $out"
fresh seedsafe3; mysql -uroot seedsafe3 -e "CREATE TRIGGER boom BEFORE INSERT ON distribution_beneficiaries FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='forced failure'"
DB_NAME=seedsafe3 php database/seed_test_data_8_households.php >/dev/null 2>&1; rc=$?
n=$(mysql -uroot -N seedsafe3 -e "select count(*) from users where email like '%binitayan.test%'; select count(*) from relief_items where item_name like '%[TEST]%'" | paste -sd+ | bc)
[ $rc -ne 0 ] && [ "$n" = "0" ] && ok "forced mid-transaction failure: rolled back, 0 test rows" || ko "rollback: rc=$rc rows=$n"
mysql -uroot -e "DROP DATABASE seedsafe_base; DROP DATABASE seedsafe1; DROP DATABASE seedsafe2; DROP DATABASE seedsafe3"; rm -rf "$T"
echo "SUMMARY: $pass/$((pass+fail)) passed"
