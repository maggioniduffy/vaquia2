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
- Every form type has versions `draft → published → retired`. A published version is **immutable**; editing it creates a new draft version.
- Only one published version per form type (and per extension) at a time. Retired versions stay readable.
- A record stores `record_type`, `schema_version` and `extension_version?`. It is always rendered and validated with those exact versions, never with a newer one.
- A field `key` is stable across versions and is **never reused** for a different meaning. Removing a field just drops it from new versions.

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

Common to every field: `key` (snake_case, unique in the form), `label` (es-AR), `help?`, `required?`, `visibleIf?`. `visibleIf` is json-logic over other fields of the same record; a hidden field is never required and is not stored.

Signing freezes the form: once the first signature is taken, editing any content clears every signature, so every signer signs the same content (`signatures.content_hash`, spec/data-model.md#Records).

Custom widgets keep built-in forms usable: the attendees picker (charla) and the steps → hazards → controls group (ATS) are `persona`/`group` fields with a `widget` hint that the renderer knows.

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
  - yes/no answered "no".
- The admin sets the severity (`block` or `warn`) and a message template using `{label}` placeholders (e.g. "Presión de neumáticos {presion} psi: por debajo de 150").
- Stored in `rules` with `company_id` and `record_type`. A rule is versioned like any other rule: an edit is a new version, and past evaluations keep theirs.
- Company rules can only reference the company's own fields (custom types or `x_` extension fields). Core rules stay global.

## Offline
- Published schemas (base + extension) and company rules for the current company are cached on the device with the reference data (spec/architecture.md#Offline sync).
- A draft keeps the versions it was started with.
- On sync, the server accepts a record on any version that was published when the draft was created. It validates with that version's compiled Zod plus the rules active for it.

## Permissions
- `admin`: create, edit, publish and retire form types, extensions and field rules.
- `hse`: preview forms and read every version.
- Everyone in the company: read published versions (needed for capture).
- Global rows are read-only for all tenants. Every company row has `company_id` + RLS (spec/data-model.md).

## Downstream
- KPIs only read core fields of built-in forms.
- Export templates (phase 8) can map any `payload.<key>` path, including custom fields.
- The office record detail renders any version with the same renderer in read-only mode.
