<?php
// Helper for tests/allocation_completion_test.php: one Complete Distribution attempt in its own process/connection.
// Usage: php allocation_completion_worker.php <database> <allocation_id> <actor_id> <completion_key> <start_at_unix_ms>
if (PHP_SAPI !== 'cli' || $argc !== 6 || !preg_match('/^codex_users_test_\d{8}_\d{6}_[a-f0-9]+$/', $argv[1])) exit(2);
require_once __DIR__ . '/../backend/lib/allocation_workflow.php';
$db = new PDO('mysql:host=127.0.0.1;dbname=' . $argv[1] . ';charset=utf8mb4', getenv('DB_USER') ?: 'root', getenv('DB_PASS') ?: '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$items = $db->prepare('SELECT allocation_item_id, planned_qty FROM household_allocation_items WHERE allocation_id = ?');
$items->execute([(int)$argv[2]]);
$released = array_map(fn($r) => ['allocation_item_id' => (int)$r['allocation_item_id'], 'released_qty' => (int)$r['planned_qty']], $items->fetchAll(PDO::FETCH_ASSOC));
while (microtime(true) * 1000 < (float)$argv[5]) usleep(500); // both workers start together
try {
    aw_complete_distribution($db, (int)$argv[2], ['completion_key' => $argv[4], 'items' => $released], (int)$argv[3]);
    echo json_encode(['ok' => true]);
} catch (AllocationWorkflowError $e) {
    echo json_encode(['ok' => false, 'code' => $e->getCode(), 'message' => $e->getMessage()]);
}
