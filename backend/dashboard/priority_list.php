<?php
/**
 * DECISION SUPPORT — Household priority list (Phase 22: weighted five-criterion model).
 *
 * The scoring logic lives in lib/dss.php (dss_compute_priorities) so that the
 * Priority Assessment, the relief recommendations, the relief-request review,
 * the map and the reports all use one implementation. Scores are always
 * calculated here on the server from the current database records; nothing
 * is accepted from the browser. The score supports the officials' decision —
 * it never approves or allocates relief by itself.
 *
 *   Criteria (rating 1-5, higher = more urgent) and provisional weights:
 *     Disaster Severity 30%, Verified Damage and Unmet Essential Needs 25%,
 *     Vulnerable Household Members 20%, Household Size 15%,
 *     Assessment Completeness and Verification Confidence 10%.
 *   Contribution = (rating / 5) x weight; score = sum (0-100 scale).
 *   Categories: Critical 80-100, High 60-79, Moderate 40-59, Low below 40.
 *   Households without a usable disaster report: "Not Assessed" (unranked).
 *
 * Response: data[] sorted by rank (eligible first), plus calculated_at and method.
 */

require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/dss.php';

require_login(['admin', 'relief_personnel']);

$database = new Database();
$conn = $database->connect();

$results = dss_compute_priorities_cached($conn);

echo json_encode([
    "success" => true,
    "data" => $results,
    "calculated_at" => $results[0]['calculated_at'] ?? date('Y-m-d H:i:s'),
    "method" => dss_method_summary(),
]);
