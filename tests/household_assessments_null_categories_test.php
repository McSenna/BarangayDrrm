<?php
require_once __DIR__.'/../backend/lib/household_assessments.php';
foreach(['damage_classification','infrastructure_damage','property_damage','agricultural_damage','estimated_severity'] as $field){
 $data=['field_visit_date'=>'2026-10-16','damage_classification'=>'Minor Damage','findings'=>'Roof damage observed'];$data[$field]=null;
 try{ha_validate_submission($data,'2026-10-17');throw new Exception('Explicit null accepted for '.$field);}catch(HouseholdAssessmentError $e){if($e->getCode()!==400)throw $e;}
}
echo "PASS explicit null damage categories rejected\n";
