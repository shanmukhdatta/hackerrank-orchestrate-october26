# Deletion Audit Engine — Reproducible Solution

The engine uses **symbolic AI** (evidence-based inference and explicit policy rules); it makes no external model/API calls and requires no keys. It reads only participant-facing data.

## Run

Requirements: Python 3.10+ and **Node.js 18+**. To reproduce the full multimodal evidence run, also install Tesseract OCR and Poppler (`pdftotext`). `code/main.py` automatically extracts missing PDF/screenshot text when both commands are available. GitHub Actions installs them automatically.

From the repository root:

```bash
python3 code/main.py
node code/evaluation/tests.js
python3 code/evaluation/main.py
```

The first command produces `output.csv` and diagnostic CSV/JSON files. The second runs three independent synthetic scenarios. The third generates the measured evaluation and usage reports, checks schema and ordering, and highlights unsupported predictions. The quality of predictions must be assessed separately from build success.

## Architecture

1. **Intent gate**: Only deletion requests are audited; unrelated requests are `NOT_APPLICABLE`.
2. **Identity resolution**: Map current email to user ID; merge historical email, phone, and hashed identifiers from `user_audit_log.csv`.
3. **Multisource parsing**: Read direct observations from JSON snapshots, SQL tables, readback logs, and textual handover reports. Timestamp each resource observation with its supplied evidence file ID.
4. **Temporal reconciliation**: For a case, use evidence available no later than `audit_at`, selecting the most recent observation of each linked resource. Do not equate a workflow SUCCESS result to proof.
5. **Policy engine**: Apply `deletion_rules.csv`; retain compliance records, distinguish deleted vs redacted vs anonymized records, block active data flows and restore paths.
6. **Planner**: Emit findings, corrective operations, and verification checks in the exact contract-specified operation order.

## Important limits

- Images/PDFs are converted to text using local Tesseract and Poppler. OCR is imperfect and can misattribute identities across rows. Without these executable tools, the engine warns and generates lower-coverage results.
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

To package: `python3 code/package.py`. Do not include the raw `dataset/` directory in `code.zip`.
