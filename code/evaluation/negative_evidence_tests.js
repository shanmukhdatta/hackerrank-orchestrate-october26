"use strict";
// Regression fixtures are independent of the provided 32 canonical sample answers.
const assert=require("node:assert/strict");
const {runtimeAudit}=require("../main.js");

const h="case_id,email,requested_at,reported_status,reported_at,audit_at,request_text\n";
const ids="user_id,name,email,phone,email_hash,updated_at\n";
const snap=[
"CREATE TABLE customer_profiles_primary (resource_id TEXT, user_id TEXT, full_name TEXT, email TEXT, phone TEXT, account_status TEXT, updated_at TEXT);",
"CREATE TABLE customer_profiles_failover_replica (resource_id TEXT, user_id TEXT, full_name TEXT, email TEXT, phone TEXT, account_status TEXT, updated_at TEXT);",
"INSERT INTO \"customer_profiles_primary\" VALUES('account_005','user_5','Decoy','decoy@invalid.test','','ACTIVE','2026-09-02T22:45:00Z');",
"INSERT INTO \"customer_profiles_failover_replica\" VALUES('account_005','user_5','Decoy','decoy@invalid.test','','ACTIVE','2026-09-02T22:45:00Z');"
].join("\n");
function fixtures({event="DELETE_RECORD",result="PARTIAL",addAnonymous=false,
                   duplicateRequest=false,capture="2026-09-02T23:00:00Z",source="account_001"}={}){
  const date="2026-08-27T08:54:00Z",when="2026-08-27T08:47:41Z",audit="2026-09-07T10:20:00Z";
  const requestRow=(id,email)=>id+","+email+",2026-08-25T12:00:00Z,PARTIALLY_COMPLETE,"+date+","+audit+",Please delete my account.\n";
  const manifest=[
    "evidence_01,evidence/databases/test.sql,test,"+capture,
    ...(addAnonymous?["evidence_02,evidence/records/analytics.json,test,2026-09-07T09:45:00Z"]:[])
  ];
  const activities=[
    "activity_1,"+when+","+event+",deletion_worker,"+(event==="ANONYMIZE_RECORD"?"analytics_platform":"account_service")+","+source+","+result+",Operation reported "+result+"."
  ];
  const f={
    "dataset/deletion_requests.csv":h+requestRow("case_999","customer@example.org")+(duplicateRequest?requestRow("case_998","other@example.org"):""),
    "dataset/sample_deletion_requests.csv":h,
    "dataset/sample_output.csv":"case_id,deletion_status,steps_json\n",
    "dataset/user_identities.csv":ids+"user_1,Customer,customer@example.org,,,2026-08-01T00:00:00Z\n"+(duplicateRequest?"user_2,Other,other@example.org,,,2026-08-01T00:00:00Z\n":""),
    "dataset/user_audit_log.csv":"audit_id,user_id,event_time,field_name,old_value,new_value\n",
    "dataset/system_activity.csv":"activity_id,event_time,event_type,source_system,target_system,resource_id,reported_result,details\n"+activities.join("\n")+"\n",
    "dataset/evidence_files.csv":"file_id,file_path,origin,captured_at\n"+manifest.join("\n")+"\n",
    "dataset/deletion_rules.csv":"rule_id,data_category,condition,required_action\nrule_01,USER_PROFILE,Always,DELETE\nrule_07,ANALYTICS_PROFILE,Identifiable,ANONYMIZE\n",
    "dataset/evidence/databases/test.sql":snap
  };
  if(addAnonymous)f["dataset/evidence/records/analytics.json"]=JSON.stringify({captured_at:"2026-09-07T09:45:00Z",records:[{
    resource_id:source, user_id:null,email:null,phone:null,email_hash:null,record_type:"ANALYTICS_PROFILE",metrics:{sessions:11}
  }]});
  return f;
}
const read=async f=>{const result=await runtimeAudit(async p=>{if(!(p in f))throw Error("missing "+p);return f[p]});return result.csv;};
const row=(csv,id)=>{
  const line=csv.split("\n").find(s=>s.startsWith(id+","));
  if(!line)throw Error("missing output "+id);
  const [,caseId,status,raw]=/^([^,]+),([^,]+),"(.*)"$/.exec(line);
  return {status,steps:JSON.parse(raw.replace(/""/g,'"'))};
};
(async()=>{
  const verify=async(name, f, status, operations)=>{
    const output=row(await read(f),"case_999");
    assert.equal(output.status,status,name);
    assert.deepEqual(output.steps.map(x=>x.operation),operations,name);
    return name;
  };
  const checks=[];
  checks.push(await verify("partial deletion claim overridden by snapshot absence",
    fixtures(), "COMPLETE", ["VERIFY_RECORD_ABSENT"]));
  checks.push(await verify("negative evidence cannot use a future snapshot",
    fixtures({capture:"2026-09-08T09:00:00Z"}),"INCOMPLETE",[]));
  checks.push(await verify("not in SQL table without operation relationship is not absence proof",
    fixtures({event:"OTHER_EVENT"}),"INCOMPLETE",[]));
  checks.push(await verify("anonymous record proved by independent JSON after uniquely associated event",
    fixtures({event:"ANONYMIZE_RECORD",source:"analytics_901",addAnonymous:true}),
    "COMPLETE",["VERIFY_RECORD_ABSENT","VERIFY_RECORD_ANONYMIZED"]));
  const duplicate=fixtures({event:"ANONYMIZE_RECORD",source:"analytics_901",addAnonymous:true,duplicateRequest:true});
  const dup=row(await read(duplicate),"case_999");
  assert.equal(dup.status,"INCOMPLETE","ambiguous temporal association must not assign anonymized data");
  checks.push("duplicate reported timestamps cannot own anonymous records");
  console.log(JSON.stringify({pass:checks.length,checks},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
