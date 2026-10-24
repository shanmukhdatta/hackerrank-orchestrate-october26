# Evaluation report

This report evaluates the **actual final full-dataset execution** against the
32 supplied canonical sample answers. The sample answers are evaluation-only,
not prediction input. No hidden labels were used.

## Measured metrics

| Metric | Numerator / denominator | Score |
|---|---:|---:|
| Case-level deletion-status accuracy | 27/32 | 84.38% |
| Exact complete-row accuracy | 7/32 | 21.88% |
| Ordered operation-sequence accuracy | 8/32 | 25.00% |
| Positional field-level accuracy | 707/1182 | 59.81% |
| Full step precision | 128/160 | 80.00% |
| Full step recall | 128/193 | 66.32% |
| Full step F1 | - | 72.52% |

Full run: **518 cases**; parsed 94 machine-readable
evidence files; 2745 observations; matched ownership for
1674 resources.
Predicted status counts: {"COMPLETE": 156, "INCOMPLETE": 357, "NOT_APPLICABLE": 5}.
Full-output contract validation issues: **0**.
Cases with incomplete assessment but no grounded action steps: **32** (needs further evidence, not fabricated).

## Independent constructed evaluation cases

- Information-only request: PASS
- Authorized complete deletion: PASS
- Incomplete deletion with future remediation: PASS
- Invalid evidence on future action: PASS

These fixtures test the output protocol only; they do not establish ground
truth for any hidden customer.

## Failures found against the public samples

- case_01: expected COMPLETE (1 steps); predicted INCOMPLETE (0 steps)
- case_02: expected COMPLETE (1 steps); predicted INCOMPLETE (0 steps)
- case_03: expected COMPLETE (3 steps); predicted COMPLETE (2 steps)
- case_04: expected COMPLETE (2 steps); predicted INCOMPLETE (0 steps)
- case_06: expected INCOMPLETE (4 steps); predicted INCOMPLETE (3 steps)
- case_07: expected INCOMPLETE (4 steps); predicted INCOMPLETE (3 steps)
- case_08: expected INCOMPLETE (4 steps); predicted INCOMPLETE (3 steps)
- case_09: expected INCOMPLETE (5 steps); predicted INCOMPLETE (3 steps)
- case_10: expected INCOMPLETE (4 steps); predicted COMPLETE (1 steps)
- case_15: expected INCOMPLETE (5 steps); predicted INCOMPLETE (8 steps)
- case_17: expected INCOMPLETE (5 steps); predicted INCOMPLETE (6 steps)
- case_18: expected INCOMPLETE (14 steps); predicted INCOMPLETE (12 steps)
- case_20: expected INCOMPLETE (8 steps); predicted INCOMPLETE (6 steps)
- case_21: expected COMPLETE (3 steps); predicted COMPLETE (1 steps)
- case_22: expected INCOMPLETE (8 steps); predicted INCOMPLETE (7 steps)
- case_23: expected INCOMPLETE (8 steps); predicted INCOMPLETE (7 steps)
- case_24: expected INCOMPLETE (7 steps); predicted INCOMPLETE (7 steps)
- case_25: expected COMPLETE (3 steps); predicted COMPLETE (1 steps)
- case_26: expected COMPLETE (6 steps); predicted COMPLETE (5 steps)
- case_27: expected COMPLETE (6 steps); predicted COMPLETE (5 steps)
- case_28: expected COMPLETE (6 steps); predicted COMPLETE (4 steps)
- case_29: expected INCOMPLETE (14 steps); predicted INCOMPLETE (11 steps)
- case_30: expected INCOMPLETE (14 steps); predicted INCOMPLETE (11 steps)
- case_31: expected COMPLETE (3 steps); predicted COMPLETE (2 steps)

## Contract-validation findings

- None.

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
