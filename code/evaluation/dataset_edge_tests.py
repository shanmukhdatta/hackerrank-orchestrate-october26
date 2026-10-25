"""Dataset-grounded regression checks. Never import sample answers into predictions."""
from collections import defaultdict
from pathlib import Path
import csv
import json
import sqlite3

DATA = Path(__file__).resolve().parents[2] / "dataset"

def load(name):
    with (DATA / name).open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))

cases = load("deletion_requests.csv")
identities = load("user_identities.csv")
history = load("user_audit_log.csv")
manifest = load("evidence_files.csv")
rules = load("deletion_rules.csv")
assert (len(cases), len(identities), len(history), len(manifest), len(rules)) == (518, 850, 306, 94, 15)
owners, current = defaultdict(set), defaultdict(set)
for row in identities:
    email = row["email"].casefold()
    current[email].add(row["user_id"])
    owners[email].add(row["user_id"])
for row in history:
    if row["field_name"] == "email":
        owners[row["old_value"].casefold()].add(row["user_id"])
        owners[row["new_value"].casefold()].add(row["user_id"])
historical = [c for c in cases if not current[c["email"].casefold()] and len(owners[c["email"].casefold()]) == 1]
assert len(historical) == 100
assert all(len(owners[c["email"].casefold()]) == 1 for c in cases)
assert all((DATA / f["file_path"]).is_file() for f in manifest)

replica_only = []
sql_count = 0
for file in manifest:
    if not file["file_path"].endswith(".sql"):
        continue
    sql_count += 1
    with sqlite3.connect(":memory:") as db:
        db.row_factory = sqlite3.Row
        db.executescript((DATA / file["file_path"]).read_text(encoding="utf-8"))
        tables = [x[0] for x in db.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        for primary in [t for t in tables if t.endswith("_primary")]:
            prefix = primary.removesuffix("_primary")
            ids = {r[0] for r in db.execute('SELECT resource_id FROM "' + primary + '"')}
            for replica in [t for t in tables if "replica" in t and (t.startswith(prefix + "_") or t == prefix + "_failover_replica")]:
                for row in db.execute('SELECT * FROM "' + replica + '"'):
                    r = dict(row)
                    if r["resource_id"] in ids:
                        continue
                    record = json.loads(r["record_json"]) if r.get("record_json") else r
                    replica_only.append((file["file_id"], r["resource_id"], record.get("user_id") or record.get("customer_reference"), file["captured_at"]))
assert sql_count == 24
assert len(replica_only) == 13
case = next(c for c in cases if c["case_id"] == "case_105")
uid = next(iter(owners[case["email"].casefold()]))
assert any(resource == "account_6345" and owner == uid and captured <= case["audit_at"] for _, resource, owner, captured in replica_only)
print(json.dumps({"requests":len(cases),"historical_email_cases":len(historical),
    "ambiguous_or_missing_identity_cases":0,"manifest_files":len(manifest),
    "readable_sql_files":sql_count,"replica_only_resources":len(replica_only),
    "case_105_replica_confirmed":True},indent=2))
