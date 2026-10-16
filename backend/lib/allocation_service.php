<?php
/**
 * Stock-safe allocation service (Phase 19).
 *
 * Phase 25 concurrency note: in MariaDB/MySQL REPEATABLE READ, a plain SELECT
 * reads the transaction's snapshot, which may have been opened BEFORE the
 * item-row lock was obtained. The audit's concurrent-approval test showed this
 * can let two approvals both see the same free unit (301 of 300 approved).
 * Every stock and duplicate check after the lock is therefore a LOCKING read
 * (LOCK IN SHARE MODE), which always sees the latest committed data.
 *
 * This is the EXISTING approval logic from relief/approve_recommendation.php
 * (Phase 17 Fix 2), moved here unchanged so relief requests use exactly the
 * same rules instead of a second copy:
 *
 *   - the item row is locked (SELECT ... FOR UPDATE)
 *   - duplicate protection: no second Pending/Approved allocation for the same
 *     household + item
 *   - available = MAX(0, current stock - SUM(Approved, not yet distributed))
 *     and the quantity must fit within it
 *   - the allocation is created directly as Approved (approval does NOT deduct
 *     stock; relief/distribute.php deducts it when handed out)
 *
 * The caller MUST already have started a transaction and is responsible for
 * COMMIT / ROLLBACK. Nothing here echoes output or exits.
 */

require_once __DIR__ . '/dss.php';

/** Phase 25: true when migration_phase25 has been applied (snapshot / override / cancel columns). */
function allocation_phase25_ready(PDO $conn): bool
{
    static $ready = null;
    if ($ready === null) {
        try { $ready = (bool) $conn->query("SHOW COLUMNS FROM relief_allocations LIKE 'dss_score'")->fetch(); }
        catch (Throwable $e) { $ready = false; }
    }
    return $ready;
}

/**
 * Phase 25 (audit F-ALLOC-01): ONE duplicate rule for every path — Add
 * Allocation, Approve, DSS recommendations, relief requests and the emergency
 * override. A household may not hold two ACTIVE (Pending or Approved)
 * allocations of the same item. Distributed and Cancelled allocations do not
 * count, so a later distribution round is still allowed.
 * Call it inside the transaction AFTER locking the item row, so concurrent
 * requests for the same item queue behind the lock and cannot both pass.
 * It is a LOCKING read (LOCK IN SHARE MODE) so it always sees the latest
 * committed rows, even when the transaction's read view was opened earlier.
 */
function allocation_active_duplicate(PDO $conn, int $household_id, int $item_id, ?int $exclude_allocation_id = null, array $statuses = ['Pending', 'Approved']): ?array
{
    $in = implode(',', array_map(fn($s) => $conn->quote($s), $statuses));
    $sql = "SELECT allocation_id, status FROM relief_allocations
            WHERE household_id = :h AND item_id = :i AND status IN ($in)"
         . ($exclude_allocation_id ? " AND allocation_id <> :x" : "") . " LIMIT 1 LOCK IN SHARE MODE";
    $st = $conn->prepare($sql);
    $params = [':h' => $household_id, ':i' => $item_id];
    if ($exclude_allocation_id) $params[':x'] = $exclude_allocation_id;
    $st->execute($params);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/** Available = MAX(0, stock - SUM(Approved, not yet distributed)). Item row must already be locked. */
function allocation_available_locked(PDO $conn, int $item_id, int $current_stock): array
{
    $st = $conn->prepare("SELECT COALESCE(SUM(quantity), 0) FROM relief_allocations WHERE item_id = :item_id AND status = 'Approved' LOCK IN SHARE MODE");
    $st->execute([':item_id' => $item_id]);
    $committed = intval($st->fetchColumn());
    return ['committed' => $committed, 'available' => max(0, $current_stock - $committed)];
}

/**
 * Phase 25 (audit F-DSS-04): the household's DSS decision as the official saw
 * it, taken BEFORE the approval is written. Not Assessed households get their
 * category and null score/rank (an emergency override may still serve them).
 */
function dss_snapshot_for_household(PDO $conn, int $household_id): array
{
    $row = null;
    foreach (dss_compute_priorities_cached($conn) as $p) {
        if (intval($p['household_id']) === $household_id) { $row = $p; break; }
    }
    return [
        'dss_score' => $row && $row['priority_score'] !== null ? intval($row['priority_score']) : null,
        'dss_category' => $row['priority_level'] ?? DSS_NOT_ASSESSED,
        'dss_rank' => $row && $row['rank'] !== null ? intval($row['rank']) : null,
        'dss_ratings' => $row && !empty($row['ratings']) ? json_encode($row['ratings']) : null,
        'dss_model_version' => DSS_MODEL_VERSION,
    ];
}

/** Writes the snapshot (and override / event fields) onto an allocation row, if Phase 25 is installed. */
function allocation_store_decision(PDO $conn, int $allocation_id, array $snapshot, array $extra = []): void
{
    if (!allocation_phase25_ready($conn)) return;
    $st = $conn->prepare(
        "UPDATE relief_allocations SET dss_score = :s, dss_category = :c, dss_rank = :r, dss_ratings = :t, dss_model_version = :v,
                is_emergency_override = :o, override_reason = :or_, event_id = COALESCE(:e, event_id)
         WHERE allocation_id = :id"
    );
    $st->execute([
        ':s' => $snapshot['dss_score'] ?? null, ':c' => $snapshot['dss_category'] ?? null, ':r' => $snapshot['dss_rank'] ?? null,
        ':t' => $snapshot['dss_ratings'] ?? null, ':v' => $snapshot['dss_model_version'] ?? DSS_MODEL_VERSION,
        ':o' => !empty($extra['override_reason']) ? 1 : 0, ':or_' => $extra['override_reason'] ?? null,
        ':e' => $extra['event_id'] ?? null, ':id' => $allocation_id,
    ]);
}

/** Strict positive whole number from request input ("5abc", "2.5", arrays -> 0). */
function allocation_input_int($raw): int
{
    if (is_int($raw)) return $raw > 0 ? $raw : 0;
    if (is_string($raw) && preg_match('/^\s*\d+\s*$/', $raw)) return max(0, intval($raw));
    if (is_float($raw) && floor($raw) == $raw && $raw > 0) return intval($raw);
    return 0;
}

/**
 * @return array On success: ['ok' => true, 'allocation_id' => int, 'item' => array, 'available' => int]
 *               On failure: ['ok' => false, 'code' => int, 'reason' => 'item_not_found'|'duplicate'|'insufficient_stock',
 *                            'message' => string, 'available' => int|null, 'item' => array|null]
 */
function create_approved_allocation_locked(PDO $conn, int $household_id, int $item_id, int $quantity, string $reason, int $approved_by, ?int $request_item_id = null, ?array $snapshot = null, array $extra = []): array
{
    if (!$conn->inTransaction()) {
        throw new LogicException('create_approved_allocation_locked() must run inside a transaction.');
    }

    // Lock the item row so concurrent approvals/distributions of this item queue up.
    $item_stmt = $conn->prepare("SELECT item_id, item_name, unit, quantity FROM relief_items WHERE item_id = :item_id FOR UPDATE");
    $item_stmt->execute([':item_id' => $item_id]);
    $item = $item_stmt->fetch(PDO::FETCH_ASSOC);
    if (!$item) {
        return ['ok' => false, 'code' => 404, 'reason' => 'item_not_found', 'message' => "Relief item not found.", 'available' => null, 'item' => null];
    }

    // Duplicate protection (Phase 25: the one shared rule, see allocation_active_duplicate()).
    if (allocation_active_duplicate($conn, $household_id, $item_id)) {
        return ['ok' => false, 'code' => 409, 'reason' => 'duplicate',
                'message' => "This household already has a Pending or Approved Relief Allocation for {$item['item_name']}.",
                'available' => null, 'item' => $item];
    }

    // Fix 1 availability rule, re-checked at the moment of approval (locking read, item row already locked).
    $current_stock = intval($item['quantity']);
    ['committed' => $committed, 'available' => $available] = allocation_available_locked($conn, $item_id, $current_stock);
    $unit = $item['unit'];

    if ($quantity > $available) {
        return ['ok' => false, 'code' => 409, 'reason' => 'insufficient_stock',
                'message' => "Not enough stock: only $available $unit of {$item['item_name']} is available "
                           . "($current_stock in stock, $committed already committed to approved allocations).",
                'available' => $available, 'item' => $item];
    }

    $stmt = $conn->prepare(
        "INSERT INTO relief_allocations (household_id, item_id, request_item_id, quantity, status, approved_by, approved_at, recommendation_reason, allocation_date)
         VALUES (:household_id, :item_id, :request_item_id, :quantity, 'Approved', :approved_by, NOW(), :reason, CURDATE())"
    );
    $stmt->execute([
        ':household_id' => $household_id,
        ':item_id' => $item_id,
        ':request_item_id' => $request_item_id,
        ':quantity' => $quantity,
        ':approved_by' => $approved_by,
        ':reason' => $reason,
    ]);

    $allocation_id = intval($conn->lastInsertId());
    // Phase 25: DSS decision snapshot (+ override reason / event) on the same row, same transaction.
    if ($snapshot !== null) allocation_store_decision($conn, $allocation_id, $snapshot, $extra);

    return ['ok' => true, 'allocation_id' => $allocation_id, 'item' => $item, 'available' => $available];
}

/**
 * Available stock per item (current stock minus quantities committed to
 * Approved, not-yet-distributed allocations) — read-only, same formula as the
 * recommendation engine. Used for display only; approval re-checks under lock.
 */
function available_stock_by_item(PDO $conn): array
{
    $rows = $conn->query(
        "SELECT i.item_id, i.item_name, i.category, i.unit, i.quantity AS current_stock,
                COALESCE((SELECT SUM(a.quantity) FROM relief_allocations a WHERE a.item_id = i.item_id AND a.status = 'Approved'), 0) AS committed
         FROM relief_items i"
    )->fetchAll(PDO::FETCH_ASSOC);
    $out = [];
    foreach ($rows as $r) {
        $current = max(0, intval($r['current_stock']));
        $committed = intval($r['committed']);
        $out[intval($r['item_id'])] = [
            'item_id' => intval($r['item_id']),
            'item_name' => $r['item_name'],
            'category' => $r['category'],
            'unit' => $r['unit'],
            'current_stock' => $current,
            'committed' => $committed,
            'available' => max(0, $current - $committed),
        ];
    }
    return $out;
}
