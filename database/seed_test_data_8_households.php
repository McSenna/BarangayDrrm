<?php
/**
 * SYNTHETIC TEST DATA — 8 households for manual testing (Barangay Binitayan).
 *
 * Everything created here is FICTIONAL and marked "[TEST DATA]" / "[TEST]".
 * It does not describe real residents of Barangay Binitayan.
 *
 * Run from the project root (command line only):
 *     php database/seed_test_data_8_households.php            (create)
 *     php database/seed_test_data_8_households.php --check    (report only, no changes)
 *   XAMPP on Windows:
 *     C:\xampp\php\php.exe database\seed_test_data_8_households.php
 *
 * Safety rules (Part 32):
 *   - Additive only: existing rows are never updated or deleted; no DROP,
 *     no TRUNCATE, no reset. (The only UPDATE sets the stock of a [TEST]
 *     item created moments earlier in the same transaction.)
 *   - Checks for existing test accounts, households, items, centers first.
 *     If the dataset already exists it reports that and stops (no duplicates).
 *     If only part of it exists it reports the conflicts and stops.
 *   - All inserts run inside ONE transaction; any error rolls everything back.
 *   - Passwords use password_hash(PASSWORD_DEFAULT), exactly like
 *     users/add_user.php and auth/register.php. No plaintext is stored.
 *   - Inventory uses separate "[TEST]" items so real stock is never changed,
 *     and every stock movement is written to inventory_logs.
 *   - Rows are inserted directly, so NO notifications and NO SMS are sent.
 *   - Coordinates are checked with the app's own boundary validator.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Command line only.\n");
}

require_once __DIR__ . '/../backend/config/database.php';
require_once __DIR__ . '/../backend/utils/boundary_validator.php';

const TEST_PASSWORD = 'BinitayanTest2026!';
const TAG = '[TEST DATA]';
$check_only = in_array('--check', $argv, true);

// ------------------------------------------------------------------ dataset
$staff = [
    ['email' => 'admin.binitayan.test@gmail.com', 'name' => 'Maria Elena Santos', 'role' => 'admin', 'contact' => '09000000201'],
    ['email' => 'personnel.binitayan.test@gmail.com', 'name' => 'Juan Carlo Reyes', 'role' => 'relief_personnel', 'contact' => '09000000202'],
];

// counts: children (infants), seniors, pwd, pregnant
$households = [
    'H1' => ['purok' => 'Purok 1', 'head' => 'Rogelio Abenojar', 'contact' => '09000000101', 'lat' => 13.154505, 'lng' => 123.715905,
        'c' => 0, 's' => 0, 'p' => 0, 'g' => 0,
        'members' => [['Rogelio Abenojar', 'Head', 52], ['Celia Abenojar', 'Spouse', 49]]],
    'H2' => ['purok' => 'Purok 2', 'head' => 'Teresita Llagas', 'contact' => '09000000102', 'lat' => 13.154818, 'lng' => 123.715269,
        'c' => 0, 's' => 1, 'p' => 0, 'g' => 0,
        'members' => [['Teresita Llagas', 'Head', 46], ['Ernesto Llagas', 'Spouse', 48], ['Paolo Llagas', 'Son', 20], ['Consolacion Moreno', 'Mother (senior citizen)', 74]]],
    'H3' => ['purok' => 'Purok 3', 'head' => 'Danilo Barcena', 'contact' => '09000000103', 'lat' => 13.154975, 'lng' => 123.716699,
        'c' => 1, 's' => 0, 'p' => 1, 'g' => 0,
        'members' => [['Danilo Barcena', 'Head', 41], ['Marites Barcena', 'Spouse', 39], ['Jomar Barcena', 'Son (PWD)', 21], ['Kristine Barcena', 'Daughter', 19], ['Lorna Barcena', 'Daughter', 23], ['Andrea Barcena', 'Granddaughter (infant, 8 months)', 0]]],
    'H4' => ['purok' => 'Purok 4', 'head' => 'Arnel Cabrera', 'contact' => '09000000104', 'lat' => 13.155289, 'lng' => 123.715269,
        'c' => 0, 's' => 0, 'p' => 0, 'g' => 1,
        'members' => [['Arnel Cabrera', 'Head', 33], ['Jennifer Cabrera', 'Spouse (pregnant)', 30], ['Ruel Cabrera', 'Brother', 28], ['Analyn Cabrera', 'Sister', 25], ['Mario Cabrera', 'Father', 55]]],
    'H5' => ['purok' => 'Purok 5A', 'head' => 'Felisa Navarro', 'contact' => '09000000105', 'lat' => 13.155445, 'lng' => 123.716699,
        'c' => 0, 's' => 1, 'p' => 0, 'g' => 0,
        'members' => [['Felisa Navarro', 'Head', 50], ['Bonifacio Navarro', 'Father-in-law (senior citizen)', 81], ['Ricardo Navarro', 'Son', 24]]],
    'H6' => ['purok' => 'Purok 5B', 'head' => 'Rodrigo Villafuerte', 'contact' => '09000000106', 'lat' => 13.155759, 'lng' => 123.714951,
        'c' => 1, 's' => 1, 'p' => 0, 'g' => 0,
        'members' => [['Rodrigo Villafuerte', 'Head', 44], ['Imelda Villafuerte', 'Spouse', 42], ['Josefina Villafuerte', 'Mother (senior citizen)', 77], ['Mark Villafuerte', 'Son', 22], ['Sheila Villafuerte', 'Daughter', 20], ['Ryan Villafuerte', 'Son', 18], ['Liam Villafuerte', 'Grandson (infant, 1 year)', 1]]],
    'H7' => ['purok' => 'Purok 6', 'head' => 'Lourdes Ibarrientos', 'contact' => '09000000107', 'lat' => 13.155916, 'lng' => 123.716381,
        'c' => 0, 's' => 0, 'p' => 1, 'g' => 0,
        'members' => [['Lourdes Ibarrientos', 'Head', 37], ['Noel Ibarrientos', 'Spouse (PWD, wheelchair user)', 39], ['Grace Ibarrientos', 'Daughter', 19], ['Mikko Ibarrientos', 'Son', 18]]],
    'H8' => ['purok' => 'Purok 7', 'head' => 'Efren Dela Rosa', 'contact' => '09000000108', 'lat' => 13.156229, 'lng' => 123.714633,
        'c' => 1, 's' => 1, 'p' => 1, 'g' => 0,
        'members' => [['Efren Dela Rosa', 'Head', 50], ['Nenita Dela Rosa', 'Spouse', 48], ['Remedios Dela Rosa', 'Mother (senior citizen)', 79], ['Arturo Dela Rosa', 'Son (PWD)', 26], ['Liza Dela Rosa', 'Daughter-in-law', 24], ['Jessa Dela Rosa', 'Daughter', 21], ['Kevin Dela Rosa', 'Son', 19], ['Althea Dela Rosa', 'Granddaughter (infant, 5 months)', 0]]],
];

// type, severity, status, date, location, description, remarks
$reports = [
    'H1' => [['Flood', 'Low', 'Verified', '2026-09-24', 'Purok 1 near the drainage canal', 'Ankle-deep floodwater entered the yard; no damage inside the house.', 'Verified during purok inspection.']],
    'H2' => [['Typhoon', 'Medium', 'Verified', '2026-09-25', 'Purok 2, along the barangay road', 'Strong winds loosened part of the roof; minor leaks during the storm.', 'Roof damage confirmed by BDRRM team.']],
    'H3' => [['Flood', 'High', 'Verified', '2026-09-25', 'Purok 3, low-lying area', 'Waist-deep flood; kitchen and appliances submerged. Family stayed with relatives.', 'Confirmed; household needs food and water.']],
    'H4' => [['Typhoon', 'Critical', 'Verified', '2026-09-25', 'Purok 4, upper side', 'House roof blown off and walls collapsed; family evacuated. Pregnant member needs care.', 'Severe damage confirmed on site.']],
    'H5' => [['Landslide', 'Medium', 'Pending', '2026-09-27', 'Purok 5A hillside', 'Soil slid behind the house after continuous rain; small cracks on the back wall.', null]],
    'H6' => [['Earthquake', 'High', 'Verified', '2026-09-26', 'Purok 5B, interior lot', 'Strong shaking cracked the walls and damaged the water tank.', 'Structural cracks confirmed.']],
    'H7' => [['Fire', 'Critical', 'Pending', '2026-09-28', 'Purok 6, near the chapel', 'Kitchen fire spread to the living room; most belongings burned. Spouse uses a wheelchair.', null]],
    'H8' => [
        ['Flood', 'Critical', 'Verified', '2026-09-25', 'Purok 7, riverside', 'Flash flood reached the ceiling; house and backyard garden destroyed.', 'Confirmed as one of the most affected households.'],
        ['Flood', 'Critical', 'Rejected', '2026-09-25', 'Purok 7, riverside', 'Same flood submitted twice by mistake.', 'Duplicate of the verified report for the same event.'],
    ],
];

// house, infrastructure, property, agricultural, estimated severity, remarks (first report only)
$assessments = [
    'H2' => ['Minor', 'None', 'Minor', 'None', 'Medium', 'Roof sheets loosened; repairable.'],
    'H3' => ['Major', 'Minor', 'Major', 'None', 'High', 'Kitchen and appliances damaged by flood.'],
    'H4' => ['Totally Damaged', 'Major', 'Totally Damaged', 'Major', 'Critical', 'House not habitable; family in evacuation center.'],
    'H6' => ['Major', 'Major', 'Minor', 'None', 'High', 'Wall cracks and damaged water tank.'],
    'H8' => ['Major', 'None', 'Major', 'Totally Damaged', 'High', 'Ground floor flooded; vegetable garden destroyed.'],
];

// name, category, quantity, unit, minimum level
$items = [
    'rice' => ['Rice [TEST]', 'Food', 50, 'kg', 20],
    'water' => ['Bottled Water [TEST]', 'Water', 60, 'bottle (1 L)', 30],
    'pack' => ['Family Food Pack [TEST]', 'Food', 12, 'pack', 5],
    'hygiene' => ['Hygiene Kit [TEST]', 'Hygiene', 6, 'kit', 10],
    'blanket' => ['Blanket [TEST]', 'Shelter', 15, 'pc', 5],
    'firstaid' => ['First Aid Kit [TEST]', 'Medical', 2, 'kit', 5],
];

$centers = [
    ['Binitayan Test Evacuation Center A', 'Purok 3, Barangay Binitayan, Daraga, Albay ' . TAG, 'Purok 3', 13.156386, 123.716222, 120, 45, 'Open',
        'Toilets, water supply, kitchen area, first-aid station', 'Kagawad Test Contact A', '09000000301'],
    ['Binitayan Test Evacuation Center B', 'Purok 6, Barangay Binitayan, Daraga, Albay ' . TAG, 'Purok 6', 13.156699, 123.715905, 60, 60, 'Full',
        'Toilets, sleeping mats', 'Kagawad Test Contact B', '09000000302'],
];

// household => [urgency, status, reason, [[item, requested, approved|null]], admin remarks]
$requests = [
    'H1' => ['Low', 'Distributed', 'Flood entered our yard; we need rice for a few days.', [['rice', 2, 2]], 'Approved and distributed (test record for feedback).'],
    'H2' => ['Medium', 'Pending', 'Roof leaks and food supply is low.', [['rice', 4, null], ['water', 12, null], ['hygiene', 1, null]], null],
    'H3' => ['High', 'Allocated', 'Kitchen flooded; no food or clean water.', [['pack', 3, 3], ['water', 18, 18]], 'Approved in full.'],
    'H4' => ['Critical', 'Under Review', 'House destroyed; we are in the evacuation center with a pregnant family member.', [['pack', 3, null], ['blanket', 2, null], ['firstaid', 1, null], ['hygiene', 1, null]], null],
    'H5' => ['Medium', 'Rejected', 'Need blankets after the landslide.', [['blanket', 2, null]], 'Disaster report is still pending verification. Please resubmit after verification.'],
    'H6' => ['Critical', 'Pending', 'Walls cracked and water tank damaged; need water and blankets.', [['rice', 4, null], ['water', 21, null], ['blanket', 3, null]], null],
    'H8' => ['Critical', 'Pending', 'House flooded to the ceiling; elderly, PWD and infant in the family.', [['pack', 4, null], ['hygiene', 2, null], ['water', 24, null], ['firstaid', 3, null]], null],
];

// ------------------------------------------------------------------ checks
$conn = (new Database())->connect();
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$emails = array_column($staff, 'email');
for ($i = 1; $i <= 8; $i++) {
    $emails[] = sprintf('binitayan.test%02d@gmail.com', $i);
}
$found = [];
$q = $conn->prepare("SELECT email FROM users WHERE email = :e");
foreach ($emails as $e) {
    $q->execute([':e' => $e]);
    if ($q->fetch()) $found[] = "user $e";
}
$q = $conn->prepare("SELECT household_id FROM households WHERE head_of_family = :h AND address LIKE :tag");
foreach ($households as $key => $h) {
    $q->execute([':h' => $h['head'], ':tag' => '%' . TAG . '%']);
    if ($q->fetch()) $found[] = "household $key ({$h['head']})";
}
$q = $conn->prepare("SELECT item_id FROM relief_items WHERE item_name = :n");
foreach ($items as $it) {
    $q->execute([':n' => $it[0]]);
    if ($q->fetch()) $found[] = "item {$it[0]}";
}
$q = $conn->prepare("SELECT center_id FROM evacuation_centers WHERE name = :n");
foreach ($centers as $c) {
    $q->execute([':n' => $c[0]]);
    if ($q->fetch()) $found[] = "center {$c[0]}";
}
$expected = count($emails) + count($households) + count($items) + count($centers);

foreach ($households as $key => $h) {
    $v = validate_household_coordinates((string) $h['lat'], (string) $h['lng']);
    if (!$v['valid']) exit("ABORT: $key coordinates are outside Barangay Binitayan.\n");
}
foreach ($centers as $c) {
    $v = validate_household_coordinates((string) $c[3], (string) $c[4]);
    if (!$v['valid']) exit("ABORT: {$c[0]} coordinates are outside Barangay Binitayan.\n");
}
$cats = $conn->query("SELECT category_name FROM inventory_categories WHERE is_active = 1")->fetchAll(PDO::FETCH_COLUMN);
foreach ($items as $it) {
    if (!in_array($it[1], $cats, true)) exit("ABORT: inventory category '{$it[1]}' does not exist or is inactive.\n");
}
foreach (['Flood', 'Typhoon', 'Landslide', 'Earthquake', 'Fire'] as $t) {
    $q = $conn->prepare("SELECT 1 FROM disaster_types WHERE type_name = :t AND is_active = 1");
    $q->execute([':t' => $t]);
    if (!$q->fetch()) exit("ABORT: disaster type '$t' is not active in this database.\n");
}

if (count($found) === $expected) {
    echo "TEST DATA ALREADY EXISTS — nothing created (no duplicates).\n";
    exit(0);
}
if (count($found) > 0) {
    echo "ABORT: part of the test dataset already exists. Nothing was changed.\n";
    foreach ($found as $f) echo "  - exists: $f\n";
    exit(1);
}
if ($check_only) {
    echo "CHECK ONLY: no test data found; coordinates, categories and disaster types are valid. Run without --check to create it.\n";
    exit(0);
}

// ------------------------------------------------------------------ insert
$hash = fn() => password_hash(TEST_PASSWORD, PASSWORD_DEFAULT);
$ids = ['staff' => [], 'user' => [], 'hh' => [], 'report' => [], 'item' => []];

try {
    $conn->beginTransaction();

    $ins_user = $conn->prepare("INSERT INTO users (full_name, email, password, role, is_active, contact_number) VALUES (:n, :e, :p, :r, 1, :c)");
    foreach ($staff as $s) {
        $ins_user->execute([':n' => $s['name'], ':e' => $s['email'], ':p' => $hash(), ':r' => $s['role'], ':c' => $s['contact']]);
        $ids['staff'][$s['role']] = (int) $conn->lastInsertId();
    }
    $admin_id = $ids['staff']['admin'];
    $personnel_id = $ids['staff']['relief_personnel'];

    $ins_hh = $conn->prepare(
        "INSERT INTO households (user_id, head_of_family, purok, address, number_of_members, vulnerable_members, children_count, seniors_count,
            pwd_count, pregnant_count, medical_needs_count, other_vulnerable_count, contact_number, latitude, longitude)
         VALUES (:u, :h, :p, :a, :m, :v, :c, :s, :pw, :g, 0, 0, :cn, :lat, :lng)"
    );
    $ins_member = $conn->prepare("INSERT INTO household_members (household_id, full_name, relationship, age) VALUES (:h, :n, :r, :a)");
    $n = 0;
    foreach ($households as $key => $h) {
        $n++;
        $email = sprintf('binitayan.test%02d@gmail.com', $n);
        $ins_user->execute([':n' => $h['head'], ':e' => $email, ':p' => $hash(), ':r' => 'resident', ':c' => $h['contact']]);
        $uid = (int) $conn->lastInsertId();
        $ids['user'][$key] = $uid;
        $ins_hh->execute([
            ':u' => $uid, ':h' => $h['head'], ':p' => $h['purok'],
            ':a' => "{$h['purok']}, Barangay Binitayan, Daraga, Albay " . TAG,
            ':m' => count($h['members']), ':v' => $h['c'] + $h['s'] + $h['p'] + $h['g'],
            ':c' => $h['c'], ':s' => $h['s'], ':pw' => $h['p'], ':g' => $h['g'],
            ':cn' => $h['contact'], ':lat' => $h['lat'], ':lng' => $h['lng'],
        ]);
        $hid = (int) $conn->lastInsertId();
        $ids['hh'][$key] = $hid;
        foreach ($h['members'] as $m) {
            $ins_member->execute([':h' => $hid, ':n' => $m[0], ':r' => $m[1], ':a' => $m[2]]);
        }
    }

    $ins_rep = $conn->prepare(
        "INSERT INTO disaster_reports (user_id, household_id, disaster_type, location, description, report_date, report_time, severity, status,
            verified_by, verified_at, verification_remarks)
         VALUES (:u, :h, :t, :l, :d, :dt, '08:30:00', :s, :st, :vb, :va, :vr)"
    );
    foreach ($reports as $key => $list) {
        foreach ($list as $i => $r) {
            $decided = $r[2] !== 'Pending';
            $ins_rep->execute([
                ':u' => $ids['user'][$key], ':h' => $ids['hh'][$key], ':t' => $r[0], ':l' => $r[4],
                ':d' => TAG . ' ' . $r[5], ':dt' => $r[3], ':s' => $r[1], ':st' => $r[2],
                ':vb' => $decided ? $admin_id : null, ':va' => $decided ? date('Y-m-d H:i:s') : null, ':vr' => $r[6],
            ]);
            if ($i === 0) $ids['report'][$key] = (int) $conn->lastInsertId();
        }
    }

    $ins_da = $conn->prepare(
        "INSERT INTO damage_assessments (report_id, house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, remarks, assessed_by)
         VALUES (:r, :h, :i, :p, :a, :e, :rm, :by)"
    );
    foreach ($assessments as $key => $a) {
        $ins_da->execute([':r' => $ids['report'][$key], ':h' => $a[0], ':i' => $a[1], ':p' => $a[2], ':a' => $a[3], ':e' => $a[4], ':rm' => TAG . ' ' . $a[5], ':by' => $admin_id]);
    }

    $ins_item = $conn->prepare("INSERT INTO relief_items (item_name, category, quantity, unit, minimum_level) VALUES (:n, :c, :q, :u, :m)");
    $ins_log = $conn->prepare("INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by) VALUES (:i, :t, :q, :r, :ref, :by)");
    $stock = [];
    foreach ($items as $k => $it) {
        $ins_item->execute([':n' => $it[0], ':c' => $it[1], ':q' => $it[2], ':u' => $it[3], ':m' => $it[4]]);
        $ids['item'][$k] = (int) $conn->lastInsertId();
        $stock[$k] = $it[2];
        $ins_log->execute([':i' => $ids['item'][$k], ':t' => 'Stock In', ':q' => $it[2], ':r' => $it[2], ':ref' => TAG . ' Initial test stock', ':by' => $admin_id]);
    }

    $ins_c = $conn->prepare(
        "INSERT INTO evacuation_centers (name, address, purok, latitude, longitude, capacity, current_occupancy, facilities, contact_person, contact_number, status, created_by, updated_by)
         VALUES (:n, :a, :p, :lat, :lng, :cap, :occ, :f, :cp, :cn, :st, :by, :by2)"
    );
    $center_ids = [];
    foreach ($centers as $c) {
        $ins_c->execute([':n' => $c[0], ':a' => $c[1], ':p' => $c[2], ':lat' => $c[3], ':lng' => $c[4], ':cap' => $c[5], ':occ' => $c[6], ':st' => $c[7],
            ':f' => $c[8], ':cp' => $c[9], ':cn' => $c[10], ':by' => $admin_id, ':by2' => $admin_id]);
        $center_ids[] = (int) $conn->lastInsertId();
    }

    $ins_req = $conn->prepare(
        "INSERT INTO relief_requests (household_id, user_id, report_id, urgency, reason, status, admin_remarks, reviewed_by, reviewed_at, processed_by, processed_at)
         VALUES (:h, :u, :r, :ug, :rs, :st, :rm, :rb, :ra, :pb, :pa)"
    );
    $ins_ri = $conn->prepare("INSERT INTO relief_request_items (request_id, item_id, requested_quantity, approved_quantity) VALUES (:r, :i, :q, :a)");
    $ins_alloc = $conn->prepare(
        "INSERT INTO relief_allocations (household_id, item_id, request_item_id, quantity, status, approved_by, approved_at, recommendation_reason, allocation_date, distributed_by, distributed_at)
         VALUES (:h, :i, :ri, :q, :st, :ab, NOW(), :why, CURDATE(), :db, :da)"
    );
    $request_ids = [];
    foreach ($requests as $key => $rq) {
        [$urgency, $status, $reason, $lines, $remarks] = $rq;
        $reviewed = !in_array($status, ['Pending'], true);
        $processed = in_array($status, ['Allocated', 'Distributed'], true);
        $ins_req->execute([
            ':h' => $ids['hh'][$key], ':u' => $ids['user'][$key], ':r' => $ids['report'][$key] ?? null, ':ug' => $urgency,
            ':rs' => TAG . ' ' . $reason, ':st' => $status, ':rm' => $remarks,
            ':rb' => $reviewed ? $admin_id : null, ':ra' => $reviewed ? date('Y-m-d H:i:s') : null,
            ':pb' => $processed ? $admin_id : null, ':pa' => $processed ? date('Y-m-d H:i:s') : null,
        ]);
        $rid = (int) $conn->lastInsertId();
        $request_ids[$key] = $rid;
        foreach ($lines as [$ik, $qty, $approved]) {
            $ins_ri->execute([':r' => $rid, ':i' => $ids['item'][$ik], ':q' => $qty, ':a' => $approved]);
            $ri = (int) $conn->lastInsertId();
            if ($processed && $approved > 0) {
                $dist = $status === 'Distributed';
                $ins_alloc->execute([':h' => $ids['hh'][$key], ':i' => $ids['item'][$ik], ':ri' => $ri, ':q' => $approved,
                    ':st' => $dist ? 'Distributed' : 'Approved', ':ab' => $admin_id, ':why' => TAG . " Relief request #$rid",
                    ':db' => $dist ? $personnel_id : null, ':da' => $dist ? date('Y-m-d H:i:s') : null]);
                $aid = (int) $conn->lastInsertId();
                if ($dist) {
                    $stock[$ik] -= $approved;
                    $conn->prepare("UPDATE relief_items SET quantity = :q WHERE item_id = :i")->execute([':q' => $stock[$ik], ':i' => $ids['item'][$ik]]);
                    $ins_log->execute([':i' => $ids['item'][$ik], ':t' => 'Stock Out', ':q' => -$approved, ':r' => $stock[$ik],
                        ':ref' => "Relief distribution — allocation #$aid, household #{$ids['hh'][$key]} ({$households[$key]['head']}) " . TAG, ':by' => $personnel_id]);
                }
            }
        }
    }

    // One scheduled distribution (Pending beneficiaries) for the test personnel.
    $conn->prepare("INSERT INTO relief_packages (package_name, description, is_active, created_by) VALUES (:n, :d, 1, :by)")
        ->execute([':n' => 'Family Relief Pack [TEST]', ':d' => TAG . ' 1 food pack, 6 bottles of water, 1 hygiene kit', ':by' => $admin_id]);
    $pkg = (int) $conn->lastInsertId();
    $ins_pi = $conn->prepare("INSERT INTO relief_package_items (package_id, item_id, quantity) VALUES (:p, :i, :q)");
    foreach ([['pack', 1], ['water', 6], ['hygiene', 1]] as [$ik, $q]) {
        $ins_pi->execute([':p' => $pkg, ':i' => $ids['item'][$ik], ':q' => $q]);
    }
    $conn->prepare(
        "INSERT INTO distribution_schedules (package_id, distribution_date, distribution_time, location, latitude, longitude, assigned_personnel, notes, created_by)
         VALUES (:p, '2026-10-10', '09:00:00', :l, :lat, :lng, :per, :n, :by)"
    )->execute([':p' => $pkg, ':l' => 'Binitayan Test Evacuation Center A', ':lat' => $centers[0][3], ':lng' => $centers[0][4],
        ':per' => $personnel_id, ':n' => TAG . ' Scheduled distribution for manual testing', ':by' => $admin_id]);
    $sched = (int) $conn->lastInsertId();
    $ins_b = $conn->prepare("INSERT INTO distribution_beneficiaries (schedule_id, household_id) VALUES (:s, :h)");
    foreach (['H7', 'H5'] as $key) {
        $ins_b->execute([':s' => $sched, ':h' => $ids['hh'][$key]]);
    }

    $conn->prepare("INSERT INTO audit_logs (user_id, action, details) VALUES (NULL, :a, :d)")
        ->execute([':a' => 'Test data seeded', ':d' => TAG . ' 8 synthetic households, 10 test accounts, 6 [TEST] items, 2 test evacuation centers (seed_test_data_8_households.php)']);

    $conn->commit();
} catch (Throwable $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    fwrite(STDERR, "ROLLED BACK — no test data was created. Reason: " . $e->getMessage() . "\n");
    exit(1);
}

echo "TEST DATA CREATED (one transaction).\n";
echo "  Admin test account:     admin.binitayan.test@gmail.com (user_id {$admin_id})\n";
echo "  Personnel test account: personnel.binitayan.test@gmail.com (user_id {$personnel_id})\n";
foreach ($ids['hh'] as $key => $hid) {
    echo "  $key household_id $hid, resident user_id {$ids['user'][$key]}, request_id " . ($request_ids[$key] ?? '-') . "\n";
}
echo "  Items: " . json_encode($ids['item']) . "\n  Centers: " . implode(', ', $center_ids) . "\n  Schedule: $sched (package $pkg)\n";
echo "  Password for all test accounts: see TEST_DATA_8_HOUSEHOLDS.md (stored hashed).\n";
