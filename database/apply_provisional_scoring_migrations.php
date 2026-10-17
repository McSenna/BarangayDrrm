<?php
// Additive schema changes only; verification of legacy data is deliberately manual.
if (PHP_SAPI !== 'cli') {http_response_code(403);exit();}
require_once __DIR__.'/../backend/config/database.php';
if (app_config('APP_ENV')!=='local' || !in_array(app_config('DB_HOST'),['localhost','127.0.0.1','::1'],true)) {fwrite(STDERR,"Restricted to local development databases.\n");exit(1);}
$conn=(new Database())->connect();
$tables=['users','households','household_members','damage_assessments','report_photos','relief_allocations','distribution_beneficiaries','delivery_reports'];
$before=[];
foreach($tables as $table)$before[$table]=(int)$conn->query("SELECT COUNT(*) FROM $table")->fetchColumn();
$historyBefore=$conn->query("SELECT allocation_id,dss_score,dss_category,dss_rank,dss_ratings,dss_model_version FROM relief_allocations ORDER BY allocation_id")->fetchAll(PDO::FETCH_ASSOC);
foreach(['migration_phase29_household_assessments.sql','migration_phase30_verified_household_members.sql','migration_phase31_verified_flood_scoring.sql'] as $migration){$conn->exec(file_get_contents(__DIR__.'/'.$migration));echo "$migration applied.\n";}
$after=[];
foreach($tables as $table)$after[$table]=(int)$conn->query("SELECT COUNT(*) FROM $table")->fetchColumn();
$historyAfter=$conn->query("SELECT allocation_id,dss_score,dss_category,dss_rank,dss_ratings,dss_model_version FROM relief_allocations ORDER BY allocation_id")->fetchAll(PDO::FETCH_ASSOC);
if($before!==$after || $historyBefore!==$historyAfter){fwrite(STDERR,"Preservation check failed. Inspect the database before proceeding.\n");exit(1);}
echo "Record counts and all historical allocation scoring snapshots preserved. Existing locations and rosters require explicit verification.\n";
