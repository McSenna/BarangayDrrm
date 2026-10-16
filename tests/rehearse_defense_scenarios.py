"""Runs every defense scenario on a REHEARSAL copy loaded with defensedata_typhoon_flood.sql
and prints the values the application shows. Usage:
  python3 tests/rehearse_defense_scenarios.py <backend_url> <db_name_containing_rehearsal> <admin_email> <admin_password>
It changes data. TextBee must be OFF."""
import requests, subprocess, json, sys
if len(sys.argv)!=5 or "rehearsal" not in sys.argv[2]: sys.exit(__doc__)
B=sys.argv[1].rstrip("/")+"/"; DB=sys.argv[2]; PW="BinitayanTest2026!"; ADMIN=(sys.argv[3], sys.argv[4])
def sql(q): return subprocess.run(["mysql","-N","-B",DB,"-e",q],capture_output=True,text=True).stdout.strip()
def login(e,p=PW):
    s=requests.Session(); r=s.post(B+"auth/login.php",json={"email":e,"password":p}).json(); return s,r
def J(r):
    try: return r.json()
    except: return {"raw":r.text[:200],"code":r.status_code}
def stock(): return sql("SELECT CONCAT(REPLACE(item_name,' [DEFENSE TEST]',''),'=',quantity) FROM relief_items ORDER BY item_id").replace("\n",", ")
A,_=login(*ADMIN); P,_=login("personnel.binitayan.test@gmail.com")
def pri():
    out=[]
    for i,p in enumerate(A.get(B+"dashboard/priority_list.php").json()["data"],1):
        r=p.get("ratings") or {}; out.append(f"{i}. {p['head_of_family']} {p['priority_score']} {p['priority_level']} rank={p['rank']} S{r.get('disaster_severity')} D{r.get('damage_unmet_needs')} V{r.get('vulnerable_members')} H{r.get('household_size')} C{r.get('assessment_confidence')} covered={(p.get('unmet_needs') or {}).get('coverage_percent')}% review={p.get('needs_review')}")
    return out
def score(name): return [p for p in A.get(B+"dashboard/priority_list.php").json()["data"] if p["head_of_family"]==name][0]
def req_detail(rid):
    d=A.get(B+"requests/get_request_detail.php",params={"request_id":rid}).json()["data"]
    return d["request"]["status"], [(i["item_name"].replace(" [DEFENSE TEST]",""), i["requested_quantity"], i["approved_quantity"], i["dss_needs_estimate"], i["dss_needs_rule"], i["dss_recommended_quantity"], i["current_stock"], i["committed_stock"], i["available_stock"], i["shortage"], i.get("dss_recommendation_note")) for i in d["items"]], d
print("== START"); print("stock:",stock()); print("\n".join(pri()))
# Resident H06
R6,r=login("binitayan.test06@gmail.com"); print("\n== S1 resident H06 login:",r.get("success"), r.get("user",{}).get("role"))
hh=R6.get(B+"households/get_households.php").json()["data"]; print("H06 sees households:",len(hh), hh[0]["head_of_family"], hh[0]["number_of_members"], "vuln", hh[0]["vulnerable_members"])
mem=R6.get(B+"households/members/get_members.php",params={"household_id":hh[0]["household_id"]}); print("members endpoint:", J(mem).get("success"), len(J(mem).get("data",[])))
print("H06 allocation status:", [(a["item_name"].replace(" [DEFENSE TEST]",""), a["display_status"]) for a in R6.get(B+"relief/get_allocations.php").json()["data"]])
r=R6.post(B+"disasters/create_report.php",json={"household_id":int(hh[0]["household_id"]),"disaster_type":"Flood","severity":"Medium","location":"Purok 5B","report_date":"2026-09-30"})
print("Phase 21 - resident tries to submit a report through the API:",r.status_code,J(r).get("message"))
H06=int(hh[0]["household_id"])
r=P.post(B+"disasters/create_report.php",json={"household_id":H06,"disaster_type":"Flood","severity":"Medium","location":"Purok 5B, interior lot","report_date":"2026-09-30","report_time":"08:00","description":"Floodwater entered the house again after continuous rain. Same damage as the first report."})
print("\n== S2 Relief Personnel records a report for H06:",J(r)); newrep=J(r).get("report_id")
print("row:", sql(f"SELECT report_id,user_id,household_id,disaster_type,severity,status,verified_by,created_at FROM disaster_reports WHERE report_id={newrep}"))
print("H06 score after new pending Medium report:", score("Wilfredo Ocampo")["priority_score"])
print("admin list sees it:", any(str(x["report_id"])==str(newrep) for x in A.get(B+"disasters/get_reports.php").json()["data"]))
print("notifications for admin:", sql("SELECT COUNT(*) FROM notifications"))
# H06 creates request
items={n:int(i) for i,n in [l.split("\t") for l in sql("SELECT item_id, REPLACE(item_name,' [DEFENSE TEST]','') FROM relief_items").splitlines()]}
r=R6.post(B+"requests/create_request.php",json={"household_id":H06,"urgency":"High","reason":"x"*20,"items":[{"item_id":items["Blanket"],"quantity":1}]}); print("Phase 21 - resident tries to submit a request:",r.status_code,J(r).get("message"))
r=A.post(B+"requests/create_request.php",json={"household_id":H06,"urgency":"High","reason":"Our kitchen roof was broken and the water pump is not working. We need food, drinking water and blankets for 7 members.","report_id":int(sql("SELECT report_id FROM disaster_reports WHERE household_id=(SELECT household_id FROM households WHERE head_of_family='Wilfredo Ocampo') AND status='Verified'")),"items":[{"item_id":items["Family Food Pack"],"quantity":4},{"item_id":items["Bottled Water"],"quantity":21},{"item_id":items["Blanket"],"quantity":3}]})
print("\n== S3 Administrator records a relief request for H06:",J(r)); req6=J(r).get("request_id")
# H08 tries a second request
R8,_=login("binitayan.test08@gmail.com")
r=A.post(B+"requests/create_request.php",json={"household_id":int(sql("SELECT household_id FROM households WHERE head_of_family='Ernesto Dimaculangan'")),"urgency":"High","reason":"We still need more rice for the family.","items":[{"item_id":items["Rice"],"quantity":2}]}); print("H08 second request:",r.status_code,J(r).get("message"))
print("H08 resident household count:", len(R8.get(B+"households/get_households.php").json()["data"]), "priority 403:", R8.get(B+"dashboard/priority_list.php").status_code)
print("H08 resident disaster reports API:", R8.get(B+"disasters/get_reports.php").status_code)
# dashboard
st=J(A.get(B+"dashboard/statistics.php")); print("\n== S4 dashboard keys:", list(st.get("data",st).keys())[:40])
print(json.dumps(st.get("data",st))[:1500])
# reject H06 new report
r=A.post(B+"disasters/reject_report.php",json={"report_id":newrep,"remarks":"Duplicate of report already verified for this household."}); print("\n== S5 reject:",J(r))
print("H06 score after reject:", score("Wilfredo Ocampo")["priority_score"])
# verify H08
rid8=int(sql("SELECT report_id FROM disaster_reports WHERE household_id=(SELECT household_id FROM households WHERE head_of_family='Ernesto Dimaculangan')"))
print("\n== S6 H08 before verify:", score("Ernesto Dimaculangan")["priority_score"])
r=A.post(B+"disasters/verify_report.php",json={"report_id":rid8,"remarks":"Verified by the BDRRM team: river overflow and chest-level flood confirmed."}); print("verify:",J(r))
s8=score("Ernesto Dimaculangan"); print("H08 after verify:", s8["priority_score"], s8["priority_level"], s8["score_breakdown"])
print("assessment H08:", sql(f"SELECT house_damage,infrastructure_damage,property_damage,agricultural_damage,estimated_severity FROM damage_assessments WHERE report_id={rid8}"))
print("\n== S8 ranking after verify"); print("\n".join(pri()))
rec=A.get(B+"dashboard/relief_recommendations.php").json()["data"]
print("\n== S9 recommendations")
for h in rec: print(h["head_of_family"],h["priority_score"],h["priority_level"],"total_shortage",h["total_shortage"],[(x["item_name"].replace(" [DEFENSE TEST]",""),x["requested_quantity"],x["recommended_quantity"],x["available_stock"],x["shortage"]) for x in h["recommendations"]])
print("\n== S10 inventory:", sql("SELECT CONCAT(REPLACE(item_name,' [DEFENSE TEST]',''),' stock=',quantity,' min=',minimum_level,' reserved=',(SELECT COALESCE(SUM(quantity),0) FROM relief_allocations a WHERE a.item_id=i.item_id AND a.status='Approved')) FROM relief_items i").replace("\n"," | "))
req8=int(sql("SELECT request_id FROM relief_requests WHERE household_id=(SELECT household_id FROM households WHERE head_of_family='Ernesto Dimaculangan')"))
s,its,d=req_detail(req8); print("\n== S11 H08 request",req8,s); [print("  ",x) for x in its]
print("start review:",J(A.post(B+"requests/start_review.php",json={"request_id":req8})).get("success"))
li={x[0]:i["request_item_id"] for x,i in zip(its,d["items"])}
def decide(w,f,h): return J(A.post(B+"requests/decide_request.php",json={"request_id":req8,"decision":"approve","remarks":"Approved for the defense demo.","items":[{"request_item_id":li["Bottled Water"],"approved_quantity":w},{"request_item_id":li["Family Food Pack"],"approved_quantity":f},{"request_item_id":li["Hygiene Kit"],"approved_quantity":h}]}))
print("decide 24/4/5:",decide(24,4,5)); r=A.post(B+"requests/process_request.php",json={"request_id":req8}); print("process ->",r.status_code,J(r).get("message"))
print("decide 24/4/2:",decide(24,4,2)); r=A.post(B+"requests/process_request.php",json={"request_id":req8}); print("process ->",r.status_code,J(r).get("message"))
print("stock after allocation:",stock()); s,its,_=req_detail(req8); print("H08 now",s); [print("  ",x) for x in its]
s8=score("Ernesto Dimaculangan"); print("H08 score:",s8["priority_score"],s8["priority_level"])
s,its,_=req_detail(req6); print("\n== S12 H06 request",req6,s); [print("  ",x) for x in its]
# personnel distribute H04
allocs=P.get(B+"relief/get_allocations.php").json()["data"]; print("\n== S13 personnel approved allocations:",len([a for a in allocs if a["status"]=="Approved"]), sorted({a["head_of_family"] for a in allocs if a["status"]=="Approved"}) if "head_of_family" in allocs[0] else "")
h04=sql("SELECT household_id FROM households WHERE head_of_family='Jerome Pascual'")
a04=[a for a in allocs if str(a["household_id"])==h04 and a["status"]=="Approved"]
print("before:",stock()); 
for a in a04: print("distribute",a["allocation_id"],J(P.post(B+"relief/distribute.php",json={"allocation_id":int(a["allocation_id"])})).get("message"))
print("after:",stock()); print("logs:",sql("SELECT CONCAT(log_type,' ',quantity_change,' -> ',resulting_quantity,' | ',reference) FROM inventory_logs WHERE log_type='Stock Out'").replace("\n"," || "))
r=P.post(B+"relief/distribute.php",json={"allocation_id":int(a04[0]["allocation_id"])}); print("second click:",r.status_code,J(r).get("message"))
print("H04 request status:", sql(f"SELECT status FROM relief_requests WHERE household_id={h04}"), "score:", score("Jerome Pascual")["priority_score"], score("Jerome Pascual")["priority_level"])
# Phase 21: Ready for Distribution for H08 (verified schedule + location) -> automated SMS
h08=sql("SELECT household_id FROM households WHERE head_of_family='Ernesto Dimaculangan'")
a08=[int(a["allocation_id"]) for a in P.get(B+"relief/get_allocations.php").json()["data"] if str(a["household_id"])==h08 and a["status"]=="Approved"]
import datetime; tmr=(datetime.date.today()+datetime.timedelta(days=1)).isoformat()
r=P.post(B+"relief/mark_ready.php",json={"allocation_ids":a08,"distribution_date":tmr,"distribution_time":"09:00","location":"Binitayan Evacuation Center","instructions":"Bring a valid ID. The household head or an authorized member should claim.","confirmed":True})
print("\n== S13b Mark Ready for Distribution (H08):",r.status_code,J(r).get("message"))
print("SMS row:", sql("SELECT CONCAT(category,' | ',event_type,' | ',status,' | ',message) FROM sms_logs WHERE event_type='ALLOCATION_READY_FOR_DISTRIBUTION'"))
print("H08 resident sees:", [(a["item_name"].replace(" [DEFENSE TEST]",""), a["display_status"], a["ready_schedule_date"], a["ready_schedule_time"], a["ready_location"]) for a in R8.get(B+"relief/get_allocations.php").json()["data"]])
print("stock unchanged by Ready:",stock()); s8=score("Ernesto Dimaculangan"); print("H08 score unchanged:",s8["priority_score"],s8["priority_level"])
r=P.post(B+"relief/mark_ready.php",json={"allocation_ids":a08,"distribution_date":tmr,"location":"Binitayan Evacuation Center","confirmed":True}); print("second Mark Ready:",r.status_code,J(r).get("message"))
# schedule
sch=P.get(B+"relief/schedules/get_schedules.php").json()["data"][0]; print("\n== S14 schedule:",sch["schedule_id"],sch["distribution_date"],sch["distribution_time"],sch["location"],sch["latitude"],sch["longitude"],sch.get("package_name"))
det=P.get(B+"relief/schedules/get_schedule_detail.php",params={"schedule_id":sch["schedule_id"]}).json()["data"]
print("package items:", [(x.get("item_name","").replace(" [DEFENSE TEST]",""),x.get("quantity")) for x in det.get("package_items",det.get("items",[]))])
b5=[b for b in det["beneficiaries"] if b["head_of_family"]=="Corazon Villanueva"][0]["beneficiary_id"]
for stt in ["Prepared","Dispatched"]: print(stt, J(P.post(B+"relief/schedules/update_beneficiary_status.php",json={"beneficiary_id":b5,"status":stt})).get("message"))
r=P.post(B+"relief/schedules/update_beneficiary_status.php",json={"beneficiary_id":b5,"status":"Delivered","recipient_name":"Corazon Villanueva"}); print("Delivered before verify:",r.status_code,J(r).get("message"))
print("verify:",J(P.post(B+"relief/schedules/verify_beneficiary.php",json={"beneficiary_id":b5})).get("message"))
before=stock(); r=P.post(B+"relief/schedules/update_beneficiary_status.php",json={"beneficiary_id":b5,"status":"Delivered","recipient_name":"Corazon Villanueva","remarks":"Received by the household head at the evacuation center."}); print("Delivered:",J(r).get("message"))
print("stock",before,"->",stock()); print("H05:",score("Corazon Villanueva")["priority_score"],score("Corazon Villanueva")["priority_level"],"needs covered", score("Corazon Villanueva")["unmet_needs"]["coverage_percent"], "%")
# map / boundary
hh=A.get(B+"households/get_households.php").json()["data"]; h=[x for x in hh if x["head_of_family"]=="Jerome Pascual"][0]
bad=dict(h); bad.update({"household_id":h["household_id"],"latitude":13.30,"longitude":123.90})
r=A.post(B+"households/update_household.php",json=bad); print("\n== S15 outside coords:",r.status_code,J(r).get("message"))
print("coords unchanged:", sql(f"SELECT CONCAT(latitude,',',longitude) FROM households WHERE household_id={h['household_id']}"))
# evacuation
c=A.get(B+"evacuation/get_centers.php").json()["data"][0]; print("\n== S16 center:",c["name"],c["status"],c["current_occupancy"],"/",c["capacity"],c["facilities"])
r=A.post(B+"evacuation/update_occupancy.php",json={"center_id":c["center_id"],"current_occupancy":50,"remarks":"More families arrived from Purok 7."}); print("occ 50:",J(r).get("message"), A.get(B+"evacuation/get_centers.php").json()["data"][0]["status"])
r=A.post(B+"evacuation/update_occupancy.php",json={"center_id":c["center_id"],"current_occupancy":51}); print("occ 51:",r.status_code,J(r).get("message"))
r=A.post(B+"evacuation/update_occupancy.php",json={"center_id":c["center_id"],"current_occupancy":40,"remarks":"Some families went home."}); print("occ 40:",J(r).get("message"), A.get(B+"evacuation/get_centers.php").json()["data"][0]["status"])
print("history:", sql(f"SELECT CONCAT(IFNULL(previous_occupancy,'-'),'->',new_occupancy,' ',IFNULL(previous_status,'-'),'->',new_status,' ',IFNULL(remarks,'')) FROM evacuation_center_logs WHERE center_id={c['center_id']} ORDER BY log_id").replace("\n"," || "))
# hazard
print("\n== S17 alerts:", [(a["hazard_type"],a["status"],a["affected_purok"],a["is_active"],a["title"]) for a in A.get(B+"hazards/alerts/get_alerts.php").json()["data"]])
print("H02 before:", score("Gloria Mendoza")["priority_score"])
r=A.post(B+"hazards/alerts/add_alert.php",json={"hazard_type":"Flood","status":"Alert","title":"Rising water along the Purok 2 canal","description":"Water level in the Purok 2 canal is rising. Stay alert.","affected_purok":"Purok 2"}); print("add alert:",J(r)); aid=J(r).get("alert_id")
print("H02 with active Purok 2 alert:", score("Gloria Mendoza")["priority_score"], score("Gloria Mendoza")["priority_level"], "sms rows:", sql("SELECT COUNT(*) FROM sms_logs"))
print("resolve:",J(A.post(B+"hazards/alerts/update_status.php",json={"alert_id":aid,"resolve":True})).get("message")); print("H02 after resolve:", score("Gloria Mendoza")["priority_score"])
# SMS
r=A.post(B+"sms/send.php",json={"recipient_mode":"household","household_ids":[int(sql("SELECT household_id FROM households WHERE head_of_family='Ernesto Dimaculangan'"))],"category":"Relief Distribution Announcement","message":"Your approved relief is ready. Please proceed to the Binitayan evacuation center tomorrow at 9:00 AM."}); print("\n== S18 manual sms:",r.status_code,J(r).get("message"))
print("sms_logs:", sql("SELECT CONCAT(category,' | ',recipient_type,' | ',IFNULL(recipient_name,''),' | ',status,' | ',LEFT(message,110)) FROM sms_logs ORDER BY sms_id").replace("\n","\n   "))
print("notifications:", sql("SELECT CONCAT(u.full_name,': ',n.title) FROM notifications n JOIN users u ON u.user_id=n.user_id ORDER BY notification_id").replace("\n"," || "))
print("audit:", sql("SELECT COUNT(*) FROM audit_logs"), sql("SELECT action FROM audit_logs ORDER BY log_id").replace("\n"," | "))
print("\n== FINAL ranking"); print("\n".join(pri()))
an=J(A.get(B+"reports/dashboard_analytics.php")); print("analytics ok:",an.get("success"))
