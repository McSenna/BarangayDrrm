<?php
/**
 * Builds database/DEFENSE_TEST_DATA.sql — the phpMyAdmin-importable version of the
 * "Typhoon Binitayan Defense Demonstration 2026" synthetic test dataset.
 *
 * WHY A GENERATOR: the password hashes must come from PHP's real password_hash()
 * (the same call as users/add_user.php), and every coordinate is checked with the
 * application's own boundary validator before it is written to the SQL file.
 *
 * RUN:   php database/defense_demo/build_defense_test_data_sql.php
 * OUTPUT: database/DEFENSE_TEST_DATA.sql (INSERT statements only; no DDL)
 *
 * This script only WRITES A FILE. It does not connect to any database.
 */

if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Command line only.\n"); }
require_once __DIR__ . '/../../backend/utils/boundary_validator.php';
require_once __DIR__ . '/../../backend/lib/puroks.php';

const PASSWORD = 'BinitayanTest2026!';
const TAG = '[DEFENSE TEST]';
const SCENARIO = 'Typhoon Binitayan Defense Demonstration 2026';
const SCENARIO_DESC = 'A simulated strong typhoon affected Barangay Binitayan, Daraga, Albay, resulting in flooding, property damage, temporary displacement, and increased demand for emergency relief resources.';

function q(?string $s): string
{
    if ($s === null) return 'NULL';
    return "'" . str_replace(["\\", "'"], ["\\\\", "''"], $s) . "'";
}
function fail(string $m): void { fwrite(STDERR, "BUILD FAILED: $m\n"); exit(1); }

// ---------------------------------------------------------------- DATASET
$admin = ['email' => 'admin.binitayan.test@gmail.com', 'name' => 'Carmela Robles', 'contact' => '09000001201'];
$personnel = ['email' => 'personnel.binitayan.test@gmail.com', 'name' => 'Nestor Valdez', 'contact' => '09000001202'];

// c = children (infants are recorded as children: the schema has no infant column),
// s = seniors (elderly), p = PWD, g = pregnant. Members: [name, relationship, age].
$households = [
    'H01' => ['purok' => 'Purok 1', 'head' => 'Ramon Dizon', 'contact' => '09000001101', 'lat' => '13.1545050', 'lng' => '123.7159050', 'c' => 0, 's' => 0, 'p' => 0, 'g' => 0,
        'members' => [['Ramon Dizon', 'Head of family', 58], ['Lydia Dizon', 'Spouse', 56]]],
    'H02' => ['purok' => 'Purok 2', 'head' => 'Gloria Mendoza', 'contact' => '09000001102', 'lat' => '13.1548180', 'lng' => '123.7152690', 'c' => 0, 's' => 1, 'p' => 0, 'g' => 0,
        'members' => [['Gloria Mendoza', 'Head of family', 45], ['Ronaldo Mendoza', 'Spouse', 47], ['Kyle Mendoza', 'Son', 19], ['Pacita Rivera', 'Mother (elderly / senior citizen)', 71]]],
    'H03' => ['purok' => 'Purok 3', 'head' => 'Eduardo Salazar', 'contact' => '09000001103', 'lat' => '13.1549750', 'lng' => '123.7166990', 'c' => 1, 's' => 0, 'p' => 1, 'g' => 0,
        'members' => [['Eduardo Salazar', 'Head of family', 46], ['Marissa Salazar', 'Spouse', 44], ['Joshua Salazar', 'Son (PWD, mobility impairment)', 20],
            ['Carla Salazar', 'Daughter', 23], ['Bea Salazar', 'Daughter', 18], ['Mika Salazar', 'Granddaughter (infant, 7 months)', 0]]],
    'H04' => ['purok' => 'Purok 4', 'head' => 'Jerome Pascual', 'contact' => '09000001104', 'lat' => '13.1552890', 'lng' => '123.7152690', 'c' => 0, 's' => 0, 'p' => 0, 'g' => 1,
        'members' => [['Jerome Pascual', 'Head of family', 31], ['Angelica Pascual', 'Spouse (pregnant, 7 months)', 29], ['Rolando Pascual', 'Father', 56],
            ['Maricel Pascual', 'Sister', 26], ['Dennis Pascual', 'Brother', 22]]],
    'H05' => ['purok' => 'Purok 5A', 'head' => 'Corazon Villanueva', 'contact' => '09000001105', 'lat' => '13.1554450', 'lng' => '123.7166990', 'c' => 0, 's' => 1, 'p' => 0, 'g' => 0,
        'members' => [['Corazon Villanueva', 'Head of family', 52], ['Andres Villanueva', 'Father-in-law (elderly / senior citizen)', 78], ['Paolo Villanueva', 'Son', 25]]],
    'H06' => ['purok' => 'Purok 5B', 'head' => 'Wilfredo Ocampo', 'contact' => '09000001106', 'lat' => '13.1557590', 'lng' => '123.7149510', 'c' => 1, 's' => 1, 'p' => 0, 'g' => 0,
        'members' => [['Wilfredo Ocampo', 'Head of family', 48], ['Rosalinda Ocampo', 'Spouse', 46], ['Esperanza Ocampo', 'Mother (elderly / senior citizen)', 75],
            ['Mark Ocampo', 'Son', 24], ['Jenny Ocampo', 'Daughter-in-law', 22], ['Ryan Ocampo', 'Son', 19], ['Liam Ocampo', 'Grandson (infant, 1 year)', 1]]],
    'H07' => ['purok' => 'Purok 6', 'head' => 'Leonora Castillo', 'contact' => '09000001107', 'lat' => '13.1559160', 'lng' => '123.7163810', 'c' => 0, 's' => 0, 'p' => 1, 'g' => 0,
        'members' => [['Leonora Castillo', 'Head of family', 40], ['Benjie Castillo', 'Spouse (PWD, wheelchair user)', 43], ['Trisha Castillo', 'Daughter', 19], ['Paul Castillo', 'Son', 18]]],
    'H08' => ['purok' => 'Purok 7', 'head' => 'Ernesto Dimaculangan', 'contact' => '09000001108', 'lat' => '13.1562290', 'lng' => '123.7146330', 'c' => 1, 's' => 1, 'p' => 1, 'g' => 0,
        'members' => [['Ernesto Dimaculangan', 'Head of family', 51], ['Lorna Dimaculangan', 'Spouse', 49], ['Felipa Dimaculangan', 'Mother (elderly / senior citizen)', 80],
            ['Ramil Dimaculangan', 'Son (PWD, visual impairment)', 27], ['Joy Dimaculangan', 'Daughter-in-law', 25], ['Kenneth Dimaculangan', 'Son', 21],
            ['Aira Dimaculangan', 'Daughter', 19], ['Zoe Dimaculangan', 'Granddaughter (infant, 4 months)', 0]]],
];

// Reports (all Typhoon): [severity, verified?, date, time, location, description, verification remarks]
$reports = [
    'H01' => ['Low', true, '2026-09-28', '16:20:00', 'Purok 1, near the drainage canal',
        'Heavy rain flooded the yard ankle-deep. No water entered the house; part of the bamboo fence and some plants were damaged.',
        'Checked during the purok inspection. Minor yard damage only.'],
    'H02' => ['Medium', true, '2026-09-28', '17:05:00', 'Purok 2, along the barangay road',
        'Strong winds lifted several roof sheets (roof partially damaged). Rainwater leaked into the living area and wet clothes and school supplies.',
        'Roof damage confirmed by the BDRRM team.'],
    'H03' => ['High', true, '2026-09-28', '18:40:00', 'Purok 3, low-lying area',
        'Floodwater entered the household and rose to about waist level. The refrigerator, rice cooker and stored food were damaged. The family stayed with relatives for two nights and requires food and clean water.',
        'Flood damage confirmed; household needs food and clean water.'],
    'H04' => ['Critical', true, '2026-09-28', '19:15:00', 'Purok 4, upper side',
        'The roof was blown off and a side wall collapsed during the strongest winds. The house is not safe to stay in; the household is temporarily displaced at the evacuation center. One member is pregnant.',
        'Severe damage confirmed on site. Family is at the evacuation center.'],
    'H05' => ['Medium', true, '2026-09-29', '07:30:00', 'Purok 5A hillside',
        'Heavy rain caused soil to slide behind the house. Mud entered the kitchen and a small part of the back wall cracked.',
        'Soil movement and wall crack confirmed.'],
    'H06' => ['High', true, '2026-09-29', '08:10:00', 'Purok 5B, interior lot',
        'Floodwater entered the house and a fallen tree damaged the kitchen roof. The water pump stopped working, so the water supply is affected.',
        'Confirmed; kitchen roof and water pump damaged.'],
    'H07' => ['Critical', true, '2026-09-29', '09:00:00', 'Purok 6, near the chapel',
        'Most of the roof and the kitchen were destroyed by the typhoon; furniture and appliances were soaked and the sleeping area was damaged. A family member uses a wheelchair and needs a safe place to stay.',
        'House largely destroyed; family member with disability confirmed.'],
    'H08' => ['High', false, '2026-09-29', '10:25:00', 'Purok 7, riverside',
        'The nearby river overflowed. Floodwater reached chest level in the house, damaged appliances and destroyed the backyard vegetable garden. The elderly, PWD and infant members moved to a relative\'s house. The household requires food, water and hygiene supplies.',
        null],
];

// Damage: house, infrastructure, property, agricultural, estimated severity, remarks.
// The schema supports only None / Minor / Major / Totally Damaged (no "Moderate").
$assessments = [
    'H01' => ['Minor', 'None', 'None', 'Minor', 'Low', 'Minor: fence and garden plants damaged; house not affected.'],
    'H02' => ['Minor', 'None', 'Minor', 'None', 'Medium', 'Moderate overall (recorded as Minor house + Minor property, because the system has no "Moderate" level): roof sheets loosened, some belongings wet.'],
    'H03' => ['Major', 'None', 'Major', 'None', 'High', 'Major: flood damaged kitchen, appliances and stored food.'],
    'H04' => ['Totally Damaged', 'Minor', 'Totally Damaged', 'None', 'Critical', 'Total: roof gone and side wall collapsed; house not habitable.'],
    'H05' => ['Minor', 'None', 'Minor', 'None', 'Medium', 'Minor: mud in kitchen, small crack on back wall.'],
    'H06' => ['Major', 'Major', 'Minor', 'None', 'High', 'Major: kitchen roof broken by fallen tree; water pump not working.'],
    'H07' => ['Totally Damaged', 'None', 'Major', 'None', 'Critical', 'Major/Total: most of the roof and kitchen destroyed; appliances soaked.'],
    'H08' => ['Major', 'None', 'Major', 'Major', 'High', 'Major: house flooded to chest level; vegetable garden destroyed.'],
];

// Items: key => [name, category, quantity, unit, minimum level]
$items = [
    'rice' => ['Rice ' . TAG, 'Food', 100, 'kg', 20],
    'water' => ['Bottled Water ' . TAG, 'Water', 120, 'bottle (1 L)', 30],
    'pack' => ['Family Food Pack ' . TAG, 'Food', 20, 'pack', 10],
    'hygiene' => ['Hygiene Kit ' . TAG, 'Hygiene', 6, 'kit', 10],
    'blanket' => ['Blanket ' . TAG, 'Shelter', 10, 'pc', 5],
    'firstaid' => ['First Aid Kit ' . TAG, 'Medical', 4, 'kit', 5],
];

$center = ['name' => 'Binitayan Defense Demonstration Evacuation Center', 'purok' => 'Purok 3', 'lat' => '13.1563860', 'lng' => '123.7162220',
    'capacity' => 50, 'occupancy' => 18, 'facilities' => 'Water, Restrooms, Electricity, First Aid, Sleeping Area',
    'contact_person' => 'Kagawad on duty (Defense Test)', 'contact' => '09000001301'];

// Hazard alerts: [type, status, title, description, purok (null = barangay-wide), issued_at, resolved_at|null]
$alerts = [
    ['Typhoon', 'Critical', SCENARIO . ' — strong winds and heavy rainfall',
        SCENARIO_DESC . ' Strong winds and heavy rainfall expected. Secure roofs, stay indoors and prepare to evacuate if instructed. ' . TAG,
        null, '2026-09-28 12:00:00', '2026-09-30 08:00:00'],
    ['Flood', 'Critical', 'Flooding in low-lying areas — Purok 7 riverside',
        'Simulated flooding reported in low-lying areas of Barangay Binitayan following Typhoon Binitayan Defense Demonstration 2026. Floodwater remains high near the river in Purok 7; residents should stay away from the riverbank. ' . TAG,
        'Purok 7', '2026-09-29 06:00:00', null],
    ['Landslide', 'Warning', 'Landslide risk on the Purok 5A hillside',
        'Soil remains saturated after heavy rainfall. Watch for cracks and soil movement behind houses. ' . TAG,
        'Purok 5A', '2026-09-29 07:45:00', null],
];
// Weather logs (manual): [date, time, condition, temp, rain mm, wind kph, direction, remarks]
$weather = [
    ['2026-09-28', '15:00:00', 'Stormy', '24.5', '86.0', '110.0', 'NE', 'Typhoon passing near Albay: strong winds and heavy rainfall (manual log, simulated). ' . TAG],
    ['2026-09-29', '09:00:00', 'Rainy', '25.0', '38.0', '45.0', 'N', 'Continuous rain after the typhoon (manual log, simulated). ' . TAG],
    ['2026-09-30', '09:00:00', 'Cloudy', '27.5', '4.0', '15.0', 'E', 'Rain has stopped; flooding remains in low-lying puroks (manual log, simulated). ' . TAG],
];

// Requests: [urgency, reason, created_at, [[item, requested, approved|null]], decision status, admin remarks]
// H03 / H04 / H07 are left at "Allocated" with APPROVED (reserved, not distributed) allocations,
// exactly what requests/process_request.php produces. H08 is left Pending for the live review.
$requests = [
    'H03' => ['High', 'Our kitchen was flooded and our stored food and drinking water were spoiled. We need food packs and clean water.', '2026-09-29 18:00:00',
        [['pack', 3, 3], ['water', 12, 12]], 'Approved', 'Approved in full.'],
    'H04' => ['Critical', 'Our house was destroyed and we are at the evacuation center with a pregnant family member. We need food, water and hygiene kits.', '2026-09-29 18:10:00',
        [['pack', 4, 4], ['hygiene', 2, 2], ['water', 18, 18]], 'Approved', 'Approved in full: house destroyed, pregnant member at the evacuation center.'],
    'H07' => ['Critical', 'Our house and kitchen were destroyed. We need food and hygiene kits; my husband uses a wheelchair.', '2026-09-29 18:20:00',
        [['pack', 3, 3], ['hygiene', 3, 2]], 'Partially Approved', 'Approved 2 of 3 hygiene kits to keep stock for other affected households.'],
    'H08' => ['High', 'The river flooded our house up to chest level. We need food, drinking water and hygiene kits for 8 members, including an infant.', '2026-09-30 07:30:00',
        [['pack', 5, null], ['water', 24, null], ['hygiene', 5, null]], 'Pending', null],
];
$review_at = ['H03' => '2026-09-30 09:00:00', 'H04' => '2026-09-30 09:10:00', 'H07' => '2026-09-30 09:20:00'];
$process_at = ['H03' => '2026-09-30 09:30:00', 'H04' => '2026-09-30 09:35:00', 'H07' => '2026-09-30 09:40:00'];

// ---------------------------------------------------------------- CHECKS
$emails = [];
foreach ($households as $k => $h) {
    if (!in_array($h['purok'], BINITAYAN_PUROKS, true)) fail("$k purok '{$h['purok']}' is not a standard Binitayan purok.");
    $v = validate_household_coordinates($h['lat'], $h['lng']);
    if (!$v['valid']) fail("$k coordinates are outside Barangay Binitayan.");
    if (count($h['members']) < 1) fail("$k has no members.");
}
$v = validate_household_coordinates($center['lat'], $center['lng']);
if (!$v['valid']) fail('Evacuation center coordinates are outside Barangay Binitayan.');
foreach ($requests as $k => $r) foreach ($r[3] as $line) if (!isset($items[$line[0]])) fail("Unknown item {$line[0]}");

// Stock check: reserved (Approved) quantities may not exceed stock (process_request.php rule).
$reserved = [];
foreach ($requests as $r) foreach ($r[3] as [$it, , $ap]) if ($ap) $reserved[$it] = ($reserved[$it] ?? 0) + $ap;
foreach ($reserved as $it => $qty) if ($qty > $items[$it][2]) fail("Reserved $it ($qty) exceeds stock ({$items[$it][2]}).");

// ---------------------------------------------------------------- SQL
$o = [];
$o[] = "-- =====================================================================";
$o[] = "-- DEFENSE_TEST_DATA.sql";
$o[] = "-- Synthetic test data: \"" . SCENARIO . "\"";
$o[] = "-- Web-Based Post Disaster Monitoring and Relief Allocation with Decision";
$o[] = "-- Support System for Barangay Binitayan — Phase 19 schema (barangay_disaster_db_FINAL.sql)";
$o[] = "--";
$o[] = "-- SYNTHETIC TEST DATA ONLY. All names and 0900 numbers are fictional.";
$o[] = "-- Every record is marked " . TAG . " (or uses a binitayan.test e-mail) so";
$o[] = "-- DEFENSE_TEST_DATA_CLEANUP.sql can remove exactly these records.";
$o[] = "--";
$o[] = "-- HOW TO IMPORT: phpMyAdmin -> select the (defense/test) database -> Import";
$o[] = "--   -> this file -> Go. See DEFENSE_TEST_DATA_IMPORT_GUIDE.md.";
$o[] = "--";
$o[] = "-- WHAT THIS FILE DOES";
$o[] = "--   * INSERT statements only (plus SET NAMES, SET time_zone, START TRANSACTION, COMMIT and";
$o[] = "--     user variables that carry new AUTO_INCREMENT ids to child rows).";
$o[] = "--   * No CREATE / ALTER / DROP / TRUNCATE / DELETE. Foreign key checks stay ON.";
$o[] = "--   * No primary keys are hard-coded: every id comes from LAST_INSERT_ID(),";
$o[] = "--     so existing records are never overwritten.";
$o[] = "--   * No DSS scores, ranks or recommendations are stored (the schema has no";
$o[] = "--     such columns): the application calculates them when a page is opened.";
$o[] = "--   * No fake audit logs, SMS logs, notifications or distributed records.";
$o[] = "--";
$o[] = "-- DUPLICATE PROTECTION: users.email is UNIQUE. If any test account already";
$o[] = "-- exists, the first INSERT stops with \"Duplicate entry ... for key 'email'\"";
$o[] = "-- and NOTHING is saved (the transaction is never committed). Run";
$o[] = "-- DEFENSE_TEST_DATA_CLEANUP.sql first, then import again.";
$o[] = "--";
$o[] = "-- Password for all 10 test accounts: see DEFENSE_TEST_DATA_IMPORT_GUIDE.md.";
$o[] = "-- Stored here ONLY as bcrypt hashes made with PHP password_hash() (PASSWORD_DEFAULT),";
$o[] = "-- the same call as backend/users/add_user.php; login uses password_verify().";
$o[] = "-- Generated by database/defense_demo/build_defense_test_data_sql.php";
$o[] = "-- =====================================================================";
$o[] = "";
$o[] = "SET NAMES utf8mb4;";
$o[] = "-- Same session time zone the application uses (DB_TIME_ZONE '+08:00', Philippine";
$o[] = "-- time), so the scenario timestamps below show correctly on any server.";
$o[] = "SET time_zone = '+08:00';";
$o[] = "START TRANSACTION;";
$o[] = "";

$o[] = "-- ---------------------------------------------------------------------";
$o[] = "-- 1. TEST ACCOUNTS (10). The Administrator is inserted first, so an existing";
$o[] = "--    defense dataset stops the import before anything else is written.";
$o[] = "-- ---------------------------------------------------------------------";
$userRow = function (string $var, string $name, string $email, string $role, string $contact, string $created) use (&$o) {
    $o[] = "INSERT INTO users (full_name, email, password, role, is_active, contact_number, created_at) VALUES (" .
        q($name) . ", " . q($email) . ", " . q(password_hash(PASSWORD, PASSWORD_DEFAULT)) . ", " . q($role) . ", 1, " . q($contact) . ", " . q($created) . ");";
    $o[] = "SET @$var := LAST_INSERT_ID();";
};
$userRow('admin', $admin['name'], $admin['email'], 'admin', $admin['contact'], '2026-09-01 08:00:00');
$userRow('personnel', $personnel['name'], $personnel['email'], 'relief_personnel', $personnel['contact'], '2026-09-01 08:05:00');
$n = 0;
foreach ($households as $k => $h) {
    $n++;
    $userRow('u_' . strtolower($k), $h['head'], sprintf('binitayan.test%02d@gmail.com', $n), 'resident', $h['contact'], sprintf('2026-09-01 09:%02d:00', $n));
}
$o[] = "";

$o[] = "-- ---------------------------------------------------------------------";
$o[] = "-- 2. HOUSEHOLDS (8) + MEMBERS. vulnerable_members = children + seniors + PWD";
$o[] = "--    + pregnant + medical + other (same formula as add_household.php).";
$o[] = "--    Infants are counted in children_count (the schema has no infant column).";
$o[] = "--    Coordinates were checked with backend/utils/boundary_validator.php.";
$o[] = "-- ---------------------------------------------------------------------";
$hn = 0;
foreach ($households as $k => $h) {
    $hn++;
    $lk = strtolower($k);
    $vul = $h['c'] + $h['s'] + $h['p'] + $h['g'];
    $address = "{$h['purok']}, Barangay Binitayan, Daraga, Albay — " . TAG . " $k";
    $created = sprintf('2026-09-02 09:%02d:00', $hn);
    $o[] = "-- $k: {$h['head']} ({$h['purok']}), " . count($h['members']) . " members, $vul vulnerable";
    $o[] = "INSERT INTO households (user_id, head_of_family, purok, address, number_of_members, vulnerable_members, children_count, seniors_count, pwd_count, pregnant_count, medical_needs_count, other_vulnerable_count, contact_number, latitude, longitude, created_at) VALUES (" .
        "@u_$lk, " . q($h['head']) . ", " . q($h['purok']) . ", " . q($address) . ", " . count($h['members']) . ", $vul, {$h['c']}, {$h['s']}, {$h['p']}, {$h['g']}, 0, 0, " .
        q($h['contact']) . ", {$h['lat']}, {$h['lng']}, " . q($created) . ");";
    $o[] = "SET @h_$lk := LAST_INSERT_ID();";
    $vals = [];
    foreach ($h['members'] as $m) $vals[] = "(@h_$lk, " . q($m[0]) . ", " . q($m[1]) . ", {$m[2]}, " . q($created) . ")";
    $o[] = "INSERT INTO household_members (household_id, full_name, relationship, age, created_at) VALUES\n  " . implode(",\n  ", $vals) . ";";
}
$o[] = "";

$o[] = "-- ---------------------------------------------------------------------";
$o[] = "-- 3. RELIEF ITEMS (6) + their initial \"Stock In\" log, exactly as";
$o[] = "--    inventory/add_item.php records an item created with a starting quantity.";
$o[] = "--    Categories must already exist in inventory_categories (default rows).";
$o[] = "-- ---------------------------------------------------------------------";
foreach ($items as $k => [$name, $cat, $qty, $unit, $min]) {
    $o[] = "INSERT INTO relief_items (item_name, category, quantity, unit, minimum_level, expiration_date, date_added) VALUES (" .
        q($name) . ", " . q($cat) . ", $qty, " . q($unit) . ", $min, NULL, '2026-09-20 10:00:00');";
    $o[] = "SET @i_$k := LAST_INSERT_ID();";
    $o[] = "INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by, created_at) VALUES (@i_$k, 'Stock In', $qty, $qty, 'Initial stock on item creation', @admin, '2026-09-20 10:00:00');";
}
$o[] = "";

$o[] = "-- ---------------------------------------------------------------------";
$o[] = "-- 4. EVACUATION CENTER (1) + the \"Center added\" history row that";
$o[] = "--    evacuation/save_center.php writes when a center is created.";
$o[] = "-- ---------------------------------------------------------------------";
$c = $center;
$o[] = "INSERT INTO evacuation_centers (name, address, purok, latitude, longitude, capacity, current_occupancy, facilities, contact_person, contact_number, status, created_by, updated_by, created_at, updated_at) VALUES (" .
    q($c['name']) . ", " . q("{$c['purok']}, Barangay Binitayan, Daraga, Albay " . TAG) . ", " . q($c['purok']) . ", {$c['lat']}, {$c['lng']}, {$c['capacity']}, {$c['occupancy']}, " .
    q($c['facilities']) . ", " . q($c['contact_person']) . ", " . q($c['contact']) . ", 'Open', @admin, @admin, '2026-09-28 20:00:00', '2026-09-28 20:00:00');";
$o[] = "SET @center := LAST_INSERT_ID();";
$o[] = "INSERT INTO evacuation_center_logs (center_id, previous_occupancy, new_occupancy, previous_status, new_status, remarks, changed_by, changed_at) VALUES (@center, NULL, {$c['occupancy']}, NULL, 'Open', 'Center added', @admin, '2026-09-28 20:00:00');";
$o[] = "";

$o[] = "-- ---------------------------------------------------------------------";
$o[] = "-- 5. HAZARD ALERTS (3) + WEATHER LOGS (3, manual). Active alerts feed the";
$o[] = "--    DSS location factor: Purok 7 flood and Purok 5A landslide are active;";
$o[] = "--    the barangay-wide typhoon alert is resolved (it no longer adds points).";
$o[] = "--    No prediction data is created.";
$o[] = "-- ---------------------------------------------------------------------";
foreach ($alerts as [$type, $status, $title, $desc, $purok, $issued, $resolved]) {
    $o[] = "INSERT INTO hazard_alerts (hazard_type, status, title, description, affected_purok, is_active, issued_by, issued_at, resolved_by, resolved_at) VALUES (" .
        q($type) . ", " . q($status) . ", " . q($title) . ", " . q($desc) . ", " . q($purok) . ", " . ($resolved ? 0 : 1) . ", @admin, " . q($issued) . ", " .
        ($resolved ? '@admin' : 'NULL') . ", " . q($resolved) . ");";
}
foreach ($weather as [$d, $t, $cond, $temp, $rain, $wind, $dir, $rem]) {
    $o[] = "INSERT INTO weather_logs (log_date, log_time, temperature, rainfall_mm, weather_condition, wind_speed_kph, wind_direction, source, remarks, recorded_by, created_at) VALUES (" .
        q($d) . ", " . q($t) . ", $temp, $rain, " . q($cond) . ", $wind, " . q($dir) . ", 'Manual', " . q($rem) . ", @admin, " . q("$d $t") . ");";
}
$o[] = "";

$o[] = "-- ---------------------------------------------------------------------";
$o[] = "-- 6. DISASTER REPORTS (8, all Typhoon, one per household; H01–H07 Verified,";
$o[] = "--    H08 Pending) + DAMAGE ASSESSMENTS (8). No photos (no files exist).";
$o[] = "--    Note: estimated_severity is stored and shown, but the DSS does not use it.";
$o[] = "-- ---------------------------------------------------------------------";
foreach ($reports as $k => [$sev, $verified, $date, $time, $loc, $desc, $remarks]) {
    $lk = strtolower($k);
    $o[] = "INSERT INTO disaster_reports (user_id, household_id, disaster_type, location, description, report_date, report_time, severity, status, verified_by, verified_at, verification_remarks, created_at) VALUES (" .
        "@u_$lk, @h_$lk, 'Typhoon', " . q($loc) . ", " . q(TAG . ' ' . SCENARIO . ': ' . $desc) . ", " . q($date) . ", " . q($time) . ", " . q($sev) . ", " .
        ($verified ? "'Verified', @admin, '2026-09-29 16:00:00', " . q($remarks) : "'Pending', NULL, NULL, NULL") . ", " . q("$date $time") . ");";
    $o[] = "SET @r_$lk := LAST_INSERT_ID();";
    [$hd, $inf, $prop, $agr, $est, $arem] = $assessments[$k];
    $o[] = "INSERT INTO damage_assessments (report_id, house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, remarks, assessed_by, assessed_at) VALUES (" .
        "@r_$lk, " . q($hd) . ", " . q($inf) . ", " . q($prop) . ", " . q($agr) . ", " . q($est) . ", " . q($arem . ' ' . TAG) . ", @admin, '2026-09-29 16:30:00');";
}
$o[] = "";

$o[] = "-- ---------------------------------------------------------------------";
$o[] = "-- 7. RELIEF REQUESTS (4) + REQUEST ITEMS + APPROVED ALLOCATIONS.";
$o[] = "--    H03, H04, H07: reviewed, decided and processed by the Administrator";
$o[] = "--    -> request status 'Allocated', allocations 'Approved' (stock RESERVED,";
$o[] = "--    not deducted), the same rows requests/process_request.php creates.";
$o[] = "--    Nothing is Distributed: do the distribution live in the defense.";
$o[] = "--    H08: Pending (not reviewed) for the live DSS review; it shows the";
$o[] = "--    Hygiene Kit shortage (requested 5, available 2).";
$o[] = "-- ---------------------------------------------------------------------";
foreach ($requests as $k => [$urg, $reason, $created, $lines, $decision, $remarks]) {
    $lk = strtolower($k);
    $done = $decision !== 'Pending';
    $o[] = "-- $k: $urg urgency, " . ($done ? "$decision -> Allocated" : 'Pending');
    $o[] = "INSERT INTO relief_requests (household_id, user_id, report_id, urgency, reason, status, admin_remarks, reviewed_by, reviewed_at, processed_by, processed_at, created_at, updated_at) VALUES (" .
        "@h_$lk, @u_$lk, @r_$lk, " . q($urg) . ", " . q($reason . ' ' . TAG) . ", " . ($done ? "'Allocated'" : "'Pending'") . ", " .
        ($done ? q($remarks . ' ' . TAG) . ", @admin, " . q($review_at[$k]) . ", @admin, " . q($process_at[$k]) : "NULL, NULL, NULL, NULL, NULL") . ", " .
        q($created) . ", " . q($done ? $process_at[$k] : $created) . ");";
    $o[] = "SET @q_$lk := LAST_INSERT_ID();";
    foreach ($lines as [$it, $reqQty, $apQty]) {
        $o[] = "INSERT INTO relief_request_items (request_id, item_id, requested_quantity, approved_quantity) VALUES (@q_$lk, @i_$it, $reqQty, " . ($apQty === null ? 'NULL' : $apQty) . ");";
        if ($done && $apQty > 0) {
            $unit = $items[$it][3];
            $o[] = "SET @ri := LAST_INSERT_ID();";
            $o[] = "INSERT INTO relief_allocations (household_id, item_id, schedule_id, request_item_id, quantity, status, approved_by, approved_at, recommendation_reason, allocation_date) VALUES (" .
                "@h_$lk, @i_$it, NULL, @ri, $apQty, 'Approved', @admin, " . q($process_at[$k]) . ", CONCAT('Relief request #', @q_$lk, " .
                q(" ($urg urgency): resident requested $reqQty $unit, Administrator approved $apQty $unit. " . TAG . " Loaded by DEFENSE_TEST_DATA.sql; the DSS priority is calculated live by the application.") .
                "), '2026-09-30');";
        }
    }
}
$o[] = "";
$o[] = "COMMIT;";
$o[] = "";
$o[] = "-- Done. Open the system and let the application calculate the DSS results";
$o[] = "-- (Administrator -> Priority Assessment / Relief Recommendations).";
$o[] = "";

$out = __DIR__ . '/../DEFENSE_TEST_DATA.sql';
file_put_contents($out, implode("\n", $o));
$inserts = substr_count(implode("\n", $o), "INSERT INTO");
echo "Wrote " . realpath($out) . " ($inserts INSERT statements)\n";
