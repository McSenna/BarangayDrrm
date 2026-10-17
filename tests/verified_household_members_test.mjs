import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const php = 'C:/xampp/php/php.exe';
const fixture = JSON.parse(execFileSync(php,['tests/user_management_fixture.php'],{encoding:'utf8'}));
const sql = query => execFileSync(php,['-r',"$p=new PDO('mysql:host=127.0.0.1;dbname='.$argv[1],'root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);$p->exec($argv[2]);",fixture.database,query]);
sql(readFileSync('database/migration_phase30_verified_household_members.sql','utf8'));
const server = spawn(php,['-S','127.0.0.1:8116','-t','.'],{env:{...process.env,DB_HOST:'127.0.0.1',DB_NAME:fixture.database},stdio:'ignore'});
async function call(path,method='GET',data,cookie) {
 const r=await fetch('http://127.0.0.1:8116/backend/'+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:data?JSON.stringify(data):undefined});
 return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
try {
 for(let n=0;n<40;n++){try{await call('auth/session.php');break;}catch{await new Promise(r=>setTimeout(r,100));}}
 const login=async email=>(await call('auth/login.php','POST',{email,password:fixture.password})).cookie;
 const admin=await login('admin@example.test'), resident=await login('resident@example.test');
 const route='households/members/';
 const verify=()=>call(route+'verify_roster.php','POST',{household_id:1,confirm_complete:true},admin);
 assert.equal((await verify()).status,400);
 const person={household_id:1,full_name:'Test household',relationship:'Head',age:65,is_pwd:1,is_pregnant:0,has_medical_needs:1,is_other_vulnerable:0,verify_vulnerability:true};
 const householdData={head_of_family:'Test household',purok:'Purok 3',address:'Test street',number_of_members:3,latitude:'',longitude:''};
 for(const path of ['add_household.php','update_household.php']) for(const badCounts of [{number_of_members:0},{number_of_members:-2},{number_of_members:1.5},{number_of_members:'2bad'},{children_count:-1},{pwd_count:1.5},{vulnerable_members:4}]) {
   const invalid=await call('households/'+path,path.startsWith('add')?'POST':'PUT',{...householdData,household_id:1,...badCounts},admin);assert.equal(invalid.status,400,JSON.stringify(invalid));
 }
 assert.equal((await call(route+'add_member.php','POST',person,resident)).status,403);
 for(const age of [-1,'bad',[],true,1.5]) assert.equal((await call(route+'add_member.php','POST',{...person,age},admin)).status,400);
 for(const id of [-1,'1bad',[],true]) assert.equal((await call(route+'add_member.php','POST',{...person,household_id:id},admin)).status,400);
 assert.equal((await call(route+'add_member.php','POST',{...person,is_pwd:'unknown'},admin)).status,400);
 assert.equal((await call(route+'add_member.php','POST',{...person,age:null},admin)).status,400);
 assert.equal((await call(route+'verify_roster.php','POST',{household_id:1,confirm_complete:true},resident)).status,403);
 let r=await call(route+'add_member.php','POST',person,admin); assert.equal(r.status,201,JSON.stringify(r)); const id=r.data.member_id;
 assert.equal((await call(route+'add_member.php','POST',{...person,full_name:' test   household '},admin)).status,400);
 r=await verify(); assert.equal(r.status,200,JSON.stringify(r)); assert.equal(r.data.profile.size,1); assert.equal(r.data.profile.vulnerable,1);
 r=await call('households/update_household.php','PUT',{...householdData,household_id:1,children_count:2,pwd_count:2,vulnerable_members:3},admin);assert.equal(r.status,200,JSON.stringify(r));
 const stored=JSON.parse(execFileSync(php,['-r',"$p=new PDO('mysql:host=127.0.0.1;dbname='.$argv[1],'root','');echo json_encode($p->query('SELECT number_of_members,vulnerable_members,children_count,pwd_count FROM households WHERE household_id=1')->fetch(PDO::FETCH_ASSOC));",fixture.database],{encoding:'utf8'}));
 assert.deepEqual(Object.values(stored).map(Number),[1,1,0,1]);
 r=await call(route+'get_members.php?household_id=1','GET',undefined,admin);assert.equal(r.data.profile.complete,true);
 r=await call(route+'update_member.php','PUT',{...person,member_id:id,is_pwd:0,has_medical_needs:0,age:30},admin); assert.equal(r.status,200);
 r=await call(route+'get_members.php?household_id=1','GET',undefined,admin); assert.equal(r.data.profile.size,null); assert.equal(r.data.profile.complete,false);
 r=await verify(); assert.equal(r.data.profile.vulnerable,0);
 r=await call(route+'add_member.php','POST',{household_id:1,full_name:'Unknown Person',relationship:'Child',age:5},admin); assert.equal(r.status,201);
 assert.equal((await verify()).status,400);
 assert.equal((await call(route+'delete_member.php','DELETE',{member_id:r.data.member_id},admin)).status,200);
 assert.equal((await verify()).status,200);
 // Changing the household head invalidates the attestation even though member rows have not changed.
 r=await call('households/update_household.php','PUT',{household_id:1,head_of_family:'Changed head',purok:'Purok 3',address:'Test street',number_of_members:1,latitude:'',longitude:''},admin);
 assert.equal(r.status,200,JSON.stringify(r));
 r=await call(route+'get_members.php?household_id=1','GET',undefined,admin);assert.equal(r.data.profile.roster_verified,false);
 assert.equal((await call(route+'delete_member.php','DELETE',{member_id:id},admin)).status,200);
 assert.equal((await verify()).status,400);
 console.log('Verified household member API tests passed in isolated '+fixture.database);
} finally {server.kill();sql(`DROP DATABASE \`${fixture.database}\``);}
