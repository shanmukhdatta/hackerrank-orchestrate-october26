"use strict";
const assert = require("node:assert/strict");
const { runtimeAudit } = require("../main.js");

const HEAD = "case_id,email,requested_at,reported_status,reported_at,audit_at,request_text\n";
const EVIDENCE_HEADER="file_id,file_path,origin,captured_at\n";
const IDS_HEAD="user_id,name,email,phone,email_hash,updated_at\n";
const RULES="rule_id,data_category,condition,required_action\nrule_01,USER_PROFILE,Always,DELETE\nrule_02,SEARCH_INDEX_ENTRY,Always,DELETE\nrule_03,SECURITY_AUDIT_LOG,Within retention,RETAIN\n";
async function scenario(label,email,requestText,records,expectedStatus,expectedOps) {
  const fixtures = {
    "dataset/deletion_requests.csv":HEAD+"case_999,"+email+",2026-09-01T10:00:00Z,COMPLETE,2026-09-01T11:00:00Z,2026-09-02T10:00:00Z,"+requestText+"\n",
    "dataset/sample_deletion_requests.csv":HEAD,
    "dataset/sample_output.csv":"case_id,deletion_status,steps_json\n",
    "dataset/user_identities.csv":IDS_HEAD+"user_1,Example User,"+email+",,,2026-08-01T00:00:00Z\n",
    "dataset/user_audit_log.csv":"audit_id,user_id,event_time,field_name,old_value,new_value\n",
    "dataset/system_activity.csv":"activity_id,event_time,event_type,source_system,target_system,resource_id,reported_result,details\n",
    "dataset/deletion_rules.csv":RULES,
    "dataset/evidence_files.csv":EVIDENCE_HEADER+"evidence_01,evidence/records/test.json,test,2026-09-02T09:00:00Z\n",
    "dataset/evidence/records/test.json":JSON.stringify({records})
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
  console.log(JSON.stringify({pass:tests.length,tests},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
