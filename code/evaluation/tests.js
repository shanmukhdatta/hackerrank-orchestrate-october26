"use strict";
const assert = require("node:assert/strict");
const { runtimeAudit } = require("../main.js");

const HEAD = "case_id,email,requested_at,reported_status,reported_at,audit_at,request_text\n";
const EVIDENCE_HEADER="file_id,file_path,origin,captured_at\n";
const IDS_HEAD="user_id,name,email,phone,email_hash,updated_at\n";
const RULES="rule_id,data_category,condition,required_action\nrule_01,USER_PROFILE,Always,DELETE\nrule_02,SEARCH_INDEX_ENTRY,Always,DELETE\nrule_03,SECURITY_AUDIT_LOG,Within retention,RETAIN\nrule_04,ANALYTICS_PROFILE,Identifiable,ANONYMIZE\nrule_05,ACCOUNT_TOMBSTONE,Stable ID only,REDACT\n";
async function scenario(label,email,requestText,records,expectedStatus,expectedOps,logEvidence=null,captureAt="2026-09-02T09:00:00Z") {
  const fixtures = {
    "dataset/deletion_requests.csv":HEAD+"case_999,"+email+",2026-09-01T10:00:00Z,COMPLETE,2026-09-01T11:00:00Z,2026-09-02T10:00:00Z,"+requestText+"\n",
    "dataset/sample_deletion_requests.csv":HEAD,
    "dataset/sample_output.csv":"case_id,deletion_status,steps_json\n",
    "dataset/user_identities.csv":IDS_HEAD+"user_1,Example User,"+email+",,,2026-08-01T00:00:00Z\n",
    "dataset/user_audit_log.csv":"audit_id,user_id,event_time,field_name,old_value,new_value\n",
    "dataset/system_activity.csv":"activity_id,event_time,event_type,source_system,target_system,resource_id,reported_result,details\n",
    "dataset/deletion_rules.csv":RULES,
    "dataset/evidence_files.csv":EVIDENCE_HEADER+`evidence_01,${logEvidence===null?"evidence/records/test.json":"evidence/logs/test.log"},test,${captureAt}\n`,
    ...(logEvidence===null?{"dataset/evidence/records/test.json":JSON.stringify({records})}:{"dataset/evidence/logs/test.log":logEvidence})
  };
  const result=await runtimeAudit(async p=>{if(!(p in fixtures)) throw Error(p);return fixtures[p]});
  const data=result.csv.trim().split("\n").slice(1).join("\n");
  // steps_json is the third CSV column and uses doubled quotes.
  const match=data.match(/^case_999,([^,]+),"(.*)"$/);
  assert.ok(match,label+": output row format");
  assert.equal(match[1],expectedStatus,label+": status");
  const steps=JSON.parse(match[2].replace(/""/g,'"'));
  assert.deepEqual(steps.map(x=>x.operation),expectedOps,label+": ordered operations");
  assert.deepEqual(steps.map(x=>x.step_no),steps.map((_,i)=>i+1),label+": consecutive numbering");
  return {label,status:match[1],steps:steps.length};
}
(async()=>{
  const absent={resource_id:"account_100",system:"account_service",record_type:"USER_PROFILE",result:"NOT_FOUND",subject_reference:"user_1",recorded_at:"2026-09-02T09:00:00Z"};
  const retained={resource_id:"audit_record_100",system:"security_service",record_type:"SECURITY_AUDIT_LOG",result:"FOUND",subject_reference:"user_1",recorded_at:"2026-09-02T09:00:00Z"};
  const tests=[];
  tests.push(await scenario("No erasure request","user1@example.org","Please email my order invoice.",[absent],"NOT_APPLICABLE",[]));
  tests.push(await scenario("Deletion verified","user1@example.org","Please delete my account.",[absent,retained],"COMPLETE",["VERIFY_RECORD_ABSENT","VERIFY_RECORD_PRESENT"]));
  tests.push(await scenario("Active sync blocks erasure","user1@example.org","Please delete my account.",[absent,retained,{resource_id:"data_flow_100",system:"integration_service",record_type:"DATA_FLOW",enabled:true,subject_reference:"user_1",recorded_at:"2026-09-02T09:00:00Z"}],"INCOMPLETE",["REPORT_ACTIVE_DATA_FLOW","DISABLE_DATA_FLOW","VERIFY_RECORD_ABSENT","VERIFY_RECORD_PRESENT","VERIFY_DATA_FLOW_DISABLED"]));
  tests.push(await scenario("Explicitly not requesting deletion","user1@example.org","I am not asking for deletion. Please stop promotional emails.",[absent],"NOT_APPLICABLE",[]));
  tests.push(await scenario("Do not close account","user1@example.org","Please do not close my account.",[absent],"NOT_APPLICABLE",[]));
  tests.push(await scenario("Correction only","user1@example.org","Correct my surname without removing any of my records.",[absent],"NOT_APPLICABLE",[]));
  tests.push(await scenario("Marketing unsubscribe only","user1@example.org","Please remove me from marketing lists only. I still need my account.",[absent],"NOT_APPLICABLE",[]));
  tests.push(await scenario("Deleted status still exposes personal data","user1@example.org","Please delete my account.",[{resource_id:"account_100",system:"account_service",record_type:"USER_PROFILE",account_status:"DELETED",email:"user1@example.org",subject_reference:"user_1",recorded_at:"2026-09-02T09:00:00Z"}],"INCOMPLETE",["REPORT_REMAINING_RECORD","DELETE_RECORD","VERIFY_RECORD_ABSENT"]));
  const anonymousLog="2026-09-02T09:00:00Z level=INFO service=analytics_platform event=analytics_profile_read_completed resource_id=analytics_100 lookup_key=user_1 customer_reference=null email=null phone=null email_hash=null audience_cohort=test\\n";
  tests.push(await scenario("Null-valued identifiers are not PII","user1@example.org","Please delete my account.",[],"COMPLETE",["VERIFY_RECORD_ANONYMIZED"],anonymousLog));
  const contactLog="2026-09-02T09:00:00Z level=DEBUG service=support_replica trace_id=test123 event=contact_query_started lookup_key=user1@example.org source=legacy_contact_index\\n2026-09-02T09:00:01Z level=INFO service=support_replica trace_id=test123 event=contact_query_completed resource_id=support_200 rows=1\\n";
  tests.push(await scenario("Legacy contact index must be deleted","user1@example.org","Please delete my account.",[],"INCOMPLETE",["REPORT_REMAINING_RECORD","DELETE_RECORD","VERIFY_RECORD_ABSENT"],contactLog));
  tests.push(await scenario("Compliant redacted tombstone","user1@example.org","Please delete my account.",[{resource_id:"tombstone_100",record_type:"ACCOUNT_TOMBSTONE",account_status:"DELETED",subject_reference:"user_1",email:null,name:null,phone:null,email_hash:null,recorded_at:"2026-09-02T09:00:00Z"}],"COMPLETE",["VERIFY_RECORD_REDACTED"]));
  tests.push(await scenario("Deleted tombstone still exposing email","user1@example.org","Please delete my account.",[{resource_id:"tombstone_100",record_type:"ACCOUNT_TOMBSTONE",account_status:"DELETED",subject_reference:"user_1",email:"user1@example.org",recorded_at:"2026-09-02T09:00:00Z"}],"INCOMPLETE",["REPORT_EXPOSED_PII","REDACT_RECORD","VERIFY_RECORD_REDACTED"]));
  tests.push(await scenario("Future-captured evidence unavailable at audit","user1@example.org","Please delete my account.",[{resource_id:"account_100",record_type:"USER_PROFILE",result:"NOT_FOUND",subject_reference:"user_1",recorded_at:"2026-09-02T09:00:00Z"}],"INCOMPLETE",[],null,"2026-09-03T09:00:00Z"));

  // Real-data regression class: historical email must resolve to the current user_id.
  {
    const email="old@example.org", user="user_1";
    const fixtures={
      "dataset/deletion_requests.csv":HEAD+"case_999,"+email+",2026-09-01T10:00:00Z,COMPLETE,2026-09-01T11:00:00Z,2026-09-02T10:00:00Z,Please delete my account.\n",
      "dataset/sample_deletion_requests.csv":HEAD,
      "dataset/sample_output.csv":"case_id,deletion_status,steps_json\n",
      "dataset/user_identities.csv":IDS_HEAD+"user_1,Example User,new@example.org,,,2026-08-01T00:00:00Z\n",
      "dataset/user_audit_log.csv":"audit_id,user_id,event_time,field_name,old_value,new_value\naudit_1,user_1,2026-08-01T00:00:00Z,email,old@example.org,new@example.org\n",
      "dataset/system_activity.csv":"activity_id,event_time,event_type,source_system,target_system,resource_id,reported_result,details\n",
      "dataset/deletion_rules.csv":RULES,
      "dataset/evidence_files.csv":EVIDENCE_HEADER+"evidence_01,evidence/records/test.json,test,2026-09-02T09:00:00Z\n",
      "dataset/evidence/records/test.json":JSON.stringify({records:[{resource_id:"account_100",record_type:"USER_PROFILE",result:"NOT_FOUND",subject_reference:user,recorded_at:"2026-09-02T09:00:00Z"}]})
    };
    const result=await runtimeAudit(async p=>fixtures[p]);
    assert.ok(result.csv.includes("case_999,COMPLETE"),"historical email resolves to a verified user");
    tests.push({label:"Historical email identity graph",status:"PASS"});
  }
  // Replica-only personal data must not disappear behind an absent primary readback.
  {
    const defs="CREATE TABLE customer_data_primary (resource_id TEXT, origin_system TEXT, collection_name TEXT, record_json TEXT, updated_at TEXT);"+
      "CREATE TABLE customer_data_read_replica (resource_id TEXT, origin_system TEXT, collection_name TEXT, record_json TEXT, updated_at TEXT);";
    const sqlRow=(table,result)=>"INSERT INTO "+table+" VALUES('account_100','account_service','customer_profiles','"+
      JSON.stringify({resource_id:"account_100",record_type:"USER_PROFILE",result,subject_reference:"user_1"})+
      "','2026-09-02T09:00:00Z');";
    const fixtures={
      "dataset/deletion_requests.csv":HEAD+"case_999,user1@example.org,2026-09-01T10:00:00Z,COMPLETE,2026-09-01T11:00:00Z,2026-09-02T10:00:00Z,Please delete my account.\n",
      "dataset/sample_deletion_requests.csv":HEAD,
      "dataset/sample_output.csv":"case_id,deletion_status,steps_json\n",
      "dataset/user_identities.csv":IDS_HEAD+"user_1,Example User,user1@example.org,,,2026-08-01T00:00:00Z\n",
      "dataset/user_audit_log.csv":"audit_id,user_id,event_time,field_name,old_value,new_value\n",
      "dataset/system_activity.csv":"activity_id,event_time,event_type,source_system,target_system,resource_id,reported_result,details\n",
      "dataset/deletion_rules.csv":RULES,
      "dataset/evidence_files.csv":EVIDENCE_HEADER+"evidence_01,evidence/databases/test.sql,test,2026-09-02T09:00:00Z\n",
      "dataset/evidence/databases/test.sql":defs+sqlRow("customer_data_primary","NOT_FOUND")+sqlRow("customer_data_read_replica","FOUND")
    };
    const result=await runtimeAudit(async p=>fixtures[p]);
    assert.ok(result.csv.includes("case_999,INCOMPLETE"),"present read-replica copy must override absent primary");
    assert.ok(result.csv.includes("REPORT_REMAINING_RECORD"),"replica produces grounded finding");
    tests.push({label:"Replica-only ghost record",status:"PASS"});
  }
  // A shared email must never be silently assigned to the last user in the map.
  {
    const fixtures={
      "dataset/deletion_requests.csv":HEAD+"case_999,shared@example.org,2026-09-01T10:00:00Z,COMPLETE,2026-09-01T11:00:00Z,2026-09-02T10:00:00Z,Please delete my account.\n",
      "dataset/sample_deletion_requests.csv":HEAD,
      "dataset/sample_output.csv":"case_id,deletion_status,steps_json\n",
      "dataset/user_identities.csv":IDS_HEAD+"user_1,A,shared@example.org,,,2026-08-01T00:00:00Z\nuser_2,B,shared@example.org,,,2026-08-01T00:00:00Z\n",
      "dataset/user_audit_log.csv":"audit_id,user_id,event_time,field_name,old_value,new_value\n",
      "dataset/system_activity.csv":"activity_id,event_time,event_type,source_system,target_system,resource_id,reported_result,details\n",
      "dataset/deletion_rules.csv":RULES,
      "dataset/evidence_files.csv":EVIDENCE_HEADER
    };
    await assert.rejects(()=>runtimeAudit(async p=>fixtures[p]),/Identity unresolved or ambiguous/);
    tests.push({label:"Ambiguous identity rejected",status:"PASS"});
  }
  console.log(JSON.stringify({pass:tests.length,tests},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
