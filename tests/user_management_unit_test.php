<?php
require_once __DIR__ . '/../backend/users/management.php';
$checks = 0;
function check($ok, $name) { global $checks; if (!$ok) { throw new Exception($name); } $checks++; }
function rejects($fn, $status, $name) {
    try { $fn(); } catch (UserManagementError $e) { check($e->getCode() === $status, $name); return; }
    throw new Exception("Expected rejection: $name");
}
$valid = ['full_name' => ' Test User ', 'email' => ' Person@example.com ', 'role' => 'resident', 'contact_number' => ''];
check(um_profile($valid)['email'] === 'Person@example.com', 'Preserve existing email casing and trim');
check(um_profile($valid)['full_name'] === 'Test User', 'Trim name');
rejects(fn() => um_profile($valid + ['is_active' => 1]), 400, 'Reject injected activation field');
rejects(fn() => um_profile(array_replace($valid, ['email' => 'bad'])), 400, 'Invalid email');
rejects(fn() => um_profile(array_replace($valid, ['role' => 'superadmin'])), 400, 'Unknown role');
rejects(fn() => um_profile(array_replace($valid, ['full_name' => []])), 400, 'Wrong field type');
rejects(fn() => um_profile(array_replace($valid, ['contact_number' => str_repeat('1', 21)])), 400, 'Storage length');
rejects(fn() => um_profile($valid + ['password' => 'change-me']), 400, 'No password edits');
rejects(fn() => um_profile($valid + ['password' => '123'], true), 400, 'Short provisioning password');
$admin = ['user_id' => 1, 'role' => 'admin', 'is_active' => 1];
rejects(fn() => um_guard($admin, 1, 'resident', 1, 2), 409, 'Self demotion');
rejects(fn() => um_guard($admin, 1, 'admin', 0, 2), 409, 'Self deactivation');
rejects(fn() => um_guard($admin, 2, 'resident', 1, 1), 409, 'Last admin demotion');
rejects(fn() => um_guard($admin, 2, 'admin', 0, 1), 409, 'Last admin deactivation');
um_guard($admin, 2, 'resident', 1, 2); check(true, 'Other administrator may demote');
foreach (['=SUM(A1)', '+cmd', '-1', '@SUM(A1)', " \t=1", "\r=1", "\n=1"] as $cell) {
    check(str_starts_with(um_csv_cell($cell), "'"), 'CSV formula protection');
}
check(um_csv_cell('Ordinary, "quoted" name') === 'Ordinary, "quoted" name', 'CSV preserves normal text');
$row = $valid + ['user_id' => 3, 'is_active' => 1];
check(um_version($row) !== um_version(array_replace($row, ['role' => 'admin'])), 'Version detects role change');
check(um_version($row) === um_version($row + ['last_login' => 'today']), 'Login does not conflict with profile editing');
echo "PASS: $checks user management checks\n";
