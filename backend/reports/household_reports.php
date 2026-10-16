<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin']);

$database = new Database();
$conn = $database->connect();

$total_households = intval($conn->query("SELECT COUNT(*) FROM households")->fetchColumn());
$total_population = intval($conn->query("SELECT COALESCE(SUM(number_of_members),0) FROM households")->fetchColumn());

$population_per_purok = $conn->query(
    "SELECT purok AS label, COUNT(*) AS household_count, COALESCE(SUM(number_of_members),0) AS population
     FROM households GROUP BY purok ORDER BY purok ASC"
)->fetchAll(PDO::FETCH_ASSOC);

$vulnerable_stmt = $conn->query(
    "SELECT COUNT(*) AS household_count, COALESCE(SUM(vulnerable_members),0) AS total_vulnerable_members
     FROM households WHERE vulnerable_members > 0"
)->fetch(PDO::FETCH_ASSOC);

$vulnerability_breakdown = $conn->query(
    "SELECT COALESCE(SUM(children_count),0) AS children, COALESCE(SUM(seniors_count),0) AS seniors,
            COALESCE(SUM(pwd_count),0) AS pwd, COALESCE(SUM(pregnant_count),0) AS pregnant,
            COALESCE(SUM(medical_needs_count),0) AS medical_needs, COALESCE(SUM(other_vulnerable_count),0) AS other
     FROM households"
)->fetch(PDO::FETCH_ASSOC);

// Reuse the existing priority scoring algorithm (single source of truth) rather
// than duplicating it — same technique used by the Phase 6 recommendation engine.
ob_start();
include __DIR__ . '/../dashboard/priority_list.php';
$priority_json = ob_get_clean();
$priority_response = json_decode($priority_json, true);
$priority_data = $priority_response['data'] ?? [];

$high_priority = array_values(array_filter($priority_data, fn($h) => in_array($h['priority_level'], ['High Priority', 'Critical Priority'])));
usort($high_priority, fn($a, $b) => $a['rank'] <=> $b['rank']);

echo json_encode([
    "success" => true,
    "data" => [
        "total_households" => $total_households,
        "total_population" => $total_population,
        "population_per_purok" => $population_per_purok,
        "vulnerable_household_count" => intval($vulnerable_stmt['household_count']),
        "total_vulnerable_members" => intval($vulnerable_stmt['total_vulnerable_members']),
        "vulnerability_breakdown" => $vulnerability_breakdown,
        "high_priority_count" => count($high_priority),
        "high_priority_households" => array_slice($high_priority, 0, 50),
    ]
]);
