# Workflow — data chain, states, escalation

## Roles
| Role | Where | Does | Approves |
|---|---|---|---|
| `worker` | Field | Signs records | — |
| `supervisor` | Field, often offline | Creates talks/ATS, collects signatures, uploads evidence | Closure of own crew's actions |
| `hse` | Office + field | Reviews records, manages actions, qualifications, monthly close | Records, actions, report draft |
| `manager` | Office | Dashboards | Monthly report, export |
| `admin` | Office | Company config, rules, templates | — |

`personas` (payroll) ≠ `users` (login). Role lives on `memberships`.

## Chain
Field record → sync → validation (rules + qualifications) → block (back to supervisor) / warn (ack) / ok → accepted → findings? → corrective action → evidence → HSE approval → aggregation → KPIs → monthly close → auto report draft → HSE review → manager approval → period locked + snapshot → operator export.

## Record states
`draft → pending_sync → submitted → (blocked | accepted) → reviewed → locked`
- `draft`/`pending_sync`: device only (IndexedDB).
- `blocked`: Layer 1 failed; returns to supervisor with reason.
- `accepted`: passed, warnings acknowledged.
- `locked`: period approved. Never edited; corrections = new record with `amends_record_id`.
- Server is authoritative; client runs the same rules for instant feedback only.
- Late-synced record dated in a locked period → "pendiente de enmienda" queue.

## Corrective action states
`open → in_progress → pending_approval → closed`; `pending_approval → rejected → in_progress`.
`overdue` is derived (due_on < now and not closed), never stored.

## Period states (monthly)
`open → closing → in_review → pending_approval → approved → exported`
On `approved`: snapshot (KPIs + record IDs + hash), records locked. Exports/PDF come from the snapshot only.

## Escalation
| Event | Supervisor/owner | HSE | Manager |
|---|---|---|---|
| Record blocked | Immediate, on screen | — | — |
| Warning acknowledged | — | Daily digest | — |
| Action assigned | Push + email | — | — |
| Action overdue | Push | Immediate | Weekly digest |
| Action overdue > 7 d | — | Immediate | Immediate |
| Qualification expiring 30/15/7 d | Supervisor of persona | Daily digest | — |
| Qualification expired | Supervisor, immediate | Immediate | Weekly digest |
| Report draft ready | — | Immediate | — |
| Report awaiting approval | — | — | Immediate + every 48 h |

Every notification has a dedupe key; never sent twice. Timezone: America/Argentina/Buenos_Aires.
