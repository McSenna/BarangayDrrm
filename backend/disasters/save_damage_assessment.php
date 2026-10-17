<?php
// Compatibility route: report IDs resolve a household, and the same officer authorization,
// visit validation, concurrency protection and revision history apply. Legacy rows stay intact.
require_once __DIR__.'/../config/cors.php';
require_once __DIR__.'/../config/database.php';
require_once __DIR__.'/../lib/household_assessments.php';
require_login(['field_officer']);
if($_SERVER['REQUEST_METHOD']!=='POST'){http_response_code(405);echo json_encode(['success'=>false,'message'=>'Method not allowed.']);exit;}
ha_endpoint(function(){
 $data=json_decode(file_get_contents('php://input'),true);if(!is_array($data))ha_error('A JSON object is required.');
 $db=(new Database())->connect();$s=$db->prepare('SELECT household_id FROM disaster_reports WHERE report_id=?');$s->execute([ha_integer($data['report_id']??null,'report_id')]);$hid=$s->fetchColumn();if(!$hid)ha_error('Report has no household to assess.',404);
 $data['household_id']=intval($hid);$result=ha_submit($db,$data,intval($_SESSION['user_id']));
 if($result['queued_sms_ids'])sms_process_queued($db,$result['queued_sms_ids'],intval(app_config('SMS_AUTO_TIMEOUT_SECONDS')?:8));unset($result['queued_sms_ids']);return $result;
});
