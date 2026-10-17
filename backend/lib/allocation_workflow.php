<?php
/**
 * Household relief allocation workflow — the ONLY code that changes household_allocations.status
 * (spec: docs/superpowers/specs/2026-10-17-relief-allocation-workflow-design.md §6).
 *
 *   PENDING_ASSESSMENT → ASSESSMENT_IN_PROGRESS → READY_FOR_DISTRIBUTION → COMPLETED
 *   PENDING_ASSESSMENT → READY_FOR_DISTRIBUTION            (a complete visit submitted in one go)
 *   READY_FOR_DISTRIBUTION → CANCELLED                     (Administrator, with reason)
 *   READY_FOR_DISTRIBUTION → ASSESSMENT_IN_PROGRESS        (Administrator re-open, with reason)
 *
 * READY is reached only by aw_promote_if_complete(): a submitted (locked) field visit, a final score and an active
 * standard relief package. Ready never touches stock; stock leaves only in aw_complete_distribution().
 * Every function joins the caller's transaction or opens its own; every status change writes history.
 */
require_once __DIR__ . '/dss.php';
require_once __DIR__ . '/notify.php';

class AllocationWorkflowError extends RuntimeException {}

const AW_STATUSES = ['PENDING_ASSESSMENT', 'ASSESSMENT_IN_PROGRESS', 'READY_FOR_DISTRIBUTION', 'COMPLETED', 'CANCELLED'];
const AW_OPEN_STATUSES = ['PENDING_ASSESSMENT', 'ASSESSMENT_IN_PROGRESS', 'READY_FOR_DISTRIBUTION'];
const AW_TRANSITIONS = [
    'PENDING_ASSESSMENT' => ['ASSESSMENT_IN_PROGRESS', 'READY_FOR_DISTRIBUTION'],
    'ASSESSMENT_IN_PROGRESS' => ['READY_FOR_DISTRIBUTION'],
    'READY_FOR_DISTRIBUTION' => ['COMPLETED', 'CANCELLED', 'ASSESSMENT_IN_PROGRESS'],
    'COMPLETED' => [],
    'CANCELLED' => [],
];
const AW_STATUS_LABELS = [
    'PENDING_ASSESSMENT' => 'Pending Assessment', 'ASSESSMENT_IN_PROGRESS' => 'Assessment in Progress',
    'READY_FOR_DISTRIBUTION' => 'Ready for Distribution', 'COMPLETED' => 'Completed', 'CANCELLED' => 'Cancelled',
];

function aw_error(string $message, int $code = 400): void { throw new AllocationWorkflowError($message, $code); }

/** Runs $fn inside the caller's transaction, or in its own (committed or rolled back here). */
function aw_tx(PDO $db, callable $fn) {
    if ($db->inTransaction()) return $fn();
    $db->beginTransaction();
    try { $result = $fn(); $db->commit(); return $result; }
    catch (Throwable $e) { if ($db->inTransaction()) $db->rollBack(); throw $e; }
}

function aw_actor(PDO $db, int $userId): array {
    $s = $db->prepare('SELECT user_id, role, is_active, assigned_purok, full_name FROM users WHERE user_id = ?');
    $s->execute([$userId]);
    $actor = $s->fetch(PDO::FETCH_ASSOC);
    if (!$actor || !intval($actor['is_active'])) aw_error('Your account does not currently have access.', 403);
    return $actor;
}

function aw_require_admin(PDO $db, int $userId): array {
    $actor = aw_actor($db, $userId);
    if ($actor['role'] !== 'admin') aw_error('Only an administrator may do this.', 403);
    return $actor;
}

function aw_reason(?string $reason): string {
    $reason = trim((string)$reason);
    if (mb_strlen($reason) < 3 || mb_strlen($reason) > 500) aw_error('Enter a reason (3 to 500 characters).');
    return $reason;
}

function aw_allocation(PDO $db, int $allocationId, bool $lock = false): array {
    $s = $db->prepare('SELECT * FROM household_allocations WHERE allocation_id = ?' . ($lock ? ' FOR UPDATE' : ''));
    $s->execute([$allocationId]);
    $row = $s->fetch(PDO::FETCH_ASSOC);
    if (!$row) aw_error('Allocation not found.', 404);
    return $row;
}

function aw_open_allocation(PDO $db, int $householdId, bool $lock = false): ?array {
    $s = $db->prepare("SELECT * FROM household_allocations WHERE household_id = ? AND status IN ('PENDING_ASSESSMENT','ASSESSMENT_IN_PROGRESS','READY_FOR_DISTRIBUTION')" . ($lock ? ' FOR UPDATE' : ''));
    $s->execute([$householdId]);
    return $s->fetch(PDO::FETCH_ASSOC) ?: null;
}

function aw_history(PDO $db, int $allocationId, string $action, ?string $from, ?string $to, ?int $userId, ?string $reason = null, array $details = []): void {
    $db->prepare('INSERT INTO household_allocation_history (allocation_id, action, from_status, to_status, reason, details, user_id, ip_address) VALUES (?,?,?,?,?,?,?,?)')
       ->execute([$allocationId, $action, $from, $to, $reason, $details ? json_encode($details) : null, $userId, $_SERVER['REMOTE_ADDR'] ?? null]);
}

/**
 * The only status writer. $sets are extra columns written in the same UPDATE. The WHERE on the old status makes
 * a concurrent change fail instead of being overwritten.
 */
function aw_transition(PDO $db, array $alloc, string $to, string $action, ?int $actorId, ?string $reason = null, array $details = [], array $sets = []): array {
    $from = $alloc['status'];
    if (!in_array($to, AW_TRANSITIONS[$from] ?? [], true)) aw_error("Cannot move an allocation from $from to $to.", 409);
    $assign = ['status = ?', 'version = version + 1'];
    $values = [$to];
    foreach ($sets as $column => $value) { $assign[] = "$column = ?"; $values[] = $value; }
    $values[] = $alloc['allocation_id'];
    $values[] = $from;
    $s = $db->prepare('UPDATE household_allocations SET ' . implode(', ', $assign) . ' WHERE allocation_id = ? AND status = ?');
    $s->execute($values);
    if ($s->rowCount() !== 1) aw_error('This allocation changed while saving. Refresh and try again.', 409);
    aw_history($db, (int)$alloc['allocation_id'], $action, $from, $to, $actorId, $reason, $details);
    return aw_allocation($db, (int)$alloc['allocation_id']);
}

/** The household's row from the shared scoring service (no second formula). */
function aw_current_score(PDO $db, int $householdId): ?array {
    foreach (dss_compute_priorities($db) as $row) if ((int)$row['household_id'] === $householdId) return $row;
    return null;
}

/** The standard package with its items, or null with the reason it cannot be used. */
function aw_standard_package(PDO $db): array {
    $id = $db->query("SELECT setting_value FROM system_settings WHERE setting_key = 'standard_relief_package_id'")->fetchColumn();
    if (!$id || !ctype_digit((string)$id)) return ['package' => null, 'items' => [], 'reason' => 'No standard relief package is set.'];
    $s = $db->prepare('SELECT package_id, package_name, is_active FROM relief_packages WHERE package_id = ?');
    $s->execute([(int)$id]);
    $package = $s->fetch(PDO::FETCH_ASSOC);
    if (!$package || !intval($package['is_active'])) return ['package' => null, 'items' => [], 'reason' => 'The standard relief package is missing or inactive.'];
    $s = $db->prepare('SELECT pi.item_id, pi.quantity, ri.item_name, ri.unit FROM relief_package_items pi JOIN relief_items ri ON ri.item_id = pi.item_id WHERE pi.package_id = ? AND pi.quantity > 0 ORDER BY pi.item_id');
    $s->execute([(int)$id]);
    $items = $s->fetchAll(PDO::FETCH_ASSOC);
    if (!$items) return ['package' => null, 'items' => [], 'reason' => 'The standard relief package has no items.'];
    return ['package' => $package, 'items' => $items, 'reason' => null];
}

function aw_score_snapshot(array $score): string {
    $keys = ['score_breakdown', 'automatic_subtotal', 'final_score', 'priority_level', 'number_of_members', 'vulnerable_members',
             'flood_status', 'flood_classification_label', 'damage_classification', 'assessment_status', 'assigned_field_officer_name',
             'field_visit_date', 'model_version'];
    return json_encode(array_intersect_key($score, array_flip($keys)));
}

/**
 * Moves the household's open allocation to READY when everything is in place; otherwise returns why not.
 * @return array{promoted: bool, reasons: string[], allocation: ?array, queued_sms_ids: int[]}
 */
function aw_promote_if_complete(PDO $db, int $householdId, ?int $actorId): array {
    return aw_tx($db, function () use ($db, $householdId, $actorId) {
        $alloc = aw_open_allocation($db, $householdId, true);
        if (!$alloc) return ['promoted' => false, 'reasons' => ['No open allocation for this household.'], 'allocation' => null, 'queued_sms_ids' => []];
        if (!in_array($alloc['status'], ['PENDING_ASSESSMENT', 'ASSESSMENT_IN_PROGRESS'], true))
            return ['promoted' => false, 'reasons' => ['Allocation is ' . AW_STATUS_LABELS[$alloc['status']] . '.'], 'allocation' => $alloc, 'queued_sms_ids' => []];
        $reasons = [];
        $s = $db->prepare('SELECT status, locked_at FROM household_field_assessments WHERE allocation_id = ?');
        $s->execute([$alloc['allocation_id']]);
        $visit = $s->fetch(PDO::FETCH_ASSOC);
        $submitted = $visit && $visit['status'] === 'assessed' && !empty($visit['locked_at']);
        if (!$submitted) $reasons[] = 'Field visit not yet submitted.';
        $score = aw_current_score($db, $householdId);
        // Before the visit the score is incomplete by design; only gaps in the source data are reported then.
        if (!$score || ($score['score_complete'] === false && ($submitted || !$score['automatic_complete']))) {
            foreach (($score['review_reasons'] ?? []) ?: ['The score is incomplete.'] as $why) $reasons[] = 'For Verification: ' . $why;
        }
        $standard = aw_standard_package($db);
        if ($standard['reason']) $reasons[] = $standard['reason'];
        if ($reasons) return ['promoted' => false, 'reasons' => array_values(array_unique($reasons)), 'allocation' => $alloc, 'queued_sms_ids' => []];

        $insert = $db->prepare('INSERT INTO household_allocation_items (allocation_id, item_id, item_name, unit, planned_qty) VALUES (?,?,?,?,?)');
        foreach ($standard['items'] as $item) $insert->execute([$alloc['allocation_id'], $item['item_id'], $item['item_name'], $item['unit'], (int)$item['quantity']]);
        $ready = aw_transition($db, $alloc, 'READY_FOR_DISTRIBUTION', 'auto_ready', $actorId, null,
            ['final_score' => $score['final_score'], 'priority' => $score['priority_level'], 'package_id' => (int)$standard['package']['package_id']],
            ['ready_at' => date('Y-m-d H:i:s'), 'ready_score' => $score['final_score'], 'ready_priority' => $score['priority_level'],
             'ready_snapshot' => aw_score_snapshot($score), 'ready_rule_version' => DSS_MODEL_VERSION, 'package_id' => (int)$standard['package']['package_id']]);

        $list = implode(', ', array_map(fn($i) => "{$i['item_name']} {$i['quantity']} {$i['unit']}", $standard['items']));
        $summary = dispatch_notification($db, [['household_id' => $householdId]], "household_allocation:{$ready['allocation_id']}:ready",
            'Your relief allocation is ready for distribution', "Items: $list. For inquiries, contact the barangay office.",
            ['link' => '/resident/relief-status', 'sms' => true, 'sms_category' => 'Relief Allocation Update',
             'event_type' => 'ALLOCATION_READY_FOR_DISTRIBUTION', 'allocation_id' => (int)$ready['allocation_id'], 'sent_by' => $actorId, 'sms_defer' => true]);
        return ['promoted' => true, 'reasons' => [], 'allocation' => $ready, 'queued_sms_ids' => $summary['sms']['queued_ids'] ?? []];
    });
}

/** Promotes every waiting allocation whose only blocker may have been cleared (e.g. the standard package was set). */
function aw_promote_all_waiting(PDO $db, ?int $actorId): array {
    $waiting = $db->query("SELECT a.household_id FROM household_allocations a JOIN household_field_assessments f ON f.allocation_id = a.allocation_id
                           WHERE a.status IN ('PENDING_ASSESSMENT','ASSESSMENT_IN_PROGRESS') AND f.status = 'assessed' AND f.locked_at IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);
    $promoted = 0; $queued = [];
    foreach ($waiting as $hid) {
        $r = aw_promote_if_complete($db, (int)$hid, $actorId);
        if ($r['promoted']) { $promoted++; $queued = array_merge($queued, $r['queued_sms_ids']); }
    }
    return ['promoted' => $promoted, 'queued_sms_ids' => $queued];
}

/** Administrator re-open: back to ASSESSMENT_IN_PROGRESS, the visit unlocked, the plan removed (kept in history). */
function aw_reopen(PDO $db, int $allocationId, int $actorId, ?string $reason): array {
    aw_require_admin($db, $actorId);
    $reason = aw_reason($reason);
    return aw_tx($db, function () use ($db, $allocationId, $actorId, $reason) {
        $alloc = aw_allocation($db, $allocationId, true);
        $items = $db->prepare('SELECT item_id, item_name, unit, planned_qty FROM household_allocation_items WHERE allocation_id = ?');
        $items->execute([$allocationId]);
        $plan = $items->fetchAll(PDO::FETCH_ASSOC);
        $reopened = aw_transition($db, $alloc, 'ASSESSMENT_IN_PROGRESS', 'reopen', $actorId, $reason,
            ['ready_score' => $alloc['ready_score'], 'ready_priority' => $alloc['ready_priority'], 'planned_items' => $plan],
            ['ready_at' => null, 'ready_score' => null, 'ready_priority' => null, 'ready_snapshot' => null, 'ready_rule_version' => null, 'package_id' => null]);
        $db->prepare('DELETE FROM household_allocation_items WHERE allocation_id = ?')->execute([$allocationId]);
        $s = $db->prepare('SELECT * FROM household_field_assessments WHERE allocation_id = ? FOR UPDATE');
        $s->execute([$allocationId]);
        if ($before = $s->fetch(PDO::FETCH_ASSOC)) {
            $db->prepare("UPDATE household_field_assessments SET status = 'assigned', locked_at = NULL, reopened_count = reopened_count + 1, updated_by = ?, updated_at = NOW(), version = version + 1 WHERE assessment_id = ?")
               ->execute([$actorId, $before['assessment_id']]);
            $s->execute([$allocationId]);
            $after = $s->fetch(PDO::FETCH_ASSOC);
            $db->prepare('INSERT INTO household_assessment_revisions (assessment_id, action, before_json, after_json, changed_by) VALUES (?,?,?,?,?)')
               ->execute([$before['assessment_id'], 'reopen', json_encode($before), json_encode($after + ['reopen_reason' => $reason]), $actorId]);
        }
        return $reopened;
    });
}

function aw_cancel(PDO $db, int $allocationId, int $actorId, ?string $reason): array {
    aw_require_admin($db, $actorId);
    $reason = aw_reason($reason);
    return aw_tx($db, function () use ($db, $allocationId, $actorId, $reason) {
        $alloc = aw_allocation($db, $allocationId, true);
        return aw_transition($db, $alloc, 'CANCELLED', 'cancel', $actorId, $reason, [],
            ['cancelled_by' => $actorId, 'cancelled_at' => date('Y-m-d H:i:s'), 'cancel_reason' => $reason]);
    });
}

/** Administrator override: raise planned quantities on a READY allocation. Relief Personnel may still release less. */
function aw_adjust_planned(PDO $db, int $allocationId, array $quantities, int $actorId, ?string $reason): array {
    aw_require_admin($db, $actorId);
    $reason = aw_reason($reason);
    return aw_tx($db, function () use ($db, $allocationId, $quantities, $actorId, $reason) {
        $alloc = aw_allocation($db, $allocationId, true);
        if ($alloc['status'] !== 'READY_FOR_DISTRIBUTION') aw_error('Planned quantities can only be changed while the allocation is Ready for Distribution.', 409);
        if (!$quantities) aw_error('Choose at least one item to change.');
        $s = $db->prepare('SELECT item_id, planned_qty FROM household_allocation_items WHERE allocation_id = ? FOR UPDATE');
        $s->execute([$allocationId]);
        $planned = array_map('intval', $s->fetchAll(PDO::FETCH_KEY_PAIR));
        $changes = [];
        foreach ($quantities as $itemId => $qty) {
            if (!array_key_exists((int)$itemId, $planned)) aw_error('Only items already in the plan can be changed.');
            if (!is_int($qty) && !(is_string($qty) && ctype_digit($qty))) aw_error('Planned quantities must be whole numbers.');
            $qty = (int)$qty;
            if ($qty < $planned[(int)$itemId]) aw_error('Planned quantities can only be raised; Relief Personnel may release less at distribution.');
            if ($qty > 1000000) aw_error('Planned quantity is too large.');
            if ($qty !== $planned[(int)$itemId]) $changes[(int)$itemId] = ['from' => $planned[(int)$itemId], 'to' => $qty];
        }
        $update = $db->prepare('UPDATE household_allocation_items SET planned_qty = ? WHERE allocation_id = ? AND item_id = ?');
        foreach ($changes as $itemId => $c) $update->execute([$c['to'], $allocationId, $itemId]);
        aw_history($db, $allocationId, 'adjust_planned', $alloc['status'], $alloc['status'], $actorId, $reason, ['changes' => $changes]);
        return aw_allocation($db, $allocationId);
    });
}

/** Administrator: a new round after the previous one is Completed or Cancelled. */
function aw_start_round(PDO $db, int $householdId, int $actorId): array {
    aw_require_admin($db, $actorId);
    return aw_tx($db, function () use ($db, $householdId, $actorId) {
        $h = $db->prepare('SELECT household_id FROM households WHERE household_id = ? FOR UPDATE');
        $h->execute([$householdId]);
        if (!$h->fetch()) aw_error('Household not found.', 404);
        if ($open = aw_open_allocation($db, $householdId, true))
            aw_error("This household already has an open allocation (#{$open['allocation_id']}, " . AW_STATUS_LABELS[$open['status']] . ').', 409);
        $s = $db->prepare('SELECT COALESCE(MAX(round_no), 0) + 1 FROM household_allocations WHERE household_id = ?');
        $s->execute([$householdId]);
        $round = (int)$s->fetchColumn();
        $db->prepare("INSERT INTO household_allocations (household_id, round_no, status, created_by) VALUES (?, ?, 'PENDING_ASSESSMENT', ?)")->execute([$householdId, $round, $actorId]);
        $id = (int)$db->lastInsertId();
        aw_history($db, $id, $round === 1 ? 'created' : 'start_round', null, 'PENDING_ASSESSMENT', $actorId);
        return aw_allocation($db, $id);
    });
}

/** Relief Personnel see only households in their assigned Purok; administrators see all. */
function aw_in_scope(PDO $db, array $actor, int $householdId): bool {
    if ($actor['role'] === 'admin') return true;
    require_once __DIR__ . '/puroks.php';
    $s = $db->prepare('SELECT purok FROM households WHERE household_id = ?');
    $s->execute([$householdId]);
    $purok = normalize_purok($s->fetchColumn() ?: null);
    return $purok !== null && $purok === normalize_purok($actor['assigned_purok'] ?? null);
}

/** One allocation with its plan lines, live stock per item and the completing user's name. */
function aw_allocation_view(PDO $db, int $allocationId): array {
    $alloc = aw_allocation($db, $allocationId);
    $s = $db->prepare('SELECT ai.allocation_item_id, ai.item_id, ai.item_name, ai.unit, ai.planned_qty, ai.released_qty, ri.quantity AS remaining_stock
                       FROM household_allocation_items ai LEFT JOIN relief_items ri ON ri.item_id = ai.item_id WHERE ai.allocation_id = ? ORDER BY ai.allocation_item_id');
    $s->execute([$allocationId]);
    $alloc['items'] = array_map(function ($i) {
        foreach (['allocation_item_id', 'item_id', 'planned_qty', 'released_qty', 'remaining_stock'] as $k) $i[$k] = $i[$k] === null ? null : (int)$i[$k];
        return $i;
    }, $s->fetchAll(PDO::FETCH_ASSOC));
    $n = $db->prepare('SELECT full_name FROM users WHERE user_id = ?');
    $n->execute([$alloc['completed_by']]);
    $alloc['completed_by_name'] = $alloc['completed_by'] ? ($n->fetchColumn() ?: null) : null;
    return $alloc;
}

/** Released quantities keyed by plan line; whole numbers 0…planned, every line present, at least one above 0. */
function aw_released_quantities(array $lines, $items): array {
    if (!is_array($items)) aw_error('Enter the released quantity for every planned item.');
    $given = [];
    foreach ($items as $entry) {
        if (!is_array($entry) || !isset($entry['allocation_item_id'])) aw_error('Enter the released quantity for every planned item.');
        $qty = $entry['released_qty'] ?? null;
        if (!((is_int($qty) && $qty >= 0) || (is_string($qty) && ctype_digit($qty)))) aw_error('Released quantities must be whole numbers of 0 or more.');
        $given[(int)$entry['allocation_item_id']] = (int)$qty;
    }
    $released = [];
    foreach ($lines as $line) {
        $id = (int)$line['allocation_item_id'];
        if (!array_key_exists($id, $given)) aw_error('Enter the released quantity for every planned item.');
        if ($given[$id] > (int)$line['planned_qty'])
            aw_error("You cannot release more than planned for {$line['item_name']} (planned {$line['planned_qty']}). An administrator must raise the plan first.");
        $released[$id] = $given[$id];
    }
    if (count($given) !== count($lines)) aw_error('Enter the released quantity for every planned item.');
    if (array_sum($released) === 0) aw_error('Release at least one item.');
    return $released;
}

/**
 * Relief Personnel complete a READY allocation. One transaction: allocation row locked and re-checked, item rows
 * locked in item order, every shortage collected (nothing deducted unless all fit), stock deducted with a
 * non-negative guard, one Stock Out ledger row per released item, completed snapshot, status COMPLETED.
 * The completion key makes a retried request return the first result instead of deducting twice.
 */
function aw_complete_distribution(PDO $db, int $allocationId, array $input, int $actorId): array {
    $actor = aw_actor($db, $actorId);
    if ($actor['role'] !== 'relief_personnel') aw_error('Only Relief Personnel can complete a distribution.', 403);
    $key = $input['completion_key'] ?? null;
    if (!is_string($key) || !preg_match('/^[A-Za-z0-9-]{8,64}$/D', $key)) aw_error('A valid completion key is required.');
    $text = function (string $field, int $max) use ($input): ?string {
        $v = $input[$field] ?? null;
        if ($v === null || $v === '') return null;
        if (!is_string($v) || mb_strlen(trim($v)) > $max) aw_error("Invalid $field.");
        return trim($v) === '' ? null : trim($v);
    };
    $recipient = $text('recipient_name', 150);
    $remarks = $text('remarks', 300);
    $photo = $text('proof_photo', 255);
    if ($photo !== null && $photo !== basename($photo)) aw_error('Invalid proof_photo.');

    return aw_tx($db, function () use ($db, $allocationId, $input, $actorId, $actor, $key, $recipient, $remarks, $photo) {
        $used = $db->prepare('SELECT allocation_id FROM household_allocations WHERE completion_key = ?');
        $used->execute([$key]);
        if (($usedBy = $used->fetchColumn()) !== false) {
            if ((int)$usedBy !== $allocationId) aw_error('This completion key was already used for another allocation.', 409);
            return aw_allocation_view($db, $allocationId);
        }
        $alloc = aw_allocation($db, $allocationId, true);
        if (!aw_in_scope($db, $actor, (int)$alloc['household_id'])) aw_error('Allocation not found.', 404);
        if ($alloc['status'] === 'COMPLETED') {
            if ($alloc['completion_key'] === $key) return aw_allocation_view($db, $allocationId);
            $view = aw_allocation_view($db, $allocationId);
            aw_error("This allocation was already completed by {$view['completed_by_name']} at {$alloc['completed_at']}.", 409);
        }
        if ($alloc['status'] !== 'READY_FOR_DISTRIBUTION') aw_error('This allocation is no longer ready for distribution.', 409);

        $s = $db->prepare('SELECT * FROM household_allocation_items WHERE allocation_id = ? ORDER BY allocation_item_id FOR UPDATE');
        $s->execute([$allocationId]);
        $lines = $s->fetchAll(PDO::FETCH_ASSOC);
        if (!$lines) aw_error('This allocation has no planned items.', 409);
        $released = aw_released_quantities($lines, $input['items'] ?? null);

        $needed = []; // item_id => [qty, line]
        foreach ($lines as $line) {
            $qty = $released[(int)$line['allocation_item_id']];
            if ($qty === 0) continue;
            if ($line['item_id'] === null) aw_error("{$line['item_name']} is no longer in the inventory.", 409);
            $needed[(int)$line['item_id']] = ['qty' => $qty, 'line' => $line];
        }
        ksort($needed);
        $stock = [];
        $lock = $db->prepare('SELECT item_id, item_name, unit, quantity FROM relief_items WHERE item_id = ? FOR UPDATE');
        foreach (array_keys($needed) as $itemId) {
            $lock->execute([$itemId]);
            if (!($row = $lock->fetch(PDO::FETCH_ASSOC))) aw_error("{$needed[$itemId]['line']['item_name']} is no longer in the inventory.", 409);
            $stock[$itemId] = $row;
        }
        $short = [];
        foreach ($needed as $itemId => $n) {
            if ((int)$stock[$itemId]['quantity'] < $n['qty']) $short[] = "{$stock[$itemId]['item_name']}: need {$n['qty']}, available {$stock[$itemId]['quantity']}";
        }
        if ($short) aw_error('Not enough stock: ' . implode('; ', $short) . '.', 409);

        $deduct = $db->prepare('UPDATE relief_items SET quantity = quantity - ? WHERE item_id = ? AND quantity >= ?');
        $ledger = $db->prepare("INSERT INTO inventory_logs (item_id, log_type, quantity_change, previous_quantity, resulting_quantity, reference, allocation_ref, performed_by) VALUES (?, 'Stock Out', ?, ?, ?, ?, ?, ?)");
        foreach ($needed as $itemId => $n) {
            $deduct->execute([$n['qty'], $itemId, $n['qty']]);
            if ($deduct->rowCount() !== 1) aw_error('The stock level changed while saving. Refresh and try again.', 409);
            $before = (int)$stock[$itemId]['quantity'];
            $ledger->execute([$itemId, -$n['qty'], $before, $before - $n['qty'], "Household allocation #$allocationId", $allocationId, $actorId]);
        }
        $setReleased = $db->prepare('UPDATE household_allocation_items SET released_qty = ? WHERE allocation_item_id = ?');
        foreach ($released as $lineId => $qty) $setReleased->execute([$qty, $lineId]);

        $score = aw_current_score($db, (int)$alloc['household_id']);
        aw_transition($db, $alloc, 'COMPLETED', 'complete', $actorId, null,
            ['released' => array_map(fn($n) => ['item' => $n['line']['item_name'], 'qty' => $n['qty']], array_values($needed))],
            ['completed_by' => $actorId, 'completed_at' => date('Y-m-d H:i:s'), 'completion_key' => $key,
             'completed_score' => $score['final_score'] ?? null, 'completed_priority' => $score['priority_level'] ?? null,
             'completed_snapshot' => $score ? aw_score_snapshot($score) : null, 'completed_rule_version' => DSS_MODEL_VERSION,
             'recipient_name' => $recipient, 'completion_remarks' => $remarks, 'proof_photo' => $photo]);
        return aw_allocation_view($db, $allocationId);
    });
}

/** JSON endpoint wrapper: AllocationWorkflowError → its HTTP code; other errors propagate to the global handler. */
function aw_endpoint(callable $fn): void {
    try { echo json_encode(['success' => true, 'data' => $fn()]); }
    catch (AllocationWorkflowError $e) { http_response_code($e->getCode() ?: 400); echo json_encode(['success' => false, 'message' => $e->getMessage()]); }
}
