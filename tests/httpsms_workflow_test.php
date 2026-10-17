<?php
// In-memory database double; never reads or writes the application's database.
require_once __DIR__ . '/../backend/sms/sms_helper.php';
function check($condition, $message) {
    if (!$condition) { fwrite(STDERR, "FAIL: $message\n"); exit(1); }
}
class SmsTestStatement extends PDOStatement {
    public function __construct(private SmsTestDatabase $db, private string $sql) {}
    public function execute(?array $params = null): bool {
        $this->db->writes[] = [$this->sql, $params]; return true;
    }
    public function fetch(int $mode = PDO::FETCH_DEFAULT, int $cursorOrientation = PDO::FETCH_ORI_NEXT, int $cursorOffset = 0): mixed {
        if (str_starts_with($this->sql, 'SHOW COLUMNS')) return ['Field' => 'present'];
        return $this->db->row;
    }
    public function fetchColumn(int $column = 0): mixed { return $this->db->duplicate; }
}
class SmsTestDatabase extends PDO {
    public array $writes = [];
    public bool $duplicate = false;
    public array $row = ['sms_id' => 1, 'recipient_number' => '09123456789', 'message' => 'Test', 'status' => 'Queued'];
    private bool $transaction = false;
    public function __construct() {}
    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false { return new SmsTestStatement($this, $query); }
    public function prepare(string $query, array $options = []): PDOStatement|false { return new SmsTestStatement($this, $query); }
    public function lastInsertId(?string $name = null): string|false { return (string) count($this->writes); }
    public function inTransaction(): bool { return $this->transaction; }
    public function beginTransaction(): bool { $this->transaction = true; return true; }
    public function commit(): bool { $this->transaction = false; return true; }
    public function rollBack(): bool { $this->transaction = false; return true; }
}
putenv('HTTPSMS_SMS_ENABLED=false');
putenv('HTTPSMS_API_KEY=offline-test');
$db = new SmsTestDatabase();
$recipient = ['type' => 'Custom', 'name' => 'Test', 'number' => '09123456789'];
$result = send_sms_batch($db, [$recipient], 'Test notice', 'General Announcement', null);
check($result['status'] === 'Not Configured', 'Disabled manual SMS is not sent');
check($db->writes[0][1][':status'] === 'Not Configured', 'Disabled recipient logged');
$db->writes = [];
$recipient['number'] = 'invalid';
$result = send_sms_batch($db, [$recipient], 'Test notice', 'General Announcement', null);
check($result['status'] === 'Failed' && $db->writes[0][1][':status'] === 'Failed', 'Invalid recipient logged as failed');
$db->writes = []; $db->duplicate = true; $recipient['number'] = '09123456789';
$result = send_sms_batch($db, [$recipient], 'Test notice', 'General Announcement', null, ['event_key' => 'event-1']);
check($result['status'] === 'Duplicate Skipped', 'Duplicate event skipped');
check(count($db->writes) === 1 && str_starts_with($db->writes[0][0], 'SELECT 1'), 'Duplicate event creates no new log');
$db->writes = [];
$result = sms_process_queued($db, [1]);
check($result['failed'] === 1 && str_contains($db->writes[1][0], "status = 'Not Configured'"), 'Disabled queued SMS recorded');
foreach (SMS_ACCEPTED_STATUSES as $status) {
    $db->row['status'] = $status;
    $db->writes = [];
    check(sms_process_queued($db, [1])['skipped'] === 1 && count($db->writes) === 1, 'Previously accepted queued SMS skipped');
}
echo "httpSMS offline workflow checks passed.\n";

