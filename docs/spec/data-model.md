# Data model

All tenant tables have `id uuid (v7, client-generatable)`, `company_id uuid`, `created_at`, `created_by`. RLS: `company_id = current_company_id()` plus role checks noted below. Only columns that matter are listed.

## Tenancy
| Table | Key columns | Notes |
|---|---|---|
| `companies` | name, cuit, plan, settings jsonb | settings: report_day, timezone, kpi_base |
| `memberships` | user_id, company_id, role enum(worker, supervisor, hse, manager, admin), persona_id? | role lives here |

## People & places
| Table | Key columns | Notes |
|---|---|---|
| `personas` | full_name, dni, crew_id?, active | not every persona is a user |
| `crews` | name, supervisor_persona_id, location_id? | |
| `locations` | name, field (yacimiento), operator_id?, geo point? | |
| `operators` | name, code | YPF, PAE… shared catalog (no company_id) |

## Qualifications (A1)
| Table | Key columns | Notes |
|---|---|---|
| `qualification_types` | name, default_validity_months, issuer, operator_id? | seeded + company-custom |
| `qualifications` | persona_id, type_id, issued_on, expires_on, file_path, status (derived view) | |
| `task_types` | name (altura, confinado, caliente, eléctrico, izaje, general) | |
| `task_requirements` | task_type_id, qualification_type_id | which quals a task needs |

## Records
| Table | Key columns | Notes |
|---|---|---|
| `record_types` | code (toolbox_talk, ats…), current_schema_version | global |
| `records` | type, schema_version, status enum, occurred_at, crew_id, location_id, task_type_id?, author_id, payload jsonb, geo, device_id, amends_record_id? | status per spec/workflow.md#Record states |
| `record_participants` | record_id, persona_id, role (attendee, signer, responsible) | |
| `signatures` | record_id, persona_id, image_path, signed_at, geo, content_hash | |
| `attachments` | owner_type, owner_id, path, mime, taken_at, geo | photos/evidence |

## Validation & audit (append-only)
| Table | Key columns | Notes |
|---|---|---|
| `rules` | code, version, record_type, logic jsonb, severity, message_template, active | new row per version |
| `rule_evaluations` | record_id, rule_id+version, result, severity, explanation, input_hash, evaluated_at | append-only |
| `alert_feedback` | rule_evaluation_id, user_id, kind (false_positive, ack), note | |
| `audit_log` | actor_id, entity, entity_id, action, diff jsonb, at | append-only, trigger-fed |

## Findings & actions
| Table | Key columns | Notes |
|---|---|---|
| `findings` | source (record, rule, manual), record_id?, rule_evaluation_id?, description, severity | |
| `corrective_actions` | finding_id, owner_persona_id, due_on, status, criticality, closed_at, approved_by | overdue = derived |

## KPIs & periods (A2, A3)
| Table | Key columns | Notes |
|---|---|---|
| `man_hours` | period (month), crew_id, hours, source (manual, csv) | |
| `incidents` | occurred_at, kind (near_miss, first_aid, recordable, lti, fatal, environmental), days_lost, record_id?, classified_by | |
| `kpi_*` | SQL views | computed, never stored except in snapshots |
| `periods` | month, status enum, report_draft jsonb, hse_comment, approved_by, approved_at | |
| `period_snapshots` | period_id, kpis jsonb, record_ids uuid[], content_hash, pdf_path | append-only |
| `export_templates` | operator_id, name, format (xlsx/csv/pdf), mapping jsonb, kpi_base, version | |
| `exports` | period_id, template_id+version, file_path, hash, created_by | append-only |

## Notifications
| Table | Key columns | Notes |
|---|---|---|
| `notifications` | recipient_user_id, kind, payload, channel, dedupe_key unique, sent_at, read_at | in-app inbox + send log |
| `push_subscriptions` | user_id, endpoint, keys | |
