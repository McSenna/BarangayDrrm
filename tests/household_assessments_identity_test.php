<?php
require_once __DIR__.'/../backend/lib/household_assessments.php';
foreach([[],[1],true,1.2,1.0,'1.2','1abc','-1',0,null] as $value){try{ha_integer($value,'household_id');throw new Exception('Invalid ID accepted: '.json_encode($value));}catch(HouseholdAssessmentError $e){if($e->getCode()!==400)throw $e;}}
foreach([1,'1',123,'123'] as $value){if(ha_integer($value,'household_id')!==intval($value))throw new Exception('Valid ID rejected');}
if(ha_integer(0,'version',0)!==0)throw new Exception('Version 0 rejected');
foreach([true,1.0,[],1.2] as $value){try{ha_version(['version'=>$value],['version'=>1]);throw new Exception('Invalid version accepted');}catch(HouseholdAssessmentError $e){if($e->getCode()!==400)throw $e;}}
echo "PASS strict assessment identities and versions\n";
