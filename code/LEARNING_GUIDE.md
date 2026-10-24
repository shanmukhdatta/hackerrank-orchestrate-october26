# Learning guide: Ghost Data Still Exists

## 1. Problem in plain language

A support portal saying “account deleted” is **not proof** that no personal data
remains. An account may still appear in a search index, a database replica,
support attachment, export, marketing segment, cache or backup. A connector
may put an erased email back into a primary system later.

For each case, decide whether the user actually requested deletion, whether
policy-required treatment has happened everywhere, and what should be done
next. An audit is **not** the same as executing deletion. This project produces
the plan; it does not access or mutate real customer data.

## 2. What the input files represent

- `deletion_requests.csv`: 518 customer requests and the timestamp `audit_at`
  at which each status must be evaluated.
- `user_identities.csv`: latest known ID, names, emails, hashes and phones.
- `user_audit_log.csv`: previous aliases (emails or phones may have changed).
- `system_activity.csv`: operation history. These are claims and clues, not
  conclusive proof of current state.
- `deletion_rules.csv`: what to do with each category.
- `evidence_files.csv` + `evidence/`: independent snapshots/readbacks, including
  SQL databases, logs, JSON, screenshots and PDFs.
- `sample_output.csv`: public labels for development-time scoring **only**.
  Do not read this file inside the prediction path.

## 3. Architecture and data flow

```text
Request email + text + audit_at
        |
  Intent classifier
        |
  Identity resolver --> current identifiers + historical aliases
        |
  Evidence loaders --> SQL, JSON, logs, TXT, OCR/PDF text
        |
  Resource resolver --> resource_id, system_id, owner, observed state and time
        |
  Point-in-time arbiter --> latest observation before audit_at
        |
  Policy mapping --> DELETE / REDACT / ANONYMIZE / RETAIN / DISABLE / BLOCK
        |
  Phase planner --> FINDING -> REMEDIATION -> VERIFICATION
        |
  Stable sort + numbered JSON steps --> output.csv
```

A representative result for a live search-index copy has three steps:

1. FINDING: `REPORT_REMAINING_RECORD`, evidence refers to what was observed.
2. REMEDIATION: `DELETE_RECORD`, with empty evidence because it is proposed.
3. VERIFICATION: `VERIFY_RECORD_ABSENT`, empty evidence until performed.

If a deletion is already complete, include only existing evidence-backed
verification steps. For a request unrelated to deletion, output
`NOT_APPLICABLE,[]` rather than authorizing a new destructive action.

## 4. Why policy matters

You cannot just erase everything: a retained security record may have to
remain. Policy says:
- User profile, search entry, cache, export, or exclusive support attachment:
  delete.
- Shared support conversation: redact personal identifiers, keep the context.
- Analytics/telemetry: anonymize so it cannot identify the user.
- Security audit with active retention, legal hold: retain.
- Tombstone: keep the stable internal ID when required but remove personal
  identifiers.
- Data sync/restore: disable or block before it can recreate data.

The planner must verify the **desired end state**, not merely whether an
operation returned "success".

## 5. What each source file does

- `code/main.py`: required `python3 code/main.py` entry point.
- `code/main.js`: main deterministic analysis engine (Node.js 18+).
- `code/extract_media.py`: uses local poppler/Tesseract tools to convert
  PDFs/screenshots into text for inspection (no paid API).
- `code/evaluation/main.py`: 518-row schema validation, public-sample metrics,
  and additional constructed tests.
- `code/package.py`: packages submission-ready `code.zip`.
- `.github/workflows/build-submission.yml`: repeatable execution and commits.
- `code/evaluation/evaluation_report.md`: measured results and known failures.
- `code/evaluation/usage_report.md`: runtime model calls/tokens/costs.

## 6. How to run and debug

Use Python 3.10+, Node.js 18+, and a shell. For image/PDF extraction,
install Tesseract OCR and poppler-utils (not needed for core CSV parsing):

```bash
git clone https://github.com/shanmukhdatta/hackerrank-orchestrate-october26.git
cd hackerrank-orchestrate-october26
python3 code/extract_media.py
python3 code/main.py
python3 code/evaluation/main.py
python3 code/package.py
```

Submit `output.csv` and `code.zip` as separate files, and `log.txt` as the
development chat transcript. Review the contest instructions for any separate
agent-trace artifact. Never upload API secrets.

To reproduce a single mistake:
1. Locate its row in `dataset/sample_deletion_requests.csv`.
2. Read its expected steps in `dataset/sample_output.csv`.
3. Find the cited `evidence_id` path in `dataset/evidence_files.csv`.
4. Inspect its snapshot, identifiers, and timestamp.
5. Compare the predicted row in `code/evaluation/sample_predictions.csv`.
6. Fix the evidence parser or state/policy mapping **generically**, rerun, and
   measure public-sample accuracy. Do not hardcode canonical case answers.

## 7. How to explain this in the AI interview

**Q: Where is AI used if there are zero model calls?**
A: The system is a deterministic symbolic reasoning agent: it decomposes the
task, recovers entity links, reasons over observed state, applies a policy
knowledge base, plans remediation, and validates output constraints. Its
inference process is automated but **does not invoke an LLM**. We report that
plainly and do not claim generative model capabilities.

**Q: Why not trust a 'COMPLETE' workflow status?**
A: A successful delete action only establishes that an operation ran, not that
independent replicas, backups and flows are clean at the audit timestamp.

**Q: Why resolve historical email changes?**
A: Older support/export/search records may refer to the user's old email.
Looking only at the current address misses them.

**Q: Why must finding evidence be cited?**
A: A claim is auditable only when it can be traced to an observation. Future
remediation and verification cannot honestly cite completed proof yet.

**Q: What are the weaknesses?**
A: OCR is imperfect; some identity links disappear after anonymization;
conflicting snapshots require more detailed provenance and store-specific
reconciliation. The measured public sample scores, not speculation, quantify
our present accuracy. Fully eliminating these errors is the next research task.

## 8. What this project teaches

Event sourcing, entity resolution, temporal state reconstruction, data
governance, policy-driven agents, deterministic planning, evaluation metrics,
GitHub CI, reproducibility, and prompt/model-usage accounting.
