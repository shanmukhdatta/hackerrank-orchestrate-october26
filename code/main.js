#!/usr/bin/env node
"use strict";
// Evidence-first, deterministic (symbolic AI) deletion audit.
// Node.js 18+; uses only built-in modules and participant-facing data.
const fs = require("fs");
const path = require("path");
async function runtimeAudit(load) {
  const parseCSV=s=>{const out=[];let row=[],cell="",quoted=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=""}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&s[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))out.push(row);row=[];cell=""}else cell+=c}if(row.length||cell){row.push(cell);out.push(row)}return out};
  const dictCSV=s=>{let [head,...rows]=parseCSV(s);return rows.map(row=>Object.fromEntries(head.map((key,i)=>[key,row[i]||""])))};
  const req= dictCSV(await load("dataset/deletion_requests.csv"));
  const sample= dictCSV(await load("dataset/sample_deletion_requests.csv"));
  const sampleGold=dictCSV(await load("dataset/sample_output.csv"));
  const ids=dictCSV(await load("dataset/user_identities.csv"));
  const changes=dictCSV(await load("dataset/user_audit_log.csv"));
  const activities=dictCSV(await load("dataset/system_activity.csv"));
  const manifest=dictCSV(await load("dataset/evidence_files.csv"));
  const rules=dictCSV(await load("dataset/deletion_rules.csv"));
  const catAction=new Map(rules.map(r=>[r.data_category,r.required_action]));
   const captureByEvidence=new Map(manifest.map(f=>[f.file_id,f.captured_at]));
  const norm=s=>String(s??"").trim().toLowerCase();
  const tokens=s=>[...new Set((String(s??"").toLowerCase().match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}|user_\d+|[a-f0-9]{64}/g)||[]))];
  const aliases=new Map(); const users=new Map();
  for(const id of ids){users.set(id.user_id,id); const set=new Set([id.user_id]);for(const k of ["email","name","phone","email_hash"])if(id[k])set.add(norm(id[k]));aliases.set(id.user_id,set)}
  for(const c of changes)if(aliases.has(c.user_id)){for(const k of ["old_value","new_value"])if(c[k])aliases.get(c.user_id).add(norm(c[k]))}
  const emailToUser=new Map();for(const [u,vs] of aliases)for(const v of vs)if(v.includes("@"))emailToUser.set(v,u);
  const observation=[];const latestOwner=new Map(); let sourceCount=0, skipped=[];
  const serviceOf=(rid,hint="")=>{
    if(/^(account_|tombstone_)/.test(rid))return rid.startsWith("tombstone_")?"identity_service":"account_service";
    if(/^search_/.test(rid))return "search_service";
    if(/^support_/.test(rid))return "support_platform";
    if(/^analytics_/.test(rid))return "analytics_platform";
    if(/^export_/.test(rid))return "export_service";
    if(/^backup_/.test(rid))return "backup_service";
    if(/^data_flow_/.test(rid))return "integration_service";
    if(/^audit_record_/.test(rid))return "security_service";
    if(/^marketing_/.test(rid))return "marketing_service";
    if(/^cache_/.test(rid))return "cache_service";
    if(/^email_delivery_/.test(rid))return "email_delivery_service";
    return hint||"unknown_service";
  };
  const category=(rid,rec={})=>{
    const t=String(rec.record_type||rec.data_category||rec.category||"").toUpperCase();
    if(t&&catAction.has(t))return t;
    if(/^tombstone_/.test(rid))return "ACCOUNT_TOMBSTONE";
    if(/^account_/.test(rid))return "USER_PROFILE";
    if(/^search_/.test(rid))return "SEARCH_INDEX_ENTRY";
    if(/^support_/.test(rid))return /attachment/i.test(String(rec.collection_name||rec.record_type||""))?"SUPPORT_ATTACHMENT":"SUPPORT_MESSAGE";
    if(/^analytics_/.test(rid))return "ANALYTICS_PROFILE";
    if(/^export_/.test(rid))return "USER_EXPORT";
    if(/^backup_/.test(rid))return "BACKUP_ARCHIVE";
    if(/^audit_record_/.test(rid))return "SECURITY_AUDIT_LOG";
    if(/^marketing_/.test(rid))return "MARKETING_PROFILE";
    if(/^cache_/.test(rid))return "CACHE_ENTRY";
    if(/^email_delivery_/.test(rid))return "EMAIL_DELIVERY_LOG";
    if(/^data_flow_/.test(rid))return "DATA_FLOW";
    return t;
  };
  const getTime=(rec,fallback)=>String(rec.observed_at||rec.recorded_at||rec.captured_at||rec.updated_at||rec.event_time||rec.timestamp||fallback||"").slice(0,20);
  const tri=v=>v===true||v===1||/^(true|1|yes|enabled)$/i.test(String(v??""));
  const infer=(rid,r)=>{
    const kind=category(rid,r);
    const raw=String(r.result||r.state||r.status||r.record_status||r.account_status||"").toUpperCase();
    if(kind==="DATA_FLOW")return r.enabled!==undefined?(tri(r.enabled)?"ACTIVE":"DISABLED"):raw==="ACTIVE"?"ACTIVE":raw==="DISABLED"?"DISABLED":"";
    if(kind==="BACKUP_ARCHIVE")return r.restore_allowed!==undefined?(tri(r.restore_allowed)?"ACTIVE":"BLOCKED"):raw==="ACTIVE"?"ACTIVE":raw==="BLOCKED"?"BLOCKED":"";
    if(r.status_code!==undefined)return Number(r.status_code)===404?"ABSENT":Number(r.status_code)===200?"PRESENT":"";
    if(r.rows!==undefined&&(/profile_lookup_completed|audit_record_read_completed|.*_read_completed/.test(String(r.event||""))))return String(r.rows)==="0"?"ABSENT":"PRESENT";
    if(kind==="ACCOUNT_TOMBSTONE"&&raw==="DELETED")return ["name","email","phone","email_hash","full_name"].some(k=>r[k]!=null&&r[k]!=="")?"PRESENT":"REDACTED";
     if(kind==="USER_PROFILE"&&raw==="DELETED"&&["email","phone","full_name","name","email_hash"].some(k=>r[k]!=null&&r[k]!==""))return "PRESENT";
     if(["NOT_FOUND","MISSING","ABSENT","DELETED","404","NO_MATCH"].includes(raw))return "ABSENT";
    if(["FOUND","PRESENT","EXISTS","HIT","ACTIVE","IDENTIFIABLE","UNREDACTED","200","SUCCESS"].includes(raw))return "PRESENT";
    if(["REDACTED","ANONYMIZED","DISABLED","BLOCKED"].includes(raw))return raw;
    if(raw==="NOT_FOUND")return "ABSENT";
    if(kind==="DATA_FLOW"&&r.last_delivery_status==="stopped")return "DISABLED";
    if(kind==="BACKUP_ARCHIVE"&&r.archive_present!==undefined)return "ACTIVE";
    if(/^(account_|search_|export_)/.test(rid)&&r.profile===null&&r.status_code!==undefined)return "ABSENT";
    const fields=["email","email_hash","phone","full_name","requester_email","requester_phone","customer_email","owner_email","customer_reference","user_id","subject_reference","display_name"];
    if(["ANALYTICS_PROFILE","PRODUCT_TELEMETRY"].includes(kind)){
      const direct=fields.some(k=>r[k]!==undefined&&r[k]!==null&&r[k]!=="");
      return direct?"PRESENT":"ANONYMIZED";
    }
    if(["SUPPORT_MESSAGE","ACCOUNT_TOMBSTONE","EMAIL_DELIVERY_LOG"].includes(kind)){
      const direct=["email","phone","name","full_name","requester_email","requester_phone","requester_name","customer_email","email_hash","display_name"].some(k=>r[k]!==undefined&&r[k]!==null&&r[k]!=="");
      return direct?"PRESENT":"REDACTED";
    }
    if(r.record_json||r.resource_id)return "PRESENT";
    return "";
  };
  const add=(rid,rec,evidence,time,hint)=>{
    if(!rid||!/^([a-z]+_)+[0-9]+$/i.test(rid))return;
    const t=getTime(rec,time);let state=infer(rid,rec);if(!state)return;
    let sys=rec.system||rec.origin_system||rec.data_store||hint||serviceOf(rid);sys=serviceOf(rid,sys);
    const v=Object.values(rec).flatMap(x=>typeof x==="string"?tokens(x):[]);const ident=new Set(v);
    for(const k of ["subject_reference","customer_reference","user_id","lookup_key","match_key","correlation_key","subject_key","customer_email","email","requester_email","owner_email"])if(rec[k])ident.add(norm(rec[k]));
    observation.push({rid,sys,state,time:t,evidence,category:category(rid,rec),ident:[...ident],rec});
  };
  const parseKV=s=>{let r={};for(const m of s.matchAll(/([A-Za-z_][\w]*)=(?:"((?:\\.|[^"\\])*)"|([^\s]+))/g)){let v=m[2]===undefined?m[3]:m[2];v=v.replace(/\\"/g,'"').replace(/\\\\/g,"\\");r[m[1]]=/^(?:null|none)$/i.test(v)?null:v}return r};
  const parseLog=(s,eid,time)=>{
    const traces=new Map();
    for(const line of s.split(/\r?\n/)){
      const iso=line.match(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/);
      const when=iso?iso[0]:time;
      let r=parseKV(line);
      if(r.message)r={...r,...parseKV(r.message)};
      if(r.trace_id&&r.event&&/(started|requested|lookup_started|query_started|scan_started)$/.test(r.event))
        traces.set(r.trace_id,{...r});
      if(r.trace_id&&traces.has(r.trace_id))r={...traces.get(r.trace_id),...r};
      const rid=r.resource_id;
      if(!rid)continue;
      const event=String(r.event||"");
      if(/(_started|_retried|_retry|connection_acquired|_scheduled)$/.test(event))continue;
      if(event==="index_query_completed"){
        r.record_type="SEARCH_INDEX_ENTRY";
        if(/^(hit|hits)$/i.test(r.result||""))r.result="FOUND";
        else if(/^(miss|no_hits|empty)$/i.test(r.result||""))r.result="NOT_FOUND";
      }
      if(event==="message_pii_scan"){r.result="IDENTIFIABLE";r.subject_reference=r.matched_value||r.subject_reference}
      if(event==="support_ticket_read_completed")r.record_type="SUPPORT_MESSAGE";
      if(event==="profile_lookup_completed")r.record_type="USER_PROFILE";
      if(event==="contact_lookup_completed")r.record_type="MARKETING_PROFILE";
       if(event==="contact_query_completed"&&/legacy_contact_index/i.test(String(r.source||"")))r.record_type="SECONDARY_IDENTIFIER";
      if(event==="restore_policy_read_completed")r.record_type="BACKUP_ARCHIVE";
      if(event==="connector_config_read_completed")r.record_type="DATA_FLOW";
      if(event==="audit_record_read_completed")r.record_type="SECURITY_AUDIT_LOG";
      if(event==="connector_heartbeat"){
        r.record_type="DATA_FLOW";
        r.result=tri(r.enabled)?"ACTIVE":"DISABLED";
      }
      if(event==="restore_candidate_evaluated"){
        r.record_type="BACKUP_ARCHIVE";
        r.result=(tri(r.eligible)&&!tri(r.deletion_block))?"ACTIVE":"BLOCKED";
      }
      if(event==="contact_lookup_completed"&&Number(r.rows)===0)r.result="NOT_FOUND";
      if(event==="contact_lookup_completed"&&Number(r.rows)>0)r.result="FOUND";
      const isReadback=/(lookup_completed|query_completed|read_completed|scan|heartbeat|restore_candidate_evaluated|record_lookup|record_snapshot|state_read|record_presence)/.test(event);
      if(isReadback||r.record_type||r.result){
        add(rid,r,eid,when,r.system||r.service);
      }
    }
  };

  function sqlValues(s){const out=[];let cell="",q=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==="'"){if(q&&s[i+1]==="'"){cell+="'";i++}else q=!q}else if(c===","&&!q){out.push(cell.trim()==="NULL"?null:cell.trim());cell=""}else cell+=c}out.push(cell.trim()==="NULL"?null:cell.trim());return out}
  const parseSQL=(s,eid,time)=>{
    const cols=new Map();for(const m of s.matchAll(/CREATE TABLE\s+"?(\w+)"?\s*\(([\s\S]*?)\);/gi)){let names=[];for(const col of m[2].matchAll(/(?:^|,)\s*"?(\w+)"?\s+(?:TEXT|INTEGER|REAL|BLOB)/gim))names.push(col[1]);cols.set(m[1],names)}
    for(const m of s.matchAll(/INSERT INTO\s+"?(\w+)"?\s+VALUES\s*\((.*?)\);/gis)){
      const values=sqlValues(m[2]),fields=cols.get(m[1])||[];let r=Object.fromEntries(values.map((v,i)=>[fields[i]||"field_"+i,v]));if(r.record_json){try{r={...r,...JSON.parse(r.record_json)}}catch{}}
      const rid=r.resource_id||values.find(v=>typeof v==="string"&&/^(?:account|search|analytics|backup|data_flow|support|export|audit_record|tombstone)_\d+$/.test(v));
      if(rid)add(rid,{...r,collection_name:r.collection_name||m[1]},eid,r.updated_at||time,r.origin_system);
    }
  };
  const parseJSON=(s,eid,time)=>{
    let root;try{root=JSON.parse(s)}catch{return}
    const walk=(node,ctx={},depth=0)=>{
      if(depth>16||!node||typeof node!=="object")return;
      if(Array.isArray(node)){for(const n of node)walk(n,ctx,depth+1);return}
      let c={...ctx};
      if(node.data_store)c.system=node.data_store;
      if(node.origin_system)c.system=node.origin_system;
      if(node.system)c.system=node.system;
      if(node.captured_at)c.time=node.captured_at;
      if(node.observed_at)c.time=node.observed_at;
      if(node.collection)c.collection_name=node.collection;
      if(node.record_type)c.record_type=node.record_type;
      if(node.resource_id){const rid=node.resource_id;let r={...c,...node};if(node.profile&&typeof node.profile==="object")r={...r,...node.profile};if(node.document&&typeof node.document==="object")r={...r,...node.document};add(rid,r,eid,c.time||time,c.system)}
      for(const [k,v] of Object.entries(node)){
        if(!v||typeof v!=="object")continue;
        let child={...c};
        if(/^(account_service|search_service|analytics_platform|support_platform|integration_service|security_service|backup_service|export_service|identity_service|marketing_service)$/.test(k))child.system=k;
        if(k==="snapshots"&&node.exported_at)child.time=node.exported_at;
        walk(v,child,depth+1);
      }
    };walk(root,{time},0);
  };
  const parseTxt=(s,eid,time)=>{
    for(const line of s.split(/\r?\n/)){
      if(line.includes(" | ")){const cells=line.replace(/^\s*-\s*/,"").split(" | ").map(x=>x.trim());if(cells.length>=5&&/^\d{4}-/.test(cells[0]))add(cells[2],{system:cells[1],record_type:cells[3],result:cells[4],subject_reference:cells.slice(5).join(" ")},eid,cells[0],cells[1])}
      else if(/resource_id=/.test(line))parseLog(line,eid,time);
    }
  };
  const parseMedia=(s,eid,time)=>{
    // OCR is supplementary evidence, never a claim that extraction was perfect.
    const ids=[...s.matchAll(/\b(?:account|search|support|analytics|export|backup|data_flow|marketing|audit_record|cache|tombstone|email_delivery)_[0-9]+\b/gi)];
    const visited=new Set();
    for(const match of ids){
      const rid=match[0].toLowerCase();
      if(visited.has(rid))continue;
      visited.add(rid);
      const context=s.slice(Math.max(0,match.index-240),Math.min(s.length,match.index+520));
      let refs=tokens(context);
      if(!refs.length && visited.size===1)refs=tokens(s.slice(0,850));
      // In multi-row admin screenshots, nearby identity takes precedence.
      let subject=refs.find(x=>x.includes("@")) || refs.find(x=>x.startsWith("user_"));
      if(!subject)continue;
      const rec={resource_id:rid,subject_reference:subject,
        result:/\b(not found|no results|missing|absent)\b/i.test(context)?"NOT_FOUND":"FOUND"};
      if(/^support_/.test(rid)&&/attachment|support reference|uploaded|pdf/i.test(s))rec.record_type="SUPPORT_ATTACHMENT";
      if(/^marketing_/.test(rid))rec.record_type="MARKETING_PROFILE";
      if(/^data_flow_/.test(rid)){rec.record_type="DATA_FLOW";rec.result=/\bdisabled\b/i.test(context)?"DISABLED":"ACTIVE"}
      if(/^backup_/.test(rid)){rec.record_type="BACKUP_ARCHIVE";rec.result=/\bblocked\b/i.test(context)?"BLOCKED":"ACTIVE"}
      if(/^audit_record_/.test(rid)){rec.record_type="SECURITY_AUDIT_LOG";rec.result="PRESENT"}
      add(rid,rec,eid,time,serviceOf(rid));
    }
  };
  const evidenceFiles=manifest.filter(f=>/\.(log|json|sql|txt|png|pdf)$/i.test(f.file_path))
    .map(f=>/\.(png|pdf)$/i.test(f.file_path)?
      {...f,media_source:true,file_path:"evidence/parsed_media/"+f.file_id+".txt"}:f);
  for(let i=0;i<evidenceFiles.length;i+=12){
    const batch=evidenceFiles.slice(i,i+12);
    const loaded=await Promise.all(batch.map(async f=>{try{return [f,await load("dataset/"+f.file_path)]}catch(e){skipped.push(f.file_id);return [f,""]}}));
    for(const [f,s] of loaded){if(!s)continue;sourceCount++;if(/\.log$/i.test(f.file_path))parseLog(s,f.file_id,f.captured_at);else if(/\.json$/i.test(f.file_path))parseJSON(s,f.file_id,f.captured_at);else if(/\.sql$/i.test(f.file_path))parseSQL(s,f.file_id,f.captured_at);else if(f.media_source)parseMedia(s,f.file_id,f.captured_at);else parseTxt(s,f.file_id,f.captured_at)}
  }
  // Infer historical ownership of anonymized/readback resources by earlier observations.
  const owners=new Map();
  for(const o of observation)for(const token of o.ident){let user=token.startsWith("user_")?token:emailToUser.get(token);if(user&&users.has(user)){if(!owners.has(o.rid))owners.set(o.rid,new Set());owners.get(o.rid).add(user)}}
  for(const a of activities){const rid=a.resource_id;const usersFound=new Set(tokens(a.details).map(t=>t.startsWith("user_")?t:emailToUser.get(t)).filter(Boolean));for(const user of usersFound){if(!owners.has(rid))owners.set(rid,new Set());owners.get(rid).add(user)}}
  const phaseOperations=[
    ["REPORT_REMAINING_RECORD","REPORT_EXPOSED_PII","REPORT_ACTIVE_DATA_FLOW","REPORT_RESTORE_RISK"],
    ["DISABLE_DATA_FLOW","BLOCK_RESTORE","DELETE_RECORD","REDACT_RECORD","ANONYMIZE_RECORD"],
    ["VERIFY_RECORD_ABSENT","VERIFY_RECORD_PRESENT","VERIFY_RECORD_REDACTED","VERIFY_RECORD_ANONYMIZED","VERIFY_DATA_FLOW_DISABLED","VERIFY_RESTORE_BLOCKED"]
  ];
  const order=new Map(phaseOperations.flatMap((ops,pi)=>ops.map((op,i)=>[op,[pi,i]])));
  const sortSteps=steps=>steps.sort((a,b)=>{const x=order.get(a.operation)||[9,9],y=order.get(b.operation)||[9,9];return x[0]-y[0]||x[1]-y[1]||a.system_id.localeCompare(b.system_id)||a.resource_id.localeCompare(b.resource_id)});
  const actionState={DELETE:["REPORT_REMAINING_RECORD","DELETE_RECORD","VERIFY_RECORD_ABSENT","PRESENT","ABSENT"],REDACT:["REPORT_EXPOSED_PII","REDACT_RECORD","VERIFY_RECORD_REDACTED","PRESENT","REDACTED"],ANONYMIZE:["REPORT_EXPOSED_PII","ANONYMIZE_RECORD","VERIFY_RECORD_ANONYMIZED","PRESENT","ANONYMIZED"],RETAIN:["","","VERIFY_RECORD_PRESENT","PRESENT","PRESENT"],FLOW:["REPORT_ACTIVE_DATA_FLOW","DISABLE_DATA_FLOW","VERIFY_DATA_FLOW_DISABLED","ACTIVE","DISABLED"],BACKUP:["REPORT_RESTORE_RISK","BLOCK_RESTORE","VERIFY_RESTORE_BLOCKED","ACTIVE","BLOCKED"]};
  const intent=(s)=>{
    // Intention is determined from the request text, not the reported status.
    // Inflection-aware and multilingual: the public data includes six languages.
    s=norm(s).normalize("NFKC");
    const negate=/\b(do not delete|don't delete|do not close|don't close|do not erase|don't erase|not asking for deletion|not requesting deletion|not a deletion request|not a request to erase|not a request to delete|keep my account|keep the account|leave the account active|leave my profile|cancel my deletion request|no deletion requested|without removing any|without deleting any|marketing lists only|marketing emails only|marketing opt.?out only|promotional emails only|remove me from marketing lists|i still need the account)\b/i.test(s);
    const request=/\b(delet\w*|eras\w*|remov\w*|clos\w*|cancell\w*|forget\s+me|account\s+closure|permanent\w*\s+remov\w*|desaparecer|suppres\w*|supprim\w*|effac\w*|elimin\w*|borrar|apagar|excluir|exclusão|löschen|lösch\w*|rimuov\w*)\b|удал|削除|消去|删除|삭제|حذف|हटाना|मिटा/i.test(s);
    return (request||/profile\s+(?:is\s+)?gone|records?\s+cannot\s+identify\s+me/i.test(s))&&!negate;
  };
  function planCase(c){
    if(!intent(c.request_text))return {case_id:c.case_id,deletion_status:"NOT_APPLICABLE",steps_json:"[]"};
    const id=emailToUser.get(norm(c.email));const aliasSet=id?aliases.get(id):new Set([norm(c.email)]);
    const mine=observation.filter(o=>{
      if(o.time&&o.time>c.audit_at)return false;
       if(captureByEvidence.get(o.evidence)&&captureByEvidence.get(o.evidence)>c.audit_at)return false;
      return (owners.get(o.rid)?.has(id))||o.ident.some(v=>aliasSet.has(v)||norm(c.email)===v);
    });
    const byRes=new Map();
    for(const o of mine){const k=o.rid;const before=byRes.get(k);if(!before||o.time>before.time||(o.time===before.time&&o.evidence<before.evidence))byRes.set(k,o)}
    const steps=[], defects=[];const uniq=new Set();
    const push=(phase,sys,rid,op,state,evidence)=>{const key=phase+"|"+rid+"|"+op;if(uniq.has(key))return;uniq.add(key);steps.push({step_no:0,phase,system_id:sys,resource_id:rid,operation:op,state,evidence_id:evidence||""})};
    const todo=[];
    for(const o of byRes.values()){
      const kind=o.category;let action;
      if(kind==="DATA_FLOW")action="FLOW";else if(kind==="BACKUP_ARCHIVE")action="BACKUP";else if(kind==="ACCOUNT_TOMBSTONE")action="REDACT";else action=catAction.get(kind)||"DELETE";
      if(kind==="LEGAL_HOLD_RECORD"&&String(o.rec.hold_status||"").toUpperCase()==="RELEASED")action="DELETE";
      if(kind==="SECURITY_AUDIT_LOG"&&o.rec.retention_until&&o.rec.retention_until<c.audit_at)action="DELETE";
      const spec=actionState[action];if(!spec)continue;
      let violate=(action==="DELETE"&&o.state!=="ABSENT")||(action==="REDACT"&&o.state!=="REDACTED"&&o.state!=="ABSENT")||(action==="ANONYMIZE"&&o.state!=="ANONYMIZED"&&o.state!=="ABSENT")||(action==="RETAIN"&&o.state!=="PRESENT")||(action==="FLOW"&&o.state==="ACTIVE")||(action==="BACKUP"&&o.state==="ACTIVE");
      if(violate&&spec[0]&&!(action==="RETAIN")){push("FINDING",o.sys,o.rid,spec[0],spec[3],o.evidence);defects.push(o)}
      if(violate&&spec[1])todo.push({sys:o.sys,rid:o.rid,action,spec});
      // Always verify relevant policy-defined resources after remediation, including compliant records.
      let verify=spec[2],vstate=spec[4];
      if(action==="DELETE"||o.state==="ABSENT"&&["REDACT","ANONYMIZE"].includes(action)){verify="VERIFY_RECORD_ABSENT";vstate="ABSENT"}
      if(action==="REDACT"&&o.state==="ABSENT"){verify="VERIFY_RECORD_ABSENT";vstate="ABSENT"}
      if(action==="ANONYMIZE"&&o.state==="ABSENT"){verify="VERIFY_RECORD_ABSENT";vstate="ABSENT"}
      if(action==="FLOW"&&o.state==="DISABLED")verify="VERIFY_DATA_FLOW_DISABLED";
      if(action==="BACKUP"&&o.state==="BLOCKED")verify="VERIFY_RESTORE_BLOCKED";
      push("VERIFICATION",o.sys,o.rid,verify,vstate,o.evidence);
    }
    const incomplete=defects.length>0||!byRes.size;
    if(incomplete){
      for(const t of todo)push("REMEDIATION",t.sys,t.rid,t.spec[1],t.spec[4],"");
      for(const s of steps)if(s.phase==="VERIFICATION")s.evidence_id="";
    }
    const planned=steps.filter(s=>incomplete||s.phase==="VERIFICATION");
    sortSteps(planned);for(let i=0;i<planned.length;i++)planned[i].step_no=i+1;
    return {case_id:c.case_id,deletion_status:incomplete?"INCOMPLETE":"COMPLETE",steps_json:JSON.stringify(planned)};
  }
  const out=req.map(planCase).sort((a,b)=>a.case_id.localeCompare(b.case_id,undefined,{numeric:true}));
  const sampleOut=sample.map(planCase);
  const gold=new Map(sampleGold.map(x=>[x.case_id,x]));
  let status=0,perfect=0,totalOps=0,correctOps=0;
  for(const r of sampleOut){let g=gold.get(r.case_id);if(!g)continue;if(r.deletion_status===g.deletion_status)status++;if(r.deletion_status===g.deletion_status&&JSON.stringify(JSON.parse(r.steps_json))===JSON.stringify(JSON.parse(g.steps_json)))perfect++;let pred=JSON.parse(r.steps_json),exp=JSON.parse(g.steps_json);totalOps+=exp.length;for(let i=0;i<Math.min(pred.length,exp.length);i++)if(pred[i].operation===exp[i].operation&&pred[i].resource_id===exp[i].resource_id)correctOps++}
  const esc=x=>'"'+String(x).replace(/"/g,'""')+'"';
  const csv="case_id,deletion_status,steps_json\n"+out.map(r=>[r.case_id,r.deletion_status,esc(r.steps_json)].join(",")).join("\n")+"\n";
  return {csv,stats:{requests:out.length,sources:sourceCount,skipped,observations:observation.length,known_resource_owners:owners.size,statuses:out.reduce((a,r)=>(a[r.deletion_status]=(a[r.deletion_status]||0)+1,a),{}),sample:{total:sampleOut.length,status_correct:status,exact_correct:perfect,ordered_operation_hits:correctOps,canonical_operation_count:totalOps}},samplePred:sampleOut};
}
async function main() {
  const root = path.resolve(__dirname, "..");
  const read = async file => fs.readFileSync(path.join(root, file), "utf8");
  const result = await runtimeAudit(read);
  const escapeCsv = value => '"' + String(value).replace(/"/g, '""') + '"';
  const sampleCsv = "case_id,deletion_status,steps_json\n" +
    result.samplePred.map(r => [r.case_id, r.deletion_status, escapeCsv(r.steps_json)].join(",")).join("\n") + "\n";
  fs.mkdirSync(path.join(root, "code", "evaluation"), {recursive: true});
  fs.writeFileSync(path.join(root, "output.csv"), result.csv, "utf8");
  fs.writeFileSync(path.join(root, "code", "evaluation", "sample_predictions.csv"), sampleCsv, "utf8");
  fs.writeFileSync(path.join(root, "code", "evaluation", "run_stats.json"), JSON.stringify(result.stats, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(result.stats, null, 2));
  return result;
}
if (require.main === module) main().catch(err => { console.error(err); process.exitCode=1; });
module.exports = {runtimeAudit};
