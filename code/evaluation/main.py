"""Validate the generated submission without requiring third-party packages."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
with (ROOT / "dataset/deletion_requests.csv").open(newline="", encoding="utf-8") as f:
    expected = {r["case_id"] for r in csv.DictReader(f)}
with (ROOT / "output.csv").open(newline="", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    assert reader.fieldnames == ["case_id", "deletion_status", "steps_json"], reader.fieldnames
    rows = list(reader)
assert len(rows) == len(expected) == 518, (len(rows),len(expected))
assert {r["case_id"] for r in rows} == expected
assert [r["case_id"] for r in rows] == sorted(expected, key=lambda x:int(x.split("_")[1]))
for r in rows:
    assert r["deletion_status"] in {"COMPLETE", "INCOMPLETE", "NOT_APPLICABLE"}
    steps = json.loads(r["steps_json"])
    assert isinstance(steps, list)
    assert r["deletion_status"] != "NOT_APPLICABLE" or steps == []
    for i, step in enumerate(steps, 1):
        assert set(step) == {"step_no","phase","system_id","resource_id","operation","state","evidence_id"},(r["case_id"],step)
        assert step["step_no"] == i, r["case_id"]
        assert step["phase"] in {"FINDING", "REMEDIATION", "VERIFICATION"}
        if r["deletion_status"] == "INCOMPLETE" and step["phase"] != "FINDING":
            assert step["evidence_id"] == ""
print(f"PASS: {len(rows)} unique cases, valid JSON, sequential steps and expected columns")

# Public reference answers are for evaluation only and never loaded by main.js.
from collections import Counter
from datetime import datetime, timezone

def load_csv(filename):
    with filename.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

EVAL = ROOT / "code" / "evaluation"
gold = {r["case_id"]:r for r in load_csv(ROOT/"dataset/sample_output.csv")}
pred = {r["case_id"]:r for r in load_csv(EVAL/"sample_predictions.csv")}
run = json.loads((EVAL/"run_stats.json").read_text(encoding="utf-8"))
files = {r["file_id"] for r in load_csv(ROOT/"dataset/evidence_files.csv")}
activities = {r["activity_id"] for r in load_csv(ROOT/"dataset/system_activity.csv")}
audits = {r["audit_id"] for r in load_csv(ROOT/"dataset/user_audit_log.csv")}
allowed_evidence = files | activities | audits
op_groups = [
    ["REPORT_REMAINING_RECORD","REPORT_EXPOSED_PII","REPORT_ACTIVE_DATA_FLOW","REPORT_RESTORE_RISK"],
    ["DISABLE_DATA_FLOW","BLOCK_RESTORE","DELETE_RECORD","REDACT_RECORD","ANONYMIZE_RECORD"],
    ["VERIFY_RECORD_ABSENT","VERIFY_RECORD_PRESENT","VERIFY_RECORD_REDACTED","VERIFY_RECORD_ANONYMIZED","VERIFY_DATA_FLOW_DISABLED","VERIFY_RESTORE_BLOCKED"],
]
op_order = {op:(p,i) for p,ops in enumerate(op_groups) for i,op in enumerate(ops)}
schema_errors = []
for row in rows:
    steps = json.loads(row["steps_json"])
    prev = (-1,-1,"","")
    for step in steps:
        op=step["operation"]
        if op not in op_order:
            schema_errors.append(f"{row['case_id']}: unknown operation {op}")
            continue
        current=(*op_order[op],step["system_id"],step["resource_id"])
        if current<prev: schema_errors.append(f"{row['case_id']}: operation order")
        prev=current
        must_prove=step["phase"]=="FINDING" or (row["deletion_status"]=="COMPLETE" and step["phase"]=="VERIFICATION")
        if must_prove and step["evidence_id"] not in allowed_evidence:
            schema_errors.append(f"{row['case_id']}: unsupported evidence {step['evidence_id']}")
        if not must_prove and step["evidence_id"]!="":
            schema_errors.append(f"{row['case_id']}: proposed action cites evidence")
        if row["deletion_status"]=="COMPLETE" and step["phase"]!="VERIFICATION":
            schema_errors.append(f"{row['case_id']}: complete case contains non-verification step")
status_hits=row_hits=sequence_hits=field_hits=field_count=step_hit=step_count=pred_step_count=0
mismatches=[]
fields=("phase","system_id","resource_id","operation","state","evidence_id")
def signature(s):return tuple(s.get(k) for k in fields)
for case,g in gold.items():
    p=pred[case]; gs=json.loads(g["steps_json"]);ps=json.loads(p["steps_json"])
    if g["deletion_status"]==p["deletion_status"]:status_hits+=1
    if g["deletion_status"]==p["deletion_status"] and gs==ps:row_hits+=1
    if [x["operation"] for x in gs]==[x["operation"] for x in ps]:sequence_hits+=1
    step_hit+=sum((Counter(map(signature,gs))&Counter(map(signature,ps))).values())
    step_count+=len(gs);pred_step_count+=len(ps)
    for i in range(max(len(gs),len(ps))):
        for field in fields:
            field_count+=1
            if i<len(gs) and i<len(ps) and gs[i].get(field)==ps[i].get(field):field_hits+=1
    if g["deletion_status"]!=p["deletion_status"] or gs!=ps:
        mismatches.append(f"- {case}: expected {g['deletion_status']} ({len(gs)} steps); predicted {p['deletion_status']} ({len(ps)} steps)")
n=len(gold);precision=step_hit/max(1,pred_step_count);recall=step_hit/max(1,step_count)
f1=2*precision*recall/(precision+recall) if precision+recall else 0
# Three constructed independent examples exercise the validation rules.
custom_tests=[
    ("Information-only request", "NOT_APPLICABLE", [], True),
    ("Authorized complete deletion",
     "COMPLETE", [{"step_no":1,"phase":"VERIFICATION","system_id":"account_service","resource_id":"account_1","operation":"VERIFY_RECORD_ABSENT","state":"ABSENT","evidence_id":"evidence_01"}], True),
    ("Incomplete deletion with future remediation",
     "INCOMPLETE", [{"step_no":1,"phase":"FINDING","system_id":"search_service","resource_id":"search_1","operation":"REPORT_REMAINING_RECORD","state":"PRESENT","evidence_id":"evidence_01"},
                    {"step_no":2,"phase":"REMEDIATION","system_id":"search_service","resource_id":"search_1","operation":"DELETE_RECORD","state":"ABSENT","evidence_id":""},
                    {"step_no":3,"phase":"VERIFICATION","system_id":"search_service","resource_id":"search_1","operation":"VERIFY_RECORD_ABSENT","state":"ABSENT","evidence_id":""}], True),
    ("Invalid evidence on future action",
     "INCOMPLETE", [{"step_no":1,"phase":"REMEDIATION","system_id":"search_service","resource_id":"search_1","operation":"DELETE_RECORD","state":"ABSENT","evidence_id":"evidence_01"}], False),
]
def custom_valid(status,steps):
    if status=="NOT_APPLICABLE":return not steps
    if status=="COMPLETE" and any(s["phase"]!="VERIFICATION" for s in steps):return False
    for s in steps:
        needs=s["phase"]=="FINDING" or (status=="COMPLETE" and s["phase"]=="VERIFICATION")
        if needs and s["evidence_id"] not in allowed_evidence:return False
        if not needs and s["evidence_id"]:return False
    return True
custom_results=[(name,custom_valid(status,steps)==expected) for name,status,steps,expected in custom_tests]
tests_text="\\n".join(f"- {name}: {'PASS' if passed else 'FAIL'}" for name,passed in custom_results)
mismatch_text="\\n".join(mismatches[:24]) or "- No mismatches."
errors_text="\\n".join("- "+x for x in schema_errors[:24]) or "- None."
report=f"""# Evaluation report

This report evaluates the **actual final full-dataset execution** against the
32 supplied canonical sample answers. The sample answers are evaluation-only,
not prediction input. No hidden labels were used.

## Measured metrics

| Metric | Numerator / denominator | Score |
|---|---:|---:|
| Case-level deletion-status accuracy | {status_hits}/{n} | {status_hits/n:.2%} |
| Exact complete-row accuracy | {row_hits}/{n} | {row_hits/n:.2%} |
| Ordered operation-sequence accuracy | {sequence_hits}/{n} | {sequence_hits/n:.2%} |
| Positional field-level accuracy | {field_hits}/{field_count} | {field_hits/max(1,field_count):.2%} |
| Full step precision | {step_hit}/{pred_step_count} | {precision:.2%} |
| Full step recall | {step_hit}/{step_count} | {recall:.2%} |
| Full step F1 | - | {f1:.2%} |

Full run: **{len(rows)} cases**; parsed {run['sources']} machine-readable
evidence files; {run['observations']} observations; matched ownership for
{run['known_resource_owners']} resources.
Predicted status counts: {json.dumps(run['statuses'],sort_keys=True)}.
Full-output contract validation issues: **{len(schema_errors)}**.

## Independent constructed evaluation cases

{tests_text}

These fixtures test the output protocol only; they do not establish ground
truth for any hidden customer.

## Failures found against the public samples

{mismatch_text}

## Contract-validation findings

{errors_text}

## Improvements implemented and limitations

- Added historical identifier matching, point-in-time filtering, multiple
  evidence formats (SQL, JSON, logs, text), and explicit policy/operation order.
- Added direct observation precedence rather than trusting a workflow's
  reported success.
- Added case/field/step and sequence scoring, plus independent contract tests.
- Remaining limitations: screenshots and PDFs are not interpreted; some
  anonymized records cannot be linked once historical identifiers disappear;
  overlapping snapshots can give conflicting observations; intent detection
  across languages and complex account merges requires refinement.
- The public-sample metrics are the reproducible measurement, **not a claim
  about hidden-case accuracy**.
"""
(EVAL/"evaluation_report.md").write_text(report,encoding="utf-8")
usage=f"""# Model usage and cost report

## Full-dataset run
- Provider: **None** — offline deterministic symbolic AI/policy engine.
- Model name: **None invoked at inference time**.
- Model calls: **0**.
- Model input tokens: **0**.
- Model output tokens: **0**.
- Total tokens and average tokens per request: **0**.
- Estimated total model API cost: **USD $0.00**.
- Estimated average model API cost per request: **USD $0.00**.
- Per-model totals: not applicable (no external models).
- Evaluated requests: **{len(rows)}**.
- Parsed machine-readable evidence files: **{run['sources']}**.

No paid provider or external AI model API is required for the full dataset
audit. These zeroes describe **runtime inference**, not prior ChatGPT
development assistance. GitHub Actions compute may have separate account
billing and is not included in the API estimate.
"""
(EVAL/"usage_report.md").write_text(usage,encoding="utf-8")
print(f"Public samples: status {status_hits}/{n}, exact {row_hits}/{n}, step F1 {f1:.2%}; schema issues {len(schema_errors)}")
if schema_errors or not all(result for _,result in custom_results):
    raise SystemExit("Contract validation failed; inspect evaluation_report.md")
