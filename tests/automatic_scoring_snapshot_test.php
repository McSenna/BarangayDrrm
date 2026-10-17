<?php
require_once __DIR__.'/../backend/lib/dss.php';
$fixture=json_decode(file_get_contents(__DIR__.'/.user-management-local/scoring_fixture.json'),true);
if(!preg_match('/^codex_users_test_\d{8}_\d{6}_[a-f0-9]+$/',$fixture['database']??''))throw new RuntimeException('Isolated test database required.');
$dsn='mysql:host=127.0.0.1;dbname='.$fixture['database'];
$writer=new PDO($dsn,getenv('DB_USER')?:'root',getenv('DB_PASS')?:'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$target=$fixture['ids'][4];
// Establish a deterministic race immediately after household metadata was read.
class ScoringRaceStatement extends PDOStatement {
    protected function __construct(private PDO $writer,private int $target){}
    public function fetchAll(int $mode=PDO::FETCH_DEFAULT,mixed ...$args):array {
        $rows=parent::fetchAll($mode,...$args);
        if($this->queryString==='SELECT * FROM households'){
            $this->writer->beginTransaction();
            $this->writer->prepare('UPDATE households SET roster_verified_at=NULL,roster_verified_by=NULL WHERE household_id=?')->execute([$this->target]);
            $this->writer->prepare('UPDATE household_members SET is_pwd=0,has_medical_needs=0 WHERE household_id=?')->execute([$this->target]);
            $this->writer->commit();
        }
        return $rows;
    }
}
$reader=new PDO($dsn,getenv('DB_USER')?:'root',getenv('DB_PASS')?:'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_STATEMENT_CLASS=>[ScoringRaceStatement::class,[$writer,$target]]]);
$rows=dss_compute_priorities($reader);$during=array_values(array_filter($rows,fn($r)=>$r['household_id']===$target))[0];
if($during['automatic_subtotal']!==80 || $during['vulnerable_members']!==4)throw new RuntimeException('Scoring combined stale verification with changed people: '.json_encode(array_intersect_key($during,array_flip(['automatic_subtotal','vulnerable_members','number_of_members','priority_level','review_reasons']))));
$after=array_values(array_filter(dss_compute_priorities($writer),fn($r)=>$r['household_id']===$target))[0];
if($after['automatic_complete'] || $after['automatic_subtotal']!==null)throw new RuntimeException('Next request did not observe invalidated verification.');
echo "PASS consistent source snapshot during concurrent roster changes; next read requires verification\n";
