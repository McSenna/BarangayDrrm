<?php
require_once __DIR__.'/../config/cors.php';
require_once __DIR__.'/../config/database.php';
require_once __DIR__.'/../lib/household_assessments.php';
require_login(['admin','relief_personnel','field_officer']);
ha_endpoint(function(){
 $db=(new Database())->connect();ha_require_schema($db);$method=$_SERVER['REQUEST_METHOD'];$hid=ha_integer(($method==='POST'?$_POST:$_GET)['household_id']??null,'household_id');$actorId=intval($_SESSION['user_id']);
 if($method==='GET'){
  if(!ha_list($db,$actorId,$hid))ha_error('Household not available.',403);
  $s=$db->prepare('SELECT p.photo_id,p.assessment_id,p.mime_type,p.original_name,p.uploaded_by,p.uploaded_at FROM household_assessment_photos p JOIN household_field_assessments a ON a.assessment_id=p.assessment_id WHERE a.household_id=? ORDER BY p.photo_id');$s->execute([$hid]);$rows=$s->fetchAll(PDO::FETCH_ASSOC);
  foreach($rows as &$r)$r['url']='disasters/download_household_assessment_photo.php?id='.$r['photo_id'];return $rows;
 }
 if($method!=='POST')ha_error('Method not allowed.',405);
 $db->beginTransaction();try{
  ha_actor($db,$actorId);ha_household($db,$hid,true);$row=ha_authorize_officer($db,$hid,$actorId)['row'];ha_require_unlocked($row);$photo=$_FILES['photo']??null;
  if(!$photo||$photo['error']!==UPLOAD_ERR_OK||!is_uploaded_file($photo['tmp_name'])||$photo['size']>5*1024*1024)ha_error('Upload a valid photo of up to 5 MB.');
  $mime=(new finfo(FILEINFO_MIME_TYPE))->file($photo['tmp_name']);$info=@getimagesize($photo['tmp_name']);
  if(!in_array($mime,['image/jpeg','image/png','image/webp'],true)||!$info||$info['mime']!==$mime||$info[0]*$info[1]>25000000)ha_error('Use a valid JPG, PNG or WebP photo under 25 megapixels.');
  $s=$db->prepare('SELECT COUNT(*) FROM household_assessment_photos WHERE assessment_id=?');$s->execute([$row['assessment_id']]);if(intval($s->fetchColumn())>=20)ha_error('This assessment already has 20 evidence photos.');
  $s=$db->prepare('INSERT INTO household_assessment_photos(assessment_id,photo_data,mime_type,original_name,uploaded_by) VALUES(?,?,?,?,?)');$s->execute([$row['assessment_id'],file_get_contents($photo['tmp_name']),$mime,substr(basename($photo['name']),0,255),$actorId]);$id=intval($db->lastInsertId());
  ha_revision($db,$row,array_merge($row,['added_photo_id'=>$id]),$actorId,'photo_added');$db->commit();return ['photo_id'=>$id,'url'=>'disasters/download_household_assessment_photo.php?id='.$id];
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
});

