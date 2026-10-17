<?php
/**
 * Purok Cleanup — list every distinct purok value stored in the database
 * (Phase 19, admin only). Read-only: shows how many records use each value,
 * whether it is already a standard purok, and a suggested standard value.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/puroks.php';

require_login(['admin']);

$database = new Database();
$conn = $database->connect();

$sources = [
    'households' => "SELECT purok AS value, COUNT(*) AS cnt FROM households GROUP BY purok",
    'hazard_alerts' => "SELECT affected_purok AS value, COUNT(*) AS cnt FROM hazard_alerts ha WHERE affected_purok IS NOT NULL AND affected_purok <> ''
        AND NOT EXISTS (SELECT 1 FROM hazard_alert_puroks hp WHERE hp.alert_id = ha.alert_id) GROUP BY affected_purok", // Phase 33 alerts store standard Puroks separately
    'evacuation_centers' => "SELECT purok AS value, COUNT(*) AS cnt FROM evacuation_centers GROUP BY purok",
];

$values = [];
foreach ($sources as $table => $sql) {
    foreach ($conn->query($sql)->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $v = (string) $row['value'];
        if (!isset($values[$v])) {
            $values[$v] = [
                'value' => $v,
                'is_standard' => in_array($v, BINITAYAN_PUROKS, true),
                'suggested' => normalize_purok($v),
                'households' => 0,
                'hazard_alerts' => 0,
                'evacuation_centers' => 0,
            ];
        }
        $values[$v][$table] = intval($row['cnt']);
    }
}

$list = array_values($values);
usort($list, fn($a, $b) => [$a['is_standard'], $a['value']] <=> [$b['is_standard'], $b['value']]);

echo json_encode([
    "success" => true,
    "standard_puroks" => BINITAYAN_PUROKS,
    "data" => $list,
    "non_standard_count" => count(array_filter($list, fn($r) => !$r['is_standard'])),
]);
