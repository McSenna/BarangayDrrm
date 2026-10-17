<?php
require_once __DIR__ . '/../backend/lib/household_profile.php';
function check_profile($condition, $message) { if (!$condition) throw new RuntimeException($message); }
$head = ['member_id'=>1,'full_name'=>'Test Head','relationship'=>'Head','age'=>65,'is_child'=>0,'is_senior'=>1,'is_pwd'=>1,'is_pregnant'=>0,'has_medical_needs'=>1,'is_other_vulnerable'=>0,'vulnerability_verified_at'=>'2026-10-17','vulnerability_verified_by'=>1];
$adult = array_merge($head, ['member_id'=>2,'full_name'=>'Other Adult','relationship'=>'Spouse','age'=>30,'is_senior'=>0,'is_pwd'=>0,'has_medical_needs'=>0]);
$household = ['head_of_family'=>'Test Head','roster_verified_at'=>'2026-10-17','roster_verified_by'=>1];
$p = household_profile_from_members($household, [$head,$adult]);
check_profile($p['complete'] && $p['size']===2 && $p['vulnerable']===1, 'People with several vulnerability categories count once, with head included once');
$p = household_profile_from_members($household, [array_merge($head,['age'=>30,'is_senior'=>0,'is_pwd'=>0,'has_medical_needs'=>0])]);
check_profile($p['complete'] && $p['vulnerable']===0, 'Verified zero remains zero');
$p = household_profile_from_members($household, [array_merge($head,['is_pwd'=>null])]);
check_profile(!$p['complete'] && $p['size']===1 && $p['vulnerable']===null, 'Missing vulnerability must remain unknown while attested size remains available');
$p = household_profile_from_members($household, [array_merge($head,['age'=>null])]);
check_profile($p['complete'] && $p['vulnerable']===1, 'Unknown age supports explicit verified child and senior classifications');
$p = household_profile_from_members(array_merge($household,['roster_verified_at'=>null]),[$head]);
check_profile(!$p['complete'] && $p['size']===null, 'Unverified roster cannot provide size');
foreach ([[],[$adult],[$head,array_merge($head,['member_id'=>3])],[$head,array_merge($adult,['full_name'=>' test   head ','age'=>65])]] as $rows) {
    check_profile(!household_profile_from_members($household,$rows)['complete'], 'Empty, missing-head and duplicate rosters are invalid');
}
foreach ([-1,'bad',1.5,true,[],151] as $age) {
    try { household_member_payload(['full_name'=>'Person','relationship'=>'Head','age'=>$age]); throw new RuntimeException('Invalid age accepted'); }
    catch (InvalidArgumentException $e) {}
}
echo "Verified household profile tests passed\n";
