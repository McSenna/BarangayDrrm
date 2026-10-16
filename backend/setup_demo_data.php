<?php
/**
 * Demo/presentation data seeder — NOT for a real (production) database.
 *
 * Phase 17 Security Fix 2 — COMMAND LINE ONLY. Web requests get 404.
 * After the database is set up and setup_admin.php has been run, execute once
 * from XAMPP Shell (or any terminal) inside the project folder:
 *
 *     php backend/setup_demo_data.php
 *
 * Creates a full set of realistic demo accounts and records so you can
 * present every completed feature without manually creating test data live.
 * Safe to run even if you already have some data — accounts are skipped
 * (not duplicated) if the email already exists; household/report/schedule
 * records are only created the first time (checked by a marker in remarks).
 *
 * Demo accounts use the shared password demo1234 — never run this against a
 * database used for real barangay operations.
 */

// Refuse any web request (Apache, php -S, etc.) before touching the database.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    header("Content-Type: text/plain");
    echo "Not found.";
    exit();
}

require_once __DIR__ . '/config/database.php';

header("Content-Type: text/plain");

$database = new Database();
$conn = $database->connect();

echo "=== Barangay Binitayan — Demo Data Setup ===\n\n";

function create_user($conn, $full_name, $email, $password, $role, $contact) {
    $check = $conn->prepare("SELECT user_id FROM users WHERE email = :email");
    $check->execute([':email' => $email]);
    $existing = $check->fetch(PDO::FETCH_ASSOC);
    if ($existing) {
        echo "  - $email already exists, skipping (user_id {$existing['user_id']}).\n";
        return $existing['user_id'];
    }
    $stmt = $conn->prepare(
        "INSERT INTO users (full_name, email, password, role, contact_number) VALUES (:full_name, :email, :password, :role, :contact)"
    );
    $stmt->execute([
        ':full_name' => $full_name, ':email' => $email,
        ':password' => password_hash($password, PASSWORD_DEFAULT),
        ':role' => $role, ':contact' => $contact,
    ]);
    $id = $conn->lastInsertId();
    echo "  - Created $role account: $email (user_id $id)\n";
    return $id;
}

// ---------------------------------------------------------------
// 1. Demo accounts
// ---------------------------------------------------------------
echo "Step 1: Creating demo accounts...\n";

$resident1_id = create_user($conn, 'Maria Santos', 'demo.resident1@binitayan.gov.ph', 'demo1234', 'resident', '09171111111');
$resident2_id = create_user($conn, 'Pedro Ramirez', 'demo.resident2@binitayan.gov.ph', 'demo1234', 'resident', '09172222222');
$resident3_id = create_user($conn, 'Luzviminda Cruz', 'demo.resident3@binitayan.gov.ph', 'demo1234', 'resident', '09173333333');
$personnel1_id = create_user($conn, 'Ramon Bautista', 'demo.personnel1@binitayan.gov.ph', 'demo1234', 'relief_personnel', '09174444444');
$personnel2_id = create_user($conn, 'Corazon Villanueva', 'demo.personnel2@binitayan.gov.ph', 'demo1234', 'relief_personnel', '09175555555');

echo "\n";

// ---------------------------------------------------------------
// 2. Households (only created once — checked via a marker household)
// ---------------------------------------------------------------
echo "Step 2: Creating demo households...\n";

$marker_check = $conn->prepare("SELECT household_id FROM households WHERE head_of_family = 'Maria Santos' AND purok = 'Demo-3'");
$marker_check->execute();

if ($marker_check->fetch()) {
    echo "  - Demo households already exist, skipping this step.\n\n";
    $hh1_id = null; // Will be looked up below if needed
} else {
    $hh_stmt = $conn->prepare(
        "INSERT INTO households
            (user_id, head_of_family, purok, address, number_of_members, vulnerable_members,
             children_count, seniors_count, pwd_count, pregnant_count, medical_needs_count, other_vulnerable_count,
             contact_number, latitude, longitude)
         VALUES (:user_id, :head, :purok, :address, :members, :vulnerable,
                 :children, :seniors, :pwd, :pregnant, :medical, :other,
                 :contact, :lat, :lng)"
    );

    // Household 1 — high vulnerability, will become a Critical-priority example
    $hh_stmt->execute([
        ':user_id' => $resident1_id, ':head' => 'Maria Santos', ':purok' => 'Demo-3',
        ':address' => '123 Riverside St., Purok 3', ':members' => 6, ':vulnerable' => 3,
        ':children' => 2, ':seniors' => 1, ':pwd' => 0, ':pregnant' => 0, ':medical' => 0, ':other' => 0,
        ':contact' => '09171111111', ':lat' => 13.1391, ':lng' => 123.7438,
    ]);
    $hh1_id = $conn->lastInsertId();
    echo "  - Household 1 (Maria Santos, Purok Demo-3, high vulnerability) — household_id $hh1_id\n";

    // Household 2 — moderate, low vulnerability
    $hh_stmt->execute([
        ':user_id' => $resident2_id, ':head' => 'Pedro Ramirez', ':purok' => 'Demo-1',
        ':address' => '45 Mabini St., Purok 1', ':members' => 3, ':vulnerable' => 0,
        ':children' => 0, ':seniors' => 0, ':pwd' => 0, ':pregnant' => 0, ':medical' => 0, ':other' => 0,
        ':contact' => '09172222222', ':lat' => 13.1405, ':lng' => 123.7451,
    ]);
    $hh2_id = $conn->lastInsertId();
    echo "  - Household 2 (Pedro Ramirez, Purok Demo-1, low vulnerability) — household_id $hh2_id\n";

    // Household 3 — PWD + pregnant member, for vulnerability variety
    $hh_stmt->execute([
        ':user_id' => $resident3_id, ':head' => 'Luzviminda Cruz', ':purok' => 'Demo-3',
        ':address' => '78 Rizal Ave., Purok 3', ':members' => 4, ':vulnerable' => 2,
        ':children' => 0, ':seniors' => 0, ':pwd' => 1, ':pregnant' => 1, ':medical' => 0, ':other' => 0,
        ':contact' => '09173333333', ':lat' => 13.1380, ':lng' => 123.7420,
    ]);
    $hh3_id = $conn->lastInsertId();
    echo "  - Household 3 (Luzviminda Cruz, Purok Demo-3, PWD + pregnant) — household_id $hh3_id\n";

    // A household with NO linked resident account and NO coordinates —
    // demonstrates the "Missing Coordinates" list on the map and manual admin entry
    $hh_stmt->execute([
        ':user_id' => null, ':head' => 'Roberto Aquino', ':purok' => 'Demo-2',
        ':address' => '12 Bonifacio St., Purok 2', ':members' => 5, ':vulnerable' => 1,
        ':children' => 1, ':seniors' => 0, ':pwd' => 0, ':pregnant' => 0, ':medical' => 0, ':other' => 0,
        ':contact' => '09176666666', ':lat' => null, ':lng' => null,
    ]);
    $hh4_id = $conn->lastInsertId();
    echo "  - Household 4 (Roberto Aquino, Purok Demo-2, no account link, no coordinates) — household_id $hh4_id\n";

    // Household members for Household 1 (Maria Santos)
    $member_stmt = $conn->prepare("INSERT INTO household_members (household_id, full_name, relationship, age) VALUES (:hh, :name, :rel, :age)");
    $member_stmt->execute([':hh' => $hh1_id, ':name' => 'Maria Santos', ':rel' => 'Head', ':age' => 42]);
    $member_stmt->execute([':hh' => $hh1_id, ':name' => 'Jose Santos', ':rel' => 'Spouse', ':age' => 45]);
    $member_stmt->execute([':hh' => $hh1_id, ':name' => 'Ana Santos', ':rel' => 'Daughter', ':age' => 8]);
    $member_stmt->execute([':hh' => $hh1_id, ':name' => 'Miguel Santos', ':rel' => 'Son', ':age' => 5]);
    echo "  - Added household members for Household 1\n\n";

    // ---------------------------------------------------------------
    // 3. Disaster reports
    // ---------------------------------------------------------------
    echo "Step 3: Creating demo disaster reports...\n";

    $report_stmt = $conn->prepare(
        "INSERT INTO disaster_reports (user_id, household_id, disaster_type, location, description, report_date, report_time, severity, status)
         VALUES (:user_id, :hh, :type, :location, :desc, :date, :time, :severity, :status)"
    );

    // Verified, Critical severity, on Household 1 — will drive priority scoring demo
    $report_stmt->execute([
        ':user_id' => $resident1_id, ':hh' => $hh1_id, ':type' => 'Flood',
        ':location' => 'Purok Demo-3, near the riverside', ':desc' => 'Floodwater reached waist-level inside our home. We evacuated to higher ground.',
        ':date' => date('Y-m-d', strtotime('-2 days')), ':time' => '14:30:00', ':severity' => 'Critical', ':status' => 'Verified',
    ]);
    $report1_id = $conn->lastInsertId();
    echo "  - Verified Critical Flood report on Household 1 (report_id $report1_id)\n";

    // Pending, Medium severity, on Household 3 — for the verification workflow demo
    $report_stmt->execute([
        ':user_id' => $resident3_id, ':hh' => $hh3_id, ':type' => 'Landslide',
        ':location' => 'Purok Demo-3, hillside road', ':desc' => 'Small landslide blocked the road near our house after heavy rain.',
        ':date' => date('Y-m-d', strtotime('-1 day')), ':time' => '08:15:00', ':severity' => 'Medium', ':status' => 'Pending',
    ]);
    $report2_id = $conn->lastInsertId();
    echo "  - Pending Medium Landslide report on Household 3 (report_id $report2_id) — ready to Verify/Reject live\n";

    // Rejected example, on Household 2
    $report_stmt->execute([
        ':user_id' => $resident2_id, ':hh' => $hh2_id, ':type' => 'Fire',
        ':location' => 'Purok Demo-1', ':desc' => 'Reported a small fire that turned out to be a controlled burn.',
        ':date' => date('Y-m-d', strtotime('-5 days')), ':time' => '10:00:00', ':severity' => 'Low', ':status' => 'Rejected',
    ]);
    echo "  - Rejected Fire report on Household 2 (with verification_remarks example)\n";

    $conn->prepare("UPDATE disaster_reports SET verified_by = :admin, verified_at = NOW(), verification_remarks = :remarks WHERE report_id = :id")
        ->execute([':admin' => null, ':remarks' => 'Confirmed to be a controlled agricultural burn, not an emergency.', ':id' => $conn->lastInsertId()]);

    // Verify report 1 with remarks, and add a damage assessment
    $conn->prepare("UPDATE disaster_reports SET verified_by = :admin, verified_at = NOW(), verification_remarks = :remarks WHERE report_id = :id")
        ->execute([':admin' => null, ':remarks' => 'Confirmed on-site by barangay tanod. Household evacuated safely.', ':id' => $report1_id]);

    $conn->prepare(
        "INSERT INTO damage_assessments (report_id, house_damage, infrastructure_damage, property_damage, agricultural_damage, estimated_severity, remarks)
         VALUES (:id, 'Major', 'Minor', 'Major', 'None', 'Critical', 'Ground floor furniture and appliances damaged. House structurally sound but needs cleanup.')"
    )->execute([':id' => $report1_id]);
    echo "  - Added damage assessment for report_id $report1_id (feeds into priority scoring)\n\n";

    // ---------------------------------------------------------------
    // 4. Inventory — add a low-stock item for the Low Stock dashboard demo
    // ---------------------------------------------------------------
    echo "Step 4: Adding a low-stock demo item...\n";
    $item_check = $conn->prepare("SELECT item_id FROM relief_items WHERE item_name = 'Instant Noodles'");
    $item_check->execute();
    if (!$item_check->fetch()) {
        $conn->prepare(
            "INSERT INTO relief_items (item_name, category, quantity, unit, minimum_level) VALUES ('Instant Noodles', 'Food', 5, 'pack', 20)"
        )->execute();
        echo "  - Added 'Instant Noodles' at 5/20 units (shows as Low Stock)\n\n";
    } else {
        echo "  - 'Instant Noodles' already exists, skipping.\n\n";
    }

    // ---------------------------------------------------------------
    // 5. Relief package
    // ---------------------------------------------------------------
    echo "Step 5: Creating a demo relief package...\n";
    $rice_id = $conn->query("SELECT item_id FROM relief_items WHERE item_name = 'Rice' LIMIT 1")->fetchColumn();
    $water_id = $conn->query("SELECT item_id FROM relief_items WHERE item_name = 'Drinking Water' LIMIT 1")->fetchColumn();
    $hygiene_id = $conn->query("SELECT item_id FROM relief_items WHERE item_name = 'Hygiene Kits' LIMIT 1")->fetchColumn();

    $pkg_check = $conn->prepare("SELECT package_id FROM relief_packages WHERE package_name = 'Standard Family Pack'");
    $pkg_check->execute();
    $existing_pkg = $pkg_check->fetch(PDO::FETCH_ASSOC);

    if ($existing_pkg) {
        $package_id = $existing_pkg['package_id'];
        echo "  - 'Standard Family Pack' already exists (package_id $package_id), skipping.\n\n";
    } else {
        $conn->prepare("INSERT INTO relief_packages (package_name, description, created_by) VALUES ('Standard Family Pack', 'Basic relief bundle for a family of 4-6', :by)")
            ->execute([':by' => null]);
        $package_id = $conn->lastInsertId();
        $pkg_item_stmt = $conn->prepare("INSERT INTO relief_package_items (package_id, item_id, quantity) VALUES (:pkg, :item, :qty)");
        if ($rice_id) $pkg_item_stmt->execute([':pkg' => $package_id, ':item' => $rice_id, ':qty' => 1]);
        if ($water_id) $pkg_item_stmt->execute([':pkg' => $package_id, ':item' => $water_id, ':qty' => 6]);
        if ($hygiene_id) $pkg_item_stmt->execute([':pkg' => $package_id, ':item' => $hygiene_id, ':qty' => 1]);
        echo "  - Created 'Standard Family Pack' package (package_id $package_id)\n\n";
    }

    // ---------------------------------------------------------------
    // 6. Distribution schedule with beneficiaries in different pipeline stages
    // ---------------------------------------------------------------
    echo "Step 6: Creating a demo distribution schedule...\n";
    $conn->prepare(
        "INSERT INTO distribution_schedules (package_id, distribution_date, distribution_time, location, assigned_personnel, notes, created_by)
         VALUES (:pkg, :date, :time, :location, :personnel, :notes, :by)"
    )->execute([
        ':pkg' => $package_id, ':date' => date('Y-m-d'), ':time' => '09:00:00',
        ':location' => 'Barangay Covered Court', ':personnel' => $personnel1_id,
        ':notes' => 'Demo distribution event for presentation purposes.', ':by' => null,
    ]);
    $schedule_id = $conn->lastInsertId();
    echo "  - Created schedule (schedule_id $schedule_id), assigned to demo.personnel1\n";

    // Beneficiary A: Household 1 — already Delivered, with a full delivery report (for Completed Deliveries demo)
    $conn->prepare("INSERT INTO distribution_beneficiaries (schedule_id, household_id, is_verified, verified_by, verified_at, status, status_updated_by, status_updated_at, remarks) VALUES (:s, :h, 1, :v, NOW(), 'Delivered', :u, NOW(), 'Delivered without issues.')")
        ->execute([':s' => $schedule_id, ':h' => $hh1_id, ':v' => $personnel1_id, ':u' => $personnel1_id]);
    $ben1_id = $conn->lastInsertId();

    $conn->prepare("INSERT INTO delivery_reports (beneficiary_id, recipient_name, remarks, submitted_by) VALUES (:b, 'Maria Santos', 'Recipient confirmed receipt in good condition.', :by)")
        ->execute([':b' => $ben1_id, ':by' => $personnel1_id]);

    // Create the matching relief_allocations rows + reduce inventory, exactly like the real Delivered flow would
    if ($rice_id) {
        $conn->prepare("INSERT INTO relief_allocations (household_id, item_id, schedule_id, quantity, status, allocation_date, distributed_by, distributed_at) VALUES (:h, :i, :s, 1, 'Distributed', CURDATE(), :by, NOW())")
            ->execute([':h' => $hh1_id, ':i' => $rice_id, ':s' => $schedule_id, ':by' => $personnel1_id]);
        $conn->prepare("UPDATE relief_items SET quantity = GREATEST(0, quantity - 1) WHERE item_id = :i")->execute([':i' => $rice_id]);
    }
    if ($water_id) {
        $conn->prepare("INSERT INTO relief_allocations (household_id, item_id, schedule_id, quantity, status, allocation_date, distributed_by, distributed_at) VALUES (:h, :i, :s, 6, 'Distributed', CURDATE(), :by, NOW())")
            ->execute([':h' => $hh1_id, ':i' => $water_id, ':s' => $schedule_id, ':by' => $personnel1_id]);
        $conn->prepare("UPDATE relief_items SET quantity = GREATEST(0, quantity - 6) WHERE item_id = :i")->execute([':i' => $water_id]);
    }
    echo "  - Beneficiary: Household 1 — status Delivered, with delivery report (Completed Deliveries demo)\n";

    // Beneficiary B: Household 3 — Verified but still Pending (ready to advance live: Prepared -> Dispatched -> Delivered)
    $conn->prepare("INSERT INTO distribution_beneficiaries (schedule_id, household_id, is_verified, verified_by, verified_at, status) VALUES (:s, :h, 1, :v, NOW(), 'Pending')")
        ->execute([':s' => $schedule_id, ':h' => $hh3_id, ':v' => $personnel1_id]);
    echo "  - Beneficiary: Household 3 — Verified, status Pending (advance live during the demo)\n";

    // Beneficiary C: Household 2 — not yet verified (for the Beneficiary Verification demo)
    $conn->prepare("INSERT INTO distribution_beneficiaries (schedule_id, household_id, status) VALUES (:s, :h, 'Pending')")
        ->execute([':s' => $schedule_id, ':h' => $hh2_id]);
    echo "  - Beneficiary: Household 2 — Unverified (verify live during the demo)\n\n";

    // ---------------------------------------------------------------
    // 7. Hazard alert + weather log
    // ---------------------------------------------------------------
    echo "Step 7: Creating a demo hazard alert and weather log...\n";
    $conn->prepare(
        "INSERT INTO hazard_alerts (hazard_type, status, title, description, affected_purok, is_active, issued_by, issued_at)
         VALUES ('Flood', 'Warning', 'Rising water levels along Binitayan River', 'Continuous rainfall has raised the river level. Residents near the riverside are advised to prepare for possible evacuation.', 'Demo-3', 1, :by, NOW())"
    )->execute([':by' => null]);
    echo "  - Active Flood Warning for Purok Demo-3 (shows on Home page + all dashboards)\n";

    $conn->prepare(
        "INSERT INTO weather_logs (log_date, log_time, temperature, rainfall_mm, weather_condition, wind_speed_kph, wind_direction, source, remarks, recorded_by)
         VALUES (CURDATE(), CURTIME(), 27.5, 45.0, 'Stormy', 38.0, 'NE', 'Manual', 'Continuous rain since this morning.', :by)"
    )->execute([':by' => null]);
    echo "  - Weather log entry for today\n\n";

    echo "=== Demo data setup complete! ===\n\n";
}

echo "DEMO LOGIN CREDENTIALS (password for all: demo1234)\n";
echo "----------------------------------------------------\n";
echo "Resident:          demo.resident1@binitayan.gov.ph  (Maria Santos — Critical priority, has Pending relief)\n";
echo "Resident:          demo.resident2@binitayan.gov.ph  (Pedro Ramirez — low priority, unverified beneficiary)\n";
echo "Resident:          demo.resident3@binitayan.gov.ph  (Luzviminda Cruz — has a Pending report to verify live)\n";
echo "Relief Personnel:  demo.personnel1@binitayan.gov.ph (assigned to the demo distribution schedule)\n";
echo "Relief Personnel:  demo.personnel2@binitayan.gov.ph (no assignments yet — clean personnel view)\n";
echo "Admin:             use your existing admin account from setup_admin.php\n\n";
echo "IMPORTANT: demo accounts share the password demo1234 — do not use this data on a real/production database.\n";
