# Evaluation report

This report evaluates the **actual final full-dataset execution** against the
32 supplied canonical sample answers. The sample answers are evaluation-only,
not prediction input. No hidden labels were used.

## Measured metrics

| Metric | Numerator / denominator | Score |
|---|---:|---:|
| Case-level deletion-status accuracy | 32/32 | 100.00% |
| Exact complete-row accuracy | 14/32 | 43.75% |
| Ordered operation-sequence accuracy | 14/32 | 43.75% |
| Positional field-level accuracy | 858/1182 | 72.59% |
| Full step precision | 168/172 | 97.67% |
| Full step recall | 168/193 | 87.05% |
| Full step F1 | - | 92.05% |

Full run: **518 cases**; parsed 94 machine-readable
evidence files; 2875 observations; matched ownership for
1844 resources.
Predicted status counts: {"COMPLETE": 157, "INCOMPLETE": 351, "NOT_APPLICABLE": 10}.
Full-output contract validation issues: **0**.
Cases with incomplete assessment but no grounded action steps: **2** (blocking quality gap; needs independent evidence, not fabricated).

## Independent constructed evaluation cases

- Information-only request: PASS
- Authorized complete deletion: PASS
- Incomplete deletion with future remediation: PASS
- Invalid evidence on future action: PASS

These fixtures test the output protocol only; they do not establish ground
truth for any hidden customer.

## Failures found against the public samples

- case_03: expected COMPLETE (3 steps); predicted COMPLETE (2 steps)
- case_09: expected INCOMPLETE (5 steps); predicted INCOMPLETE (3 steps)
- case_15: expected INCOMPLETE (5 steps); predicted INCOMPLETE (8 steps)
- case_17: expected INCOMPLETE (5 steps); predicted INCOMPLETE (6 steps)
- case_18: expected INCOMPLETE (14 steps); predicted INCOMPLETE (12 steps)
- case_20: expected INCOMPLETE (8 steps); predicted INCOMPLETE (6 steps)
- case_21: expected COMPLETE (3 steps); predicted COMPLETE (1 steps)
- case_22: expected INCOMPLETE (8 steps); predicted INCOMPLETE (7 steps)
- case_23: expected INCOMPLETE (8 steps); predicted INCOMPLETE (6 steps)
- case_24: expected INCOMPLETE (7 steps); predicted INCOMPLETE (6 steps)
- case_25: expected COMPLETE (3 steps); predicted COMPLETE (1 steps)
- case_26: expected COMPLETE (6 steps); predicted COMPLETE (5 steps)
- case_27: expected COMPLETE (6 steps); predicted COMPLETE (5 steps)
- case_28: expected COMPLETE (6 steps); predicted COMPLETE (4 steps)
- case_29: expected INCOMPLETE (14 steps); predicted INCOMPLETE (12 steps)
- case_30: expected INCOMPLETE (14 steps); predicted INCOMPLETE (12 steps)
- case_31: expected COMPLETE (3 steps); predicted COMPLETE (2 steps)
- case_32: expected INCOMPLETE (5 steps); predicted INCOMPLETE (4 steps)

## Contract-validation findings

- None.

## Improvements implemented and limitations

- Added historical identifier matching, point-in-time filtering, and
  SQL/JSON/log/PDF/image evidence normalization, with explicit operation order.
- Added per-physical-replica state reconstruction and scoped, independently
  corroborated negative SQL readbacks; source timestamps remain mandatory.
- Added historical provenance verification for anonymized records and trace
  joins for RFC5424 and pipe-delimited structured service logs.
- Added direct readback precedence over operation SUCCESS/PARTIAL claims.
- Added case/field/step and sequence scoring, independent regression fixtures,
  strict audit-cutoff checks, and reproducible submission packaging.
- Remaining limitations: screenshots and PDFs are only approximately interpreted
  using OCR/text extraction and can generate false associations; some
  anonymized records cannot be linked once historical identifiers disappear;
  overlapping snapshots can give conflicting observations; intent detection
  across languages and complex account merges requires refinement.
- The public-sample metrics are the reproducible measurement, **not a claim
  about hidden-case accuracy**.
