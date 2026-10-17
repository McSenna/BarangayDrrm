<?php
require_once __DIR__ . '/../backend/lib/dss.php';
$checks = 0;
function auto_check($ok, $label) { global $checks; if (!$ok) throw new RuntimeException($label); $checks++; }
function auto_reject($fn, $label) { try { $fn(); } catch (InvalidArgumentException $e) { auto_check(true, $label); return; } throw new RuntimeException($label); }

// The brief's full scoring examples (flood + size + vulnerable + damage = final / 100).
foreach ([['flood_prone',7,3,'Destroyed',100,'Critical Priority'],['flood_prone',5,2,'Severely Damaged',85,'Critical Priority'],
  ['flood_prone',7,3,'No Damage',80,'High Priority'],['flood_prone',5,1,'Severely Damaged',80,'High Priority'],
  ['flood_prone',4,1,'Minor Damage',65,'High Priority'],['not_designated',6,2,'Partially Damaged',60,'Moderate Priority'],
  ['not_designated',3,1,'Minor Damage',45,'Moderate Priority'],['not_designated',2,0,'No Damage',25,'Low Priority']] as [$z,$s,$v,$d,$t,$p]) {
  $r=dss_household_score($z,$s,$v,$d); auto_check($r['final_score']===$t && $r['priority_score']===$t && $r['priority_level']===$p && $r['score_complete'],"example $z/$s/$v/$d");
}
$r=dss_household_score('flood_prone',8,4,null);
auto_check($r['automatic_subtotal']===80 && $r['final_score']===null && $r['priority_level']==='Pending Assessment' && $r['score_breakdown']['damage']===null && !$r['score_complete'] && $r['automatic_complete'],'not yet assessed');
foreach (DSS_DAMAGE_POINTS as $d=>$pts) auto_check(dss_household_score('not_designated',2,0,$d)['score_breakdown']['damage']===$pts,"damage $d");
auto_check(DSS_DAMAGE_POINTS===['Destroyed'=>20,'Severely Damaged'=>15,'Partially Damaged'=>10,'Minor Damage'=>5,'No Damage'=>0],'damage scale');
auto_check(dss_household_score('flood_prone',2,0,'No Damage')['final_score']===45 && dss_household_score('flood_prone',2,0,null)['final_score']===null,'no damage assessed differs from not assessed');
auto_reject(fn()=>dss_household_score('flood_prone',2,0,'Major'),'old damage scale rejected');
auto_check(dss_household_score(null,2,0,'Destroyed')['priority_level']==='For Verification','missing source data is For Verification even after a visit');
auto_check(dss_household_score(null,2,0,null)['priority_level']==='For Verification','missing source data before a visit is For Verification');

// Automatic components (subtotal / 80) — unchanged rules.
foreach ([1=>5,2=>5,3=>10,4=>10,5=>15,6=>15,7=>20,8=>20] as $size=>$points) auto_check(dss_household_score('not_designated',$size,0,null)['score_breakdown']['household_size'] === $points, "size $size");
foreach ([0=>0,1=>10,2=>15,3=>20,4=>20] as $count=>$points) auto_check(dss_household_score('not_designated',8,$count,null)['score_breakdown']['vulnerable_members'] === $points,"vulnerable $count");
auto_check(dss_household_score('flood_prone',7,3,null)['automatic_subtotal']===80 && dss_household_score('not_designated',2,0,null)['automatic_subtotal']===25,'automatic subtotal');
foreach ([0=>'Low Priority',40=>'Low Priority',41=>'Moderate Priority',60=>'Moderate Priority',61=>'High Priority',80=>'High Priority',81=>'Critical Priority',100=>'Critical Priority'] as $score=>$level) auto_check(dss_priority_category($score) === $level,"boundary $score");
foreach ([-1,101,NAN,INF,40.5] as $invalid) auto_reject(fn()=>dss_priority_category($invalid),'invalid score');
foreach ([[0,0],[-1,0],[2,3],[2,-1]] as [$size,$v]) auto_reject(fn()=>dss_household_score('flood_prone',$size,$v,null),'invalid household count');
foreach (['unmapped','unverified',null] as $zone) { $r=dss_household_score($zone,2,0,'No Damage'); auto_check(!$r['score_complete'] && $r['final_score'] === null && $r['automatic_subtotal'] === null && $r['score_breakdown']['flood_zone'] === null,'unknown flood is incomplete'); }
$missing=dss_household_score('flood_prone',2,null,'No Damage');
auto_check(!$missing['score_complete'] && $missing['score_breakdown']['vulnerable_members'] === null,'missing vulnerability is unknown');
auto_check(dss_household_score('flood_prone',2,0,'No Damage')['score_complete'],'verified zero vulnerability is valid');
auto_check(dss_household_score('flood_prone',null,null,null)['automatic_subtotal'] === null,'missing roster is incomplete');

// Flood zone comes from the recorded Purok: Puroks 1–4 inside, 5A–7 outside, with no coordinates or confirmation.
$bounds = purok_boundaries_load();
foreach ([['Purok 3','flood_prone'],['Purok 1','flood_prone'],['Purok 5A','not_designated'],['Purok 7','not_designated']] as [$purok,$zone]) {
    $f = dss_flood_profile(['purok'=>$purok,'latitude'=>null,'longitude'=>null],$bounds);
    auto_check($f['flood_status'] === $zone && $f['flood_verified'] === true, "$purok is automatically $zone");
}
$f = dss_flood_profile(['purok'=>'Purok 4','latitude'=>13.1552189,'longitude'=>123.7169349],$bounds); // point lies in Purok 7
auto_check($f['flood_status'] === 'flood_prone' && $f['flood_verified'],'recorded Purok decides even when the map point is elsewhere');
foreach ([null,'','Purok 9'] as $purok) { $f = dss_flood_profile(['purok'=>$purok,'latitude'=>null,'longitude'=>null],$bounds); auto_check($f['flood_status'] === 'unverified' && !$f['flood_verified'],'unknown Purok is flagged '.json_encode($purok)); }

$m=dss_method_summary();
auto_check($m['maximum_automatic_subtotal']===80 && $m['maximum_score']===100,'max 80 / 100');
auto_check($m['damage_points']===DSS_DAMAGE_POINTS && $m['provisional']===false,'damage points defined; not provisional');
auto_check(DSS_MODEL_VERSION==='final-v1 F40 recorded-Purok H20 V20 D20; max100','rule version');
echo "PASS: $checks automatic scoring checks\n";
