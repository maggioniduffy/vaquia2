# Automations

## A1 — Qualification expiry alerts
- Daily job 06:00 ART (Vercel Cron → `/api/cron/a1`).
- Thresholds 30 / 15 / 7 / 0 days. Dedupe key `(qualification_id, threshold)`.
- **One digest per recipient per day**, never one message per item. Recipients per `workflow.md` escalation table.
- At 0 days: status `expired` → Layer 1 blocks that persona from signing ATS/PT whose task type requires it (`task_requirements`).
- Screen "Personal apto / no apto": filter by crew, location, task type.
- Inputs: qualification types (seed: `domain.md`), persona qualifications with expiry + attachment, task type → required qualifications.

## A2 — Monthly report
1. Job on `companies.settings.report_day` (default 1) opens close of previous month; builds **draft**:
   lagging KPIs, leading KPIs, incidents, open/overdue actions, qualification status snapshot, 3-month trend.
2. **Completeness check** lists blockers, each linking to where it's fixed: missing man-hours, records `pending_sync` > 48 h, unresolved blocks, unclassified incidents. KPIs with missing inputs show "incompleto", never a wrong number.
3. HSE reviews, adds narrative, submits.
4. Manager approves or returns with comment.
5. On approve (one transaction): snapshot (KPIs + record IDs + SHA-256 of canonical JSON) → lock period records → PDF (`@react-pdf/renderer`) stored with hash.

## A3 — Operator export
- `export_templates`: versioned JSON mapping snapshot fields → layout (XLSX sheets/columns, CSV, PDF section order). Editable without deploy.
- Supports: column mapping from snapshot paths, static cells, number formats, `kpi_base` override (200k vs 1M HH), per-crew row expansion.
- Only from `approved` periods; generated from snapshot.
- Required-field validation per template before generating.
- Every export stored with file, hash, author, template version (append-only).
- Ship one template (pilot's operator). Others = configuration only. Operator APIs out of scope.

## Supporting: action escalation
Hourly job detects actions crossing due date → escalation rows in `workflow.md`.
