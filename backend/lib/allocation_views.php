<?php
/**
 * Read models for the allocation screens (lists, detail, history). Status changes live in allocation_workflow.php.
 * Ready-only access for Relief Personnel is enforced here, in the queries.
 */
require_once __DIR__ . '/allocation_workflow.php';
require_once __DIR__ . '/puroks.php';

/** Allocation rows with household, visit, officer and plan lines (live stock per item). */
function av_rows(PDO $db, string $where, array $params): array {
    $s = $db->prepare("SELECT a.*, h.head_of_family, h.purok, h.address, f.field_visit_date, f.damage_classification, f.status AS assessment_status,
                              f.assigned_field_officer_id, u.full_name AS assessed_by_name
                       FROM household_allocations a
                       JOIN households h ON h.household_id = a.household_id
                       LEFT JOIN household_field_assessments f ON f.allocation_id = a.allocation_id
                       LEFT JOIN users u ON u.user_id = f.assigned_field_officer_id
                       WHERE $where");
    $s->execute($params);
    $items = $db->prepare('SELECT ai.allocation_item_id, ai.item_id, ai.item_name, ai.unit, ai.planned_qty, ai.released_qty, ri.quantity AS current_stock
                           FROM household_allocation_items ai LEFT JOIN relief_items ri ON ri.item_id = ai.item_id WHERE ai.allocation_id = ? ORDER BY ai.allocation_item_id');
    $rows = [];
    foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) {
        foreach (['allocation_id', 'household_id', 'round_no', 'ready_score', 'completed_score', 'version'] as $k) $r[$k] = $r[$k] === null ? null : (int)$r[$k];
        $r['status_label'] = AW_STATUS_LABELS[$r['status']];
        $r['ready_snapshot'] = $r['ready_snapshot'] ? json_decode($r['ready_snapshot'], true) : null;
        $r['completed_snapshot'] = $r['completed_snapshot'] ? json_decode($r['completed_snapshot'], true) : null;
        $r['breakdown'] = $r['ready_snapshot']['score_breakdown'] ?? null;
        $r['damage_label'] = $r['damage_classification'] ? DSS_DAMAGE_LABELS[$r['damage_classification']] : null;
        $items->execute([$r['allocation_id']]);
        $r['items'] = array_map(function ($i) {
            foreach (['allocation_item_id', 'item_id', 'planned_qty', 'released_qty', 'current_stock'] as $k) $i[$k] = $i[$k] === null ? null : (int)$i[$k];
            return $i;
        }, $items->fetchAll(PDO::FETCH_ASSOC));
        unset($r['completion_key'], $r['active_household_id']);
        $rows[] = $r;
    }
    return $rows;
}

/** Search (head name, household ID, Purok) and filters (Purok, priority) shared by the list endpoints. */
function av_filter(array $rows, array $q): array {
    $term = trim((string)($q['q'] ?? ''));
    $purok = normalize_purok($q['purok'] ?? null);
    $priority = trim((string)($q['priority'] ?? ''));
    return array_values(array_filter($rows, function ($r) use ($term, $purok, $priority) {
        if ($purok !== null && normalize_purok($r['purok']) !== $purok) return false;
        if ($priority !== '' && ($r['ready_priority'] ?? $r['completed_priority'] ?? null) !== $priority) return false;
        if ($term === '') return true;
        return (ctype_digit($term) && (int)$term === $r['household_id']) || stripos($r['head_of_family'], $term) !== false || stripos((string)$r['purok'], $term) !== false;
    }));
}

/** Ready for Distribution only — the Relief Personnel list. Highest final score first, then the oldest Ready. */
function av_ready_list(PDO $db, array $actor, array $q): array {
    $rows = av_rows($db, "a.status = 'READY_FOR_DISTRIBUTION'", []);
    if ($actor['role'] !== 'admin') $rows = array_values(array_filter($rows, fn($r) => aw_in_scope($db, $actor, $r['household_id'])));
    $rows = av_filter($rows, $q);
    usort($rows, fn($a, $b) => ($b['ready_score'] <=> $a['ready_score']) ?: strcmp((string)$a['ready_at'], (string)$b['ready_at']) ?: ($a['allocation_id'] <=> $b['allocation_id']));
    return $rows;
}

/** One allocation. Relief Personnel get 404 for anything not Ready or outside their Purok. */
function av_detail(PDO $db, array $actor, int $allocationId): array {
    if (!in_array($actor['role'], ['admin', 'relief_personnel'], true)) aw_error('Access denied.', 403);
    $row = av_rows($db, 'a.allocation_id = ?', [$allocationId])[0] ?? null;
    if (!$row) aw_error('Allocation not found.', 404);
    if ($actor['role'] === 'relief_personnel' && ($row['status'] !== 'READY_FOR_DISTRIBUTION' || !aw_in_scope($db, $actor, $row['household_id']))) aw_error('Allocation not found.', 404);
    $row['current'] = aw_current_score($db, $row['household_id']);
    return $row;
}

/** Administrator list: every round, any status, with the current score next to the snapshots, plus legacy history. */
function av_admin_list(PDO $db, array $q): array {
    $status = (string)($q['status'] ?? '');
    if ($status !== '' && !in_array($status, AW_STATUSES, true)) aw_error('Unknown status.');
    $rows = av_filter(av_rows($db, $status === '' ? '1=1' : 'a.status = ?', $status === '' ? [] : [$status]), $q);
    $current = [];
    foreach (dss_compute_priorities($db) as $p) $current[(int)$p['household_id']] = $p;
    foreach ($rows as &$r) {
        $p = $current[$r['household_id']] ?? null;
        $r['current'] = $p ? array_intersect_key($p, array_flip(['final_score', 'automatic_subtotal', 'priority_level', 'score_breakdown', 'assessment_status', 'review_reasons', 'score_complete'])) : null;
    }
    unset($r);
    $order = array_flip(AW_STATUSES);
    usort($rows, fn($a, $b) => ($order[$a['status']] <=> $order[$b['status']]) ?: (($b['ready_score'] ?? -1) <=> ($a['ready_score'] ?? -1)) ?: ($b['allocation_id'] <=> $a['allocation_id']));
    $legacy = $db->query("SELECT ra.allocation_id, ra.household_id, h.head_of_family, h.purok, ri.item_name, ri.unit, ra.quantity, ra.status, ra.allocation_date,
                                 ra.distributed_at, ra.distributed_by, ra.cancel_reason, ra.dss_score, ra.dss_category, ra.dss_model_version
                          FROM relief_allocations ra JOIN households h ON h.household_id = ra.household_id LEFT JOIN relief_items ri ON ri.item_id = ra.item_id
                          ORDER BY ra.allocation_id DESC")->fetchAll(PDO::FETCH_ASSOC);
    foreach ($legacy as &$l) $l['label'] = 'Historical';
    unset($l);
    return ['allocations' => $rows, 'legacy' => $legacy];
}

function av_history(PDO $db, int $allocationId): array {
    aw_allocation($db, $allocationId);
    $s = $db->prepare('SELECT h.history_id, h.action, h.from_status, h.to_status, h.reason, h.details, h.created_at, h.ip_address, u.full_name AS user_name, u.role AS user_role
                       FROM household_allocation_history h LEFT JOIN users u ON u.user_id = h.user_id WHERE h.allocation_id = ? ORDER BY h.history_id');
    $s->execute([$allocationId]);
    return array_map(function ($r) { $r['details'] = $r['details'] ? json_decode($r['details'], true) : null; return $r; }, $s->fetchAll(PDO::FETCH_ASSOC));
}

/**
 * Every relief line actually handed out: completed workflow allocations (released quantities) plus the historical
 * Distributed rows of the old per-item allocations. Columns: household_id, item_id, quantity, distributed_at, source.
 */
function av_released_sql(): string {
    return "(SELECT ra.household_id, ra.item_id, COALESCE(ra.received_quantity, ra.quantity) AS quantity, ra.distributed_at, 'historical' AS source
             FROM relief_allocations ra WHERE ra.status = 'Distributed'
             UNION ALL
             SELECT a.household_id, ai.item_id, ai.released_qty AS quantity, a.completed_at AS distributed_at, 'workflow' AS source
             FROM household_allocations a JOIN household_allocation_items ai ON ai.allocation_id = a.allocation_id
             WHERE a.status = 'COMPLETED' AND ai.released_qty > 0)";
}

/** Positive integer id from a query string or JSON body value. */
function av_id($value, string $field): int {
    if (!(is_int($value) || (is_string($value) && ctype_digit($value))) || (int)$value < 1 || (int)$value > 2147483647) aw_error("Invalid $field.");
    return (int)$value;
}

function av_json_body(): array {
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) aw_error('A JSON object is required.');
    return $data;
}

/**
 * After a committed household change (roster verified, Purok or members edited): promote the household if that
 * cleared its last blocker, then send the Ready SMS. Never fails the change that already succeeded.
 */
function av_promote_after_change(PDO $db, int $householdId, int $actorId): ?array {
    try {
        $result = aw_promote_if_complete($db, $householdId, $actorId);
        av_send_queued_sms($db, $result['queued_sms_ids']);
        return ['promoted' => $result['promoted'], 'reasons' => $result['reasons']];
    } catch (Throwable $e) {
        error_log('Allocation promotion after household change failed for household ' . $householdId . ': ' . $e->getMessage());
        return null;
    }
}

/** Sends Ready SMS queued inside a committed transaction. */
function av_send_queued_sms(PDO $db, array $ids): void {
    if ($ids) sms_process_queued($db, $ids, intval(app_config('SMS_AUTO_TIMEOUT_SECONDS') ?: 8));
}
