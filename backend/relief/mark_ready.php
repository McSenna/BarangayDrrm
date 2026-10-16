<?php
/**
 * Phase 21 — mark Approved relief allocations as "Ready for Distribution"
 * and notify each household automatically (in-app + TextBee SMS).
 *
 * Workflow:  Pending -> Approved -> Ready for Distribution -> Distributed
 *
 * Who: Administrator / Barangay Official or Relief Personnel.
 *
 * The stored status stays 'Approved' (stock stays reserved and the DSS is
 * unchanged); ready_at + the verified schedule and location are recorded.
 * The person marking the allocation must confirm that the schedule and
 * location are verified (confirmed: true) — unconfirmed details are never
 * saved or sent.
 *
 * Body (JSON):
 *   { allocation_ids: [int, ...]  (1–100, all Approved and not yet ready),
 *     distribution_date: "YYYY-MM-DD" (today or later, within 60 days),
 *     distribution_time: "HH:MM" (optional),
 *     location: string (3–255 chars),
 *     instructions: string (optional, max 300 chars),
 *     confirmed: true }
 *
 * Rules:
 *   - all rows are locked (SELECT ... FOR UPDATE) and re-checked in one
 *     transaction; if ANY allocation is not Approved or is already ready,
 *     nothing is changed;
 *   - an allocation can be marked ready only once, so the SMS event
 *     "allocation:<first id>:ready" can fire only once per household batch;
 *     the unique keys on notifications / sms_logs block any duplicate send;
 *   - the SMS is sent AFTER COMMIT through dispatch_notification(), which
 *     never throws: a TextBee failure is logged (Failed) and does not undo
 *     the Ready status. With SMS disabled the attempt is logged as
 *     "Not Configured" and nothing is sent.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/notify.php';

require_login(['admin', 'relief_personnel']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];

function ready_fail(PDO $conn = null, int $code = 400, string $message = '', array $extra = [])
{
    if ($conn && $conn->inTransaction()) $conn->rollBack();
    http_response_code($code);
    echo json_encode(array_merge(["success" => false, "message" => $message], $extra));
    exit();
}

// ---- allocation ids (strict whole numbers) ----
$raw_ids = $data['allocation_ids'] ?? null;
if (!is_array($raw_ids) || count($raw_ids) === 0) {
    ready_fail(null, 400, "Please select at least one approved allocation.");
}
if (count($raw_ids) > 100) {
    ready_fail(null, 400, "Please mark at most 100 allocations at a time.");
}
$ids = [];
foreach ($raw_ids as $raw) {
    if (is_int($raw) && $raw > 0) {
        $ids[] = $raw;
    } elseif (is_string($raw) && preg_match('/^\s*\d+\s*$/', $raw) && intval($raw) > 0) {
        $ids[] = intval($raw);
    } else {
        ready_fail(null, 400, "One of the selected allocations is not valid. Please refresh the page and try again.");
    }
}
$ids = array_values(array_unique($ids));
sort($ids);

// ---- verified schedule details ----
$date = trim((string) ($data['distribution_date'] ?? ''));
$time = trim((string) ($data['distribution_time'] ?? ''));
$location = trim(preg_replace('/\s+/', ' ', (string) ($data['location'] ?? '')));
$instructions = trim(preg_replace('/\s+/', ' ', (string) ($data['instructions'] ?? '')));

$d = DateTime::createFromFormat('Y-m-d', $date);
if (!$d || $d->format('Y-m-d') !== $date) {
    ready_fail(null, 400, "Please enter the verified distribution date.");
}
$today = date('Y-m-d');
if ($date < $today) {
    ready_fail(null, 400, "The distribution date cannot be in the past.");
}
if ($date > date('Y-m-d', strtotime('+60 days'))) {
    ready_fail(null, 400, "The distribution date must be within the next 60 days.");
}
if ($time !== '' && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time)) {
    ready_fail(null, 400, "Please enter a valid distribution time (HH:MM), or leave it blank.");
}
if (mb_strlen($location) < 3 || mb_strlen($location) > 255) {
    ready_fail(null, 400, "Please enter the verified distribution location (3 to 255 characters).");
}
if (mb_strlen($instructions) > 300) {
    ready_fail(null, 400, "Instructions are limited to 300 characters.");
}
if (($data['confirmed'] ?? null) !== true) {
    ready_fail(null, 400, "Please confirm that the distribution schedule and location are verified before notifying the households.");
}

$conn = (new Database())->connect();

// The Phase 21 migration must have been run.
$has_cols = $conn->query("SHOW COLUMNS FROM relief_allocations LIKE 'ready_at'")->fetch();
if (!$has_cols) {
    ready_fail(null, 503, "Ready for Distribution needs the Phase 21 database update. Please ask the administrator to run database/migration_phase21_resident_scope.sql.");
}

try {
    $conn->beginTransaction();

    $in = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $conn->prepare(
        "SELECT ra.allocation_id, ra.household_id, ra.quantity, ra.status, ra.ready_at,
                h.head_of_family, ri.item_name, ri.unit
         FROM relief_allocations ra
         JOIN households h ON h.household_id = ra.household_id
         JOIN relief_items ri ON ri.item_id = ra.item_id
         WHERE ra.allocation_id IN ($in)
         ORDER BY ra.allocation_id
         FOR UPDATE"
    );
    $stmt->execute($ids);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (count($rows) !== count($ids)) {
        $found = array_map('intval', array_column($rows, 'allocation_id'));
        $missing = array_values(array_diff($ids, $found));
        ready_fail($conn, 404, "Allocation(s) not found: #" . implode(', #', $missing) . ". Please refresh the page.");
    }
    foreach ($rows as $r) {
        if ($r['status'] !== 'Approved') {
            ready_fail($conn, 409, "Allocation #{$r['allocation_id']} is {$r['status']}. Only Approved allocations can be marked Ready for Distribution. Nothing was changed.");
        }
        if ($r['ready_at'] !== null) {
            ready_fail($conn, 409, "Allocation #{$r['allocation_id']} is already Ready for Distribution, and its household was already notified. Nothing was changed.");
        }
    }

    $upd = $conn->prepare(
        "UPDATE relief_allocations
         SET ready_at = NOW(), ready_by = ?, ready_schedule_date = ?, ready_schedule_time = ?,
             ready_location = ?, ready_instructions = ?
         WHERE allocation_id IN ($in) AND status = 'Approved' AND ready_at IS NULL"
    );
    $upd->execute(array_merge(
        [$_SESSION['user_id'], $date, $time === '' ? null : "$time:00", $location, $instructions === '' ? null : $instructions],
        $ids
    ));
    if ($upd->rowCount() !== count($ids)) {
        ready_fail($conn, 409, "The allocations changed while saving. Please refresh the page and try again.");
    }

    $households = [];
    foreach ($rows as $r) {
        $households[intval($r['household_id'])][] = $r;
    }

    log_action($conn, "Relief allocations marked Ready for Distribution",
        "allocation_ids: " . implode(',', $ids) . "; households: " . implode(',', array_keys($households))
        . "; schedule: $date" . ($time !== '' ? " $time" : "") . "; location: $location; by {$_SESSION['role']}");

    $conn->commit();
} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    error_log("relief/mark_ready.php: " . $e->getMessage());
    ready_fail(null, 500, "We couldn't mark these allocations as Ready for Distribution. Please try again.");
}

// ---- after COMMIT: one automated notification (in-app + SMS) per household ----
// Phase 25 (audit F-SMS-03): every household's SMS is QUEUED first (a log row
// each), then the queue is sent. If the request is interrupted, the remaining
// rows stay "Queued" in SMS Logs and can be sent from there — none is lost.
$when = date('D, M j, Y', strtotime($date)) . ($time !== '' ? ', ' . date('g:i A', strtotime("2000-01-01 $time")) : '');
$results = [];
$statuses = [];
$queued_by_household = [];
foreach ($households as $household_id => $list) {
    $items = implode(', ', array_map(fn($r) => "{$r['item_name']} {$r['quantity']} {$r['unit']}", $list));
    $first_id = intval($list[0]['allocation_id']);
    // SMS text = "Brgy. Binitayan: <title>. <message>" (dispatch_notification), i.e.
    // "Brgy. Binitayan: Your relief allocation is ready for distribution. Items: … Schedule: … Location: …"
    $message = "Items: $items. Schedule: $when. Location: $location. "
        . ($instructions !== '' ? "Instructions: $instructions" : "For inquiries, contact the barangay office.");
    $summary = dispatch_notification($conn, [['household_id' => $household_id]],
        "allocation:$first_id:ready", "Your relief allocation is ready for distribution", $message,
        ['link' => '/resident/relief-status', 'sms' => true, 'sms_category' => 'Relief Allocation Update',
         'event_type' => 'ALLOCATION_READY_FOR_DISTRIBUTION', 'allocation_id' => $first_id,
         'sent_by' => $_SESSION['user_id'], 'sms_defer' => true]);
    $status = $summary['sms']['status'] ?? null;
    $queued_by_household[$household_id] = $summary['sms']['queued_ids'] ?? [];
    $results[] = [
        'household_id' => $household_id,
        'head_of_family' => $list[0]['head_of_family'],
        'allocation_ids' => array_map(fn($r) => intval($r['allocation_id']), $list),
        'in_app_created' => $summary['in_app_created'] ?? 0,
        'sms_status' => $status,
    ];
}

// Send the queue (one gateway call per message) and read back each household's outcome.
$all_queued = array_merge([], ...array_values($queued_by_household ?? []));
if ($all_queued) sms_process_queued($conn, $all_queued, intval(app_config('SMS_AUTO_TIMEOUT_SECONDS') ?: 8));
foreach ($results as &$res) {
    $qids = $queued_by_household[$res['household_id']] ?? [];
    if ($qids) {
        $in = implode(',', array_map('intval', $qids));
        $res['sms_status'] = $conn->query("SELECT status FROM sms_logs WHERE sms_id IN ($in) ORDER BY sms_id LIMIT 1")->fetchColumn() ?: $res['sms_status'];
    }
    $statuses[] = $res['sms_status'];
}
unset($res);

$n_alloc = count($ids);
$n_hh = count($households);
$msg = "$n_alloc allocation(s) for $n_hh household(s) marked Ready for Distribution.";
if (in_array('Not Configured', $statuses, true)) {
    $msg .= " " . SMS_DISABLED_MESSAGE . " The notifications were saved in-app and logged in SMS Logs as \"Not Configured\".";
} elseif (in_array('Failed', $statuses, true) || in_array('Partial', $statuses, true)) {
    $msg .= " Some SMS notifications could not be sent (see SMS Logs, where they can be retried). The Ready status is saved.";
} elseif ($statuses && count(array_filter($statuses, fn($s) => in_array($s, SMS_ACCEPTED_STATUSES, true))) === count($statuses)) {
    $msg .= " SMS notifications were accepted by the TextBee gateway (delivery to phones is not confirmed by the provider).";
} elseif (in_array('Queued', $statuses, true)) {
    $msg .= " Some SMS are still queued; send them from SMS Logs.";
} elseif (in_array(null, $statuses, true) || in_array('No Recipients', $statuses, true)) {
    $msg .= " Households without a contact number were notified in-app only.";
}

echo json_encode([
    "success" => true,
    "message" => $msg,
    "allocation_ids" => $ids,
    "households" => $results,
]);
