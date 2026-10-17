<?php
// Resident: the relief allocation rounds of their own household (status, planned or released items, dates).
// Scores, officers and other households are not included.
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/allocation_views.php';
require_login(['resident']);
if ($_SERVER['REQUEST_METHOD'] !== 'GET') { http_response_code(405); echo json_encode(['success' => false, 'message' => 'Method not allowed.']); exit; }
aw_endpoint(function () {
    $db = (new Database())->connect();
    $s = $db->prepare('SELECT household_id FROM households WHERE user_id = ?');
    $s->execute([intval($_SESSION['user_id'])]);
    $ids = array_map('intval', $s->fetchAll(PDO::FETCH_COLUMN));
    if (!$ids) return [];
    $rows = av_rows($db, 'a.household_id IN (' . implode(',', $ids) . ')', []);
    usort($rows, fn($a, $b) => $b['allocation_id'] <=> $a['allocation_id']);
    return array_map(fn($r) => [
        'allocation_id' => $r['allocation_id'], 'round_no' => $r['round_no'], 'status' => $r['status'], 'status_label' => $r['status_label'],
        'ready_at' => $r['ready_at'], 'completed_at' => $r['completed_at'], 'cancel_reason' => $r['status'] === 'CANCELLED' ? $r['cancel_reason'] : null,
        'items' => array_map(fn($i) => ['item_name' => $i['item_name'], 'unit' => $i['unit'], 'planned_qty' => $i['planned_qty'], 'released_qty' => $i['released_qty']], $r['items']),
    ], $rows);
});
