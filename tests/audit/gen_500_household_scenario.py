"""
Generates the audit scenario SQL: 500 synthetic affected households across the
Binitayan Puroks, one disaster report each (varied severity / status / damage),
and ONE relief item with 300 packs. Synthetic data only (names "Audit HH nnn",
0900 numbers). Deterministic (seed 2026). Load into a REHEARSAL database only.

Usage: python3 tests/audit/gen_500_household_scenario.py > /tmp/audit500.sql
"""
import random
random.seed(2026)
PUROKS = ["Purok 1", "Purok 2", "Purok 3", "Purok 4", "Purok 5A", "Purok 5B", "Purok 6", "Purok 7"]
SEV = ["Low", "Medium", "High", "Critical"]
DMG = ["None", "Minor", "Major", "Totally Damaged"]
out = ["SET NAMES utf8mb4;", "START TRANSACTION;",
       "SET @admin := (SELECT user_id FROM users WHERE role='admin' ORDER BY user_id LIMIT 1);",
       "INSERT INTO relief_items (item_name, category, unit, quantity, minimum_level) VALUES ('Relief Pack [AUDIT]', 'Other', 'pack', 300, 10);",
       "SET @item := LAST_INSERT_ID();",
       "INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by) VALUES (@item, 'Stock In', 300, 300, 'Opening stock [AUDIT]', @admin);"]
for i in range(1, 501):
    purok = PUROKS[(i * 7 + random.randint(0, 7)) % 8]
    members = random.choice([1, 2, 3, 3, 4, 4, 4, 5, 5, 6, 7, 8, 9])
    kids = random.randint(0, max(0, members - 1) // 2)
    seniors = random.choice([0, 0, 0, 1, 1, 2]) if members > kids else 0
    pwd = random.choice([0] * 8 + [1])
    preg = random.choice([0] * 9 + [1])
    vul = min(members, kids + seniors + pwd + preg)
    # keep the breakdown consistent with vulnerable_members (cap at members)
    extra = kids + seniors + pwd + preg - vul
    kids = max(0, kids - extra)
    out.append(
        "INSERT INTO households (head_of_family, purok, address, number_of_members, vulnerable_members, children_count, seniors_count, pwd_count, pregnant_count, medical_needs_count, other_vulnerable_count, contact_number) "
        f"VALUES ('Audit HH {i:03d}', '{purok}', 'Audit address {i:03d} [AUDIT]', {members}, {kids + seniors + pwd + preg}, {kids}, {seniors}, {pwd}, {preg}, 0, 0, '0900{i:07d}');")
    out.append("SET @h := LAST_INSERT_ID();")
    if i % 25 == 0:
        continue  # 20 households without any report -> Not Assessed (unranked, never excluded silently)
    sev = random.choices(SEV, weights=[25, 35, 25, 15])[0]
    st = random.choices(["Verified", "Pending", "Rejected"], weights=[85, 12, 3])[0]
    out.append(
        "INSERT INTO disaster_reports (user_id, household_id, disaster_type, location, description, report_date, report_time, severity, status, verified_by, verified_at) "
        f"VALUES (@admin, @h, 'Typhoon', '{purok} [AUDIT]', 'Audit scenario report [AUDIT]', '2026-10-01', '09:00:00', '{sev}', '{st}', "
        + ("@admin, '2026-10-02 08:00:00');" if st == "Verified" else "NULL, NULL);"))
    if random.random() < 0.9:
        hd = random.choices(DMG, weights=[20, 35, 30, 15])[0]
        out.append("SET @r := LAST_INSERT_ID();")
        out.append("INSERT INTO damage_assessments (report_id, house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, remarks, assessed_by) "
                   f"VALUES (@r, '{hd}', '{random.choice(DMG)}', '{random.choice(DMG)}', 'None', '{sev}', 'Audit [AUDIT]', @admin);")
out.append("COMMIT;")
print("\n".join(out))
