<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

// Intentionally public (no require_login call) — hazard warnings and current
// weather are public safety information residents should see even before
// logging in, similar to how a barangay bulletin board works.

$database = new Database();
$conn = $database->connect();

$active_alerts = $conn->query(
    "SELECT alert_id, hazard_type, status, title, description, affected_purok, issued_at
     FROM hazard_alerts
     WHERE is_active = 1
     ORDER BY FIELD(status, 'Critical','Warning','Alert','Normal') ASC, issued_at DESC"
)->fetchAll(PDO::FETCH_ASSOC);

$status_rank = ['Critical' => 4, 'Warning' => 3, 'Alert' => 2, 'Normal' => 1];
$overall_status = 'Normal';
foreach ($active_alerts as $alert) {
    if (($status_rank[$alert['status']] ?? 0) > ($status_rank[$overall_status] ?? 0)) {
        $overall_status = $alert['status'];
    }
}

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
