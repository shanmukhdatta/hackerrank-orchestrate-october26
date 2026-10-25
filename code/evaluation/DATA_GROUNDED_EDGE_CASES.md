# Verified edge cases and architecture — 25 October 2026

This report is based only on supplied participant-facing datasets and reproducible tests. Synthetic fixtures exercise fallbacks that did not occur in the main 518-case data.

## Identity resolution

| Actual main-dataset pattern | Count | Implemented behavior |
|---|---:|---|
| Uniquely identified request email | 518/518 | Deterministic email → user_id graph |
| Historical email but not current email | 100 | Include audit-log old/new emails |
| Ambiguous matched identities | 0 | Reject ambiguous matches rather than last-writer wins |
| Missing identity matches | 0 | Try one evidence-based match using co-occurring explicit email/user_id; reject unresolved |
| Post-audit changes affecting identities | 0 | Do not attribute future identity updates to the past |

Current identifiers include current/historical email, user_id, phone, and email hash. Fuzzy name-only identity merging is forbidden. A distinct non-deletion request is NOT_APPLICABLE, rather than undergoing identity resolution.

## Intent classification

The provided 518 request texts include 508 deletion requests and 10 non-deletion requests (cases 533–542). Rules handle supplied multilingual and negated wording. The classifier now returns internal DELETE / NOT_DELETE / UNCERTAIN; unrecognized intent is not silently marked NOT_APPLICABLE. A live LLM API fallback has not been configured or benchmarked because no supplied request currently needs it. Uncertain new wording requires review or an independent model, rather than repeated identical classifier calls.

## Evidence discovery and state reconstruction

| Observed dataset fact | Why the agent must handle it |
|---|---|
| 94 manifest entries, all present | Parse SQL, JSON, log, PDF, PNG and text evidence |
| 24 SQLite-readable SQL exports | Index records and *physical* store names |
| 13 replica-only account/profile records across those exports | An absent primary does not prove a replica is clean |
| 11 main-case replica-only findings at their cutoffs (in exploratory audit) | Test per-case point-in-time replica tracking |
| 211 resource IDs in multiple files (earlier structured-only extraction) | Compare timing and source instead of blindly deduplicating |
| Enabled connectors and permitted restores appear in JSON | Verify subject linkage and audit-time configuration before flagging risk |

Specific proof: case_105 has account_6345 present in a read replica at the audit cutoff, despite a reported completed deletion. Do not equate a deletion SUCCESS activity with an absent record.

The updated engine now:
1. Parses JSON-formatted service log lines and their trace context.
2. Indexes typed identity clues instead of fuzzy matching by names.
3. Preserves SQL table provenance and reconstructs latest state separately for each physical store.
4. Prefers a corroborated policy violation in any copy over a clean observation of a different copy.
5. Excludes evidence captured or observed after audit_at, and does not trust reported workflow status as proof.

Remaining limitations: negative evidence is sometimes hard to establish from an open-world snapshot; PDF/image extraction can miss or misassociate entries; unmapped data categories and unresolved identities must not be guessed; different snapshot topologies can make historical presence uncertain.

## Deletion policy and actions

All 15 supplied deletion_rules.csv entries remain authoritative. Especially:
- USER_PROFILE requires DELETE, including replica copies.
- ACCOUNT_TOMBSTONE requires REDACT of direct identifiers, preserving stable user_id.
- LEGAL_HOLD_RECORD and SECURITY_AUDIT_LOG require conditional retention.
- Backup and data-flow risks require distinct active-control inspection.
- Unknown policy categories are not silently treated as DELETE.

For COMPLETE, emit evidence-backed VERIFICATION only. For INCOMPLETE, FINDING → REMEDIATION → future VERIFICATION. For NOT_APPLICABLE, emit [].

## Reproduction

From repository root:

```bash
python3 code/extract_media.py
python3 code/evaluation/dataset_edge_tests.py
node code/evaluation/tests.js
node code/evaluation/negative_evidence_tests.js
python3 code/main.py
python3 code/evaluation/main.py
python3 code/evaluation/submission_check.py
python3 code/package.py
```

OCR/PDF text extraction is performed by code/extract_media.py in branch CI.

**Latest measured branch workflow:** 518/518 structurally valid predictions,
94 participant-facing evidence sources parsed, 19 standard regression checks
and 5 scoped-negative-evidence checks passed, 32/32 public-sample status
accuracy, 14/32 exact public-sample rows, and 92.05% public-sample step F1.

**Further observed coverage repair:** The actual operational logs use both
RFC5424 headers and `timestamp | level | service | trace | event` fields.
Connecting those headers to subsequent readback events reduced main-dataset
INCOMPLETE cases with zero grounded steps from 18 to **2**. Those two lack
available matching pre-audit proof; the system does not fabricate findings.
No hidden-case accuracy is claimed.

**Important evidence safeguards:** Negative SQL certificates require at
least two physical copies and an independently associated deletion request;
anonymous analytics certificates require both a verified anonymized state
and uniquely associated activity provenance. Reported SUCCESS/PARTIAL is
never treated as record-state proof.

The development branch is separate from main. Its GitHub Actions workflow
runs complete validation and packages downloadable deliverables without
pushing or submitting anything to the organization.
