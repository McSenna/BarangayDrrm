<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/barangay_alerts.php';

// Intentionally public (no require_login call) — hazard warnings and current
// weather are public safety information residents should see even before
// logging in, similar to how a barangay bulletin board works.
// Phase 33: active alerts come from backend/lib/barangay_alerts.php (drafts and
// turned-off alerts never appear). The older keys (status, affected_purok,
// issued_at) are kept for existing readers; severity, scope, puroks[],
// instructions and ISO activated_at are added.

$database = new Database();
$conn = $database->connect();

$active_alerts = array_map(function ($a) {
    return [
        'alert_id' => $a['alert_id'],
        'hazard_type' => $a['hazard_type'],
        'status' => $a['severity'],
        'title' => $a['title'],
        'description' => $a['description'],
        'affected_purok' => $a['scope'] === 'barangay' ? null : ($a['puroks'] ? implode(', ', $a['puroks']) : $a['unmapped_area']),
        'issued_at' => $a['activated_at'] ? str_replace('T', ' ', substr($a['activated_at'], 0, 19)) : null,
    ] + $a;
}, ba_public_active($conn));

$overall_status = ba_highest_severity($active_alerts) ?? 'Normal';

$latest_weather = $conn->query(
    "SELECT log_date, log_time, temperature, rainfall_mm, weather_condition, wind_speed_kph, wind_direction, source
     FROM weather_logs
     ORDER BY log_date DESC, log_time DESC
     LIMIT 1"
)->fetch(PDO::FETCH_ASSOC);

echo json_encode([
    "success" => true,
    "data" => [
        "overall_status" => $overall_status,
        "active_alerts" => $active_alerts,
        "latest_weather" => $latest_weather ?: null,
    ]
]);
