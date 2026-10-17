# Data model

All tenant tables have `id uuid (v7, client-generatable)`, `company_id uuid`, `created_at`, `created_by`. RLS: `company_id = current_company_id()` plus role checks noted below. Only columns that matter are listed.

## Tenancy
| Table | Key columns | Notes |
|---|---|---|
| `users`, `sessions`, `accounts`, `verifications` | Better Auth (see `src/lib/auth-options.ts`); `users.is_anonymous` for temporary guest sessions | not tenant tables; never granted to `authenticated` |
| `companies` | name, cuit, plan, trial_ends_at?, settings jsonb | settings: report_day, timezone, kpi_base. `plan` in (`trial`, `paid`, `demo`), default `trial`; `trial_ends_at` required when `plan = 'trial'`. `public.company_writable(company)` is false only for an expired trial. Trigger `app.assert_company_writable()` (BEFORE INSERT/UPDATE/DELETE, all roles) on every business tenant table raises `company_read_only` (errcode `VQ001`) for expired trials; global rows (null `company_id`) pass; on `companies` UPDATE the NEW row is checked so ops can re-activate. Not attached to `audit_log`, `user_settings`, auth tables. `cuit` is stored digits-only (11) and checked by `app.cuit_valid()` (prefix 20/23/24/27/30/33/34 + mod-11 check digit; mirrored in `src/lib/cuit.ts`); unique. |
| `create_company(name, cuit, full_name, dni)` | security definer RPC | Self-serve onboarding, atomic: company (`plan='trial'`, `trial_ends_at = now()+30 days`) + persona + admin membership + `user_settings.active_company_id`. Errcode `42501` if unauthenticated, anonymous or the caller already has a membership; `22023` (`invalid_name`/`invalid_full_name`/`invalid_cuit`/`invalid_dni`) on bad input (CUIT is required here, though `companies.cuit` stays nullable for legacy/demo rows); duplicate CUIT raises `23505`. Serialized per user with an advisory lock. Returns the company id. |
| `memberships` | user_id, company_id, role enum(worker, supervisor, hse, manager, admin), persona_id? | role lives here; `persona_id` unique per company (one login per persona); link/unlink and role changes are admin-only; the last admin can't be demoted or removed, and admins can't remove themselves |
| `user_settings` | user_id (pk), active_company_id | user-scoped, not tenant. Written only via `set_active_company()`. `current_company_id()` = active company if still a member, else oldest membership. `my_companies()` feeds the switcher. |

## People & places
| Table | Key columns | Notes |
|---|---|---|
| `personas` | full_name, dni (unique per company), crew_id?, active | not every persona is a user; `memberships.persona_id` links a login to a persona |
| `crews` | name (unique per company), supervisor_persona_id?, location_id? | |
| `locations` | name (unique per company), field (yacimiento), operator_id?, lat?, lng? | plain numeric lat/lng (no PostGIS) |
| `operators` | name, code (unique) | YPF, PAE… shared catalog (no company_id), read-only for users |

Same-company references use composite FKs `(company_id, x_id) → x(company_id, id)`, so a row can never point at another tenant's crew/location/persona.
Writes (insert/update/delete) on people & places: `hse`, `admin`. Every member of the company reads them.

## Qualifications (A1)
| Table | Key columns | Notes |
|---|---|---|
| `qualification_types` | company_id? (null = global seed), name, default_validity_months?, issuer?, operator_id? | global rows read-only; company rows written by `hse`/`admin` |
| `qualifications` | persona_id, type_id, issued_on, expires_on? (null = no expiry), file_path? | **renewal = new row**; the current one per persona × type is the latest `issued_on` (ties: latest `created_at`). Never updated to "renew"; corrections allowed by `hse`/`admin` |
| `task_types` | company_id? (null = global seed), code, name | seed: general, altura, espacio_confinado, trabajo_en_caliente, electrico, izaje |
| `task_requirements` | company_id? (null = global default), task_type_id, qualification_type_id | which quals a task needs; company rows add to the global defaults |

Status of a persona's current qualification, computed on the ART date (`America/Argentina/Buenos_Aires`), never stored:
- `expired`: `expires_on <= today` (0 days left counts as expired, matching A1's 0-day threshold);
- `expiring`: `expires_on <= today + 30`;
- `valid`: otherwise, or `expires_on` is null;
- `missing`: the task requires the type and the persona has no qualification of that type.

A persona is **apto** for a task type when every required type is `valid` or `expiring`.
Views use `security_invoker` so RLS of the underlying tables applies.

Files (certificates): stored by `src/lib/storage` under `{company_id}/qualifications/{id}/{name}`; local disk in dev/CI, Cloudflare R2 in production. Downloads go through an authenticated route that checks the key's company prefix against the current company. Attaching a file is optional until R2 is configured.

## Records
| Table | Key columns | Notes |
|---|---|---|
| `record_types` | company_id? (null = global built-in), code (unique per company; toolbox_talk, ats…), name, active | built-ins read-only; company types written by `admin` (spec/forms.md) |
| `form_schemas` | record_type_id, company_id?, kind (base, extension), version, schema jsonb, status (draft, published, retired), published_at, published_by | published rows immutable; one published per type × kind × company; extensions only for global types |
| `records` | type, schema_version, extension_version?, status enum, occurred_at, crew_id, location_id, task_type_id?, author_id, payload jsonb, geo, device_id, amends_record_id? | status per spec/workflow.md#Record states |
| `record_participants` | record_id, persona_id, role (attendee, signer, responsible) | |
| `signatures` | record_id, persona_id, image_path, signed_at, geo, content_hash | |
| `attachments` | owner_type, owner_id, path, mime, taken_at, geo | photos/evidence |

## Validation & audit (append-only)
| Table | Key columns | Notes |
|---|---|---|
| `rules` | company_id? (null = global), code, version, record_type, logic jsonb, severity, message_template, active | new row per version; company rules only reference the company's own fields (spec/forms.md) |
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
