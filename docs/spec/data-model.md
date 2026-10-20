# Data model

All tenant tables have `id uuid (v7, client-generatable)`, `company_id uuid`, `created_at`, `created_by`. RLS: `company_id = current_company_id()` plus role checks noted below. Only columns that matter are listed.

## Tenancy
| Table | Key columns | Notes |
|---|---|---|
| `users`, `sessions`, `accounts`, `verifications` | Better Auth (see `src/lib/auth-options.ts`); `users.is_anonymous` for temporary guest sessions | not tenant tables; never granted to `authenticated` |
| `companies` | name, cuit, plan, trial_ends_at?, settings jsonb | settings: report_day, timezone, kpi_base. `plan` in (`trial`, `paid`, `demo`), default `trial`; `trial_ends_at` required when `plan = 'trial'`. `public.company_writable(company)` is false only for an expired trial. Trigger `app.assert_company_writable()` (BEFORE INSERT/UPDATE/DELETE, all roles) on every business tenant table raises `company_read_only` (errcode `VQ001`) for expired trials; global rows (null `company_id`) pass; on `companies`, DELETE is always allowed and UPDATE is allowed when only `plan`/`trial_ends_at` change (ops expire/re-activate) or when the OLD or NEW row is writable; otherwise an expired trial cannot edit itself; on `invitations`, an UPDATE that only moves `pending` to `revoked`/`declined` (changing nothing but `status`/`responded_at`) is allowed on an expired trial, while creating and accepting stay blocked. Not attached to `audit_log`, `user_settings`, auth tables. `cuit` is stored digits-only (11) and checked by `app.cuit_valid()` (prefix 20/23/24/27/30/33/34 + mod-11 check digit; mirrored in `src/lib/cuit.ts`); unique. |
| `create_company(name, cuit, full_name, dni)` | security definer RPC | Self-serve onboarding, atomic: company (`plan='trial'`, `trial_ends_at = now()+30 days`) + persona + admin membership + `user_settings.active_company_id`. Errcode `42501` if unauthenticated, anonymous or the caller already has a membership; `22023` (`invalid_name`/`invalid_full_name`/`invalid_cuit`/`invalid_dni`) on bad input (CUIT is required here, though `companies.cuit` stays nullable for legacy/demo rows); duplicate CUIT raises `23505`. Serialized per user with an advisory lock. Returns the company id. |
| _(planned, 1c)_ | `companies.tier`, `billing_interval`, `subscriptions`, `billing_events` | see spec/billing.md |
| `memberships` | user_id, company_id, role enum(worker, supervisor, hse, manager, admin), persona_id? | role lives here; `persona_id` unique per company (one login per persona); memberships are created only by `create_company()` (first admin) or `accept_invitation()`, never by granting access directly; link/unlink and role changes are admin-only; the last admin can't be demoted or removed, and admins can't remove themselves; DELETE is always allowed, even on an expired trial (revoking access must work) |
| `invitations` | company_id, email (lowercase), role, persona_id (composite FK to personas), invited_by, status (`pending`/`accepted`/`declined`/`revoked`), responded_at | Access grants are pending invitations; no user or membership is created until the invited person accepts. Unique pending per (company, email) and per (company, persona). RLS: admins of the company select, insert (`pending` only) and update (pending → `revoked`); no delete; business trigger `assert_company_writable` and `audit_row`. Invitee side via security definer RPCs matched on the caller's `users.email` (non-anonymous only): `my_invitations()` (id, company name, role, invited_at; nothing else), `accept_invitation(id)` (inserts the membership with the persona link, marks accepted, sets the active company; errcode `P0002` if not pending/not addressed to the caller, `23505` if already a member) and `decline_invitation(id)`. |
| `user_settings` | user_id (pk), active_company_id | user-scoped, not tenant. Written only via `set_active_company()`. `current_company_id()` = active company if still a member, else oldest membership. `my_companies()` feeds the switcher. |

**Accepted risk: CUIT squatting.** CUITs are public, so someone can register a company with another firm's CUIT and block the real one (unique `companies.cuit`). The duplicate error shows a support contact; ops resolves it manually by nulling or reassigning `companies.cuit` via SQL with the owner pool. Verifying CUIT ownership is planned together with billing (phase 1c).

## People & places
| Table | Key columns | Notes |
|---|---|---|
| `personas` | full_name, dni (unique per company), crew_id?, active | not every persona is a user; `memberships.persona_id` links a login to a persona |
| `crews` | name (unique per company), supervisor_persona_id?, location_id? | |
| `locations` | name (unique per company), field (yacimiento), operator_id?, lat?, lng? | plain numeric lat/lng (no PostGIS); set from the form's map/search/paste picker (spec/design.md#Location picker) |
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
| `record_types` | company_id? (null = global built-in), code, name, active | built-ins seeded by migration with fixed ids, read-only; company types written by `admin` (phase 3b). Code unique per company (`nulls not distinct`), and a company code may not shadow a global code. Everyone reads global + own |
| `form_schemas` | record_type_id, company_id?, kind (`base`, `extension`), version int, schema jsonb, status (`draft`, `published`, `retired`), published_at, published_by | unique (record_type, company, kind, version) `nulls not distinct`; at most one `published` per type × kind × company (partial unique index, `nulls not distinct`); extensions only for global types. Guard trigger (BEFORE UPDATE/DELETE, all roles): non-draft rows reject DELETE and only allow `published → retired`; `record_type_id, company_id, kind, version, schema, published_at, published_by` frozen once published. Members read global + own `published`/`retired`; drafts only `admin`/`hse`. Phase 2 grants select only (also on `record_types`); writes arrive in 3b |
| `records` | id (client UUIDv7), record_type_id, schema_version, extension_version?, status `record_status`, occurred_at, crew_id, location_id, task_type_id?, author_id, payload jsonb, submission_hash, geo_lat/geo_lng/geo_accuracy?, device_id, client_created_at, submitted_at, amends_record_id? | see rules below |
| `record_participants` | id, record_id, persona_id, role (`attendee`, `signer`, `responsible`) | unique (record, persona, role) |
| `signatures` | id (client UUIDv7), record_id, persona_id, image_path, signed_at, geo_lat/geo_lng/geo_accuracy?, content_hash | unique (record, persona); never updated |
| `attachments` | id (client UUIDv7), record_id?, (later) corrective_action_id?, path, mime, size, taken_at, geo_lat/geo_lng? | exactly one owner (`num_nonnulls(...) = 1`; phase 2 only `record_id`, widened when `corrective_action_id` arrives), composite FKs per owner; mime jpeg/png/webp, size ≤ 5 MB (the client compresses photos) |
| `record_conflicts` | id, record_id, envelope jsonb (≤ 512 KB), device_id, author_id, received_at | conflict copies for HSE. Insert: `supervisor`/`hse`/`admin`, `author_id = app.current_user_id()`, record visible to the caller. Read: `hse`/`admin` and the submitter |

### Rules
- **References.** `record_type_id` and `task_type_id` are plain FKs checked by `check_global_or_own_ref` (global-or-own, as in qualifications). Crews, locations, personas, `amends_record_id`, and child → record links are composite `(company_id, x_id)` FKs. `records` has `unique (company_id, id)`.
- **Version pin.** A trigger checks the record's versions exist as `published` or `retired`: base = `kind = 'base'` with the record type's own `company_id` (global type → global base; a company cannot override a global base); extension = `kind = 'extension'`, `company_id = records.company_id`, only when the type is global (`extension_version` on a company type is rejected). `record_types.active` is not checked (offline drafts of a deactivated type still sync).
- **Insert.** `supervisor`/`hse`/`admin`. A BEFORE INSERT trigger forces `status = 'submitted'`, `submitted_at = now()`, `author_id = app.current_user_id()`; RLS `with check` repeats `status = 'submitted' and author_id = app.current_user_id()`. Bounds: `octet_length(payload::text) <= 256 KB`, lat/lng ranges (both set or both null; accuracy needs them), client ids must be UUIDv7 (`public.is_uuid_v7()`).
- **Children.** Participants, signatures and attachments insert only when the parent record is authored by the caller, `status = 'submitted'` and `created_at = now()` (same transaction as the record). A signature's persona must be a `signer`/`attendee` participant of the record (trigger).
- **Read.** Author, or `hse`/`manager`/`admin`. Exception: when the caller is an anonymous guest (`users.is_anonymous`), only their own records (guests share the demo company). Children are readable when their record is.
- **Immutability.** Children (`record_participants`, `signatures`, `attachments`) and `record_conflicts` reject every UPDATE/DELETE (`reject_mutation()`, all roles). `records_guard` (BEFORE UPDATE/DELETE, all roles): DELETE always rejected; UPDATE rejected when `old.status = 'locked'` or when any column other than `status` (and future `reviewed_*`) changes. `authenticated` gets select + insert only; status transitions come as functions in phase 3. A `blocked` or `locked` record is never edited: the fix is a **new record with `amends_record_id`** (workflow.md).
- **Hashes.** `submission_hash` = sha256 of the canonical envelope (record columns + payload + participants + signature ids/content hashes), computed by the server; phase 3 reuses it as `input_hash`. `content_hash` of a signature = sha256 of the canonical envelope without signatures; the server recomputes it and rejects a mismatch. The form freezes once the first signature is taken: editing content clears every signature (UX rule, spec/forms.md).
- **Files.** Keys are built by the server, never taken from the client: `signatures.image_path = company_id || '/signatures/' || id || '.png'`, `attachments.path = company_id || '/records/' || record_id || '/' || id || '.' || ext` (check constraints), so each image is single-use. `/api/files` authorizes these prefixes by reading the row under RLS.
- **Triggers.** `assert_company_writable()` on all seven tables (global rows pass). `audit_row()` on `records`, `record_participants`, `signatures`, `attachments`, `record_conflicts`, and on `record_types`/`form_schemas` only for company rows (split triggers `when (new|old.company_id is not null)`, since `audit_log.company_id` is not null). None of the shared triggers read table-specific columns.

### Sync endpoints (spec/architecture.md#Offline sync)
- Every outbox item carries its `company_id`; the endpoint checks membership and runs `withUser()` scoped to that company, else `409 wrong_company`.
- `POST /api/sync/blobs`: requires `supervisor`/`hse`/`admin` and `company_writable()` (no DB row protects it), sniffs PNG bytes, ≤ 200 KB, rate-limited per user. **Write-once**: conditional put (R2 `If-None-Match: *`, local `wx`); same sha256 already stored → `ok`; different → `409`. Guests may upload signatures only; photos are rejected server-side on `is_anonymous`.
- `POST /api/sync/records`: inserts record + participants + signatures in one transaction with `on conflict (id) do nothing`, then:
  - row visible, same `submission_hash` → `ok` (idempotent re-send);
  - row visible, different hash → `record_conflicts` row (insert by the author or `hse`/`admin`) + `ok` with `conflict: true`;
  - row invisible or conflict insert denied → `409 id_conflict`.
  - Children are inserted only when the record row was actually inserted: their RLS requires the record's own transaction, and `with check` runs before conflict detection, so a re-send must compare hashes first and never re-insert children.
- Terminal-but-kept errors: `read_only` (VQ001, trial expired while offline), `forbidden` (membership revoked), `wrong_company`, `id_conflict`, plus `invalid` (envelope, payload or content hash rejected, or a DB integrity error) and `blob_rejected` / `blob_conflict` (wrong type, too large, guest photo, same id with different bytes), because retrying cannot change them. A record whose blob is kept is itself kept as `blob_rejected`. The device keeps and flags those items; it never retries them blindly and never drops them. Everything else retries with backoff.
- **Wire format** (`src/lib/sync/envelope.ts`, logic in `src/lib/sync/server/`). Blobs: raw body, `Content-Type` = mime, headers `X-Company-Id`, `X-Blob-Id`, `X-Blob-Kind` (`signature`|`photo`), `X-Blob-Sha256`, `X-Record-Id` (photos). Records: JSON envelope (record columns, payload, participants, signatures, attachments); no paths or hashes are trusted except a signature's `content_hash`, which is recomputed. Responses: `200 {ok: true, conflict?}` or `{error: code}`: 403 `read_only`/`forbidden`, 409 `wrong_company`/`id_conflict`/`blob_conflict`/`blob_missing`, 422 `invalid`/`blob_rejected`, 401, 429 (+`Retry-After`), 5xx. 401, 429, 5xx, network errors and `blob_missing` retry.
- **Company check.** The item's `company_id` must equal the caller's active company; a member of another company gets `wrong_company`, a non-member `forbidden`.
- **Payload.** The server loads the pinned base (and extension) `form_schemas` row (`published` or `retired`) and validates with `compileForm`; the validated output is what is stored. `submission_hash` hashes record columns + payload + participants + signature ids/persona/content hashes (attachments are covered by the payload's photo fields); `content_hash` hashes the same without signatures (`src/lib/sync/canonical.ts`, used by device and server). Blobs must already be stored when the record arrives (`blob_missing`, retried).
- **Conflict copies** are de-duplicated: a retry of the same conflicting envelope (same `submission_hash`, kept inside `envelope`) does not add another `record_conflicts` row.
- **Write-once blobs.** The storage driver has no conditional put yet, so the server does exists-then-put and compares sha256 (not atomic; a race needs two devices sending different bytes for one UUIDv7). Replace with `If-None-Match: *` / `wx` when the driver gains `putIfAbsent`.
- **Outbox & retry.** Blobs are enqueued before their record in one Dexie transaction; the record is sent only when none of its blobs is still queued. Backoff 5 s doubling to 15 min, half of each delay randomized; `Retry-After` is honored. Triggers: Background Sync (tag `vaquia-sync`, Android Chrome; the service worker runs the same runner), and on iOS/others app open, `visibilitychange`, `online` (ignores backoff) and a timer for the earliest scheduled retry. Local draft, blobs and outbox rows are deleted only after the record is confirmed.
- **Sign-out.** `cleanupOnSignOut(companyIds)` (`src/lib/sync/outbox.ts`) removes a company's drafts, blobs and cached reference rows only if that company's outbox is empty (kept/flagged items count as unsynced); the `field-pages` cache is cleared only when the whole device outbox is empty. Otherwise everything stays so nothing unsynced is lost.
- Accepted risk: a uniform 409 tells a prober only whether a guessed UUIDv7 id exists (74 random bits).
- Device heartbeat (architecture.md) is not part of phase 2.

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
