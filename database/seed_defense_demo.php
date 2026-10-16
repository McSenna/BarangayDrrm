<?php
/**
 * DEFENSE DEMONSTRATION TEST DATASET — "Typhoon Binitayan Defense Demonstration 2026"
 *
 * SYNTHETIC TEST DATA ONLY. Every name, number and photo here is fictional and
 * marked "[DEFENSE TEST]". It does not describe real residents of Barangay Binitayan.
 *
 * HOW IT WORKS
 *   1. Safety checks (local database, local API, TextBee SMS off, fresh database,
 *      no existing test accounts, coordinates inside the Binitayan boundary).
 *   2. Creates ONLY the Administrator test account directly (password_hash, the
 *      same as users/add_user.php) — the API needs one admin to log in with.
 *   3. Everything else is done through the REAL PHP REST API, exactly as the
 *      React pages do it, so all validation, DSS logic, stock reservation,
 *      stock deduction, inventory logs, notifications, SMS logs and audit logs
 *      are produced by the application itself. Nothing is forced or edited
 *      directly in the database afterwards.
 *
 * RUN (command line only), with XAMPP Apache + MySQL running:
 *     php database/seed_defense_demo.php --check
 *     php database/seed_defense_demo.php --api=http://localhost/barangay-disaster/backend/
 *   XAMPP on Windows:
 *     C:\xampp\php\php.exe database\seed_defense_demo.php --api=http://localhost/barangay-disaster/backend/
 *
 * OPTIONS
 *   --api=URL               Backend base URL (default http://localhost/barangay-disaster/backend/)
 *   --check                 Run the safety checks only; change nothing.
 *   --allow-existing-data   Allow running on a database that already has households,
 *                           reports or relief items (DSS ranks and dashboard totals in
 *                           DEFENSE_TEST_DATA.md will then differ). Default: refuse.
 *
 * SAFETY
 *   - Refuses to run if APP_ENV is "production", the database host is not local,
 *     or the API URL is not localhost / 127.0.0.1.
 *   - Refuses to run while TextBee SMS is enabled, so no real SMS can be sent to
 *     the synthetic 0900 numbers. Event SMS are logged as "Not Configured".
 *   - Refuses to run if any of the 10 test e-mail addresses already exist
 *     (reports them instead of creating duplicates).
 *   - Additive only: no DROP, no TRUNCATE, no DELETE, no reset.
 *   - If an API step fails, the script stops and prints what was already created.
 *     Re-import a fresh database before running it again (see DEFENSE_TEST_DATA.md).
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Command line only.\n");
}

require_once __DIR__ . '/../backend/config/database.php';
require_once __DIR__ . '/../backend/utils/boundary_validator.php';

const TEST_PASSWORD = 'BinitayanTest2026!';
const TAG = '[DEFENSE TEST]';
const SCENARIO = 'Typhoon Binitayan Defense Demonstration 2026';

$opts = getopt('', ['api::', 'check', 'allow-existing-data']);
$api_base = rtrim($opts['api'] ?? 'http://localhost/barangay-disaster/backend/', '/') . '/';
$check_only = isset($opts['check']);
$allow_existing = isset($opts['allow-existing-data']);

function out(string $s): void { echo $s . "\n"; }
function stop(string $s, int $code = 1): void { fwrite(STDERR, "STOPPED: $s\n"); exit($code); }

// ======================================================================= DATASET
$admin = ['email' => 'admin.binitayan.test@gmail.com', 'name' => 'Carmela Robles', 'contact' => '09000001201'];
$personnel = ['email' => 'personnel.binitayan.test@gmail.com', 'name' => 'Nestor Valdez', 'contact' => '09000001202'];

// counts: c = children (infants are recorded here; the system has no separate
// "infant" field), s = seniors (elderly), p = PWD, g = pregnant.
// Members: [name, relationship, age]. Sex is not stored by the system.
$households = [
    'H01' => ['purok' => 'Purok 1', 'head' => 'Ramon Dizon', 'contact' => '09000001101', 'lat' => 13.154505, 'lng' => 123.715905,
        'c' => 0, 's' => 0, 'p' => 0, 'g' => 0,
        'members' => [['Ramon Dizon', 'Head of family', 58], ['Lydia Dizon', 'Spouse', 56]]],
    'H02' => ['purok' => 'Purok 2', 'head' => 'Gloria Mendoza', 'contact' => '09000001102', 'lat' => 13.154818, 'lng' => 123.715269,
        'c' => 0, 's' => 1, 'p' => 0, 'g' => 0,
        'members' => [['Gloria Mendoza', 'Head of family', 45], ['Ronaldo Mendoza', 'Spouse', 47], ['Kyle Mendoza', 'Son', 19], ['Pacita Rivera', 'Mother (elderly / senior citizen)', 71]]],
    'H03' => ['purok' => 'Purok 3', 'head' => 'Eduardo Salazar', 'contact' => '09000001103', 'lat' => 13.154975, 'lng' => 123.716699,
        'c' => 1, 's' => 0, 'p' => 1, 'g' => 0,
        'members' => [['Eduardo Salazar', 'Head of family', 46], ['Marissa Salazar', 'Spouse', 44], ['Joshua Salazar', 'Son (PWD, mobility impairment)', 20],
            ['Carla Salazar', 'Daughter', 23], ['Bea Salazar', 'Daughter', 18], ['Mika Salazar', 'Granddaughter (infant, 7 months)', 0]]],
    'H04' => ['purok' => 'Purok 4', 'head' => 'Jerome Pascual', 'contact' => '09000001104', 'lat' => 13.155289, 'lng' => 123.715269,
        'c' => 0, 's' => 0, 'p' => 0, 'g' => 1,
        'members' => [['Jerome Pascual', 'Head of family', 31], ['Angelica Pascual', 'Spouse (pregnant, 7 months)', 29], ['Rolando Pascual', 'Father', 56],
            ['Maricel Pascual', 'Sister', 26], ['Dennis Pascual', 'Brother', 22]]],
    'H05' => ['purok' => 'Purok 5A', 'head' => 'Corazon Villanueva', 'contact' => '09000001105', 'lat' => 13.155445, 'lng' => 123.716699,
        'c' => 0, 's' => 1, 'p' => 0, 'g' => 0,
        'members' => [['Corazon Villanueva', 'Head of family', 52], ['Andres Villanueva', 'Father-in-law (elderly / senior citizen)', 78], ['Paolo Villanueva', 'Son', 25]]],
    'H06' => ['purok' => 'Purok 5B', 'head' => 'Wilfredo Ocampo', 'contact' => '09000001106', 'lat' => 13.155759, 'lng' => 123.714951,
        'c' => 1, 's' => 1, 'p' => 0, 'g' => 0, 'coords_by_update' => true,
        'members' => [['Wilfredo Ocampo', 'Head of family', 48], ['Rosalinda Ocampo', 'Spouse', 46], ['Esperanza Ocampo', 'Mother (elderly / senior citizen)', 75],
            ['Mark Ocampo', 'Son', 24], ['Jenny Ocampo', 'Daughter-in-law', 22], ['Ryan Ocampo', 'Son', 19], ['Liam Ocampo', 'Grandson (infant, 1 year)', 1]]],
    'H07' => ['purok' => 'Purok 6', 'head' => 'Leonora Castillo', 'contact' => '09000001107', 'lat' => 13.155916, 'lng' => 123.716381,
        'c' => 0, 's' => 0, 'p' => 1, 'g' => 0,
        'members' => [['Leonora Castillo', 'Head of family', 40], ['Benjie Castillo', 'Spouse (PWD, wheelchair user)', 43], ['Trisha Castillo', 'Daughter', 19], ['Paul Castillo', 'Son', 18]]],
    'H08' => ['purok' => 'Purok 7', 'head' => 'Ernesto Dimaculangan', 'contact' => '09000001108', 'lat' => 13.156229, 'lng' => 123.714633,
        'c' => 1, 's' => 1, 'p' => 1, 'g' => 0,
        'members' => [['Ernesto Dimaculangan', 'Head of family', 51], ['Lorna Dimaculangan', 'Spouse', 49], ['Felipa Dimaculangan', 'Mother (elderly / senior citizen)', 80],
            ['Ramil Dimaculangan', 'Son (PWD, visual impairment)', 27], ['Joy Dimaculangan', 'Daughter-in-law', 25], ['Kenneth Dimaculangan', 'Son', 21],
            ['Aira Dimaculangan', 'Daughter', 19], ['Zoe Dimaculangan', 'Granddaughter (infant, 4 months)', 0]]],
];

// Reports: all Typhoon (one scenario). [severity, verify?, date, time, location, description, verification remarks, photos]
$reports = [
    'H01' => ['Low', true, '2026-09-28', '16:20', 'Purok 1, near the drainage canal',
        'Heavy rain flooded the yard ankle-deep. No water entered the house; part of the bamboo fence and some plants were damaged.',
        'Checked during the purok inspection. Minor yard damage only.', []],
    'H02' => ['Medium', true, '2026-09-28', '17:05', 'Purok 2, along the barangay road',
        'Strong winds lifted several roof sheets. Rainwater leaked into the living area and wet clothes and school supplies.',
        'Roof damage confirmed by the BDRRM team.', []],
    'H03' => ['High', true, '2026-09-28', '18:40', 'Purok 3, low-lying area',
        'Floodwater rose to about waist level inside the house. The refrigerator, rice cooker and stored food were damaged. The family stayed with relatives for two nights.',
        'Flood damage confirmed; household needs food and clean water.', ['report_flood_house.jpg']],
    'H04' => ['Critical', true, '2026-09-28', '19:15', 'Purok 4, upper side',
        'The roof was blown off and a side wall collapsed during the strongest winds. The house is not safe to stay in; the family moved to the evacuation center. One member is pregnant.',
        'Severe damage confirmed on site. Family is at the evacuation center.', ['report_roof_damage.jpg', 'report_collapsed_wall.jpg', 'report_flooded_interior.jpg']],
    'H05' => ['Medium', true, '2026-09-29', '07:30', 'Purok 5A hillside',
        'Heavy rain caused soil to slide behind the house. Mud entered the kitchen and a small part of the back wall cracked.',
        'Soil movement and wall crack confirmed.', []],
    'H06' => ['High', true, '2026-09-29', '08:10', 'Purok 5B, interior lot',
        'Floodwater entered the house and a fallen tree damaged the kitchen roof. The water pump stopped working.',
        'Confirmed; kitchen roof and water pump damaged.', []],
    'H07' => ['Critical', true, '2026-09-29', '09:00', 'Purok 6, near the chapel',
        'Most of the roof and the kitchen were destroyed by the typhoon; furniture and appliances were soaked. A family member uses a wheelchair and needs a safe place to stay.',
        'House largely destroyed; family member with disability confirmed.', []],
    'H08' => ['High', false, '2026-09-29', '10:25', 'Purok 7, riverside',
        'The nearby river overflowed. Floodwater reached chest level in the house and destroyed the backyard vegetable garden. The elderly, PWD and infant members moved to a relative\'s house.',
        null, []],
];

// Damage assessments: house, infrastructure, property, agricultural, estimated severity, remarks.
// The application supports only None / Minor / Major / Totally Damaged.
$assessments = [
    'H01' => ['Minor', 'None', 'None', 'Minor', 'Low', 'Minor: fence and garden plants damaged; house not affected.'],
    'H02' => ['Minor', 'None', 'Minor', 'None', 'Medium', 'Moderate overall (recorded as Minor house + Minor property): roof sheets loosened, some belongings wet.'],
    'H03' => ['Major', 'None', 'Major', 'None', 'High', 'Major: flood damaged kitchen, appliances and stored food.'],
    'H04' => ['Totally Damaged', 'Minor', 'Totally Damaged', 'None', 'Critical', 'Total: roof gone and side wall collapsed; house not habitable.'],
    'H05' => ['Minor', 'None', 'Minor', 'None', 'Medium', 'Minor: mud in kitchen, small crack on back wall.'],
    'H06' => ['Major', 'Major', 'Minor', 'None', 'High', 'Major: kitchen roof broken by fallen tree; water pump not working.'],
    'H07' => ['Totally Damaged', 'None', 'Major', 'None', 'Critical', 'Major/Total: most of the roof and kitchen destroyed; appliances soaked.'],
    'H08' => ['Major', 'None', 'Major', 'Major', 'High', 'Major: house flooded to chest level; vegetable garden destroyed.'],
];

// Inventory: key => [name, category, starting quantity, unit, minimum level]
$items = [
    'rice' => ['Rice ' . TAG, 'Food', 100, 'kg', 20],
    'water' => ['Bottled Water ' . TAG, 'Water', 96, 'bottle (1 L)', 30],
    'pack' => ['Family Food Pack ' . TAG, 'Food', 20, 'pack', 10],
    'hygiene' => ['Hygiene Kit ' . TAG, 'Hygiene', 6, 'kit', 10],
    'blanket' => ['Blanket ' . TAG, 'Shelter', 10, 'pc', 5],
    'firstaid' => ['First Aid Kit ' . TAG, 'Medical', 4, 'kit', 5],
];
$stock_in = [['water', 24, 'Delivery from the Municipal DRRM Office ' . TAG]];

$centers = [
    ['name' => 'Binitayan Defense Demonstration Evacuation Center', 'purok' => 'Purok 3', 'lat' => 13.156386, 'lng' => 123.716222,
        'capacity' => 50, 'start' => 12, 'occupancy' => 18, 'occ_remarks' => 'Families from Purok 4 and Purok 7 arrived after the river overflowed.',
        'contact_person' => 'Kagawad on duty (Defense Test)', 'contact' => '09000001301'],
    ['name' => 'Binitayan Defense Demonstration Evacuation Center B', 'purok' => 'Purok 6', 'lat' => 13.156699, 'lng' => 123.715905,
        'capacity' => 30, 'start' => 8, 'occupancy' => 8, 'occ_remarks' => null,
        'contact_person' => 'Barangay health worker on duty (Defense Test)', 'contact' => '09000001302'],
];
$facilities = 'Water, Restrooms, Electricity, First Aid, Sleeping Area';

// Hazard alerts: [type, status, title, description, affected purok ('' = barangay-wide), resolve afterwards?]
$alerts = [
    ['Typhoon', 'Critical', SCENARIO . ' — strong winds and heavy rain',
        'Typhoon signal raised for Barangay Binitayan. Secure roofs, stay indoors and prepare to evacuate if instructed. ' . TAG, '', true],
    ['Flood', 'Critical', 'River overflow along the Purok 7 riverside',
        'Floodwater remains high near the river after the typhoon. Residents should stay away from the riverbank. ' . TAG, 'Purok 7', false],
    ['Landslide', 'Warning', 'Landslide risk on the Purok 5A hillside',
        'Soil remains saturated after heavy rainfall. Watch for cracks and soil movement behind houses. ' . TAG, 'Purok 5A', false],
];
// Weather logs: [date, time, condition, temperature, rainfall mm, wind kph, wind direction, remarks]
$weather = [
    ['2026-09-28', '15:00', 'Stormy', 24.5, 86.0, 110.0, 'NE', 'Typhoon passing near Albay (manual log). ' . TAG],
    ['2026-09-29', '09:00', 'Rainy', 25.0, 38.0, 45.0, 'N', 'Continuous rain after the typhoon (manual log). ' . TAG],
    ['2026-09-30', '09:00', 'Cloudy', 27.5, 4.0, 15.0, 'E', 'Rain has stopped; flooding remains in low-lying puroks (manual log). ' . TAG],
];

// Relief requests (created by the residents): [urgency, reason, [[item, qty]]]
$requests = [
    'H03' => ['High', 'Our kitchen was flooded and our stored food and drinking water were spoiled. We need food packs and clean water.', [['pack', 3], ['water', 12]]],
    'H04' => ['Critical', 'Our house was destroyed and we are at the evacuation center with a pregnant family member. We need food, water and hygiene kits.', [['pack', 4], ['hygiene', 2], ['water', 18]]],
    'H07' => ['Critical', 'Our house and kitchen were destroyed. We need food and hygiene kits; my husband uses a wheelchair.', [['pack', 3], ['hygiene', 3]]],
    'H08' => ['High', 'The river flooded our house up to chest level. We need food, drinking water and hygiene kits for 8 members, including an infant.', [['pack', 5], ['water', 24], ['hygiene', 5]]],
];

// ======================================================================= CHECKS
out("Defense demonstration dataset — " . SCENARIO);
out("API: $api_base");

$env = strtolower((string) app_config('APP_ENV'));
$db_host = strtolower((string) app_config('DB_HOST'));
$db_name = (string) app_config('DB_NAME');
if ($env === 'production' || $env === 'prod') {
    stop("APP_ENV is '$env'. This dataset is for a LOCAL / TEST database only. Set APP_ENV to 'local' in backend/config/app_config.local.php if this really is your local XAMPP copy.");
}
if (!in_array($db_host, ['localhost', '127.0.0.1', '::1'], true)) {
    stop("DB_HOST is '$db_host', not a local database. Refusing to touch a possible production database.");
}
$api_host = strtolower((string) parse_url($api_base, PHP_URL_HOST));
if (!in_array($api_host, ['localhost', '127.0.0.1', '::1'], true)) {
    stop("The API URL host is '$api_host'. Only a local API (localhost / 127.0.0.1) is allowed.");
}
if (!function_exists('curl_init')) {
    stop("The PHP curl extension is not enabled for the command line. Enable extension=curl in php.ini.");
}
$sms = require __DIR__ . '/../backend/config/sms_api_config.php';
if (!empty($sms['SMS_ENABLED']) && $sms['API_KEY'] !== '' && $sms['DEVICE_ID'] !== '') {
    stop("TextBee SMS is ENABLED. Disable it (TEXTBEE_SMS_ENABLED => false) while seeding so no real SMS is sent to the synthetic 0900 numbers. Re-enable it afterwards for the live SMS step.");
}
out("  OK  APP_ENV '$env', database '$db_name' on '$db_host', TextBee SMS not configured for this run.");

$conn = (new Database())->connect();
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$emails = [$admin['email'], $personnel['email']];
for ($i = 1; $i <= 8; $i++) $emails[] = sprintf('binitayan.test%02d@gmail.com', $i);
$q = $conn->prepare("SELECT user_id, full_name, role FROM users WHERE email = :e");
$existing = [];
foreach ($emails as $e) {
    $q->execute([':e' => $e]);
    if ($r = $q->fetch(PDO::FETCH_ASSOC)) $existing[] = "$e (user_id {$r['user_id']}, {$r['role']}, {$r['full_name']})";
}
if ($existing) {
    out("Test accounts already exist in '$db_name' — nothing was created (no duplicates):");
    foreach ($existing as $x) out("  - $x");
    out("Load the defense dataset into a fresh database instead (see DEFENSE_TEST_DATA.md, section 1).");
    exit(1);
}
$counts = [];
foreach (['households', 'disaster_reports', 'relief_items', 'relief_requests'] as $t) {
    $counts[$t] = (int) $conn->query("SELECT COUNT(*) FROM $t")->fetchColumn();
}
if (array_sum($counts) > 0 && !$allow_existing) {
    out("This database already contains data: " . json_encode($counts));
    stop("The defense dataset expects a fresh database so the documented DSS ranking and dashboard totals match. Use a fresh database, or pass --allow-existing-data to add it anyway.");
}
foreach ($households as $k => $h) {
    $v = validate_household_coordinates((string) $h['lat'], (string) $h['lng']);
    if (!$v['valid']) stop("$k coordinates are outside Barangay Binitayan. Correct the test coordinate (validation is not disabled).");
}
foreach ($centers as $c) {
    $v = validate_household_coordinates((string) $c['lat'], (string) $c['lng']);
    if (!$v['valid']) stop("{$c['name']} coordinates are outside Barangay Binitayan.");
}
$cats = $conn->query("SELECT category_name FROM inventory_categories WHERE is_active = 1")->fetchAll(PDO::FETCH_COLUMN);
foreach ($items as $it) {
    if (!in_array($it[1], $cats, true)) stop("Inventory category '{$it[1]}' does not exist or is inactive.");
}
$t = $conn->prepare("SELECT 1 FROM disaster_types WHERE type_name = 'Typhoon' AND is_active = 1");
$t->execute();
if (!$t->fetch()) stop("Disaster type 'Typhoon' is not active in this database.");
$photo_dir = __DIR__ . '/defense_demo/photos/';
foreach (array_merge(...array_map(fn($r) => $r[7], array_values($reports))) as $p) {
    if (!is_file($photo_dir . $p)) stop("Sample photo missing: database/defense_demo/photos/$p");
}
if (!is_file($photo_dir . 'delivery_handover.jpg')) stop("Sample photo missing: database/defense_demo/photos/delivery_handover.jpg");

// The API must be reachable before anything is written.
$probe = curl_init($api_base . 'auth/session.php');
curl_setopt_array($probe, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
$probe_body = curl_exec($probe);
$probe_code = curl_getinfo($probe, CURLINFO_HTTP_CODE);
curl_close($probe);
if ($probe_code !== 200 || !is_array(json_decode((string) $probe_body, true))) {
    stop("The API at {$api_base}auth/session.php is not reachable (HTTP $probe_code). Start Apache, or pass the correct --api=URL.");
}
out("  OK  API reachable; coordinates, categories, disaster type and sample photos are valid.");

if ($check_only) {
    out("CHECK ONLY: nothing was changed. Run without --check to create the dataset.");
    exit(0);
}

// ======================================================================= API CLIENT
final class Api
{
    private string $jar;
    public function __construct(private string $base, public string $who)
    {
        $this->jar = tempnam(sys_get_temp_dir(), 'defense_') ?: (sys_get_temp_dir() . '/defense_' . md5($who));
    }
    public function __destruct() { if (is_file($this->jar)) @unlink($this->jar); }

    private function send(string $method, string $path, $body = null, array $headers = []): array
    {
        $ch = curl_init($this->base . $path);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 60,
            CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar,
            CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers,
        ]);
        if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        $raw = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        $json = json_decode((string) $raw, true);
        return ['code' => $code, 'body' => is_array($json) ? $json : ['success' => false, 'message' => $err ?: substr((string) $raw, 0, 200)]];
    }
    public function post(string $path, array $data): array
    {
        return $this->send('POST', $path, json_encode($data), ['Content-Type: application/json']);
    }
    public function get(string $path, array $query = []): array
    {
        return $this->send('GET', $path . ($query ? '?' . http_build_query($query) : ''));
    }
    public function upload(string $path, array $fields, array $files): array
    {
        foreach (array_values($files) as $i => $f) $fields["photos[$i]"] = new CURLFile($f, 'image/jpeg', basename($f));
        return $this->send('POST', $path, $fields);
    }
}

$created = [];   // progress log, printed if something fails
function must(array $r, string $what, int $expect_code = 0): array
{
    global $created;
    $ok = ($r['body']['success'] ?? false) === true && ($expect_code === 0 || $r['code'] === $expect_code);
    if (!$ok) {
        fwrite(STDERR, "\nFAILED: $what\n  HTTP {$r['code']}: " . ($r['body']['message'] ?? json_encode($r['body'])) . "\n");
        fwrite(STDERR, "Already created before the failure:\n  - " . implode("\n  - ", $created ?: ['(nothing)']) . "\n");
        fwrite(STDERR, "Re-import a fresh database before running the seed again.\n");
        exit(1);
    }
    return $r['body'];
}
function login(string $base, string $email, string $who): Api
{
    $a = new Api($base, $who);
    must($a->post('auth/login.php', ['email' => $email, 'password' => TEST_PASSWORD]), "log in as $who ($email)");
    return $a;
}

// ======================================================================= 1. ADMIN ACCOUNT (only direct insert)
try {
    $conn->beginTransaction();
    $conn->prepare("INSERT INTO users (full_name, email, password, role, is_active, contact_number) VALUES (:n, :e, :p, 'admin', 1, :c)")
        ->execute([':n' => $admin['name'], ':e' => $admin['email'], ':p' => password_hash(TEST_PASSWORD, PASSWORD_DEFAULT), ':c' => $admin['contact']]);
    $admin_id = (int) $conn->lastInsertId();
    $conn->prepare("INSERT INTO audit_logs (user_id, action, details) VALUES (NULL, :a, :d)")
        ->execute([':a' => 'Test data seeded', ':d' => TAG . " Administrator test account created by seed_defense_demo.php (user_id $admin_id). All other defense records are created through the API."]);
    $conn->commit();
} catch (Throwable $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    stop("Could not create the admin test account: " . $e->getMessage());
}
$created[] = "admin test account (user_id $admin_id)";
out("\n[1] Administrator test account created directly (hashed password), user_id $admin_id");

$A = login($api_base, $admin['email'], 'Administrator');
$who = must($A->get('auth/session.php'), 'read admin session');
if ((int) ($who['user']['user_id'] ?? 0) !== $admin_id || ($who['user']['email'] ?? '') !== $admin['email']) {
    stop("The API logged in as a different account — it is probably using a different database than this script ('$db_name').");
}
out("    API login OK — the API and this script use the same database.");

// ======================================================================= 2. ACCOUNTS
$r = must($A->post('users/add_user.php', ['full_name' => $personnel['name'], 'email' => $personnel['email'], 'password' => TEST_PASSWORD,
    'role' => 'relief_personnel', 'contact_number' => $personnel['contact']]), 'create Relief Personnel test account');
$personnel_id = (int) $r['user_id'];
$created[] = "relief personnel account (user_id $personnel_id)";
$uid = [];
$n = 0;
foreach ($households as $k => $h) {
    $n++;
    $r = must($A->post('users/add_user.php', ['full_name' => $h['head'], 'email' => sprintf('binitayan.test%02d@gmail.com', $n),
        'password' => TEST_PASSWORD, 'role' => 'resident', 'contact_number' => $h['contact']]), "create resident account for $k");
    $uid[$k] = (int) $r['user_id'];
}
$created[] = "8 resident accounts";
out("[2] Accounts created through users/add_user.php: 1 relief personnel + 8 residents");

// ======================================================================= 3. HOUSEHOLDS + MEMBERS
$hid = [];
foreach ($households as $k => $h) {
    $by_update = !empty($h['coords_by_update']);
    $payload = [
        'head_of_family' => $h['head'], 'purok' => $h['purok'],
        'address' => "{$h['purok']}, Barangay Binitayan, Daraga, Albay — " . TAG . " $k",
        'number_of_members' => count($h['members']), 'contact_number' => $h['contact'],
        'latitude' => $by_update ? '' : $h['lat'], 'longitude' => $by_update ? '' : $h['lng'], 'user_id' => $uid[$k],
        'children_count' => $h['c'], 'seniors_count' => $h['s'], 'pwd_count' => $h['p'], 'pregnant_count' => $h['g'],
        'medical_needs_count' => 0, 'other_vulnerable_count' => 0,
    ];
    $r = must($A->post('households/add_household.php', $payload), "add household $k");
    $hid[$k] = (int) $r['household_id'];
    foreach ($h['members'] as $m) {
        must($A->post('households/members/add_member.php', ['household_id' => $hid[$k], 'full_name' => $m[0], 'relationship' => $m[1], 'age' => $m[2]]), "add member {$m[0]} ($k)");
    }
    if ($by_update) {
        // Normal "Update household" action: the administrator plots the coordinates later.
        // First prove the boundary validation is active: an outside point must be refused.
        $bad = $A->post('households/update_household.php', array_merge($payload, ['household_id' => $hid[$k], 'latitude' => 13.30, 'longitude' => 123.90]));
        if ($bad['code'] !== 400) stop("Boundary validation did not reject 13.30, 123.90 for $k (HTTP {$bad['code']}).");
        must($A->post('households/update_household.php', array_merge($payload, ['household_id' => $hid[$k], 'latitude' => $h['lat'], 'longitude' => $h['lng']])), "update household $k coordinates");
    }
}
// Confirm the API wrote to the same database this script reads.
$chk = $conn->prepare("SELECT head_of_family FROM households WHERE household_id = :id");
$chk->execute([':id' => $hid['H01']]);
if ($chk->fetchColumn() !== $households['H01']['head']) stop("Household H01 is not visible in database '$db_name'. The API uses a different database.");
$created[] = "8 households with members";
out("[3] 8 households + " . array_sum(array_map(fn($h) => count($h['members']), $households)) . " members (H06 coordinates added with Update Household; outside point 13.30, 123.90 was rejected as expected)");

// ======================================================================= 4. INVENTORY
$iid = [];
foreach ($items as $k => $it) {
    $r = must($A->post('inventory/add_item.php', ['item_name' => $it[0], 'category' => $it[1], 'quantity' => $it[2], 'unit' => $it[3], 'minimum_level' => $it[4]]), "add item {$it[0]}");
    $iid[$k] = (int) $r['item_id'];
}
foreach ($stock_in as [$k, $qty, $ref]) {
    must($A->post('inventory/stock_in.php', ['item_id' => $iid[$k], 'quantity' => $qty, 'reference' => $ref]), "stock in $k");
}
$created[] = "6 relief items";
out("[4] 6 relief items added; Bottled Water restocked +24 through Stock In");

// ======================================================================= 5. EVACUATION CENTERS
$cid = [];
foreach ($centers as $c) {
    $r = must($A->post('evacuation/save_center.php', [
        'name' => $c['name'], 'address' => "{$c['purok']}, Barangay Binitayan, Daraga, Albay " . TAG, 'purok' => $c['purok'],
        'latitude' => $c['lat'], 'longitude' => $c['lng'], 'capacity' => $c['capacity'], 'current_occupancy' => $c['start'], 'status' => 'Open',
        'facilities' => $facilities, 'contact_person' => $c['contact_person'], 'contact_number' => $c['contact'],
    ]), "add center {$c['name']}");
    $cid[] = (int) $r['center_id'];
    if ($c['occupancy'] !== $c['start']) {
        must($A->post('evacuation/update_occupancy.php', ['center_id' => end($cid), 'current_occupancy' => $c['occupancy'], 'remarks' => $c['occ_remarks'] . ' ' . TAG]), "update occupancy {$c['name']}");
    }
}
$created[] = "2 evacuation centers";
out("[5] 2 evacuation centers (Open 18/50 and Open 8/30)");

// ======================================================================= 6. HAZARDS + WEATHER
$alert_ids = [];
foreach ($alerts as [$type, $status, $title, $desc, $purok, $resolve]) {
    $r = must($A->post('hazards/alerts/add_alert.php', ['hazard_type' => $type, 'status' => $status, 'title' => $title, 'description' => $desc, 'affected_purok' => $purok]), "add alert $title");
    $alert_ids[] = (int) $r['alert_id'];
    if ($resolve) must($A->post('hazards/alerts/update_status.php', ['alert_id' => end($alert_ids), 'resolve' => true]), "resolve alert $title");
}
foreach ($weather as [$d, $tm, $cond, $temp, $rain, $wind, $dir, $rem]) {
    must($A->post('hazards/weather/add_weather_log.php', ['log_date' => $d, 'log_time' => $tm, 'weather_condition' => $cond, 'temperature' => $temp,
        'rainfall_mm' => $rain, 'wind_speed_kph' => $wind, 'wind_direction' => $dir, 'remarks' => $rem]), "add weather log $d");
}
$created[] = "3 hazard alerts, 3 weather logs";
out("[6] 3 hazard alerts (typhoon alert resolved after it passed; Purok 7 flood and Purok 5A landslide active) + 3 weather logs");

// ======================================================================= 7. DISASTER REPORTS (recorded by Relief Personnel) + PHOTOS
// Phase 21: residents no longer submit reports; authorized personnel record them for each household.
$P = login($api_base, $personnel['email'], 'Relief Personnel');
$rid = [];
foreach ($households as $k => $h) {
    [$sev, , $date, $time, $loc, $desc, , $photos] = $reports[$k];
    $r = must($P->post('disasters/create_report.php', ['household_id' => $hid[$k], 'disaster_type' => 'Typhoon', 'severity' => $sev, 'location' => $loc,
        'report_date' => $date, 'report_time' => $time, 'description' => TAG . ' ' . SCENARIO . ': ' . $desc]), "record report $k");
    $rid[$k] = (int) $r['report_id'];
    if ($photos) {
        must($P->upload('disasters/upload_photos.php', ['report_id' => $rid[$k]], array_map(fn($p) => $photo_dir . $p, $photos)), "upload photos $k");
    }
}
$created[] = "8 disaster reports (4 photos)";
out("[7] 8 Typhoon reports recorded by Relief Personnel (H03: 1 photo, H04: 3 photos, others: none)");

// ======================================================================= 8. VERIFY + DAMAGE ASSESSMENT (admin)
foreach ($reports as $k => $rp) {
    if ($rp[1]) must($A->post('disasters/verify_report.php', ['report_id' => $rid[$k], 'remarks' => $rp[6]]), "verify report $k");
}
foreach ($assessments as $k => $a) {
    must($A->post('disasters/save_damage_assessment.php', ['report_id' => $rid[$k], 'house_damage' => $a[0], 'infrastructure_damage' => $a[1],
        'property_damage' => $a[2], 'agricultural_damage' => $a[3], 'estimated_severity' => $a[4], 'remarks' => $a[5] . ' ' . TAG]), "damage assessment $k");
}
$created[] = "7 verifications, 8 damage assessments";
out("[8] H01–H07 reports verified; H08 left Pending; 8 damage assessments saved");

// ======================================================================= 9. RELIEF REQUESTS (recorded by the Administrator)
// Phase 21: residents no longer submit requests; the Administrator records them for each household.
$req = [];
foreach ($requests as $k => [$urg, $reason, $lines]) {
    $r = must($A->post('requests/create_request.php', ['household_id' => $hid[$k], 'urgency' => $urg, 'reason' => $reason . ' ' . TAG, 'report_id' => $rid[$k],
        'items' => array_map(fn($l) => ['item_id' => $iid[$l[0]], 'quantity' => $l[1]], $lines)]), "relief request $k");
    $req[$k] = (int) $r['request_id'];
}
$created[] = "4 relief requests";
out("[9] Relief requests recorded by the Administrator for H03, H04, H07, H08");

// Helper: approve a request with quantities per item key (missing key = requested quantity).
function decide(Api $A, int $request_id, array $iid, array $qty_by_item, string $remarks): string
{
    $d = must($A->get('requests/get_request_detail.php', ['request_id' => $request_id]), "read request $request_id");
    $lines = [];
    foreach ($d['data']['items'] as $it) {
        $key = array_search((int) $it['item_id'], $iid, true);
        $lines[] = ['request_item_id' => (int) $it['request_item_id'], 'approved_quantity' => $qty_by_item[$key] ?? (int) $it['requested_quantity']];
    }
    $r = must($A->post('requests/decide_request.php', ['request_id' => $request_id, 'decision' => 'approve', 'items' => $lines, 'remarks' => $remarks]), "decide request $request_id");
    return $r['status'] ?? '';
}

// H03: review -> approve in full -> create allocations
must($A->post('requests/start_review.php', ['request_id' => $req['H03']]), 'start review H03');
decide($A, $req['H03'], $iid, [], 'Approved in full. ' . TAG);
must($A->post('requests/process_request.php', ['request_id' => $req['H03']]), 'create allocations H03');
// H04: review -> approve in full -> create allocations (left Approved for the live distribution)
must($A->post('requests/start_review.php', ['request_id' => $req['H04']]), 'start review H04');
decide($A, $req['H04'], $iid, [], 'Approved in full: house destroyed, pregnant member at the evacuation center. ' . TAG);
must($A->post('requests/process_request.php', ['request_id' => $req['H04']]), 'create allocations H04');
// H07: review -> PARTIAL approval (hygiene kits 2 of 3, administrator's decision) -> create allocations
must($A->post('requests/start_review.php', ['request_id' => $req['H07']]), 'start review H07');
decide($A, $req['H07'], $iid, ['hygiene' => 2], 'Approved 2 of 3 hygiene kits to keep stock for other affected households. ' . TAG);
must($A->post('requests/process_request.php', ['request_id' => $req['H07']]), 'create allocations H07');
// H08: left Pending for the live DSS review (report also Pending).
$created[] = "requests H03/H04/H07 approved and allocated";
out("[10] H03 and H04 approved in full, H07 partially approved (hygiene kit 2 of 3); allocations created (stock reserved). H08 left Pending.");

// ======================================================================= 11. DISTRIBUTION (relief personnel)
$P = login($api_base, $personnel['email'], 'Relief Personnel');
$allocs = must($P->get('relief/get_allocations.php'), 'list allocations')['data'];
$h03_allocs = array_values(array_filter($allocs, fn($a) => (int) $a['household_id'] === $hid['H03'] && $a['status'] === 'Approved'));
foreach ($h03_allocs as $a) {
    must($P->post('relief/distribute.php', ['allocation_id' => (int) $a['allocation_id']]), "distribute allocation {$a['allocation_id']} (H03)");
}
$created[] = "H03 allocations distributed";
out("[11] Relief Personnel distributed H03's " . count($h03_allocs) . " allocations (stock deducted + Stock Out logs by the application)");

// ======================================================================= 12. PACKAGE + SCHEDULE (Batch 1)
$r = must($A->post('relief/packages/add_package.php', ['package_name' => 'Family Relief Pack ' . TAG,
    'description' => '1 family food pack, 6 bottles of water and 2 kg rice per household. ' . TAG,
    'items' => [['item_id' => $iid['pack'], 'quantity' => 1], ['item_id' => $iid['water'], 'quantity' => 6], ['item_id' => $iid['rice'], 'quantity' => 2]]]), 'add package');
$package_id = (int) $r['package_id'];
$r = must($A->post('relief/schedules/add_schedule.php', ['package_id' => $package_id, 'distribution_date' => '2026-09-30', 'distribution_time' => '09:00',
    'location' => 'Binitayan Barangay Hall', 'latitude' => 13.155602, 'longitude' => 123.715587, 'assigned_personnel' => $personnel_id,
    'notes' => 'Typhoon Binitayan Relief Distribution – Batch 1 ' . TAG, 'household_ids' => [$hid['H02'], $hid['H05'], $hid['H06']]]), 'add schedule');
$schedule_id = (int) $r['schedule_id'];
$detail = must($P->get('relief/schedules/get_schedule_detail.php', ['schedule_id' => $schedule_id]), 'read schedule')['data'];
$ben = [];
foreach ($detail['beneficiaries'] as $b) $ben[(int) $b['household_id']] = (int) $b['beneficiary_id'];
$b5 = $ben[$hid['H05']];
must($P->post('relief/schedules/update_beneficiary_status.php', ['beneficiary_id' => $b5, 'status' => 'Prepared']), 'H05 Prepared');
must($P->post('relief/schedules/update_beneficiary_status.php', ['beneficiary_id' => $b5, 'status' => 'Dispatched']), 'H05 Dispatched');
must($P->post('relief/schedules/verify_beneficiary.php', ['beneficiary_id' => $b5]), 'verify H05');
$r = must($P->post('relief/schedules/update_beneficiary_status.php', ['beneficiary_id' => $b5, 'status' => 'Delivered',
    'recipient_name' => $households['H05']['head'], 'remarks' => 'Received by the household head at the barangay hall. ' . TAG]), 'H05 Delivered');
$delivery_report_id = (int) $r['report_id'];
must($P->upload('relief/delivery/upload_delivery_photo.php', ['report_id' => $delivery_report_id], [$photo_dir . 'delivery_handover.jpg']), 'delivery photo');
$created[] = "schedule $schedule_id (H05 delivered)";
out("[12] Schedule Batch 1 (2026-09-30, Binitayan Barangay Hall): H05 Prepared → Dispatched → verified → Delivered (+ delivery photo); H02 and H06 left Pending");

// ======================================================================= 13. FEEDBACK — retired in Phase 21
// Residents no longer submit relief feedback through the portal, so no feedback records are created.
out("[13] Resident feedback is retired (Phase 21): no feedback records created");

// ======================================================================= 14. MANUAL SMS (admin) — logged, not sent
$sms_results = [];
$r = $A->post('sms/send.php', ['recipient_mode' => 'household', 'household_ids' => [$hid['H03'], $hid['H04'], $hid['H07']], 'category' => 'General',
    'message' => 'Binitayan Disaster Response: Your relief request has been reviewed. Please check your account for the current status.']);
$sms_results[] = $r['body']['message'] ?? json_encode($r['body']);
$r = $A->post('sms/send.php', ['recipient_mode' => 'household', 'household_ids' => [$hid['H02'], $hid['H05'], $hid['H06']], 'category' => 'Relief Distribution Announcement',
    'message' => 'Binitayan Disaster Response: Relief distribution information is available. Please check your account or contact the barangay office.']);
$sms_results[] = $r['body']['message'] ?? json_encode($r['body']);
out("[14] 2 manual SMS submitted through sms/send.php. Result: " . implode(' | ', $sms_results));

// ======================================================================= SUMMARY
$st = $conn->query("SELECT status, COUNT(*) FROM sms_logs GROUP BY status")->fetchAll(PDO::FETCH_KEY_PAIR);
$pri = must($A->get('dashboard/priority_list.php'), 'read priority list')['data'];
$name_to_key = array_flip(array_map(fn($h) => $h['head'], $households));
out("\nDEFENSE DATASET CREATED in database '$db_name'.");
out("  Admin user_id $admin_id, personnel user_id $personnel_id, schedule $schedule_id, package $package_id");
foreach ($households as $k => $h) {
    out(sprintf("  %s household_id %d, resident user_id %d, report_id %d%s", $k, $hid[$k], $uid[$k], $rid[$k], isset($req[$k]) ? ", request_id {$req[$k]}" : ''));
}
out("  Items: " . json_encode($iid) . "  Centers: " . implode(', ', $cid));
out("  SMS log statuses: " . json_encode($st) . " (no real SMS was sent)");
out("  DSS priority (computed by the application, not forced):");
foreach ($pri as $p) {
    $r = $p['ratings'] ?? [];
    out(sprintf("    #%-2s %-4s %-22s %3s  %-17s S%s D%s V%s H%s C%s%s", $p['rank'] ?? '-', $name_to_key[$p['head_of_family']] ?? '?', $p['head_of_family'], $p['priority_score'] ?? '-', $p['priority_level'],
        $r['disaster_severity'] ?? '-', $r['damage_unmet_needs'] ?? '-', $r['vulnerable_members'] ?? '-', $r['household_size'] ?? '-', $r['assessment_confidence'] ?? '-', !empty($p['needs_review']) ? '  (needs review)' : ''));
}
out("  Password for all test accounts: see DEFENSE_TEST_DATA.md (stored hashed).");
