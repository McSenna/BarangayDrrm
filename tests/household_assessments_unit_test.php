<?php
require_once __DIR__.'/../backend/lib/household_assessments.php';
function check($v,$m){if(!$v)throw new Exception($m);}
function rejects($fn,$code){try{$fn();}catch(HouseholdAssessmentError $e){check($e->getCode()===$code,'wrong error '.$e->getMessage());return;}throw new Exception('Expected rejection');}
$valid=['field_visit_date'=>'2026-10-16','damage_classification'=>'Minor Damage','infrastructure_damage'=>'None','property_damage'=>'Major','agricultural_damage'=>'Totally Damaged','estimated_severity'=>'High','findings'=>'Visited home; roof damaged.','remarks'=>'Needs repair'];
check(ha_validate_submission($valid,'2026-10-17')['damage_classification']==='Minor Damage','valid submission');
foreach(DSS_DAMAGE_POINTS as $level=>$points) check(ha_validate_submission(array_merge($valid,['damage_classification'=>$level]),'2026-10-17')['damage_classification']===$level,"accepts $level");
foreach(['Minor','Major','Totally Damaged','None'] as $old) rejects(fn()=>ha_validate_submission(array_merge($valid,['damage_classification'=>$old]),'2026-10-17'),400);
check(!array_key_exists('damage_points',ha_validate_submission(array_merge($valid,['damage_points'=>20]),'2026-10-17')),'client points ignored');
foreach(['damage_classification'=>'minor damage','field_visit_date'=>'2026-10-18','findings'=>' ','field_visit_date'=>'2026-02-30'] as $k=>$v) rejects(fn()=>ha_validate_submission(array_merge($valid,[$k=>$v]),'2026-10-17'),400);
rejects(fn()=>ha_validate_submission(array_merge($valid,['damage_classification'=>[]]),'2026-10-17'),400);
echo "PASS assessment validation\n";

