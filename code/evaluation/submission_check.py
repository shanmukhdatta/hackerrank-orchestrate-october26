"""Independent, data-only submission contract and temporal evidence checks."""
from __future__ import annotations
import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "dataset"
def rows(name: Path):
    with name.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))

cases = rows(DATA / "deletion_requests.csv")
preds = rows(ROOT / "output.csv")
manifest = {r["file_id"]:r for r in rows(DATA/"evidence_files.csv")}
activity = {r["activity_id"]:r for r in rows(DATA/"system_activity.csv")}
identity_changes = {r["audit_id"]:r for r in rows(DATA/"user_audit_log.csv")}
assert len(cases)==len(preds)==518
assert [r["case_id"] for r in preds]==sorted([c["case_id"] for c in cases], key=lambda v:int(v.split("_")[-1]))
assert set(r["case_id"] for r in preds)==set(r["case_id"] for r in cases)
bycase={c["case_id"]:c for c in cases}
names=["FINDING","REMEDIATION","VERIFICATION"]
ops=[
 ["REPORT_REMAINING_RECORD","REPORT_EXPOSED_PII","REPORT_ACTIVE_DATA_FLOW","REPORT_RESTORE_RISK"],
 ["DISABLE_DATA_FLOW","BLOCK_RESTORE","DELETE_RECORD","REDACT_RECORD","ANONYMIZE_RECORD"],
 ["VERIFY_RECORD_ABSENT","VERIFY_RECORD_PRESENT","VERIFY_RECORD_REDACTED","VERIFY_RECORD_ANONYMIZED","VERIFY_DATA_FLOW_DISABLED","VERIFY_RESTORE_BLOCKED"]
]
states={
 "REPORT_REMAINING_RECORD":"PRESENT","REPORT_EXPOSED_PII":"PRESENT",
 "REPORT_ACTIVE_DATA_FLOW":"ACTIVE","REPORT_RESTORE_RISK":"ACTIVE",
 "DISABLE_DATA_FLOW":"DISABLED","BLOCK_RESTORE":"BLOCKED","DELETE_RECORD":"ABSENT",
 "REDACT_RECORD":"REDACTED","ANONYMIZE_RECORD":"ANONYMIZED",
 "VERIFY_RECORD_ABSENT":"ABSENT","VERIFY_RECORD_PRESENT":"PRESENT",
 "VERIFY_RECORD_REDACTED":"REDACTED","VERIFY_RECORD_ANONYMIZED":"ANONYMIZED",
 "VERIFY_DATA_FLOW_DISABLED":"DISABLED","VERIFY_RESTORE_BLOCKED":"BLOCKED"
}
order={name:(p,i) for p,group in enumerate(ops) for i,name in enumerate(group)}
status_count=Counter()
empty_incomplete=[]
missing_verification=[]
for pred in preds:
    case=bycase[pred["case_id"]]
    status=pred["deletion_status"]
    assert status in {"COMPLETE","INCOMPLETE","NOT_APPLICABLE"}, (case["case_id"],status)
    status_count[status]+=1
    steps=json.loads(pred["steps_json"])
    assert isinstance(steps,list)
    if status=="NOT_APPLICABLE":
        assert not steps,case["case_id"]
    if status=="COMPLETE" and not steps:
        missing_verification.append(case["case_id"])
    if status=="INCOMPLETE" and not steps:
        empty_incomplete.append(case["case_id"])
    prev=(-1,-1,"","")
    for n,step in enumerate(steps,1):
        assert set(step)=={"step_no","phase","system_id","resource_id","operation","state","evidence_id"}
        assert step["step_no"]==n,(case["case_id"],n)
        op=step["operation"]
        assert op in states and step["state"]==states[op],(case["case_id"],step)
        phase=names[order[op][0]]
        assert step["phase"]==phase,(case["case_id"],step)
        current=(*order[op],step["system_id"],step["resource_id"])
        assert prev<=current,(case["case_id"],step)
        prev=current
        backed=(phase=="FINDING" or (phase=="VERIFICATION" and status=="COMPLETE"))
        evidence=step["evidence_id"]
        if backed:
            if evidence in manifest:
                assert manifest[evidence]["captured_at"]<=case["audit_at"],(case["case_id"],evidence)
            elif evidence in activity:
                assert activity[evidence]["event_time"]<=case["audit_at"],(case["case_id"],evidence)
            elif evidence in identity_changes:
                assert identity_changes[evidence]["event_time"]<=case["audit_at"],(case["case_id"],evidence)
            else:
                raise AssertionError(f"{case['case_id']}: invalid evidence {evidence}")
        else:
            assert evidence=="",(case["case_id"],evidence)
        if status=="COMPLETE":assert phase=="VERIFICATION",case["case_id"]

assert not missing_verification, ("COMPLETE without proof",missing_verification)
missing_paths=[v["file_path"] for v in manifest.values() if not (DATA/v["file_path"]).is_file()]
assert not missing_paths, ("Missing source evidence",missing_paths)
print("FULL CONTRACT VALIDATION PASSED")
print("Output status counts:",dict(status_count))
print("Incomplete cases with zero grounded action steps:",len(empty_incomplete))
if empty_incomplete:
    print("WARNING: Incomplete cases without supporting action steps indicate an evidence-coverage quality gap.")
print("Captured-evidence audit cutoff, step ordering, phase/operation/state, and IDs: PASS")
