# Evaluation report

This report evaluates the **actual final full-dataset execution** against the
32 supplied canonical sample answers. The sample answers are evaluation-only,
not prediction input. No hidden labels were used.

## Measured metrics

| Metric | Numerator / denominator | Score |
|---|---:|---:|
| Case-level deletion-status accuracy | 23/32 | 71.88% |
| Exact complete-row accuracy | 6/32 | 18.75% |
| Ordered operation-sequence accuracy | 7/32 | 21.88% |
| Positional field-level accuracy | 563/1158 | 48.62% |
| Full step precision | 104/134 | 77.61% |
| Full step recall | 104/193 | 53.89% |
| Full step F1 | - | 63.61% |

Full run: **518 cases**; parsed 79 machine-readable
evidence files; 2649 observations; matched ownership for
1649 resources.
Predicted status counts: {"COMPLETE": 154, "INCOMPLETE": 347, "NOT_APPLICABLE": 17}.
Full-output contract validation issues: **0**.

## Independent constructed evaluation cases

- Information-only request: PASS\n- Authorized complete deletion: PASS\n- Incomplete deletion with future remediation: PASS\n- Invalid evidence on future action: PASS

These fixtures test the output protocol only; they do not establish ground
truth for any hidden customer.

## Failures found against the public samples

- case_01: expected COMPLETE (1 steps); predicted INCOMPLETE (0 steps)\n- case_02: expected COMPLETE (1 steps); predicted INCOMPLETE (0 steps)\n- case_03: expected COMPLETE (3 steps); predicted NOT_APPLICABLE (0 steps)\n- case_04: expected COMPLETE (2 steps); predicted INCOMPLETE (0 steps)\n- case_06: expected INCOMPLETE (4 steps); predicted INCOMPLETE (3 steps)\n- case_07: expected INCOMPLETE (4 steps); predicted INCOMPLETE (0 steps)\n- case_08: expected INCOMPLETE (4 steps); predicted INCOMPLETE (3 steps)\n- case_09: expected INCOMPLETE (5 steps); predicted INCOMPLETE (3 steps)\n- case_10: expected INCOMPLETE (4 steps); predicted INCOMPLETE (0 steps)\n- case_12: expected INCOMPLETE (5 steps); predicted COMPLETE (2 steps)\n- case_15: expected INCOMPLETE (5 steps); predicted COMPLETE (2 steps)\n- case_17: expected INCOMPLETE (5 steps); predicted COMPLETE (3 steps)\n- case_18: expected INCOMPLETE (14 steps); predicted INCOMPLETE (9 steps)\n- case_20: expected INCOMPLETE (8 steps); predicted INCOMPLETE (6 steps)\n- case_21: expected COMPLETE (3 steps); predicted COMPLETE (1 steps)\n- case_22: expected INCOMPLETE (8 steps); predicted INCOMPLETE (7 steps)\n- case_23: expected INCOMPLETE (8 steps); predicted INCOMPLETE (7 steps)\n- case_24: expected INCOMPLETE (7 steps); predicted INCOMPLETE (7 steps)\n- case_25: expected COMPLETE (3 steps); predicted COMPLETE (1 steps)\n- case_26: expected COMPLETE (6 steps); predicted NOT_APPLICABLE (0 steps)\n- case_27: expected COMPLETE (6 steps); predicted COMPLETE (5 steps)\n- case_28: expected COMPLETE (6 steps); predicted COMPLETE (4 steps)\n- case_29: expected INCOMPLETE (14 steps); predicted INCOMPLETE (11 steps)\n- case_30: expected INCOMPLETE (14 steps); predicted INCOMPLETE (11 steps)

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
