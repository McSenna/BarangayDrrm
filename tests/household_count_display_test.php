<?php
require __DIR__.'/../backend/lib/automatic_priority.php';
class CountDisplayStatement extends PDOStatement {
 public function __construct(private array $rows) {}
 public function execute(?array $params=null):bool { return true; }
 public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args):array { return $this->rows; }
 public function fetch(int $mode=PDO::FETCH_DEFAULT,int $cursorOrientation=PDO::FETCH_ORI_NEXT,int $cursorOffset=0):mixed { return false; }
}
class CountDisplayDatabase extends PDO {
 public mixed $size=5; public mixed $vulnerableCount=0; public bool $verified=false; public bool $vulnerability=false;
 public function __construct() {}
 public function query(string $q,?int $fetchMode=null,mixed ...$args):PDOStatement|false {
  return new CountDisplayStatement($q==='SELECT * FROM households' ? [['household_id'=>1,'head_of_family'=>'Head','purok'=>'Purok 3','number_of_members'=>$this->size,'vulnerable_members'=>$this->vulnerableCount,'roster_verified_at'=>$this->verified?'2026-10-18':null,'roster_verified_by'=>$this->verified?1:null]]:[]);
 }
 public function prepare(string $q,array $options=[]):PDOStatement|false {
  return new CountDisplayStatement(str_contains($q,'FROM household_members') ? [['member_id'=>1,'full_name'=>'Head','relationship'=>'Head','age'=>30,'is_child'=>0,'is_senior'=>0,'is_pwd'=>0,'is_pregnant'=>0,'has_medical_needs'=>0,'is_other_vulnerable'=>0,'vulnerability_verified_at'=>$this->vulnerability?'2026-10-18':null,'vulnerability_verified_by'=>$this->vulnerability?1:null]]:[]);
 }
}
function expect_count($ok,$message) { if(!$ok) throw new RuntimeException($message); }
$db=new CountDisplayDatabase(); $r=dss_read_priorities($db)[0];
expect_count($r['number_of_members']===5 && $r['vulnerable_members']===0,'Recorded totals are used without verification');
expect_count($r['score_breakdown']['household_size']===15 && $r['score_breakdown']['vulnerable_members']===0 && $r['automatic_subtotal']===55,'Recorded counts automatically earn points');
expect_count(!$r['needs_review'] && $r['review_reasons']===[],'Roster attestation does not block priority assessment');
expect_count($r['final_score']===null && $r['priority_level']==='Pending Assessment','Damage still requires a field visit');
expect_count(!str_contains($r['criteria'][1]['basis'],'verification') && !str_contains($r['criteria'][1]['label'],'Verified'),'Recorded counts are honestly labelled');
$db->verified=true; $db->vulnerability=true; $r=dss_read_priorities($db)[0];
expect_count($r['number_of_members']===5 && $r['automatic_subtotal']===55,'Verification flags do not change the scoring source');
foreach ([[0,0],[5,-1],[5,6],[null,null],['bad',0],[2.5,0]] as [$size,$vulnerable]) {
 $db->size=$size; $db->vulnerableCount=$vulnerable;
 $invalid=dss_read_priorities($db)[0];
 expect_count(!$invalid['automatic_complete'] && $invalid['needs_review'],'Invalid counts require correction rather than automatic points');
}
echo "Automatic recorded household count tests passed\n";

