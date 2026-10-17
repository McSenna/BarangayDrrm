<?php
/**
 * The one household scoring service (spec: docs/superpowers/specs/2026-10-17-relief-allocation-workflow-design.md).
 * Automatic part (max 80): flood zone from the recorded Purok 40/20, recorded household size 5–20, distinct
 * recorded vulnerable people 0–20. Field-officer part (max 20): household damage from the submitted visit.
 * The final score (max 100) and its priority exist only when all four parts are known.
 */
require_once __DIR__ . '/purok_boundaries.php';
require_once __DIR__ . '/flood_zones.php';

const DSS_MODEL_VERSION = 'final-v2 F40 recorded-Purok H20 V20 recorded-counts D20; max100';
const DSS_NOT_ASSESSED = 'For Verification';
const DSS_PENDING_ASSESSMENT = 'Pending Assessment';
const DSS_DAMAGE_POINTS = ['Destroyed'=>20,'Severely Damaged'=>15,'Partially Damaged'=>10,'Minor Damage'=>5,'No Damage'=>0];
const DSS_DAMAGE_LABELS = ['Destroyed'=>'Destroyed / uninhabitable','Severely Damaged'=>'Severely damaged','Partially Damaged'=>'Partially damaged','Minor Damage'=>'Minor damage','No Damage'=>'No damage'];
const DSS_CATEGORIES = [
    ['min'=>81,'max'=>100,'level'=>'Critical Priority'],
    ['min'=>61,'max'=>80,'level'=>'High Priority'],
    ['min'=>41,'max'=>60,'level'=>'Moderate Priority'],
    ['min'=>0,'max'=>40,'level'=>'Low Priority'],
];

function dss_priority_category(float $score): string {
    if (!is_finite($score) || $score < 0 || $score > 100 || floor($score) !== $score) throw new InvalidArgumentException('Priority score must be a whole number from 0 to 100.');
    foreach (DSS_CATEGORIES as $category) if ($score >= $category['min'] && $score <= $category['max']) return $category['level'];
    throw new InvalidArgumentException('Invalid priority score.');
}

/**
 * Points for one household. $damage is the submitted visit's classification (a DSS_DAMAGE_POINTS key) or null
 * when no visit is submitted. Missing data is never 0: it leaves the subtotal or final score null.
 */
function dss_household_score(?string $flood, ?int $members, ?int $vulnerable, ?string $damage): array {
    if ($members !== null && $members < 1) throw new InvalidArgumentException('Household size must include at least the household head.');
    if ($vulnerable !== null && ($vulnerable < 0 || ($members !== null && $vulnerable > $members))) throw new InvalidArgumentException('Vulnerable people must be between zero and household size.');
    if ($damage !== null && !array_key_exists($damage, DSS_DAMAGE_POINTS)) throw new InvalidArgumentException('Unknown damage classification.');
    $floodPoints = ['flood_prone'=>40,'not_designated'=>20][$flood ?? ''] ?? null;
    $sizePoints = $members === null ? null : ($members >= 7 ? 20 : ($members >= 5 ? 15 : ($members >= 3 ? 10 : 5)));
    $vulnerablePoints = $vulnerable === null ? null : ($vulnerable >= 3 ? 20 : ($vulnerable === 2 ? 15 : ($vulnerable === 1 ? 10 : 0)));
    $automatic = ['flood_zone'=>$floodPoints,'household_size'=>$sizePoints,'vulnerable_members'=>$vulnerablePoints];
    $automaticComplete = !in_array(null,$automatic,true);
    $subtotal = $automaticComplete ? array_sum($automatic) : null;
    $damagePoints = $damage === null ? null : DSS_DAMAGE_POINTS[$damage];
    $final = $automaticComplete && $damagePoints !== null ? $subtotal + $damagePoints : null;
    $level = $final !== null ? dss_priority_category($final) : ($automaticComplete ? DSS_PENDING_ASSESSMENT : DSS_NOT_ASSESSED);
    return ['automatic_subtotal'=>$subtotal,'final_score'=>$final,'priority_score'=>$final,'priority_level'=>$level,
        'score_complete'=>$final !== null,'automatic_complete'=>$automaticComplete,'score_breakdown'=>$automatic + ['damage'=>$damagePoints],
        'damage_classification'=>$damage,'maximum_automatic_subtotal'=>80,'maximum_score'=>100,'model_version'=>DSS_MODEL_VERSION];
}

/**
 * Flood zone from the recorded Purok (barangay rule): Puroks 1–4 are inside the
 * designated flood zone and Puroks 5A–7 outside, automatically — no coordinates
 * or administrator confirmation. Only a missing or unrecognised Purok is flagged.
 * The map location is still classified, for location review only.
 */
function dss_flood_profile(array $household, array $boundaries): array {
    $location = purok_classify($household['purok'] ?? '',$household['latitude'] ?? null,$household['longitude'] ?? null,$boundaries['features']);
    $status = household_flood_status_for_purok($household['purok'] ?? null);
    return ['flood_status'=>$status,'flood_verified'=>$status !== 'unverified','location_classification'=>$location,
        'flood_classification_label'=>['flood_prone'=>'Inside designated flood zone (Puroks 1–4)','not_designated'=>'Outside designated flood zone (Puroks 5A–7)','unverified'=>'Unknown Purok — record the household Purok'][$status]];
}

function dss_compute_priorities_cached(PDO $conn, bool $refresh = false): array {
    static $cache = [];
    $key = spl_object_id($conn);
    if ($refresh || !array_key_exists($key,$cache)) $cache[$key] = dss_compute_priorities($conn);
    return $cache[$key];
}

function dss_compute_priorities(PDO $conn): array {
    // Read household counts, assignments and locations from one snapshot.
    // Keep all scoring inputs consistent during concurrent edits.
    $ownsTransaction=!$conn->inTransaction();
    if($ownsTransaction){$conn->exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');$conn->beginTransaction();}
    try {
        $rows=dss_read_priorities($conn);
        if($ownsTransaction)$conn->commit();
        return $rows;
    } catch(Throwable $e){if($ownsTransaction && $conn->inTransaction())$conn->rollBack();throw $e;}
}

function dss_read_priorities(PDO $conn): array {
    $boundaries = purok_boundaries_load();
    $calculated = date('Y-m-d H:i:s');
    $reportStmt = $conn->prepare("SELECT report_id,severity,status,report_date,disaster_type FROM disaster_reports WHERE household_id=? AND status <> 'Rejected' ORDER BY (status='Verified') DESC, FIELD(severity,'Critical','High','Medium','Low'),report_date DESC,report_id DESC LIMIT 1");
    $legacyStmt = $conn->prepare("SELECT status FROM relief_allocations WHERE household_id=?");
    // Current round per household: the latest workflow allocation and its own field visit.
    $current = [];
    try {
        // Visit columns first: for a household with no visit yet, f.* is all NULL and must not overwrite the allocation ids.
        $sql = "SELECT f.*,a.allocation_id,a.household_id,a.status AS allocation_status,a.round_no,u.full_name AS assigned_field_officer_name
                FROM household_allocations a
                JOIN (SELECT household_id, MAX(allocation_id) AS allocation_id FROM household_allocations GROUP BY household_id) latest ON latest.allocation_id=a.allocation_id
                LEFT JOIN household_field_assessments f ON f.allocation_id=a.allocation_id
                LEFT JOIN users u ON u.user_id=f.assigned_field_officer_id";
        foreach ($conn->query($sql)->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $row['allocation_id'] = (int)$row['allocation_id']; $row['household_id'] = (int)$row['household_id'];
            $current[$row['household_id']] = $row;
        }
    } catch (PDOException $e) {
        if (!in_array($e->errorInfo[1] ?? 0,[1146,1054],true)) throw $e; // before migration phase 32: no rounds, no damage points
    }
    $rows=[];
    foreach ($conn->query('SELECT * FROM households')->fetchAll(PDO::FETCH_ASSOC) as $h) {
        $hid=(int)$h['household_id'];
        $flood=dss_flood_profile($h,$boundaries);
        $reasons=[];
        if (!$flood['flood_verified']) $reasons[]='Purok is missing or not recognised; record the household Purok to classify its flood zone.';
        $round=$current[$hid] ?? null;
        $visitStatus=$round['status'] ?? null;
        $submitted=$visitStatus==='assessed' && !empty($round['locked_at']);
        $damage=$submitted ? ($round['damage_classification'] ?? null) : null;
        if ($submitted && $damage===null) $reasons[]='The submitted visit has no damage classification; an administrator must re-open it.';
        $members = filter_var($h['number_of_members'] ?? null, FILTER_VALIDATE_INT);
        $vulnerable = filter_var($h['vulnerable_members'] ?? null, FILTER_VALIDATE_INT);
        if ($members === false || $members < 1) {
            $members = null;
            $reasons[] = 'Record a household size of at least one person.';
        }
        if ($vulnerable === false || $vulnerable < 0 || ($members !== null && $vulnerable > $members)) {
            $vulnerable = null;
            $reasons[] = 'Record a vulnerable-member count between zero and the household size.';
        }
        try { $score=dss_household_score($flood['flood_verified'] ? $flood['flood_status'] : null,$members,$vulnerable,$damage); }
        catch (InvalidArgumentException $e) { $score=dss_household_score($flood['flood_verified'] ? $flood['flood_status'] : null,null,null,$damage); $reasons[]=$e->getMessage(); }
        $reportStmt->execute([$hid]);$report=$reportStmt->fetch(PDO::FETCH_ASSOC) ?: null;
        $legacyStmt->execute([$hid]);$legacyStatuses=$legacyStmt->fetchAll(PDO::FETCH_COLUMN);
        $assessmentStatus=$damage===null ? 'Not Yet Assessed' : ($damage==='No Damage' ? 'No Damage — Assessed' : DSS_DAMAGE_LABELS[$damage].' — Assessed');
        $criteria=[
            ['key'=>'flood_zone','label'=>'Flood zone (recorded Purok)','max_points'=>40,'basis'=>$flood['flood_classification_label']],
            ['key'=>'household_size','label'=>'Household size (recorded)','max_points'=>20,'basis'=>$members===null?'Missing or invalid household size':$members.' recorded people, including the head'],
            ['key'=>'vulnerable_members','label'=>'Vulnerable members (recorded)','max_points'=>20,'basis'=>$vulnerable===null?'Missing or invalid vulnerable-member count':$vulnerable.' recorded vulnerable people'],
            ['key'=>'damage','label'=>'Household damage (field visit)','max_points'=>20,'basis'=>$damage===null?'Not Yet Assessed':DSS_DAMAGE_LABELS[$damage]],
        ];
        foreach ($criteria as &$criterion) $criterion['contribution']=$score['score_breakdown'][$criterion['key']];unset($criterion);
        $rows[]=$score+$flood+[
            'household_id'=>$hid,'head_of_family'=>$h['head_of_family'],'purok'=>$h['purok'],
            'number_of_members'=>$members,'vulnerable_members'=>$vulnerable,
            'reported_number_of_members'=>$h['number_of_members'],'reported_vulnerable_members'=>$h['vulnerable_members'],
            'vulnerability_score'=>$vulnerable,'vulnerability_level'=>$vulnerable===null?DSS_NOT_ASSESSED:($vulnerable>=3?'High':($vulnerable>0?'Medium':'Low')),
            'eligible'=>$round !== null && $round['allocation_status']==='READY_FOR_DISTRIBUTION','rank'=>null,
            'report_id'=>$report?(int)$report['report_id']:null,'report_date'=>$report['report_date'] ?? null,
            'disaster_type'=>$report['disaster_type'] ?? null,'latest_severity'=>$report['severity'] ?? 'No report','latest_report_status'=>$report['status'] ?? 'No report',
            'allocation_id'=>$round['allocation_id'] ?? null,'allocation_status'=>$round['allocation_status'] ?? null,'allocation_round'=>isset($round['round_no'])?(int)$round['round_no']:null,
            'current_relief_status'=>$round['allocation_status'] ?? (in_array('Distributed',$legacyStatuses,true)?'Distributed':'None'),
            'assessment_status'=>$assessmentStatus,'damage_assessment_status'=>$submitted?'Assessed':($visitStatus==='assigned'?'Assigned / Pending Visit':'Pending Assignment'),
            'assigned_field_officer_id'=>$round['assigned_field_officer_id'] ?? null,'assigned_field_officer_name'=>$round['assigned_field_officer_name'] ?? null,
            'field_visit_date'=>$submitted?($round['field_visit_date'] ?? null):null,'has_damage_assessment'=>$damage!==null,
            'damage'=>$damage!==null?['classification'=>$damage,'label'=>DSS_DAMAGE_LABELS[$damage],'findings'=>$round['findings'] ?? null]:null,
            'criteria'=>$criteria,'ratings'=>$score['score_breakdown'],'needs_review'=>(bool)$reasons,'review_reasons'=>array_values(array_unique($reasons)),
            'explanation'=>$score['score_complete'] ? 'Final score from the recorded Purok flood zone, recorded household counts and the field officer\'s damage classification.'
                : ($score['automatic_complete'] ? 'Automatic subtotal only. The final score and priority follow the field officer\'s submitted visit.'
                : 'Incomplete score. Correct the flagged source data; this household is not ranked as low priority.'),
            'calculated_at'=>$calculated,'unmet_needs'=>null,
        ];
    }
    // Final scores first, highest first; ties share a rank. Others stay listed, unranked, for verification.
    usort($rows,function($a,$b){ if ($a['score_complete']!==$b['score_complete']) return $a['score_complete']?-1:1;return ($b['final_score']<=>$a['final_score']) ?: (($b['automatic_subtotal']??-1)<=>($a['automatic_subtotal']??-1)) ?: ($a['household_id']<=>$b['household_id']); });
    $previous=null;$rank=null;
    foreach($rows as $i=>&$row){if(!$row['score_complete'])continue;if($row['final_score']!==$previous)$rank=$i+1;$row['rank']=$rank;$previous=$row['final_score'];}unset($row);
    return $rows;
}

function dss_method_summary(): array {
    return ['model'=>DSS_MODEL_VERSION,'maximum_automatic_subtotal'=>80,'maximum_score'=>100,'damage_points'=>DSS_DAMAGE_POINTS,'damage_labels'=>DSS_DAMAGE_LABELS,
        'provisional'=>false,'categories'=>DSS_CATEGORIES,
        'criteria'=>['flood_zone'=>['inside'=>40,'outside'=>20],'household_size'=>['7+'=>20,'5–6'=>15,'3–4'=>10,'1–2'=>5],'vulnerable_members'=>['3+'=>20,'2'=>15,'1'=>10,'0'=>0],'damage'=>DSS_DAMAGE_POINTS],
        'note'=>'The final score (out of 100) exists only after the assigned field officer submits the visit. Before that the automatic subtotal (out of 80) is shown as Pending Assessment.'];
}

/** Shared scoped view for routes, reports and approval helpers; no HTTP method effects. */
function dss_scoped_priorities(PDO $conn): array {
    require_once __DIR__.'/field_scope.php';
    $rows=field_scope_rows($conn,dss_compute_priorities_cached($conn));
    $position=0;$previous=null;$rank=null;
    foreach($rows as &$row){
        if(!$row['score_complete']){$row['rank']=null;continue;}
        $position++;if($row['final_score']!==$previous)$rank=$position;
        $row['rank']=$rank;$previous=$row['final_score'];
    }unset($row);return $rows;
}



