<?php
require_once __DIR__.'/../backend/lib/household_assessments.php';
try { ha_validate_submission(['field_visit_date'=>'2026-10-16','findings'=>'Visit findings'],'2026-10-17');throw new Exception('Missing damage classification must be rejected'); } catch(HouseholdAssessmentError $e) { if($e->getCode()!==400)throw $e; }
echo "PASS missing damage classification rejected\n";
