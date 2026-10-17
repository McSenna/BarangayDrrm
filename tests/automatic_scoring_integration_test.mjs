import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const php = process.env.PHP_BIN || 'C:/xampp/php/php.exe';
const fixture = JSON.parse(execFileSync(php,['tests/user_management_fixture.php'],{encoding:'utf8',env:{...process.env,USER_TEST_FULL_SCHEMA:'1'}}));
const base='http://127.0.0.1:8117/backend/';
const server=spawn(php,['-S','127.0.0.1:8117','-t','.','backend/dev_router.php'],{env:{...process.env,DB_HOST:'127.0.0.1',DB_NAME:fixture.database},stdio:'ignore'});
let checks=0;
function check(ok,label){assert.ok(ok,label);checks++;console.log('PASS '+label);}
async function call(path,method='GET',data,cookie){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});const text=await response.text();let body;try{body=JSON.parse(text);}catch{throw new Error(path+': '+text);}return{status:response.status,body,cookie:response.headers.get('set-cookie')?.split(';')[0]};}
function sql(query){return execFileSync(php,['-r',"$p=new PDO('mysql:host=127.0.0.1;dbname='.$argv[1],getenv('DB_USER')?:'root',getenv('DB_PASS')?:'',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$p->exec($argv[2]);",fixture.database,query],{encoding:'utf8'});}
try{
  for(let i=0;i<60;i++){try{await fetch(base+'auth/session.php');break;}catch{await new Promise(r=>setTimeout(r,100));}}
  const admin=(await call('auth/login.php','POST',{email:'admin@example.test',password:fixture.password})).cookie;
  const relief=(await call('auth/login.php','POST',{email:'personnel@example.test',password:fixture.password})).cookie;
  const list=async()=> (await call('dashboard/priority_list.php','GET',undefined,admin)).body.data;
  const initial=(await list())[0];
  check(initial.priority_score===null && !initial.score_complete && initial.priority_level==='For Verification','legacy aggregates do not create a score');
  check(initial.assessment_status==='Not Yet Assessed','pending visit is not no damage');
  check((await fetch(base+'households/verify_flood_location.php',{method:'POST',headers:{Cookie:admin}})).status===404,'flood confirmation endpoint removed: recorded Purok decides');
  const examples=[['flood_prone',7,3,80,'High Priority'],['not_designated',6,2,50,'Moderate Priority'],['flood_prone',4,1,60,'Moderate Priority'],['not_designated',2,0,25,'Low Priority'],['flood_prone',8,4,80,'High Priority']];
  const ids=[];
  for(const [index,[zone,size,vulnerable,total,priority]] of examples.entries()){
    const inside=zone==='flood_prone';const name='Scored Household '+index;
    const added=await call('households/add_household.php','POST',{head_of_family:name,purok:inside?'Purok 4':'Purok 7',address:'Test street',number_of_members:size,latitude:inside?13.1564170:13.1552189,longitude:inside?123.7166138:123.7169349},admin);
    check(added.status===201,'create household '+index);
    const hid=(await list()).find(h=>h.head_of_family===name).household_id;ids.push(hid);
    for(let person=0;person<size;person++){
      const member=await call('households/members/add_member.php','POST',{household_id:hid,full_name:person===0?name:'Person '+index+' '+person,relationship:person===0?'Head':'Member',age:30,is_child:0,is_senior:0,is_pwd:person<vulnerable?1:0,is_pregnant:0,has_medical_needs:person<vulnerable?1:0,is_other_vulnerable:0,verify_vulnerability:true},admin);
      assert.equal(member.status,201,JSON.stringify(member));
    }
    check((await call('households/members/verify_roster.php','POST',{household_id:hid,confirm_complete:true},admin)).status===200,'verify roster '+index);
    const score=(await list()).find(h=>h.household_id===hid);
    check(score.number_of_members===size && score.vulnerable_members===vulnerable && score.flood_verified && score.flood_status===zone,'roster counts distinct people; recorded Purok sets the flood zone automatically '+index);
    check(score.automatic_subtotal===total && score.final_score===null && score.priority_level==='Pending Assessment' && score.score_breakdown.damage===null,'automatic subtotal example; no final score before the visit '+index);
  }
  let all=await list();
  check(all.find(h=>h.household_id===ids[0]).automatic_subtotal===80 && all.find(h=>h.household_id===ids[4]).automatic_subtotal===80 && all.find(h=>h.household_id===ids[0]).rank===null,'equal subtotals stay unranked until visits are submitted');
  check(all.every(h=>h.final_score===null && !['Critical Priority','High Priority','Moderate Priority','Low Priority'].includes(h.priority_level)),'no final priority before a submitted field visit');
  check(all.find(h=>h.household_id===ids[0]).eligible===false && all.find(h=>h.household_id===ids[0]).allocation_status==='PENDING_ASSESSMENT','new households start Pending Assessment');
  const report=await call('reports/household_reports.php','GET',undefined,admin);
  check(report.status===200 && report.body.data.current_priorities.find(h=>h.household_id===ids[0]).automatic_subtotal===80,'report uses shared score');
  const csv=await(await fetch(base+'dashboard/priority_list.php?export=csv',{headers:{Cookie:admin}})).text();
  check(csv.includes('Automatic subtotal / 80') && csv.includes('Scored Household 0') && csv.includes('Pending Assessment') && csv.includes('Final score / 100'),'CSV includes shared current scores and pending households');
  const map=await call('households/purok_classification.php','GET',undefined,admin);
  check(ids.every((hid,i)=>map.body.households.find(h=>h.household_id===hid).flood_status===examples[i][0]),'map and score classification agree');
  const reportInput={household_id:ids[0],disaster_type:'Flood',severity:'High',location:'Purok 4',report_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila'}).format(new Date()),description:'Test report'};
  const firstReport=await call('disasters/create_report.php','POST',reportInput,admin);
  check(firstReport.status===201,'disaster report recorded');
  sql(`INSERT INTO damage_assessments(report_id,house_damage,remarks,assessed_by) VALUES(${firstReport.body.report_id},'None','Earlier assessment evidence',1)`);
  const legacyReport=(await call('disasters/get_reports.php','GET',undefined,admin)).body.data.find(r=>Number(r.report_id)===Number(firstReport.body.report_id));
  check(Number(legacyReport.has_legacy_assessment)===1 && Number(legacyReport.has_assessment)===0,'legacy report evidence does not imply completed household visit');
  check((await call('disasters/create_report.php','POST',{...reportInput,household_id:ids[2]},admin)).status===201,'second report recorded');
  sql(`INSERT INTO relief_items(item_name,quantity,unit) VALUES('Scoring supplies',100,'pcs');
    INSERT INTO relief_allocations(household_id,item_id,quantity,status,allocation_date,dss_score,dss_category,dss_model_version) VALUES(${ids[0]},1,1,'Distributed',CURDATE(),93,'Critical Priority','weighted-v1 historical');
    INSERT INTO relief_allocations(household_id,item_id,quantity,status,allocation_date) VALUES(${ids[0]},1,2,'Pending',CURDATE());`);
  check((await call('relief/approve_allocation.php','POST',{allocation_id:2},admin)).status===410,'administrator approval replaced by the allocation workflow');
  let allocations=(await call('relief/get_allocations.php','GET',undefined,admin)).body.data;
  check(Number(allocations.find(a=>Number(a.allocation_id)===1).dss_score)===93,'historical distribution score preserved');
  const recommendations=await call('dashboard/relief_recommendations.php','GET',undefined,admin);
  check(recommendations.status===200 && recommendations.body.assess_first.some(h=>h.household_id===ids[2]),'a household that is not Ready is listed to assess first');
  check((await call('relief/approve_recommendation.php','POST',{household_id:ids[2],item_id:1,quantity:1,priority_score:100,priority_level:'Critical Priority'},admin)).status===410,'recommendation approval replaced by the allocation workflow');
  const staff = { full_name:'Visit Officer',email:'visit@example.test',password:fixture.password,role:'field_officer',assigned_purok:'Purok 4' };
  const fieldCreated=await call('users/add_user.php','POST',staff,admin);
  const otherCreated=await call('users/add_user.php','POST',{...staff,full_name:'Other Visit Officer',email:'other-visit@example.test'},admin);
  const officer=(await call('auth/login.php','POST',{email:staff.email,password:fixture.password})).cookie;
  const other=(await call('auth/login.php','POST',{email:'other-visit@example.test',password:fixture.password})).cookie;
  const assigned=await call('disasters/assign_household_assessment.php','POST',{household_id:ids[0],assigned_field_officer_id:fieldCreated.body.user_id,version:0},admin);
  check(assigned.status===200 && assigned.body.data.status==='assigned','admin assigns actual household visit');
  const submission={household_id:ids[0],version:assigned.body.data.version,field_visit_date:reportInput.report_date,damage_classification:'No Damage',infrastructure_damage:'None',property_damage:'None',agricultural_damage:'None',estimated_severity:'Low',findings:'Visited the home. No visible household damage.',remarks:''};
  check((await call('disasters/submit_household_assessment.php','POST',submission)).status===401,'unauthenticated assessment denied');
  for(const [label,cookie] of [['administrator',admin],['relief',relief],['unassigned field officer',other]]) check((await call('disasters/submit_household_assessment.php','POST',submission,cookie)).status===403,label+' cannot submit this household visit');
  const photo=new FormData();photo.set('household_id',String(ids[0]));photo.set('photo',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64')],{type:'image/png'}),'visit.png');
  const upload=await fetch(base+'disasters/household_assessment_photos.php',{method:'POST',headers:{Cookie:officer},body:photo});const uploaded=await upload.json();
  check(upload.status===200 && uploaded.data.photo_id>0,'assigned officer stores actual protected photo evidence');
  const photoUrl=base+'disasters/download_household_assessment_photo.php?id='+uploaded.data.photo_id;
  check((await fetch(photoUrl)).status===401,'assessment photo requires authenticated session');
  check((await fetch(photoUrl,{headers:{Cookie:other}})).status===403,'unassigned officer cannot download evidence');
  const content=await fetch(photoUrl,{headers:{Cookie:officer}});
  check(content.status===200 && content.headers.get('content-type')==='image/png' && (await content.arrayBuffer()).byteLength>0,'assigned officer receives protected photo bytes');
  check((await fetch(photoUrl,{headers:{Cookie:admin}})).status===200,'administrator can review retained photo evidence');
  const submitted=await call('disasters/submit_household_assessment.php','POST',{...submission,assigned_field_officer_id:otherCreated.body.user_id,assessed_by:otherCreated.body.user_id},officer);
  check(submitted.status===200 && Number(submitted.body.data.assessment.updated_by)===Number(fieldCreated.body.user_id),'assigned officer identity comes from session despite forged actor');
  const afterVisit=(await list()).find(h=>h.household_id===ids[0]);
  check(afterVisit.assessment_status==='No Damage — Assessed' && afterVisit.field_visit_date===reportInput.report_date && afterVisit.final_score===80 && afterVisit.score_breakdown.damage===0 && afterVisit.priority_level==='High Priority','assessed No Damage scores 0 damage points and differs from Not Yet Assessed');
  const currentReport=(await call('disasters/get_reports.php','GET',undefined,admin)).body.data.find(r=>Number(r.report_id)===Number(firstReport.body.report_id));
  check(Number(currentReport.has_assessment)===1 && currentReport.damage_classification==='No Damage' && currentReport.field_visit_date===reportInput.report_date,'hazard/report fields use the actual field visit');
  check((await call('disasters/get_damage_assessment.php?report_id='+firstReport.body.report_id,'GET',undefined,admin)).body.data.remarks==='Earlier assessment evidence','new visit preserves earlier report assessment evidence');
  check((await call('disasters/submit_household_assessment.php','POST',submission,officer)).status===409,'submitted visit is locked');
  const lockedPhoto=new FormData();lockedPhoto.set('household_id',String(ids[0]));lockedPhoto.set('photo',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==','base64')],{type:'image/png'}),'late.png');
  check((await fetch(base+'disasters/household_assessment_photos.php',{method:'POST',headers:{Cookie:officer},body:lockedPhoto})).status===409,'no photos added after submission');
  const members=(await call('households/members/get_members.php?household_id='+ids[0],'GET',undefined,admin)).body.data;
  check((await call('households/members/delete_member.php','DELETE',{member_id:members.at(-1).member_id},admin)).status===200,'membership mutation saved');
  all=await list();check(all.find(h=>h.household_id===ids[0]).priority_score===null,'membership edit invalidates current verified score');
  sql(`UPDATE households SET latitude=13.1564170,longitude=123.7166138 WHERE household_id=${ids[3]}`); // map point now in Purok 4; record still Purok 7
  check((await list()).find(h=>h.household_id===ids[3]).score_breakdown.flood_zone===20,'recorded Purok decides even when the map point lies in a flood-prone Purok');
  sql(`UPDATE households SET purok='Purok 4' WHERE household_id=${ids[1]}`);
  const moved=(await list()).find(h=>h.household_id===ids[1]);
  check(moved.score_breakdown.flood_zone===40 && moved.automatic_subtotal===70 && moved.priority_level==='Pending Assessment','changing the recorded Purok to 1–4 rescores automatically');
  sql(`UPDATE households SET purok='Riverside' WHERE household_id=${ids[3]}`);
  const unknown=(await list()).find(h=>h.household_id===ids[3]);
  check(unknown.score_breakdown.flood_zone===null && unknown.priority_score===null && unknown.needs_review,'unrecognised Purok is flagged, never scored as outside');
  for(const migration of ['migration_phase29_household_assessments.sql','migration_phase30_verified_household_members.sql','migration_phase31_verified_flood_scoring.sql','migration_phase32_relief_allocation_workflow.sql'])execFileSync(php,['-r',"$p=new PDO('mysql:host=127.0.0.1;dbname='.$argv[1],getenv('DB_USER')?:'root',getenv('DB_PASS')?:'');$p->exec(file_get_contents($argv[2]));",fixture.database,'database/'+migration]);
  check((await call('relief/get_allocations.php','GET',undefined,admin)).body.data.find(a=>Number(a.allocation_id)===1).dss_model_version==='weighted-v1 historical','repeatable migrations preserve historical model');
  mkdirSync('tests/.user-management-local',{recursive:true});writeFileSync('tests/.user-management-local/scoring_fixture.json',JSON.stringify({...fixture,ids}));
  console.log(`PASS: ${checks} integrated automatic scoring checks (${fixture.database})`);
}finally{server.kill();}
