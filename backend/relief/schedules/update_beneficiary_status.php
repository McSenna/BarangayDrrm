<?php
/**
 * Distribution status pipeline: Pending -> Prepared -> Dispatched -> Delivered,
 * with Cancelled available from any non-final state.
 *
 * Reaching "Delivered" is the moment relief is actually handed over — at that
 * point, and only then, this creates real relief_allocations rows (one per item
 * in the schedule's package, status='Distributed', linked back to this schedule),
 * reduces inventory, and creates the delivery_reports record (recipient name +
 * remarks), exactly like the existing manual distribution flow plus the Phase 9
 * delivery-confirmation requirements. This keeps relief_allocations as the single
 * source of truth for "what was actually given out," regardless of whether it
 * came from a manual allocation, the Phase 6 recommendation engine, or a Phase 8
 * distribution schedule.
 *
 * A beneficiary must be verified before they can be marked Delivered, and a
 * recipient_name is required at that point (who physically received the relief —
 * not necessarily the household head).
 *
 * Phase 17 Fix 5 — delivery stock safety:
 *   - A scheduled beneficiary is NOT represented by any Approved allocation
 *     (its allocation rows are created directly as 'Distributed' here), so the
 *     same rule as Fixes 1-4 applies without double counting:
 *         available = current stock - SUM(Approved, not yet distributed)
 *     Each package item's quantity must fit within `available`, so a scheduled
 *     delivery can never consume stock already committed to approved allocations.
 *   - One transaction: beneficiary row locked, then item rows (ordered by
 *     item_id); stock deducted once (guarded against going negative), status
 *     updated only from the expected state, one inventory_logs 'Stock Out' row
 *     per item, delivery report and audit entry — then COMMIT. Any failure rolls
 *     back and writes nothing.
 */

require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/notify.php';

require_login(['admin', 'relief_personnel']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "message" => "Method not allowed."]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];

$raw_id = $data['beneficiary_id'] ?? null;
if (is_int($raw_id)) {
    $beneficiary_id = $raw_id;
} elseif (is_string($raw_id) && preg_match('/^\s*\d+\s*$/', $raw_id)) {
    $beneficiary_id = intval($raw_id);
} else {
    $beneficiary_id = 0;
}
$new_status = is_string($data['status'] ?? null) ? $data['status'] : '';
$remarks = trim((string)($data['remarks'] ?? ''));
$recipient_name = trim((string)($data['recipient_name'] ?? ''));

// Retired by the relief allocation workflow: relief (and its stock) is handed out only through
// allocations/complete.php. Schedules keep their logistics statuses but no longer create allocations.
if ($new_status === 'Delivered') {
    http_response_code(410);
    echo json_encode(["success" => false, "message" => "This action was replaced by the new allocation workflow."]);
    exit();
}

$valid_statuses = ['Prepared', 'Dispatched', 'Delivered', 'Cancelled'];
if ($beneficiary_id <= 0 || !in_array($new_status, $valid_statuses, true)) {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "The status update is not valid. Please refresh the page and try again."]);
    exit();
}

if ($new_status === 'Delivered' && $recipient_name === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Please enter the name of the person who received the relief."]);
    exit();
}

$database = new Database();
$conn = $database->connect();
staff_require_beneficiary($conn, $beneficiary_id);

/** Roll back, send an error response, and stop. */
function fail($conn, $code, $message)
{
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code($code);
    echo json_encode(["success" => false, "message" => $message]);
    exit();
}

$allowed_next = [
    'Pending' => ['Prepared', 'Cancelled'],
    'Prepared' => ['Dispatched', 'Cancelled'],
    'Dispatched' => ['Delivered', 'Cancelled'],
    'Delivered' => [],
    'Cancelled' => [],
];

try {
    $conn->beginTransaction();

    // Lock the beneficiary row first, so the same beneficiary can't be processed twice at once.
    $stmt = $conn->prepare(
        "SELECT db.*, ds.package_id, ds.assigned_personnel, h.head_of_family
         FROM distribution_beneficiaries db
         JOIN distribution_schedules ds ON db.schedule_id = ds.schedule_id
         JOIN households h ON db.household_id = h.household_id
         WHERE db.beneficiary_id = :beneficiary_id
         FOR UPDATE"
    );
    $stmt->execute([':beneficiary_id' => $beneficiary_id]);
    $beneficiary = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$beneficiary) {
        fail($conn, 404, "Beneficiary not found.");
    }

    if ($_SESSION['role'] === 'relief_personnel' && intval($beneficiary['assigned_personnel']) !== intval($_SESSION['user_id'])) {
        fail($conn, 403, "You are not assigned to this schedule.");
    }

    $current_status = $beneficiary['status'];
    if (!in_array($new_status, $allowed_next[$current_status] ?? [], true)) {
        $msg = $current_status === 'Delivered'
            ? "This beneficiary has already been marked Delivered."
            : "This beneficiary cannot be changed from $current_status to $new_status. Please refresh the page.";
        fail($conn, 409, $msg);
    }

    if ($new_status === 'Delivered' && !$beneficiary['is_verified']) {
        fail($conn, 409, "This beneficiary must be verified before relief can be marked as Delivered.");
    }

    $stock_changes = [];

    if ($new_status === 'Delivered') {
        // Package contents; lock every item row in a fixed order (item_id) to avoid deadlocks.
        $items_stmt = $conn->prepare(
            "SELECT ri.item_id, ri.item_name, ri.unit, ri.quantity AS current_stock, rpi.quantity AS package_qty
             FROM relief_package_items rpi
             JOIN relief_items ri ON rpi.item_id = ri.item_id
             WHERE rpi.package_id = :package_id
             ORDER BY ri.item_id
             FOR UPDATE"
        );
        $items_stmt->execute([':package_id' => $beneficiary['package_id']]);
        $package_items = $items_stmt->fetchAll(PDO::FETCH_ASSOC);

        $committed_stmt = $conn->prepare(
            "SELECT COALESCE(SUM(quantity), 0) FROM relief_allocations WHERE item_id = :item_id AND status = 'Approved' LOCK IN SHARE MODE"
        );

        // Validate EVERY item before touching any stock.
        foreach ($package_items as $item) {
            $qty = intval($item['package_qty']);
            if ($qty <= 0) {
                fail($conn, 400, "The package has an invalid quantity for \"{$item['item_name']}\".");
            }
            $committed_stmt->execute([':item_id' => $item['item_id']]);
            $committed = intval($committed_stmt->fetchColumn());
            $current = intval($item['current_stock']);
            $available = max(0, $current - $committed);
            if ($qty > $available) {
                fail($conn, 409,
                    "Not enough stock of \"{$item['item_name']}\" to complete this delivery: need $qty {$item['unit']}, "
                    . "only $available {$item['unit']} available ($current in stock, $committed already committed to approved allocations).");
            }
        }

        $alloc_stmt = $conn->prepare(
            "INSERT INTO relief_allocations (household_id, item_id, schedule_id, quantity, status, allocation_date, distributed_by, distributed_at)
             VALUES (:household_id, :item_id, :schedule_id, :quantity, 'Distributed', CURDATE(), :distributed_by, NOW())"
        );
        $reduce_stmt = $conn->prepare(
            "UPDATE relief_items SET quantity = quantity - :quantity WHERE item_id = :item_id AND quantity >= :quantity_check"
        );
        $log_stmt = $conn->prepare(
            "INSERT INTO inventory_logs (item_id, log_type, quantity_change, resulting_quantity, reference, performed_by)
             VALUES (:item_id, 'Stock Out', :qty, :resulting_quantity, :reference, :performed_by)"
        );
        $reference = mb_substr(
            "Scheduled delivery — schedule #{$beneficiary['schedule_id']}, beneficiary #$beneficiary_id, "
            . "household #{$beneficiary['household_id']} ({$beneficiary['head_of_family']})",
            0, 255
        );

        foreach ($package_items as $item) {
            $qty = intval($item['package_qty']);
            $reduce_stmt->execute([':quantity' => $qty, ':item_id' => $item['item_id'], ':quantity_check' => $qty]);
            if ($reduce_stmt->rowCount() !== 1) {
                fail($conn, 409, "Stock of \"{$item['item_name']}\" changed during delivery. Refresh and try again.");
            }
            $resulting = intval($item['current_stock']) - $qty;

            $alloc_stmt->execute([
                ':household_id' => $beneficiary['household_id'],
                ':item_id' => $item['item_id'],
                ':schedule_id' => $beneficiary['schedule_id'],
                ':quantity' => $qty,
                ':distributed_by' => $_SESSION['user_id'],
            ]);
            $log_stmt->execute([
                ':item_id' => $item['item_id'],
                ':qty' => -$qty,
                ':resulting_quantity' => $resulting,
                ':reference' => $reference,
                ':performed_by' => $_SESSION['user_id'],
            ]);
            $stock_changes[] = "{$item['item_name']} -$qty {$item['unit']} ({$item['current_stock']} -> $resulting)";
        }
    }

    $update_stmt = $conn->prepare(
        "UPDATE distribution_beneficiaries
         SET status = :status, status_updated_by = :updated_by, status_updated_at = NOW(), remarks = :remarks
         WHERE beneficiary_id = :beneficiary_id AND status = :current_status"
    );
    $update_stmt->execute([
        ':status' => $new_status,
        ':updated_by' => $_SESSION['user_id'],
        ':remarks' => $remarks,
        ':beneficiary_id' => $beneficiary_id,
        ':current_status' => $current_status,
    ]);
    if ($update_stmt->rowCount() !== 1) {
        fail($conn, 409, "This beneficiary's status changed. Refresh and try again.");
    }

    $report_id = null;
    if ($new_status === 'Delivered') {
        $report_stmt = $conn->prepare(
            "INSERT INTO delivery_reports (beneficiary_id, recipient_name, remarks, submitted_by)
             VALUES (:beneficiary_id, :recipient_name, :remarks, :submitted_by)"
        );
        $report_stmt->execute([
            ':beneficiary_id' => $beneficiary_id,
            ':recipient_name' => $recipient_name,
            ':remarks' => $remarks,
            ':submitted_by' => $_SESSION['user_id'],
        ]);
        $report_id = $conn->lastInsertId();
    }

    // Audit entry inside the transaction, so a failed attempt never logs as a success.
    log_action(
        $conn,
        "Beneficiary status updated",
        "beneficiary_id: $beneficiary_id, schedule_id: {$beneficiary['schedule_id']}, "
            . "household_id: {$beneficiary['household_id']} ({$beneficiary['head_of_family']}), status: $current_status -> $new_status"
            . ($stock_changes ? ", stock out: " . implode("; ", $stock_changes) : "")
    );

    $conn->commit();

    // Phase 19 — after COMMIT: tell the household. Delivered = in-app + SMS
    // (and feedback becomes available); Cancelled = in-app only.
    $sms_note = '';
    if ($new_status === 'Delivered') {
        $summary = dispatch_notification($conn, [['household_id' => $beneficiary['household_id']]], "delivery:$beneficiary_id:delivered",
            "Relief delivered", "Relief for your household was delivered (received by $recipient_name). For concerns, please contact the barangay office.",
            ['link' => '/resident/relief-status', 'sms' => true, 'sms_category' => 'Delivery Completed', 'sent_by' => $_SESSION['user_id'], 'event_type' => 'DELIVERY_COMPLETED']);
        $sms_note = describe_sms_result($summary) ? " " . describe_sms_result($summary) : "";
    } elseif ($new_status === 'Cancelled') {
        dispatch_notification($conn, [['household_id' => $beneficiary['household_id']]], "delivery:$beneficiary_id:cancelled",
            "Scheduled relief delivery cancelled", "A scheduled relief delivery for your household was cancelled. Please contact the barangay office for details.",
            ['link' => '/resident/relief-status', 'sms' => false]);
    }

    echo json_encode(["success" => true, "message" => "Delivery status updated to $new_status." . $sms_note, "report_id" => $report_id]);
} catch (Exception $e) {
    if ($conn->inTransaction()) $conn->rollBack();
    http_response_code(500);
    error_log("relief/schedules/update_beneficiary_status.php: " . $e->getMessage());
    echo json_encode(["success" => false, "message" => "We couldn't update the delivery status. Please try again."]);
}
