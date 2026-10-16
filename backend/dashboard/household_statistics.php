<?php
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';

require_login(['admin', 'relief_personnel']);

$database = new Database();
$conn = $database->connect();

$total_households = intval($conn->query("SELECT COUNT(*) FROM households")->fetchColumn());
$total_population = intval($conn->query("SELECT COALESCE(SUM(number_of_members),0) FROM households")->fetchColumn());
$vulnerable_population = intval($conn->query("SELECT COALESCE(SUM(vulnerable_members),0) FROM households")->fetchColumn());

$average_household_size = $total_households > 0
    ? round($total_population / $total_households, 1)
    : 0;

$per_purok = $conn->query(
    "SELECT purok,
            COUNT(*) AS household_count,
            COALESCE(SUM(number_of_members),0) AS population,
            COALESCE(SUM(vulnerable_members),0) AS vulnerable_population
     FROM households
     GROUP BY purok
     ORDER BY purok ASC"
)->fetchAll(PDO::FETCH_ASSOC);

$vulnerability_breakdown = $conn->query(
    "SELECT
        COALESCE(SUM(children_count),0) AS children,
        COALESCE(SUM(seniors_count),0) AS seniors,
        COALESCE(SUM(pwd_count),0) AS pwd,
        COALESCE(SUM(pregnant_count),0) AS pregnant,
        COALESCE(SUM(medical_needs_count),0) AS medical_needs,
        COALESCE(SUM(other_vulnerable_count),0) AS other
     FROM households"
)->fetch(PDO::FETCH_ASSOC);

echo json_encode([
    "success" => true,
    "data" => [
        "total_households" => $total_households,
        "total_population" => $total_population,
        "vulnerable_population" => $vulnerable_population,
        "average_household_size" => $average_household_size,
        "population_per_purok" => $per_purok,
        "vulnerability_breakdown" => $vulnerability_breakdown,
    ]
]);
