<?php
require_once __DIR__ . '/puroks.php';

function staff_has_purok_scope(): bool { return in_array($_SESSION['role'] ?? '', ['field_officer', 'relief_personnel'], true); }

// Fresh database lookup for every request; never trust a form/query/session Purok.
function field_assigned_purok(PDO $conn): ?string {
    if (!staff_has_purok_scope()) return null;
    $stmt = $conn->prepare("SELECT assigned_purok FROM users WHERE user_id = ? AND role IN ('field_officer', 'relief_personnel') AND is_active = 1");
    $stmt->execute([$_SESSION['user_id']]);
    $assigned = $stmt->fetchColumn();
    if (!is_string($assigned) || !in_array($assigned, BINITAYAN_PUROKS, true)) field_scope_denied('Ask the administrator to assign your Purok before using your workspace.');
    return $assigned;
}
function field_scope_denied($message = 'This record is outside your assigned Purok.'): void {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => $message]);
    exit();
}
function field_scope_rows(PDO $conn, array $rows, string $key = 'purok'): array {
    if (!staff_has_purok_scope()) return $rows;
    $assigned = field_assigned_purok($conn);
    return array_values(array_filter($rows, fn($row) => normalize_purok($row[$key] ?? null) === $assigned));
}
function field_require_household(PDO $conn, $householdId): void {
    if (!staff_has_purok_scope()) return;
    $assigned = field_assigned_purok($conn);
    $stmt = $conn->prepare('SELECT purok FROM households WHERE household_id = ?');
    $stmt->execute([$householdId]);
    $purok = $stmt->fetchColumn();
    if (!is_string($purok) || normalize_purok($purok) !== $assigned) field_scope_denied();
}
function field_require_report(PDO $conn, $reportId): void {
    if (!staff_has_purok_scope()) return;
    $stmt = $conn->prepare('SELECT household_id FROM disaster_reports WHERE report_id = ?');
    $stmt->execute([$reportId]);
    $householdId = $stmt->fetchColumn();
    if (!$householdId) field_scope_denied();
    field_require_household($conn, $householdId);
}

// Use validated household IDs so legacy Purok spellings follow the same normalization as list views.
function staff_household_condition(PDO $conn, string $alias): string {
    if (!staff_has_purok_scope()) return '1=1';
    $rows = field_scope_rows($conn, $conn->query('SELECT household_id, purok FROM households')->fetchAll(PDO::FETCH_ASSOC));
    $ids = array_map('intval', array_column($rows, 'household_id'));
    return $alias . '.household_id IN (' . ($ids ? implode(',', $ids) : '0') . ')';
}
function staff_require_allocation(PDO $conn, $id): void {
    if (!staff_has_purok_scope()) return;
    $stmt = $conn->prepare('SELECT household_id FROM relief_allocations WHERE allocation_id = ?');
    $stmt->execute([$id]);
    field_require_household($conn, $stmt->fetchColumn());
}
function staff_require_beneficiary(PDO $conn, $id): void {
    if (!staff_has_purok_scope()) return;
    $stmt = $conn->prepare('SELECT db.household_id, ds.assigned_personnel FROM distribution_beneficiaries db JOIN distribution_schedules ds ON ds.schedule_id = db.schedule_id WHERE db.beneficiary_id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row || intval($row['assigned_personnel']) !== intval($_SESSION['user_id'])) field_scope_denied();
    field_require_household($conn, $row['household_id']);
}
function staff_require_delivery(PDO $conn, $id): void {
    if (!staff_has_purok_scope()) return;
    $stmt = $conn->prepare('SELECT beneficiary_id FROM delivery_reports WHERE report_id = ?');
    $stmt->execute([$id]);
    staff_require_beneficiary($conn, $stmt->fetchColumn());
}
