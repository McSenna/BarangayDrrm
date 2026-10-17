<?php
/**
 * Relief request helpers (Phase 19).
 *
 * Status life cycle:
 *   Pending -> Under Review -> Approved | Partially Approved | Rejected
 *   Approved / Partially Approved -> Allocated  (processed into Approved
 *                                                relief_allocations through
 *                                                lib/allocation_service.php)
 *   Allocated -> Distributed  (when every allocation created from the
 *                              request has been distributed)
 *
 * "Open" = not yet Distributed or Rejected. Only one open request per
 * household is allowed.
 */

const RELIEF_REQUEST_STATUSES = ['Pending', 'Under Review', 'Approved', 'Partially Approved', 'Rejected', 'Allocated', 'Distributed'];
const RELIEF_REQUEST_OPEN_STATUSES = ['Pending', 'Under Review', 'Approved', 'Partially Approved', 'Allocated'];
const RELIEF_REQUEST_URGENCY = ['Low', 'Medium', 'High', 'Critical'];

/** The household linked to a resident account, or null. Always from the database, never from input. */
function resident_household(PDO $conn, int $user_id): ?array
{
    $stmt = $conn->prepare("SELECT household_id, head_of_family, purok, number_of_members, vulnerable_members FROM households WHERE user_id = :user_id ORDER BY household_id ASC LIMIT 1");
    $stmt->execute([':user_id' => $user_id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/** True if the logged-in resident may see this request (their household's, or one they submitted). */
function resident_can_view_request(PDO $conn, array $request, int $user_id): bool
{
    if (intval($request['user_id'] ?? 0) === $user_id) return true;
    $household = resident_household($conn, $user_id);
    return $household && intval($household['household_id']) === intval($request['household_id']);
}

/**
 * Runs an existing DSS endpoint (priority_list.php or relief_recommendations.php)
 * in an isolated function scope and returns its decoded JSON. This reuses the
 * DSS exactly as it is — nothing is recalculated here.
 */
function dss_run_endpoint(string $file): array
{
    ob_start();
    include __DIR__ . '/../dashboard/' . $file;
    $json = json_decode(ob_get_clean(), true);
    return is_array($json) ? $json : [];
}

/** Priority-list rows keyed by household_id. */
function dss_priority_by_household(): array
{
    $out = [];
    require_once __DIR__.'/dss.php';
    $priority_conn=(new Database())->connect();
    foreach (dss_scoped_priorities($priority_conn) as $row) {
        $out[intval($row['household_id'])] = $row;
    }
    return $out;
}

/** Current engine recommendations for one household, keyed by item_id. */
function dss_recommendations_for_household(int $household_id): array
{
    $out = [];
    $response = dss_run_endpoint('relief_recommendations.php');
    foreach ($response['data'] ?? [] as $h) {
        if (intval($h['household_id']) !== $household_id) continue;
        foreach ($h['recommendations'] as $r) {
            $out[intval($r['item_id'])] = $r;
        }
    }
    return $out;
}

/**
 * When every allocation created from a request has been distributed, mark the
 * request Distributed. Call inside the distribution transaction.
 * Returns the request_id that became Distributed, or null.
 */
function sync_request_distributed_status(PDO $conn, int $request_item_id): ?int
{
    $stmt = $conn->prepare("SELECT request_id FROM relief_request_items WHERE request_item_id = :id");
    $stmt->execute([':id' => $request_item_id]);
    $request_id = $stmt->fetchColumn();
    if (!$request_id) return null;

    $pending = $conn->prepare(
        "SELECT COUNT(*) FROM relief_allocations a
         JOIN relief_request_items ri ON ri.request_item_id = a.request_item_id
         WHERE ri.request_id = :request_id AND a.status NOT IN ('Distributed', 'Cancelled')"
    );
    $pending->execute([':request_id' => $request_id]);
    if (intval($pending->fetchColumn()) > 0) return null;
    // Phase 25: cancelled lines do not block completion, but at least one line must have been handed out.
    $done = $conn->prepare(
        "SELECT COUNT(*) FROM relief_allocations a JOIN relief_request_items ri ON ri.request_item_id = a.request_item_id
         WHERE ri.request_id = :request_id AND a.status = 'Distributed'"
    );
    $done->execute([':request_id' => $request_id]);
    if (intval($done->fetchColumn()) === 0) return null;

    $update = $conn->prepare("UPDATE relief_requests SET status = 'Distributed' WHERE request_id = :request_id AND status = 'Allocated'");
    $update->execute([':request_id' => $request_id]);
    return $update->rowCount() === 1 ? intval($request_id) : null;
}

/** Items of a request with item details and linked allocation status. */
function request_items_detail(PDO $conn, int $request_id): array
{
    $stmt = $conn->prepare(
        "SELECT ri.request_item_id, ri.item_id, ri.requested_quantity, ri.approved_quantity,
                i.item_name, i.category, i.unit,
                a.allocation_id, a.status AS allocation_status, a.quantity AS allocated_quantity
         FROM relief_request_items ri
         JOIN relief_items i ON i.item_id = ri.item_id
         LEFT JOIN relief_allocations a ON a.request_item_id = ri.request_item_id
         WHERE ri.request_id = :request_id
         ORDER BY i.item_name ASC"
    );
    $stmt->execute([':request_id' => $request_id]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}
