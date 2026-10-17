# Detection / validation engine

## Layers
| Layer | What | Phase | Max severity |
|---|---|---|---|
| 1 Deterministic | Missing signatures, signer without valid required qualification, expired inspection, required checklist item unchecked, inconsistent fields | 3 | `block` |
| 3 Semantic (LLM) | Hazards in text not covered by controls; text contradicts checklist; repeated "sin novedad" | 9 | `warn` — **LLM never blocks** |
| 2 Statistical | Per-crew outliers (0 observations vs avg 1.2; 45 s talk) | post-pilot (~3 months data) | `warn` |
| 4 Correlations | 3 near misses same location in 72 h | post-pilot | `info` to HSE/manager |

Severity behavior: `block` = cannot finish/accept; `warn` = explicit ack required; `info` = logged, no interruption.

## Implementation (Layer 1)
- `json-logic-js`, pure evaluator in `src/rules/`, identical client and server.
- Input = normalized context: record + participants + their qualification status + task requirements.
- Output per rule: `{ruleCode, version, result, severity, explanation}`.
- Explanation templates with variables (`{persona}`, `{qualification}`, `{expires_on}`) → es-AR strings.

## Company rules (phase 3b)
Admins build rules on their own form fields with a no-code builder (spec/forms.md#Rules on company fields). The builder emits json-logic for the same Layer 1 evaluator. `block` and `warn` are allowed. Company rules are stored with `company_id`, are versioned, and are logged exactly like global rules. They can never reference core fields of built-in forms.

## Non-negotiables
1. Every alert has a human-readable explanation stating what and why. Never a bare "anomalía detectada".
2. One-click false-positive marking → `alert_feedback`.
3. Every evaluation logged append-only: rule version, input hash, output, timestamp. LLM calls also log prompt version, model id, cost, latency.
4. Rules versioned: an edit creates a new row; past evaluations keep their version.
