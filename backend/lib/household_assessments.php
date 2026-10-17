<?php
/**
 * Field-officer household visits, one per allocation round (spec §6–§7).
 * Administrator assigns → assigned officer saves drafts → submits once (locked) → the same transaction asks
 * the workflow to promote the allocation to READY. Re-opening is an Administrator action (allocation_workflow.php).
 * Points, totals, priorities and the officer's identity are never read from the request.
 */
require_once __DIR__.'/puroks.php';
require_once __DIR__.'/allocation_workflow.php';
class HouseholdAssessmentError extends RuntimeException {}
const HA_NOTE_DAMAGE_FIELDS = ['infrastructure_damage','property_damage','agricultural_damage'];
const HA_NOTE_DAMAGE_LEVELS = ['None','Minor','Major','Totally Damaged'];
const HA_SEVERITY_LEVELS = ['Low','Medium','High','Critical'];

function ha_error(string $message,int $code=400): void {throw new HouseholdAssessmentError($message,$code);}
function ha_require_schema(PDO $db): void {
 foreach(['household_field_assessments','household_assessment_revisions','household_assessment_photos','household_allocations'] as $table){
  try{$db->query("SELECT 1 FROM $table LIMIT 0");}catch(PDOException $e){if(($e->errorInfo[1]??0)===1146)ha_error('Household assessments are unavailable. Apply database/migration_phase32_relief_allocation_workflow.sql.',503);throw $e;}
 }
}

/** Submission ($draft=false) needs every required field; a draft accepts any subset but validates what it has. */
function ha_validate_submission(array $data,?string $today=null,bool $draft=false): array {
 $out=[];$today=$today??(new DateTimeImmutable('now',new DateTimeZone('Asia/Manila')))->format('Y-m-d');
 if(array_key_exists('field_visit_date',$data)||!$draft){
  $date=$data['field_visit_date']??null;$parsed=is_string($date)?DateTimeImmutable::createFromFormat('!Y-m-d',$date):false;
  if(!$parsed||$parsed->format('Y-m-d')!==$date||$date>$today)ha_error('Enter an actual visit date that is not in the future.');
  $out['field_visit_date']=$date;
 }
 if(array_key_exists('damage_classification',$data)||!$draft){
  $damage=$data['damage_classification']??null;
  if($damage===null||$damage==='')ha_error('Choose the household damage classification.');
  if(!is_string($damage)||!array_key_exists($damage,DSS_DAMAGE_POINTS))ha_error('Choose a valid household damage classification.');
  $out['damage_classification']=$damage;
 }
 foreach(array_merge(HA_NOTE_DAMAGE_FIELDS,['estimated_severity']) as $key){
  if(!array_key_exists($key,$data)&&$draft)continue;
  $allowed=$key==='estimated_severity'?HA_SEVERITY_LEVELS:HA_NOTE_DAMAGE_LEVELS;
  $value=array_key_exists($key,$data)?$data[$key]:($key==='estimated_severity'?'Low':'None');
  if(!is_string($value)||!in_array($value,$allowed,true))ha_error('Invalid '.$key.'.');$out[$key]=$value;
 }
 foreach(['findings','remarks'] as $key){
  if(!array_key_exists($key,$data)&&$draft)continue;
  $value=$data[$key]??'';if(!is_string($value)||strlen($value)>20000)ha_error('Invalid '.$key.'.');$out[$key]=trim($value);
 }
 if(!$draft&&$out['findings']==='')ha_error('Findings from the actual field visit are required.');
 return $out;
}
function ha_actor(PDO $db,int $id): array {
 $s=$db->prepare('SELECT user_id,role,is_active,assigned_purok FROM users WHERE user_id=?'.($db->inTransaction()?' FOR UPDATE':''));$s->execute([$id]);$a=$s->fetch(PDO::FETCH_ASSOC);
 if(!$a||!intval($a['is_active']))ha_error('Your account does not currently have access.',403);return $a;
}
function ha_household(PDO $db,int $hid,bool $lock=false): array {$s=$db->prepare('SELECT household_id,purok FROM households WHERE household_id=?'.($lock?' FOR UPDATE':''));$s->execute([$hid]);$h=$s->fetch(PDO::FETCH_ASSOC);if(!$h)ha_error('Household not found.',404);return $h;}
/** The household's open allocation round and that round's visit (either may be null). */
function ha_round(PDO $db,int $hid,bool $lock=false): array {
 $alloc=aw_open_allocation($db,$hid,$lock);$row=null;
 if($alloc){$s=$db->prepare('SELECT * FROM household_field_assessments WHERE allocation_id=?'.($lock?' FOR UPDATE':''));$s->execute([$alloc['allocation_id']]);$row=$s->fetch(PDO::FETCH_ASSOC)?:null;}
 return ['allocation'=>$alloc,'row'=>$row];
}
function ha_row(PDO $db,int $hid): ?array {return ha_round($db,$hid)['row'];}
function ha_authorize_officer(PDO $db,int $hid,int $actorId): array {
 $a=ha_actor($db,$actorId);$h=ha_household($db,$hid);$round=ha_round($db,$hid,true);$row=$round['row'];
 if($a['role']!=='field_officer'||!$row||intval($row['assigned_field_officer_id'])!==$actorId||!normalize_purok($h['purok'])||normalize_purok($h['purok'])!==normalize_purok($a['assigned_purok']))ha_error('Only the assigned field officer may record this household visit.',403);
 return $round;
}
function ha_revision(PDO $db,?array $before,array $after,int $actorId,string $action): void {
 $s=$db->prepare('INSERT INTO household_assessment_revisions(assessment_id,action,before_json,after_json,changed_by) VALUES(?,?,?,?,?)');$s->execute([$after['assessment_id'],$action,$before?json_encode($before):null,json_encode($after),$actorId]);
}
function ha_version(array $data,?array $row): void {
 if(isset($data['version']))ha_integer($data['version'],'version',0);
 if(!isset($data['version'])||intval($data['version'])!==intval($row['version']??0))ha_error('This assessment changed. Refresh before saving again.',409);
}
function ha_require_unlocked(array $row): void {
 if(!empty($row['locked_at']))ha_error('This assessment is locked. An administrator must re-open it.',409);
}
function ha_tx(PDO $db,callable $fn) {$db->beginTransaction();try{$r=$fn();$db->commit();return $r;}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}}
function ha_fetch_assessment(PDO $db,int $assessmentId): array {$s=$db->prepare('SELECT * FROM household_field_assessments WHERE assessment_id=?');$s->execute([$assessmentId]);return $s->fetch(PDO::FETCH_ASSOC);}

function ha_assign(PDO $db,array $data,int $actorId): array {
 ha_require_schema($db);
 $hid=ha_integer($data['household_id']??null,'household_id');$officerId=ha_integer($data['assigned_field_officer_id']??null,'assigned_field_officer_id');
 return ha_tx($db,function()use($db,$data,$actorId,$hid,$officerId){
  if(ha_actor($db,$actorId)['role']!=='admin')ha_error('Only administrators may assign household visits.',403);
  $officer=ha_actor($db,$officerId);$h=ha_household($db,$hid,true);$round=ha_round($db,$hid,true);$before=$round['row'];
  if(!$round['allocation']){
   // A household that has never had a round (e.g. added outside the app) starts round 1 here; later rounds are explicit.
   $s=$db->prepare('SELECT COUNT(*) FROM household_allocations WHERE household_id=?');$s->execute([$hid]);
   if(intval($s->fetchColumn())>0)ha_error('This household has no open allocation round. Start a new round first.',409);
   aw_start_round($db,$hid,$actorId);$round=ha_round($db,$hid,true);$before=$round['row'];
  }
  if($round['allocation']['status']==='READY_FOR_DISTRIBUTION')ha_error('This household is Ready for Distribution. Re-open the allocation before reassigning its visit.',409);
  if($before)ha_require_unlocked($before);
  ha_version($data,$before);
  if($officer['role']!=='field_officer'||!normalize_purok($h['purok'])||normalize_purok($officer['assigned_purok'])!==normalize_purok($h['purok']))ha_error('Choose an active field officer assigned to this household Purok.');
  if($before){$s=$db->prepare("UPDATE household_field_assessments SET assigned_field_officer_id=?,status='assigned',updated_by=?,updated_at=NOW(),version=version+1 WHERE assessment_id=?");$s->execute([$officerId,$actorId,$before['assessment_id']]);$id=(int)$before['assessment_id'];}
  else{$s=$db->prepare("INSERT INTO household_field_assessments(household_id,allocation_id,assigned_field_officer_id,status,created_by,updated_by) VALUES(?,?,?,'assigned',?,?)");$s->execute([$hid,$round['allocation']['allocation_id'],$officerId,$actorId,$actorId]);$id=(int)$db->lastInsertId();}
  $after=ha_fetch_assessment($db,$id);ha_revision($db,$before,$after,$actorId,'assignment');return $after;
 });
}

/** Assigned officer saves an unfinished visit; the allocation becomes ASSESSMENT_IN_PROGRESS. */
function ha_save_draft(PDO $db,array $data,int $actorId): array {
 ha_require_schema($db);$hid=ha_integer($data['household_id']??null,'household_id');
 return ha_tx($db,function()use($db,$data,$actorId,$hid){
  ha_actor($db,$actorId);ha_household($db,$hid,true);$round=ha_authorize_officer($db,$hid,$actorId);$before=$round['row'];
  ha_require_unlocked($before);ha_version($data,$before);$values=ha_validate_submission($data,null,true);
  $sets=implode('',array_map(fn($key)=>"$key=?,",array_keys($values)));
  $db->prepare("UPDATE household_field_assessments SET {$sets}draft_saved_at=NOW(),updated_at=NOW(),updated_by=?,version=version+1 WHERE assessment_id=?")->execute(array_merge(array_values($values),[$actorId,$before['assessment_id']]));
  $after=ha_fetch_assessment($db,(int)$before['assessment_id']);ha_revision($db,$before,$after,$actorId,'draft');
  $alloc=$round['allocation'];
  if($alloc['status']==='PENDING_ASSESSMENT')$alloc=aw_transition($db,$alloc,'ASSESSMENT_IN_PROGRESS','draft_saved',$actorId);
  return ['assessment'=>$after,'allocation'=>$alloc];
 });
}

/**
 * Assigned officer submits the visit: saved, locked, and — in the same transaction — the allocation is promoted
 * to READY when the score is final and a standard package exists. Otherwise it waits with the reasons returned.
 */
function ha_submit(PDO $db,array $data,int $actorId): array {
 ha_require_schema($db);$hid=ha_integer($data['household_id']??null,'household_id');
 return ha_tx($db,function()use($db,$data,$actorId,$hid){
  ha_actor($db,$actorId);ha_household($db,$hid,true);$round=ha_authorize_officer($db,$hid,$actorId);$before=$round['row'];
  ha_require_unlocked($before);ha_version($data,$before);$values=ha_validate_submission($data);
  $sets=implode('',array_map(fn($key)=>"$key=?,",array_keys($values)));
  $db->prepare("UPDATE household_field_assessments SET {$sets}status='assessed',submitted_at=NOW(),locked_at=NOW(),updated_at=NOW(),updated_by=?,version=version+1 WHERE assessment_id=?")->execute(array_merge(array_values($values),[$actorId,$before['assessment_id']]));
  $after=ha_fetch_assessment($db,(int)$before['assessment_id']);ha_revision($db,$before,$after,$actorId,'submission');
  $promotion=aw_promote_if_complete($db,$hid,$actorId);
  $alloc=aw_allocation($db,(int)$round['allocation']['allocation_id']);
  if(!$promotion['promoted']&&$alloc['status']==='PENDING_ASSESSMENT')$alloc=aw_transition($db,$alloc,'ASSESSMENT_IN_PROGRESS','assessment_submitted',$actorId,null,['waiting_for'=>$promotion['reasons']]);
  return ['assessment'=>$after,'allocation'=>$alloc,'promoted'=>$promotion['promoted'],'reasons'=>$promotion['reasons'],'queued_sms_ids'=>$promotion['queued_sms_ids']];
 });
}

/** Households with their current round (latest allocation) and that round's visit, scoped to the actor. */
function ha_list(PDO $db,int $actorId,?int $hid=null): array {
 ha_require_schema($db);$actor=ha_actor($db,$actorId);if(!in_array($actor['role'],['admin','field_officer','relief_personnel'],true))ha_error('Access denied.',403);
 $rows=$db->query("SELECT h.household_id,h.head_of_family,h.purok,h.address,f.*,h.household_id AS household_id,u.full_name AS assigned_field_officer_name,
   cur.allocation_id AS allocation_id,al.status AS allocation_status,al.round_no
   FROM households h
   LEFT JOIN (SELECT household_id,MAX(allocation_id) AS allocation_id FROM household_allocations GROUP BY household_id) cur ON cur.household_id=h.household_id
   LEFT JOIN household_allocations al ON al.allocation_id=cur.allocation_id
   LEFT JOIN household_field_assessments f ON f.allocation_id=cur.allocation_id
   LEFT JOIN users u ON u.user_id=f.assigned_field_officer_id ORDER BY h.household_id")->fetchAll(PDO::FETCH_ASSOC);$out=[];
 $legacy=$db->prepare('SELECT da.*,dr.report_id FROM damage_assessments da JOIN disaster_reports dr ON dr.report_id=da.report_id WHERE dr.household_id=? ORDER BY da.assessed_at DESC LIMIT 1');
 foreach($rows as $r){if($hid!==null&&intval($r['household_id'])!==$hid)continue;
  if($actor['role']!=='admin'&&(!normalize_purok($actor['assigned_purok'])||normalize_purok($r['purok'])!==normalize_purok($actor['assigned_purok'])))continue;
  if($actor['role']==='field_officer'&&intval($r['assigned_field_officer_id'])!==$actorId)continue;
  $r['status']=$r['status']??'pending_assignment';$r['version']=intval($r['version']??0);$r['locked']=!empty($r['locked_at']);
  $legacy->execute([$r['household_id']]);$r['legacy_assessment']=$legacy->fetch(PDO::FETCH_ASSOC)?:null;
  $out[]=$r;
 }return $out;
}
function ha_endpoint(callable $fn): void {
 try{echo json_encode(['success'=>true,'data'=>$fn()]);}
 catch(HouseholdAssessmentError|AllocationWorkflowError $e){http_response_code($e->getCode()?:400);echo json_encode(['success'=>false,'message'=>$e->getMessage()]);}
}

function ha_report_evidence_locked(PDO $db,int $reportId): bool {
 $s=$db->prepare('SELECT 1 FROM damage_assessments WHERE report_id=? LIMIT 1');$s->execute([$reportId]);if($s->fetchColumn())return true;
 try{$s=$db->prepare('SELECT 1 FROM household_field_assessments a JOIN disaster_reports r ON r.household_id=a.household_id WHERE r.report_id=? LIMIT 1');$s->execute([$reportId]);return(bool)$s->fetchColumn();}catch(PDOException $e){if(($e->errorInfo[1]??0)===1146)return false;throw $e;}
}
function ha_integer($value,string $field,int $minimum=1): int {
 if(!(is_int($value)||(is_string($value)&&preg_match('/^(0|[1-9][0-9]*)$/D',$value)))||filter_var($value,FILTER_VALIDATE_INT)===false||intval($value)<$minimum||intval($value)>2147483647)ha_error('Invalid '.$field.'.');return intval($value);
}
function ha_household_evidence_locked(PDO $db,int $hid): bool {
 $s=$db->prepare('SELECT 1 FROM damage_assessments da JOIN disaster_reports dr ON dr.report_id=da.report_id WHERE dr.household_id=? LIMIT 1');$s->execute([$hid]);if($s->fetchColumn())return true;
 try{$s=$db->prepare('SELECT 1 FROM household_field_assessments WHERE household_id=? LIMIT 1');$s->execute([$hid]);return(bool)$s->fetchColumn();}catch(PDOException $e){if(($e->errorInfo[1]??0)===1146)return false;throw $e;}
}
