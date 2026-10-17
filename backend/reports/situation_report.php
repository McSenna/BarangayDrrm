<?php
/**
 * Phase 20 — Automated Disaster Situation Report.
 *
 * GET ?event_id=N                      report for a recorded disaster event
 * GET ?date_from=YYYY-MM-DD&date_to=…  report for a reporting period
 *
 * Every figure is read from the database when the report is generated; nothing
 * is typed in or stored. Where the schema has no data for a figure, the value
 * is null and the section carries the note "Not available in recorded data".
 *
 * SCOPE RULES
 *   Event mode : reports dated start_date..end_date (end_date blank = today);
 *                relief activity (requests, allocations, distributions, SMS)
 *                from start_date up to today, because relief continues after
 *                the disaster itself. Affected areas: the event's recorded areas.
 *   Period mode: everything inside date_from..date_to. Affected areas: areas of
 *                events whose period overlaps the reporting period.
 *   Evacuation and inventory are the CURRENT figures (no history is kept for them).
 *
 * Read-only. Admin only. The DSS is not changed or recalculated here.
 */
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../lib/allocation_views.php';
require_once __DIR__ . '/../lib/affected_areas.php';

require_login(['admin']);

const NA = 'Not available in recorded data';

$conn = (new Database())->connect();
$bad = function ($m, $code = 400) { http_response_code($code); echo json_encode(["success" => false, "message" => $m]); exit(); };
$valid_date = function ($d) { if (!is_string($d)) return false; $x = DateTime::createFromFormat('Y-m-d', $d); return $x && $x->format('Y-m-d') === $d; };
$today = date('Y-m-d');
$phase20 = phase20_tables_ready($conn);

// ------------------------------------------------------------------ scope
$event = null;
$event_id = isset($_GET['event_id']) ? input_positive_int($_GET['event_id']) : 0;
if ($event_id) {
    if (!$phase20) $bad("Disaster events need the Phase 20 database update. Please run database/migration_phase20_automation.sql.", 503);
    $s = $conn->prepare("SELECT e.*, u.full_name AS created_by_name FROM disaster_events e LEFT JOIN users u ON u.user_id = e.created_by WHERE e.event_id = :id");
    $s->execute([':id' => $event_id]);
    $event = $s->fetch(PDO::FETCH_ASSOC);
    if (!$event) $bad("The selected disaster event could not be found.", 404);
    $rep_from = $event['start_date'];
    $rep_to = $event['end_date'] ?: $today;
    $rel_from = $event['start_date'];
    $rel_to = max($today, $rep_to);
    $mode = 'event';
} else {
    $from = $_GET['date_from'] ?? '';
    $to = $_GET['date_to'] ?? '';
    if (!$valid_date($from) || !$valid_date($to)) $bad("Please select a disaster event, or enter a valid reporting period (From and To dates).");
    if ($to < $from) $bad("The end of the reporting period cannot be before its start.");
    $rep_from = $rel_from = $from;
    $rep_to = $rel_to = $to;
    $mode = 'period';
}
$rp = [':f' => $rep_from, ':t' => $rep_to];          // report window (DATE columns)
$lp = [':f' => $rel_from, ':t' => $rel_to];          // relief window
$ts = "BETWEEN :f AND CONCAT(:t, ' 23:59:59')";      // for TIMESTAMP columns

$q = function (string $sql, array $params = []) use ($conn) {
    $st = $conn->prepare($sql);
    $st->execute($params);
    return $st->fetchAll(PDO::FETCH_ASSOC);
};
$pairs = function (array $rows, string $k = 'k', string $v = 'c') {
    $o = [];
    foreach ($rows as $r) $o[$r[$k] ?? 'Unknown'] = intval($r[$v]);
    return $o;
};
$barangay = $q("SELECT setting_value FROM system_settings WHERE setting_key = 'barangay_name'")[0]['setting_value'] ?? 'Barangay Binitayan';

// ------------------------------------------------------------------ B. reports
$rep_where = "dr.report_date BETWEEN :f AND :t";
$reports_total = intval($q("SELECT COUNT(*) c FROM disaster_reports dr WHERE $rep_where", $rp)[0]['c']);
$reports = [
    'total' => $reports_total,
    'by_status' => array_merge(['Pending' => 0, 'Verified' => 0, 'Rejected' => 0],
        $pairs($q("SELECT dr.status k, COUNT(*) c FROM disaster_reports dr WHERE $rep_where GROUP BY dr.status", $rp))),
    'by_severity' => array_merge(['Critical' => 0, 'High' => 0, 'Medium' => 0, 'Low' => 0],
        $pairs($q("SELECT dr.severity k, COUNT(*) c FROM disaster_reports dr WHERE $rep_where AND dr.status <> 'Rejected' GROUP BY dr.severity", $rp))),
    'by_type' => $pairs($q("SELECT dr.disaster_type k, COUNT(*) c FROM disaster_reports dr WHERE $rep_where GROUP BY dr.disaster_type ORDER BY c DESC", $rp)),
    'note' => $reports_total ? 'Severity counts exclude Rejected reports.' : NA,
];
$highest = null;
foreach (['Critical', 'High', 'Medium', 'Low'] as $sv) if ($reports['by_severity'][$sv] > 0) { $highest = $sv; break; }

// ------------------------------------------------------------------ C. households
$hh_rows = $q(
    "SELECT h.household_id, h.purok, h.number_of_members, h.vulnerable_members, h.children_count, h.seniors_count, h.pwd_count,
            h.pregnant_count, h.medical_needs_count, h.other_vulnerable_count, h.latitude, h.longitude
     FROM households h
     WHERE h.household_id IN (SELECT dr.household_id FROM disaster_reports dr WHERE $rep_where AND dr.status <> 'Rejected' AND dr.household_id IS NOT NULL)", $rp);
$reported_ids = array_map(fn($r) => intval($r['household_id']), $hh_rows);

$area_rows = [];
if ($phase20) {
    $area_rows = $event
        ? fetch_affected_areas($conn, intval($event['event_id']), null, 'all', AREA_TYPE_AFFECTED)
        : $q("SELECT a.*, e.event_name FROM disaster_affected_areas a JOIN disaster_events e ON e.event_id = a.event_id
              WHERE e.start_date <= :t AND COALESCE(e.end_date, CURDATE()) >= :f"
              . (areas_have_type_column($conn) ? " AND a.area_type = 'Recorded Affected Area'" : ""), $rp);
    // Phase 23: only Recorded Affected Areas count here; flood-prone zones are reference geography.
}
$area_res = $area_rows ? affected_households_for_areas($conn, $area_rows) : ['inside' => [], 'missing' => [], 'by_area' => []];
$area_ids = array_map(fn($h) => $h['household_id'], $area_res['inside']);
$union_ids = array_values(array_unique(array_merge($reported_ids, $area_ids)));

$union_rows = $union_ids
    ? $q("SELECT household_id, purok, number_of_members, vulnerable_members, children_count, seniors_count, pwd_count, pregnant_count,
                 medical_needs_count, other_vulnerable_count, latitude, longitude
          FROM households WHERE household_id IN (" . implode(',', array_map('intval', $union_ids)) . ")")
    : [];
$by_purok = [];
$sum = ['persons' => 0, 'vulnerable_persons' => 0, 'children' => 0, 'seniors' => 0, 'pwd' => 0, 'pregnant' => 0, 'medical' => 0, 'other' => 0];
$vuln_households = 0;
$no_coords = 0;
foreach ($union_rows as $h) {
    $by_purok[$h['purok']] = ($by_purok[$h['purok']] ?? 0) + 1;
    $sum['persons'] += intval($h['number_of_members']);
    $sum['vulnerable_persons'] += intval($h['vulnerable_members']);
    foreach (['children' => 'children_count', 'seniors' => 'seniors_count', 'pwd' => 'pwd_count', 'pregnant' => 'pregnant_count',
              'medical' => 'medical_needs_count', 'other' => 'other_vulnerable_count'] as $k => $col) $sum[$k] += intval($h[$col]);
    if (intval($h['vulnerable_members']) > 0) $vuln_households++;
    if ($h['latitude'] === null || $h['longitude'] === null) $no_coords++;
}
ksort($by_purok, SORT_NATURAL);
$households = [
    'total_affected' => count($union_ids),
    'reported_affected' => count($reported_ids),
    'inside_recorded_areas' => count($area_ids),
    'inside_areas_without_report' => count(array_diff($area_ids, $reported_ids)),
    'affected_puroks' => array_keys($by_purok),
    'by_purok' => $by_purok,
    'vulnerable_households' => $vuln_households,
    'persons' => $sum['persons'],
    'vulnerable_persons' => $sum['vulnerable_persons'],
    'vulnerable_breakdown' => array_diff_key($sum, ['persons' => 1, 'vulnerable_persons' => 1]),
    'affected_without_coordinates' => $no_coords,
    'note' => count($union_ids) ? 'Affected = households with a non-rejected disaster report in the period, plus households whose recorded coordinates are inside a recorded affected area.' : NA,
];
$areas = [
    'recorded' => count($area_rows),
    'list' => array_map(fn($a) => [
        'area_id' => intval($a['area_id']), 'area_name' => $a['area_name'], 'hazard_type' => $a['hazard_type'],
        'status' => $a['status'], 'event_name' => $a['event_name'] ?? null,
        'households_inside' => $area_res['by_area'][intval($a['area_id'])] ?? 0,
    ], $area_rows),
    'households_inside' => count($area_ids),
    'households_without_coordinates' => count($area_res['missing']),
    'note' => !$phase20 ? 'Affected areas need the Phase 20 database update.'
        : (count($area_rows) ? 'Households identified by point-in-polygon using their recorded coordinates.' : NA . ' (no affected area has been recorded for this ' . ($event ? 'event' : 'period') . ').'),
];

// ------------------------------------------------------------------ D. damage
$dmg_rows = $q("SELECT DISTINCT da.* FROM household_field_assessments da JOIN disaster_reports dr ON dr.household_id=da.household_id
                WHERE $rep_where AND dr.status <> 'Rejected' AND da.status='assessed'", $rp);
$cats = ['house' => 'house_damage', 'infrastructure' => 'infrastructure_damage', 'property' => 'property_damage', 'agricultural' => 'agricultural_damage'];
$dist = [];
foreach ($cats as $k => $col) $dist[$k] = ['None' => 0, 'Minor' => 0, 'Major' => 0, 'Totally Damaged' => 0];
$est = ['Critical' => 0, 'High' => 0, 'Medium' => 0, 'Low' => 0];
$any_major = $any_total = 0;
foreach ($dmg_rows as $d) {
    $major = $total = false;
    foreach ($cats as $k => $col) {
        $dist[$k][$d[$col]] = ($dist[$k][$d[$col]] ?? 0) + 1;
        if ($d[$col] === 'Major') $major = true;
        if ($d[$col] === 'Totally Damaged') $total = true;
    }
    $est[$d['estimated_severity']] = ($est[$d['estimated_severity']] ?? 0) + 1;
    if ($major) $any_major++;
    if ($total) $any_total++;
}
$affected_visit_households = (int)($q("SELECT COUNT(DISTINCT dr.household_id) AS c FROM disaster_reports dr WHERE $rep_where AND dr.status <> 'Rejected'",$rp)[0]['c'] ?? 0);
$damage = [
    'assessed_reports' => count($dmg_rows),
    'reports_not_assessed' => max(0, $affected_visit_households - count($dmg_rows)),
    'by_category' => $dist,
    'estimated_severity' => $est,
    'with_major_damage' => $any_major,
    'with_totally_damaged' => $any_total,
    'note' => count($dmg_rows) ? 'Counts distinct households with an actual assigned field visit associated with non-rejected reports. Historical report assessments remain stored separately. Estimated severity is recorded but is not part of the DSS score.' : NA,
];

// ------------------------------------------------------------------ E. evacuation (current)
$centers = $q("SELECT name, purok, status, capacity, current_occupancy FROM evacuation_centers ORDER BY name");
$evac = [
    'centers' => count($centers),
    'by_status' => array_merge(['Open' => 0, 'Full' => 0, 'Closed' => 0], $pairs($q("SELECT status k, COUNT(*) c FROM evacuation_centers GROUP BY status"))),
    'total_capacity' => array_sum(array_map(fn($c) => intval($c['capacity']), $centers)),
    'current_occupancy_persons' => array_sum(array_map(fn($c) => intval($c['current_occupancy']), $centers)),
    'available_capacity_open_centers' => array_sum(array_map(fn($c) => $c['status'] === 'Open' ? max(0, intval($c['capacity']) - intval($c['current_occupancy'])) : 0, $centers)),
    'evacuated_households' => null,
    'evacuated_households_note' => NA . ' (the system records occupancy as a number of persons, not which households are in a center).',
    'list' => array_map(fn($c) => ['name' => $c['name'], 'purok' => $c['purok'], 'status' => $c['status'], 'capacity' => intval($c['capacity']), 'occupancy' => intval($c['current_occupancy'])], $centers),
    'note' => count($centers) ? 'Current figures at the time the report was generated.' : NA,
];

// ------------------------------------------------------------------ F. requests
$req_where = "rq.created_at $ts";
$req_total = intval($q("SELECT COUNT(*) c FROM relief_requests rq WHERE $req_where", $lp)[0]['c']);
$requests = [
    'total' => $req_total,
    'by_status' => array_merge(['Pending' => 0, 'Under Review' => 0, 'Approved' => 0, 'Partially Approved' => 0, 'Rejected' => 0, 'Allocated' => 0, 'Distributed' => 0],
        $pairs($q("SELECT rq.status k, COUNT(*) c FROM relief_requests rq WHERE $req_where GROUP BY rq.status", $lp))),
    'by_urgency' => array_merge(['Critical' => 0, 'High' => 0, 'Medium' => 0, 'Low' => 0],
        $pairs($q("SELECT rq.urgency k, COUNT(*) c FROM relief_requests rq WHERE $req_where GROUP BY rq.urgency", $lp))),
    'note' => $req_total ? 'Requests submitted in the relief period.' : NA,
];

// ------------------------------------------------------------------ G. inventory (current) + shortage
$items = $q("SELECT i.item_id, i.item_name, i.category, i.unit, i.quantity, i.minimum_level,
                    0 AS committed,
                    COALESCE((SELECT SUM(CASE WHEN rq.status IN ('Pending','Under Review') THEN ri.requested_quantity
                                              WHEN rq.status IN ('Approved','Partially Approved') THEN COALESCE(ri.approved_quantity, 0) ELSE 0 END)
                              FROM relief_request_items ri JOIN relief_requests rq ON rq.request_id = ri.request_id
                              WHERE ri.item_id = i.item_id), 0) AS open_demand
             FROM relief_items i ORDER BY i.category, i.item_name");
$inv_list = [];
foreach ($items as $it) {
    $stock = max(0, intval($it['quantity']));
    $committed = intval($it['committed']);
    $available = max(0, $stock - $committed);
    $demand = intval($it['open_demand']);
    $inv_list[] = [
        'item_name' => $it['item_name'], 'category' => $it['category'], 'unit' => $it['unit'],
        'stock' => $stock, 'reserved' => $committed, 'available' => $available, 'minimum_level' => intval($it['minimum_level']),
        'low_stock' => $stock <= intval($it['minimum_level']),
        'open_request_demand' => $demand, 'shortage' => max(0, $demand - $available),
    ];
}
$inventory = [
    'items' => count($inv_list),
    'low_stock_items' => array_values(array_map(fn($i) => $i['item_name'], array_filter($inv_list, fn($i) => $i['low_stock']))),
    'shortage_items' => array_values(array_map(fn($i) => ['item_name' => $i['item_name'], 'shortage' => $i['shortage'], 'unit' => $i['unit']], array_filter($inv_list, fn($i) => $i['shortage'] > 0))),
    'list' => $inv_list,
    'note' => count($inv_list)
        ? 'Current figures. Nothing is reserved before distribution (stock leaves only when Relief Personnel complete a distribution), so Available = stock. Shortage = quantities still waiting in open requests (Pending / Under Review: requested; Approved / Partially Approved, not yet allocated: approved) − available.'
        : NA,
];

// ------------------------------------------------------------------ H. allocations
// Relief allocation workflow rounds started in the relief period; quantities are planned (open rounds) or released (Completed).
$al_where = "DATE(a.created_at) BETWEEN :f AND :t";
$al_rows = $q("SELECT a.status, COUNT(*) c,
                      COALESCE(SUM((SELECT SUM(CASE WHEN a.status = 'COMPLETED' THEN COALESCE(ai.released_qty, 0) ELSE ai.planned_qty END)
                                    FROM household_allocation_items ai WHERE ai.allocation_id = a.allocation_id)), 0) qty
               FROM household_allocations a WHERE $al_where GROUP BY a.status", $lp);
$al = [];
foreach (AW_STATUS_LABELS as $label) $al[$label] = ['count' => 0, 'quantity' => 0];
foreach ($al_rows as $r) $al[AW_STATUS_LABELS[$r['status']]] = ['count' => intval($r['c']), 'quantity' => intval($r['qty'])];
$legacy_done = $q("SELECT COUNT(*) c, COALESCE(SUM(COALESCE(a.received_quantity, a.quantity)), 0) qty FROM relief_allocations a WHERE a.status = 'Distributed' AND a.allocation_date BETWEEN :f AND :t", $lp)[0];
$al['Distributed (historical)'] = ['count' => intval($legacy_done['c']), 'quantity' => intval($legacy_done['qty'])];
$al_items = $q("SELECT ai.item_name, ai.unit, a.status, SUM(CASE WHEN a.status = 'COMPLETED' THEN COALESCE(ai.released_qty, 0) ELSE ai.planned_qty END) qty
                FROM household_allocations a JOIN household_allocation_items ai ON ai.allocation_id = a.allocation_id
                WHERE $al_where GROUP BY ai.item_name, ai.unit, a.status ORDER BY ai.item_name", $lp);
$al_total = array_sum(array_column($al, 'count'));
$allocations = [
    'by_status' => $al,
    'total' => $al_total,
    'households_with_allocations' => intval($q("SELECT COUNT(DISTINCT a.household_id) c FROM household_allocations a WHERE $al_where", $lp)[0]['c']),
    'by_item' => array_map(fn($r) => ['item_name' => $r['item_name'], 'unit' => $r['unit'], 'status' => AW_STATUS_LABELS[$r['status']], 'quantity' => intval($r['qty'])], $al_items),
    'partial_receipts' => intval($q("SELECT COUNT(DISTINCT a.allocation_id) c FROM household_allocations a JOIN household_allocation_items ai ON ai.allocation_id = a.allocation_id
                                     WHERE a.status = 'COMPLETED' AND ai.released_qty < ai.planned_qty AND $al_where", $lp)[0]['c']),
    'note' => $al_total ? 'Allocation rounds started in the relief period. Ready = complete field visit, final score and planned items; Completed = released quantities (stock deducted). Distributed (historical) = the old per-item allocations.' : NA,
];

// ------------------------------------------------------------------ I. distribution
// Event mode includes upcoming schedules (dated after today) for the event.
$sp = [':f' => $rel_from, ':t' => $event ? '9999-12-31' : $rel_to];
$sched = $q("SELECT ds.schedule_id FROM distribution_schedules ds WHERE ds.distribution_date BETWEEN :f AND :t", $sp);
$ben = $pairs($q("SELECT b.status k, COUNT(*) c FROM distribution_beneficiaries b JOIN distribution_schedules ds ON ds.schedule_id = b.schedule_id
                  WHERE ds.distribution_date BETWEEN :f AND :t GROUP BY b.status", $sp));
$upcoming = intval($q("SELECT COUNT(*) c FROM distribution_schedules ds WHERE ds.distribution_date > CURDATE() AND ds.distribution_date BETWEEN :f AND :t", $sp)[0]['c']);
$released = av_released_sql();
$direct_done = intval($q("SELECT COUNT(*) c FROM household_allocations a WHERE a.status = 'COMPLETED' AND a.completed_at $ts", $lp)[0]['c']);
$hh_served = intval($q("SELECT COUNT(DISTINCT r.household_id) c FROM $released r WHERE r.distributed_at $ts", $lp)[0]['c']);
$distribution = [
    'schedules' => count($sched),
    'upcoming_schedules' => $upcoming,
    'beneficiaries_by_status' => array_merge(['Pending' => 0, 'Prepared' => 0, 'Dispatched' => 0, 'Delivered' => 0, 'Cancelled' => 0], $ben),
    'direct_allocations_distributed' => $direct_done,
    'households_served' => $hh_served,
    'approved_awaiting_distribution' => intval($q("SELECT COUNT(*) c FROM household_allocations a WHERE a.status = 'READY_FOR_DISTRIBUTION'")[0]['c']),
    'ready_for_distribution' => intval($q("SELECT COUNT(*) c FROM household_allocations a WHERE a.status = 'READY_FOR_DISTRIBUTION'")[0]['c']),
    'note' => (count($sched) || $direct_done || $hh_served) ? 'Scheduled deliveries (by schedule date; in event mode upcoming schedules are included) and allocations marked Distributed in the relief period. "Awaiting distribution" is the current number of Approved allocations.' : NA,
];

// ------------------------------------------------------------------ J. SMS
$sms_by = $pairs($q("SELECT status k, COUNT(*) c FROM sms_logs WHERE sent_at $ts GROUP BY status", $lp));
$sms_total = array_sum($sms_by);
$sms = [
    'total' => $sms_total,
    'sent' => ($sms_by['Sent'] ?? 0) + ($sms_by['Accepted by Gateway'] ?? 0) + ($sms_by['Delivered'] ?? 0), // accepted by the gateway
    'accepted_by_gateway' => ($sms_by['Sent'] ?? 0) + ($sms_by['Accepted by Gateway'] ?? 0),
    'delivered_confirmed' => $sms_by['Delivered'] ?? 0,
    'queued' => $sms_by['Queued'] ?? 0,
    'failed' => $sms_by['Failed'] ?? 0,
    'not_sent_disabled' => $sms_by['Not Configured'] ?? 0,
    'automatic' => intval($q("SELECT COUNT(*) c FROM sms_logs WHERE sent_at $ts AND event_key IS NOT NULL", $lp)[0]['c']),
    'manual' => intval($q("SELECT COUNT(*) c FROM sms_logs WHERE sent_at $ts AND event_key IS NULL", $lp)[0]['c']),
    'by_category' => $pairs($q("SELECT category k, COUNT(*) c FROM sms_logs WHERE sent_at $ts GROUP BY category ORDER BY c DESC", $lp)),
    'pending' => null,
    'pending_note' => NA . ' (SMS are sent immediately; the log has no queue / pending status).',
    'note' => $sms_total ? '"Sent" means TextBee accepted the message; it is not a delivery confirmation. "Not Configured" means SMS was disabled, so nothing was sent.' : NA,
];

// ------------------------------------------------------------------ executive summary (fixed sentence rules)
$summary = [];
$period_txt = $rep_from === $rep_to ? $rep_from : "$rep_from to $rep_to";
$summary[] = $event
    ? "{$event['event_name']} ({$event['disaster_type']}) affected $barangay. $reports_total disaster report(s) were recorded from $period_txt."
    : "$reports_total disaster report(s) were recorded in $barangay from $period_txt.";
if ($reports_total) $summary[] = "{$reports['by_status']['Verified']} verified, {$reports['by_status']['Pending']} pending and {$reports['by_status']['Rejected']} rejected" . ($highest ? "; the highest recorded severity is $highest." : ".");
if ($households['total_affected']) {
    $summary[] = "{$households['total_affected']} household(s) with {$households['persons']} member(s) are identified as affected"
        . ($households['affected_puroks'] ? " in " . implode(', ', $households['affected_puroks']) : "")
        . "; {$households['vulnerable_households']} of them have vulnerable members ({$households['vulnerable_persons']} person(s)).";
}
if ($areas['recorded']) $summary[] = "{$areas['households_inside']} household(s) are located inside {$areas['recorded']} recorded affected area(s).";
if ($damage['assessed_reports']) $summary[] = "{$damage['assessed_reports']} household(s) have a completed field visit; {$damage['with_totally_damaged']} include totally damaged and {$damage['with_major_damage']} include major damage.";
if ($evac['centers']) $summary[] = "{$evac['current_occupancy_persons']} person(s) are currently recorded in {$evac['centers']} evacuation center(s), with {$evac['available_capacity_open_centers']} space(s) still available in open centers.";
if ($req_total) $summary[] = "$req_total relief request(s) were submitted; {$requests['by_status']['Distributed']} are fully distributed and " . ($requests['by_status']['Pending'] + $requests['by_status']['Under Review']) . " are waiting for review.";
if ($al_total) $summary[] = "{$al['Distributed']['count']} allocation(s) have been distributed and {$al['Approved']['count']} are approved and waiting for distribution.";
if ($inventory['shortage_items']) $summary[] = "Shortage against open requests: " . implode(', ', array_map(fn($s) => "{$s['item_name']} ({$s['shortage']} {$s['unit']})", $inventory['shortage_items'])) . ".";
elseif ($inventory['items']) $summary[] = "No item is currently short for the open requests.";
if ($inventory['low_stock_items']) $summary[] = count($inventory['low_stock_items']) . " item(s) are at or below their minimum stock level.";
if ($sms_total) $summary[] = "$sms_total SMS notification(s) were recorded: {$sms['sent']} sent, {$sms['failed']} failed and {$sms['not_sent_disabled']} not sent because SMS was disabled.";

echo json_encode([
    "success" => true,
    "generated_at" => date('Y-m-d H:i:s'),
    "generated_by" => $_SESSION['user_id'],
    "mode" => $mode,
    "scope" => [
        "report_period" => ['from' => $rep_from, 'to' => $rep_to],
        "relief_period" => ['from' => $rel_from, 'to' => $rel_to],
    ],
    "disaster" => [
        "event_id" => $event ? intval($event['event_id']) : null,
        "event_name" => $event['event_name'] ?? null,
        "disaster_type" => $event['disaster_type'] ?? null,
        "start_date" => $event['start_date'] ?? $rep_from,
        "end_date" => $event ? ($event['end_date'] ?: null) : $rep_to,
        "status" => $event['status'] ?? null,
        "description" => $event['description'] ?? null,
        "affected_barangay" => $barangay,
        "highest_severity" => $highest,
        "disaster_types_reported" => array_keys($reports['by_type']),
        "note" => $event ? null : 'Reporting period selected; no disaster event record. ' . NA . ' for the event name and description.',
    ],
    "executive_summary" => $summary,
    "reports" => $reports,
    "households" => $households,
    "affected_areas" => $areas,
    "damage" => $damage,
    "evacuation" => $evac,
    "requests" => $requests,
    "inventory" => $inventory,
    "allocations" => $allocations,
    "distribution" => $distribution,
    "sms" => $sms,
    "data_sources" => [
        "Generated automatically from the system database at the time shown; no figure is typed in or stored.",
        "Reports: disaster_reports dated " . ($rep_from === $rep_to ? $rep_from : "$rep_from to $rep_to") . ". Relief activity: $rel_from to $rel_to.",
        "Tables: disaster_reports, damage_assessments, households, disaster_affected_areas, evacuation_centers, relief_requests, relief_request_items, relief_items, relief_allocations, distribution_schedules, distribution_beneficiaries, sms_logs.",
        "Evacuation and inventory figures are current values (no history is stored for them).",
        "The summary sentences are fixed rules filled with these figures (not AI). The DSS priority score is not changed by this report.",
    ],
]);
