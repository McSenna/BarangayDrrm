<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/allocation_views.php';

require_login(['admin']);

$database = new Database();
$conn = $database->connect();

// ---- Summary cards ----
$total_households = intval($conn->query("SELECT COUNT(*) FROM households")->fetchColumn());
$total_residents = intval($conn->query("SELECT COUNT(*) FROM users WHERE role = 'resident'")->fetchColumn());
$total_disaster_reports = intval($conn->query("SELECT COUNT(*) FROM disaster_reports")->fetchColumn());
$reports_this_month = intval($conn->query(
    "SELECT COUNT(*) FROM disaster_reports WHERE DATE_FORMAT(report_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')"
)->fetchColumn());
$released = av_released_sql();
$total_distributed_items = intval($conn->query("SELECT COALESCE(SUM(quantity),0) FROM $released r")->fetchColumn());
$low_stock_count = intval($conn->query("SELECT COUNT(*) FROM relief_items WHERE quantity <= minimum_level")->fetchColumn());
$active_hazard_alerts = intval($conn->query("SELECT COUNT(*) FROM hazard_alerts WHERE is_active = 1")->fetchColumn());
$total_beneficiaries = intval($conn->query("SELECT COUNT(DISTINCT household_id) FROM $released r")->fetchColumn());

// ---- Monthly statistics (last 12 months) ----
$monthly_reports = $conn->query(
    "SELECT DATE_FORMAT(report_date, '%Y-%m') AS label, COUNT(*) AS count
     FROM disaster_reports
     WHERE report_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
     GROUP BY label ORDER BY label ASC"
)->fetchAll(PDO::FETCH_ASSOC);

$monthly_relief = $conn->query(
    "SELECT DATE_FORMAT(distributed_at, '%Y-%m') AS label, SUM(quantity) AS quantity
     FROM $released r
     WHERE distributed_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
     GROUP BY label ORDER BY label ASC"
)->fetchAll(PDO::FETCH_ASSOC);

// ---- Disaster statistics ----
$reports_by_type = $conn->query(
    "SELECT disaster_type AS label, COUNT(*) AS count FROM disaster_reports GROUP BY disaster_type ORDER BY count DESC"
)->fetchAll(PDO::FETCH_ASSOC);

$reports_by_severity = $conn->query(
    "SELECT severity AS label, COUNT(*) AS count FROM disaster_reports GROUP BY severity ORDER BY FIELD(severity,'Critical','High','Medium','Low')"
)->fetchAll(PDO::FETCH_ASSOC);

$reports_by_status = $conn->query(
    "SELECT status AS label, COUNT(*) AS count FROM disaster_reports GROUP BY status"
)->fetchAll(PDO::FETCH_ASSOC);

$inventory_by_category = $conn->query(
    "SELECT category AS label, SUM(quantity) AS quantity FROM relief_items GROUP BY category ORDER BY quantity DESC"
)->fetchAll(PDO::FETCH_ASSOC);

echo json_encode([
    "success" => true,
    "data" => [
        "summary" => [
            "total_households" => $total_households,
            "total_residents" => $total_residents,
            "total_disaster_reports" => $total_disaster_reports,
            "reports_this_month" => $reports_this_month,
            "total_distributed_items" => $total_distributed_items,
            "total_beneficiaries" => $total_beneficiaries,
            "low_stock_count" => $low_stock_count,
            "active_hazard_alerts" => $active_hazard_alerts,
        ],
        "monthly_reports" => $monthly_reports,
        "monthly_relief" => $monthly_relief,
        "reports_by_type" => $reports_by_type,
        "reports_by_severity" => $reports_by_severity,
        "reports_by_status" => $reports_by_status,
        "inventory_by_category" => $inventory_by_category,
    ]
]);
