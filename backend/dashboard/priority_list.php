<?php
require_once __DIR__.'/../config/cors.php';
require_once __DIR__.'/../config/database.php';
require_once __DIR__.'/../lib/dss.php';
require_once __DIR__.'/../lib/allocation_workflow.php';
require_login(['admin','relief_personnel','field_officer']);
if ($_SERVER['REQUEST_METHOD']!=='GET') {http_response_code(405);exit();}
$conn=(new Database())->connect();
$results=dss_scoped_priorities($conn);
if(isset($_GET['household_id']))$results=array_values(array_filter($results,fn($r)=>$r['household_id']===(int)$_GET['household_id']));
if(($_GET['export']??'')==='csv'){
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="current-provisional-priorities.csv"');
    $out=fopen('php://output','w');
    fputcsv($out,['Household ID','Household','Purok','Flood classification (recorded Purok)','Flood points','Verified members','Size points','Verified vulnerable people','Vulnerability points','Damage classification','Damage points','Automatic subtotal / 80','Final score / 100','Priority','Assessment status','Allocation status','Assigned Field Officer','Actual visit date','Scoring version','Verification flags']);
    foreach($results as $r){
        $b=$r['score_breakdown'];$v=fn($x)=>$x===null?'For Verification':$x;
        $cells=[$r['household_id'],$r['head_of_family'],$r['purok'],$r['flood_classification_label'],$v($b['flood_zone']),$v($r['number_of_members']),$v($b['household_size']),$v($r['vulnerable_members']),$v($b['vulnerable_members']),
            $r['damage']['label']??'Not Yet Assessed',$b['damage']??'Not Yet Assessed',$v($r['automatic_subtotal']),$r['final_score']??$r['priority_level'],$r['priority_level'],$r['assessment_status'],
            $r['allocation_status']?AW_STATUS_LABELS[$r['allocation_status']]:'No allocation',$r['assigned_field_officer_name']??'Not assigned',$r['field_visit_date']??'Not Yet Assessed',$r['model_version'],implode('; ',$r['review_reasons'])];
        fputcsv($out,array_map(function($x){$x=(string)$x;return preg_match('/^s*[=+@-]/u',$x)?"'".$x:$x;},$cells));
    }fclose($out);exit();
}
echo json_encode(['success'=>true,'data'=>$results,'calculated_at'=>$results[0]['calculated_at']??date('Y-m-d H:i:s'),'method'=>dss_method_summary()]);
