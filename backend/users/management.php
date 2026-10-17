<?php
require_once __DIR__ . '/registration.php';
require_once __DIR__ . '/../lib/field_scope.php';
// Shared account validation and transaction policy. No bootstrap side effects.
class UserManagementError extends RuntimeException {}
function um_display_role(array $row) {
    if ($row['role'] === 'resident' && intval($row['is_household_head'] ?? 0) === 1) return 'Head of the family';
    return ['admin' => 'Administrator', 'relief_personnel' => 'Relief Personnel', 'field_officer' => 'Field Officer', 'resident' => 'Resident'][$row['role']] ?? 'Unknown';
}
function um_access($role) {
    return ['admin' => 'Full system access', 'relief_personnel' => 'Reports and relief distribution', 'field_officer' => 'Reports, assessments and field views', 'resident' => 'Own household and relief status'][$role] ?? 'Unknown';
}
function um_fail($status, $message) { throw new UserManagementError($message, $status); }
function um_fields(array $data, array $allowed) {
    if (array_diff(array_keys($data), $allowed)) um_fail(400, 'Unexpected account fields. Please refresh and try again.');
}
function um_text($value, $max) {
    if (!is_string($value)) um_fail(400, 'Please enter text in the account fields.');
    $value = trim($value);
    $length = function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
    if ($length > $max || preg_match('/[\x00-\x1F\x7F]/u', $value)) um_fail(400, 'An account field is too long or contains invalid characters.');
    return $value;
}
function um_profile(array $data, $creating = false) {
    um_fields($data, ['user_id', 'full_name', 'email', 'role', 'contact_number', 'password', 'version', 'assigned_purok']);
    $profile = [
        'full_name' => um_text($data['full_name'] ?? '', 150),
        'email' => um_text($data['email'] ?? '', 150),
        'role' => um_text($data['role'] ?? 'resident', 30),
        'contact_number' => um_text($data['contact_number'] ?? '', 20),
    ];
    if ($profile['full_name'] === '' || !filter_var($profile['email'], FILTER_VALIDATE_EMAIL)) um_fail(400, 'Enter a full name and a valid email address.');
    if (!in_array($profile['role'], ['admin', 'resident', 'relief_personnel', 'field_officer'], true)) um_fail(400, 'Select a valid account role.');
    $assigned = um_text($data['assigned_purok'] ?? '', 50);
    if (in_array($profile['role'], ['field_officer', 'relief_personnel'], true)) {
        $assigned = validate_purok_input($assigned);
        if ($assigned === null) um_fail(400, 'Select an assigned Purok for this staff account.');
    } elseif ($assigned !== '') um_fail(400, 'Purok assignment is only available for field officer and relief personnel accounts.');
    $profile['assigned_purok'] = $assigned === '' ? null : $assigned;
    $password = $data['password'] ?? '';
    if (!is_string($password)) um_fail(400, 'Enter a valid password.');
    if ($creating && (strlen($password) < 6 || strlen($password) > 72)) um_fail(400, 'Use a password of 6 to 72 bytes.');
    // Older Personnel clients submit an empty password on profile edits.
    if (!$creating && $password !== '') um_fail(400, 'Passwords cannot be changed through profile editing.');
    return $profile;
}
function um_version(array $row) {
    $values = [];
    foreach (['user_id', 'full_name', 'email', 'role', 'contact_number', 'is_active'] as $key) $values[] = (string)($row[$key] ?? '');
    $values[] = $row['registration_status'] ?? 'approved';
    $values[] = (string)($row['assigned_purok'] ?? '');
    return hash('sha256', json_encode($values));
}
function um_guard(array $row, $actor, $role, $active, $adminCount) {
    if (intval($row['user_id']) === intval($actor) && ($role !== 'admin' || !$active)) um_fail(409, 'You cannot deactivate your own account or change your own administrator role.');
    if ($row['role'] === 'admin' && intval($row['is_active']) === 1 && ($role !== 'admin' || !$active) && $adminCount <= 1) um_fail(409, 'Keep at least one active administrator.');
}
function um_csv_cell($value) {
    $value = (string)($value ?? '');
    return preg_match('/^[\s\x00-\x1F]*[=+@-]|^[\t\r\n]/u', $value) ? "'" . $value : $value;
}
function um_body($method) {
    if ($_SERVER['REQUEST_METHOD'] !== $method) um_fail(405, 'Method not allowed.');
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data) || array_is_list($data)) um_fail(400, 'Send a valid account form.');
    return $data;
}
function um_id($value) {
    if (filter_var($value, FILTER_VALIDATE_INT) === false || intval($value) <= 0) um_fail(400, 'Select a valid account.');
    return intval($value);
}
function um_active($value) {
    if (!in_array($value, [0, 1, '0', '1'], true)) um_fail(400, 'Select a valid account status.');
    return intval($value);
}
// All administrative mutations acquire the same ordered locks, then recheck
// the actor. This serializes concurrent deactivation/demotion safely.
function um_lock(PDO $conn) {
    $conn->beginTransaction();
    $admins = $conn->query("SELECT user_id, is_active FROM users WHERE role = 'admin' ORDER BY user_id FOR UPDATE")->fetchAll(PDO::FETCH_ASSOC);
    $count = 0; $authorized = false;
    foreach ($admins as $admin) {
        if (intval($admin['is_active']) === 1) {
            $count++;
            if (intval($admin['user_id']) === intval($_SESSION['user_id'])) $authorized = true;
        }
    }
    if (!$authorized) um_fail(403, 'Your account no longer has administrator access.');
    if (registration_status($conn, $_SESSION['user_id']) !== 'approved') um_fail(403, 'This account is not approved.');
    return $count;
}
function um_target(PDO $conn, $id, $version = null) {
    $stmt = $conn->prepare('SELECT user_id, full_name, email, role, contact_number, is_active, assigned_purok FROM users WHERE user_id = ? FOR UPDATE');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) um_fail(404, 'This account no longer exists. Refresh the list.');
    $row['registration_status'] = registration_status($conn, $id);
    if ($version !== null && (!is_string($version) || !hash_equals(um_version($row), $version))) um_fail(409, 'This account changed since you opened it. Close this dialog, refresh, and try again.');
    return $row;
}
function um_error(Throwable $e, $conn = null) {
    if ($conn && $conn->inTransaction()) $conn->rollBack();
    $status = $e instanceof UserManagementError ? $e->getCode() : 500;
    $message = $e instanceof UserManagementError ? $e->getMessage() : 'We could not complete the account request. Please try again.';
    if ($e instanceof PDOException && ($e->errorInfo[1] ?? null) === 1062) { $status = 409; $message = 'An account with this email already exists.'; }
    if ($status === 500) error_log('User management: ' . $e->getMessage());
    http_response_code($status);
    echo json_encode(['success' => false, 'message' => $message]);
}
