<?php
require_once __DIR__ . '/../backend/lib/household_counts.php';
require_once __DIR__ . '/../backend/lib/household_profile.php';
function counts_check(bool $ok,string $message): void { if (!$ok) throw new RuntimeException($message); }
foreach ([0,-1,1.5,'2people',true,[],null,''] as $size) {
    try { household_reported_counts(['number_of_members'=>$size]); throw new RuntimeException('Invalid household size accepted'); }
    catch (InvalidArgumentException $e) {}
}
foreach (['children_count','seniors_count','pwd_count','pregnant_count','medical_needs_count','other_vulnerable_count','vulnerable_members'] as $field) {
    foreach ([-1,0.5,'bad',true,[],4] as $value) {
        try { household_reported_counts(['number_of_members'=>3,$field=>$value]); throw new RuntimeException('Invalid reported count accepted: '.$field); }
        catch (InvalidArgumentException $e) {}
    }
}
$counts=household_reported_counts(['number_of_members'=>'3','children_count'=>2,'pwd_count'=>2]);
counts_check($counts['vulnerable_members']===0,'Overlapping category counts do not imply four distinct vulnerable people');
$counts=household_reported_counts(['number_of_members'=>3,'children_count'=>2,'pwd_count'=>2,'vulnerable_members'=>2]);
counts_check($counts['vulnerable_members']===2,'A separately reported distinct count remains separate from categories');
$derived=household_counts_from_verified_profile(['complete'=>true,'size'=>2,'vulnerable'=>1,'people'=>[
 ['is_child'=>0,'is_senior'=>1,'is_pwd'=>1,'is_pregnant'=>0,'has_medical_needs'=>1,'is_other_vulnerable'=>0],
 ['is_child'=>0,'is_senior'=>0,'is_pwd'=>0,'is_pregnant'=>0,'has_medical_needs'=>0,'is_other_vulnerable'=>0]
]]);
counts_check($derived===['number_of_members'=>2,'vulnerable_members'=>1,'children_count'=>0,'seniors_count'=>1,'pwd_count'=>1,'pregnant_count'=>0,'medical_needs_count'=>1,'other_vulnerable_count'=>0],'Verified distinct count survives overlapping groups');
echo "Reported household count tests passed\n";
