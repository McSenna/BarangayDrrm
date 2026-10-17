<?php
require_once __DIR__.'/../config/cors.php';
require_once __DIR__.'/../config/database.php';
require_once __DIR__.'/../lib/household_assessments.php';
require_login(['admin','relief_personnel','field_officer']);
try{
 if($_SERVER['REQUEST_METHOD']!=='GET')ha_error('Method not allowed.',405);
 $db=(new Database())->connect();ha_require_schema($db);
 $s=$db->prepare('SELECT p.*,a.household_id FROM household_assessment_photos p JOIN household_field_assessments a ON a.assessment_id=p.assessment_id WHERE p.photo_id=?');$s->execute([ha_integer($_GET['id']??null,'photo_id')]);$photo=$s->fetch(PDO::FETCH_ASSOC);
 if(!$photo)ha_error('Photo not found.',404);if(!ha_list($db,intval($_SESSION['user_id']),intval($photo['household_id'])))ha_error('Photo not available.',403);
 header('Cache-Control: private, no-store');header('X-Content-Type-Options: nosniff');header('Content-Security-Policy: sandbox');header('Content-Type: '.$photo['mime_type']);header('Content-Disposition: inline; filename="evidence-'.$photo['photo_id'].'"');echo $photo['photo_data'];
}catch(HouseholdAssessmentError $e){http_response_code($e->getCode());echo json_encode(['success'=>false,'message'=>$e->getMessage()]);}

