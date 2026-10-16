<?php
/**
 * Relief feedback helpers (Phase 19).
 *
 * Feedback is tied to exactly one ACTUAL delivered record of the resident's
 * household:
 *   - 'schedule'   : distribution_beneficiaries row with status 'Delivered'
 *   - 'request'    : relief_requests row with status 'Distributed'
 *   - 'allocation' : relief_allocations row with status 'Distributed' that is
 *                    not part of a request or a schedule (direct distribution)
 * Only one feedback record per delivery (UNIQUE keys in relief_feedback).
 */

/** Delivered records for a household, each with its feedback (if any). */
function feedback_deliveries_for_household(PDO $conn, int $household_id): array
{
    $out = [];

    $s = $conn->prepare(
        "SELECT db.beneficiary_id AS ref_id, ds.distribution_date, ds.location, rp.package_name,
                db.status_updated_at AS delivered_at, dr.recipient_name, f.feedback_id
         FROM distribution_beneficiaries db
         JOIN distribution_schedules ds ON ds.schedule_id = db.schedule_id
         JOIN relief_packages rp ON rp.package_id = ds.package_id
         LEFT JOIN delivery_reports dr ON dr.beneficiary_id = db.beneficiary_id
         LEFT JOIN relief_feedback f ON f.beneficiary_id = db.beneficiary_id
         WHERE db.household_id = :id AND db.status = 'Delivered'"
    );
    $s->execute([':id' => $household_id]);
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[] = [
            'type' => 'schedule',
            'ref_id' => intval($r['ref_id']),
            'title' => "Scheduled distribution: {$r['package_name']}",
            'details' => "{$r['distribution_date']} at {$r['location']}" . ($r['recipient_name'] ? " · received by {$r['recipient_name']}" : ''),
            'delivered_at' => $r['delivered_at'] ?: $r['distribution_date'],
            'feedback_id' => $r['feedback_id'] ? intval($r['feedback_id']) : null,
        ];
    }

    $q = $conn->prepare(
        "SELECT r.request_id AS ref_id,
                (SELECT MAX(a.distributed_at) FROM relief_allocations a JOIN relief_request_items ri ON ri.request_item_id = a.request_item_id WHERE ri.request_id = r.request_id) AS delivered_at,
                (SELECT GROUP_CONCAT(CONCAT(i.item_name, ' ×', ri.approved_quantity) SEPARATOR ', ')
                   FROM relief_request_items ri JOIN relief_items i ON i.item_id = ri.item_id
                  WHERE ri.request_id = r.request_id AND ri.approved_quantity > 0) AS items,
                f.feedback_id
         FROM relief_requests r
         LEFT JOIN relief_feedback f ON f.request_id = r.request_id
         WHERE r.household_id = :id AND r.status = 'Distributed'"
    );
    $q->execute([':id' => $household_id]);
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[] = [
            'type' => 'request',
            'ref_id' => intval($r['ref_id']),
            'title' => "Relief request #{$r['ref_id']}",
            'details' => (string) $r['items'],
            'delivered_at' => $r['delivered_at'],
            'feedback_id' => $r['feedback_id'] ? intval($r['feedback_id']) : null,
        ];
    }

    $a = $conn->prepare(
        "SELECT a.allocation_id AS ref_id, a.quantity, a.distributed_at, i.item_name, i.unit, f.feedback_id
         FROM relief_allocations a
         JOIN relief_items i ON i.item_id = a.item_id
         LEFT JOIN relief_feedback f ON f.allocation_id = a.allocation_id
         WHERE a.household_id = :id AND a.status = 'Distributed' AND a.request_item_id IS NULL AND a.schedule_id IS NULL"
    );
    $a->execute([':id' => $household_id]);
    foreach ($a->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[] = [
            'type' => 'allocation',
            'ref_id' => intval($r['ref_id']),
            'title' => "Relief allocation #{$r['ref_id']}",
            'details' => "{$r['item_name']} ×{$r['quantity']} {$r['unit']}",
            'delivered_at' => $r['distributed_at'],
            'feedback_id' => $r['feedback_id'] ? intval($r['feedback_id']) : null,
        ];
    }

    usort($out, fn($x, $y) => strcmp((string) $y['delivered_at'], (string) $x['delivered_at']));
    return $out;
}

/** True if the given delivery belongs to the household and has actually been delivered. */
function feedback_delivery_is_valid(PDO $conn, string $type, int $ref_id, int $household_id): bool
{
    switch ($type) {
        case 'schedule':
            $sql = "SELECT 1 FROM distribution_beneficiaries WHERE beneficiary_id = :ref AND household_id = :hh AND status = 'Delivered'";
            break;
        case 'request':
            $sql = "SELECT 1 FROM relief_requests WHERE request_id = :ref AND household_id = :hh AND status = 'Distributed'";
            break;
        case 'allocation':
            $sql = "SELECT 1 FROM relief_allocations WHERE allocation_id = :ref AND household_id = :hh AND status = 'Distributed' AND request_item_id IS NULL AND schedule_id IS NULL";
            break;
        default:
            return false;
    }
    $stmt = $conn->prepare($sql);
    $stmt->execute([':ref' => $ref_id, ':hh' => $household_id]);
    return (bool) $stmt->fetchColumn();
}
