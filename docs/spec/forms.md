# Forms — schemas as data

Every field form (charla, ATS, company checklists) is a **versioned JSON schema**, not hand-written code. Built-in forms are global seed schemas; companies add their own form types, extend the built-ins, and attach rules to their fields (phase 3b). Phase 2 already uses this model for charla and ATS.

## Pieces
| Piece | Where | What |
|---|---|---|
| DSL | `form_schemas.schema` (jsonb) | sections → fields, described below |
| Meta-schema | `src/forms/meta.ts` | validates a DSL document before it can be saved or published |
| Compiler | `src/forms/compile.ts` | DSL → Zod validator; the **same code on client and server** |
| Renderer | `src/forms/render/` | generic field renderer for the field app (390px, touch ≥ 48px, spec/design.md), plus a few custom widgets |

## Versions
- Every form type has versions `draft → published → retired`. A published version is **immutable**; editing creates a new draft, and publishing it makes it current and retires the previous one (`retired_at`). One published version per type × kind × company. Retired versions stay readable.
- A record stores `record_type`, `schema_version` and `extension_version?`. It is validated and rendered with those exact versions, forever, never with a newer one.
- Field `key`s are stable: renaming changes the label only; removing a field drops it from new versions and old records keep it. A removed key is **never reused** (checked on publish against every past version).
- Changing the type of an existing key is rejected on publish: the admin creates a new key.
- Field rules and KPI tags live in the draft and are published with it.

## DSL
```json
{
  "title": "Check-list de camioneta",
  "sections": [
    {
      "key": "vehiculo",
      "title": "Vehículo",
      "fields": [
        { "key": "dominio", "type": "text", "label": "Dominio", "required": true, "maxLength": 10 },
        { "key": "km", "type": "number", "label": "Kilometraje", "min": 0, "unit": "km" },
        { "key": "presion", "type": "number", "label": "Presión de neumáticos", "unit": "psi", "required": true },
        {
          "key": "estado",
          "type": "checklist",
          "label": "Estado general",
          "items": [
            { "key": "luces", "label": "Luces" },
            { "key": "frenos", "label": "Frenos" },
            { "key": "matafuego", "label": "Matafuego vigente" }
          ]
        },
        { "key": "fotos", "type": "photos", "label": "Fotos", "min": 0, "max": 4 },
        { "key": "observaciones", "type": "textarea", "label": "Observaciones", "visibleIf": { "==": [{ "var": "estado.frenos" }, false] } }
      ]
    },
    {
      "key": "cierre",
      "title": "Firma",
      "fields": [{ "key": "conductor", "type": "persona", "label": "Conductor", "role": "signer", "signature": true, "required": true }]
    }
  ]
}
```

### Field types
| Type | Options | Payload value |
|---|---|---|
| `text`, `textarea` | `maxLength` | string |
| `number` | `min`, `max`, `step`, `unit` | number |
| `date`, `time` | `default: "now"` | ISO date / `HH:mm` (ART) |
| `select`, `multiselect` | `options: [{key, label}]` | key / key[] |
| `yesno` | `allowNA` | `"yes" \| "no" \| "na"` |
| `checklist` | `items: [{key, label}]` | `{ [itemKey]: boolean }` |
| `ppe` | items taken from the task type's required PPE | `{ [itemKey]: boolean }` |
| `persona` | `multiple`, `role` (attendee, signer, responsible), `signature` | persona id(s) → also written to `record_participants` (and `signatures`) |
| `crew`, `location`, `task_type` | — | id |
| `signature` | single signature not tied to a persona picker | storage path |
| `photos` | `min`, `max` | attachment ids |
| `geo` | captured automatically | `{lat, lng, accuracy}` |
| `group` | `repeatable`, `min`, `max`, `fields` (max depth 2) | object or object[] |

Common to every field: `key` (snake_case, unique in the form), `label` (es-AR), `help?`, `required?`, `visibleIf?`, `kpiInput?` (see KPI inputs). `visibleIf` is json-logic over other fields of the same record; a hidden field is never required and is not stored.

Signing freezes the form: once the first signature is taken, editing any content clears every signature, so every signer signs the same content (`signatures.content_hash`, spec/data-model.md#Records).

`ppe` items come from `FormReferences.ppeItems`. Phase 2 reference data carries no per-task-type PPE catalogue, so `ppeItems` is empty: the field shows a note and a single "Sin EPP específico" toggle that stores `{}` (required satisfied, nothing invented). Filling `ppeItems` needs a PPE catalogue per task type in `/api/sync/reference` (future phase).

Custom widgets keep built-in forms usable: the attendees picker (charla) and the steps → hazards → controls group (ATS) are `persona`/`group` fields with a `widget` hint that the renderer knows. The ATS widget (`steps_hazards_controls`, repeatable group with child keys `step`, `hazards[]{hazard, controls}`) renders step cards with nested hazard cards; errors are shown per nested path (`steps.0.hazards.1.hazard`); read-only mode lists them as text.

### Limits
At most 100 fields per form (including extension fields), 20 photos per record, 2 levels of nested groups, 50 options per select, and 64 KB of schema JSON. The meta-schema enforces all of these.

## Built-in forms and extensions
- Built-in types (`toolbox_talk`, `ats`) are global rows (`company_id` null), read-only for every company.
- Their **core fields** are locked: rules, KPIs (spec/domain.md) and exports depend on their keys.
- A company can publish an **extension** for a global type (`form_schemas.kind = 'extension'`). An extension can only **append** sections and fields. Its keys must start with `x_`, and it can't hide, remove or change a core field.
- A record of an extended type stores both `schema_version` (core) and `extension_version`.

## Company form types
- Admins create new form types (`record_types.company_id` set).
- These types use the same lifecycle (record states, sync, validation, audit) as the built-in ones.
- They appear in the field app's "Hoy" and capture screens for the company's supervisors.
- Deactivating a type (`active = false`) hides it from capture. Its existing records stay.

## Rules on company fields
- A no-code builder in the office generates json-logic over the form's fields (spec/rules-engine.md). Kinds:
  - comparison (`presion < 150`),
  - range,
  - required-if,
  - checklist item unchecked,
  - yes/no answered "no",
  - creates finding if… (creates a `finding` when true),
  - requires signer with qualification X.
- The admin sets the severity (`block` or `warn`) and a message template using `{label}` placeholders (e.g. "Presión de neumáticos {presion} psi: por debajo de 150").
- Stored in `rules` with `company_id` and `record_type`. Field rules are edited in the form draft and compiled to Layer 1 rules on publish. Each `rules` row stores the `schema_version` it came from; past evaluations keep their rule version (and the record keeps its schema version).
- Company rules can only reference the company's own fields (custom types or `x_` extension fields). Core rules stay global.

## Offline
- Published schemas (base + extension) and company rules for the current company are cached on the device with the reference data (spec/architecture.md#Offline sync).
- A draft keeps the versions it was started with.
- Capture is one URL (`/field/capture`, draft id in the hash) so the service-worker page cache always matches offline. Drafts autosave to the device.
- Deep links keep the pathname and query and use the hash: `/field/capture#/new/<record_type_code>` (e.g. `toolbox_talk`, `ats`) creates a draft of that type and replaces the hash with `#/<draftId>`.
- `occurred_at` and `client_created_at` are frozen when the draft is created. Geo is requested then (8 s timeout, best effort): a denial never blocks submit, and a late fix is not applied once someone has signed.
- Every signer (persona fields with `signature: true`) signs before submit; no "could not sign" option in phase 2. Signature PNG: white background, dark strokes, downscaled until ≤ 200 KB.
- On submit the device stores the `compileForm` output as the payload and hashes that, so `content_hash` matches what the server stores.
- Qualification status shown in pickers is informational (worst status per persona); blocking comes with the rules phase.
- New drafts always start on the current version.
- On sync, the server accepts a record on the current version, or on a retired version if it arrives within 7 days of `retired_at`. It validates with that version's compiled Zod plus the rules published with it.
- After the grace period the record gets the terminal kept error `schema_retired` (422). The device keeps the draft and offers "reiniciar en la versión actual", prefilling the fields whose keys still exist. Nothing is dropped.

## Permissions
- `admin`: create, edit, publish and retire form types, extensions and field rules.
- `hse`: preview forms and read every version.
- Everyone in the company: read published versions (needed for capture).
- Global rows are read-only for all tenants. Every company row has `company_id` + RLS (spec/data-model.md).

## Downstream
- KPIs read core fields of built-in forms, plus custom fields tagged as KPI inputs (below).
- Export templates (phase 8) reference custom fields by `record_type code + field key`, never by label. Before generating, every referenced key must exist in each schema version present in the period; otherwise a clear error lists record type, key and versions.
- The office record detail renders any version with the same renderer in read-only mode.

## KPI inputs
- KPIs use built-in data only. A custom field (company type or `x_` extension field) counts only when the admin tags it with `kpiInput`. Allowed tags are a fixed list in code (`src/forms/kpi-inputs.ts`), never defined by admins:

  | Tag | Compatible field |
  |---|---|
  | `observation_count`, `inspection_planned` | `number` |
  | `near_miss`, `inspection_done` | `yesno` (`"yes"` counts) or a `checklist` item (`true` counts) |
- The meta-schema rejects an incompatible tag on publish.
- Tags are versioned with the schema: a change affects only records filled with the new version. Approved period snapshots never change.
- The dashboard names the custom sources a KPI includes: "incluye datos de: Inspección de grúa v3".
