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
