<?php
// Administrator chooses the standard relief package every Ready household receives. Waiting households whose only
// blocker was the missing package are promoted right away. Body {package_id}.
require_once __DIR__ . '/../../config/cors.php';
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../lib/allocation_views.php';
require_login(['admin']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['success' => false, 'message' => 'Method not allowed.']); exit; }
aw_endpoint(function () {
    $data = av_json_body();
    $packageId = av_id($data['package_id'] ?? null, 'package_id');
    $db = (new Database())->connect();
    $actorId = intval($_SESSION['user_id']);
    aw_require_admin($db, $actorId);
    $result = aw_tx($db, function () use ($db, $packageId, $actorId) {
        $s = $db->prepare('SELECT p.package_name, p.is_active, COUNT(pi.package_item_id) AS items FROM relief_packages p LEFT JOIN relief_package_items pi ON pi.package_id = p.package_id AND pi.quantity > 0 WHERE p.package_id = ? GROUP BY p.package_id FOR UPDATE');
        $s->execute([$packageId]);
        $package = $s->fetch(PDO::FETCH_ASSOC);
        if (!$package) aw_error('Package not found.', 404);
        if (!intval($package['is_active']) || !intval($package['items'])) aw_error('Choose an active package that has at least one item.');
        $db->prepare("INSERT INTO system_settings (setting_key, setting_value, updated_by) VALUES ('standard_relief_package_id', ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)")->execute([(string)$packageId, $actorId]);
        log_action($db, 'Standard relief package set', "package_id: $packageId ({$package['package_name']})");
        return aw_promote_all_waiting($db, $actorId);
    });
    av_send_queued_sms($db, $result['queued_sms_ids']);
    return ['package_id' => $packageId, 'promoted' => $result['promoted']];
});
