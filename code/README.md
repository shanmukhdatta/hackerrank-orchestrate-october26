# Deletion Audit Engine — Reproducible Solution

The engine uses **symbolic AI** (evidence-based inference and explicit policy rules); it makes no external model/API calls and requires no keys. It reads only participant-facing data.

## Run

Requirements: Python 3.9+ (for the starter entrypoint) and **Node.js 18+**.

From the repository root:

```bash
python3 code/main.py
node code/evaluation/tests.js
python3 code/evaluation/main.py
```

The first command produces `output.csv` in the repository root plus `code/evaluation/evaluation_report.md` and `code/evaluation/usage_report.md`. The second runs three independent synthetic scenarios. The third validates that output has the exact schema, all 518 cases, sorted keys, and sequential steps.

## Architecture

1. **Intent gate**: Only deletion requests are audited; unrelated requests are `NOT_APPLICABLE`.
2. **Identity resolution**: Map current email to user ID; merge historical email, phone, and hashed identifiers from `user_audit_log.csv`.
3. **Multisource parsing**: Read direct observations from JSON snapshots, SQL tables, readback logs, and textual handover reports. Timestamp each resource observation with its supplied evidence file ID.
4. **Temporal reconciliation**: For a case, use evidence available no later than `audit_at`, selecting the most recent observation of each linked resource. Do not equate a workflow SUCCESS result to proof.
5. **Policy engine**: Apply `deletion_rules.csv`; retain compliance records, distinguish deleted vs redacted vs anonymized records, block active data flows and restore paths.
6. **Planner**: Emit findings, corrective operations, and verification checks in the exact contract-specified operation order.

## Important limits

- Images/PDFs are not parsed by the zero-dependency runner. The architecture should be extended with optical text/PDF extraction to cover every multimodal evidence source.
- `system_activity.csv` is not treated as an authoritative snapshot because the challenge identifies workflow claims as untrusted.
- The provided sample answers are **evaluation-only**; they never feed prediction decisions.
- Reports state observed results from this deterministic implementation; they do not claim hidden-grader accuracy or LLM usage.

## Files

- `code/main.js`: implementation
- `code/main.py`: compatibility launcher
- `code/evaluation/tests.js`: synthetic-case assertions
- `code/evaluation/main.py`: submission validation
- `code/evaluation/evaluation_report.md`: sample metrics + limitations
- `code/evaluation/usage_report.md`: actual model-token and cost breakdown

To package: `zip -r code.zip README.md code -x '*__pycache__*'`.
