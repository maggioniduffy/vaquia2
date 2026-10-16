# Design system — minimal

Principle: **greys carry everything; color only means something.** No brand color fills, no gradients, no colored cards, no decorative icons.

## Tokens (CSS variables, Tailwind v4 `@theme`)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | #ffffff | #0a0a0a | page |
| `--surface` | #fafafa | #111111 | panels, inputs |
| `--border` | #e5e5e5 | #262626 | 1px lines only |
| `--text` | #0a0a0a | #fafafa | primary |
| `--text-muted` | #737373 | #a3a3a3 | secondary, labels |
| `--accent` | #0a0a0a | #fafafa | primary button = inverted text/bg |
| `--danger` | #dc2626 | #f87171 | block, destructive, expired |
| `--warning` | #d97706 | #fbbf24 | warning, expiring soon |
| `--success` | #16a34a | #4ade80 | closed, valid — use sparingly |

Status colors appear as **a dot or a thin left border + text**, never as filled backgrounds.

## Type
- Font: Geist Sans (UI), Geist Mono (numbers in tables/KPIs, `tabular-nums`).
- Scale: 12 / 14 (base) / 16 / 20 / 28. Weights 400 and 500 only; 600 for KPI numbers.

## Layout
- Spacing on a 4px grid. Radius 6px (inputs, buttons), 8px (panels). No shadows except popovers.
- Desktop: left sidebar (text links, no icons required) + content max-width 1200px.
- Mobile/field: bottom bar with 4 items max; **touch targets ≥ 48px** (gloves); primary action pinned to bottom.
- Tables over cards for lists on desktop. Lists with dividers on mobile.

## Components (shadcn/ui base, restyled to tokens)
Button (primary / secondary / ghost / danger), Input, Select, Checkbox, Textarea, Table, Sheet, Dialog, Toast, Badge (dot + text), SignaturePad, SyncIndicator, EmptyState (one line of text + one action).

## Copy
- Spanish (es-AR), "vos" not used in UI — neutral imperative ("Firmar", "Guardar borrador").
- All strings in `src/i18n/es-AR.ts`.
- Alert copy always states *what* and *why*: "Juan Pérez no puede firmar: Trabajo en altura vencido el 02/10."

## Do / don't
- ✅ Hierarchy through size, weight and whitespace.
- ✅ KPI = big mono number + small muted label + small delta.
- ❌ Colored section headers, icon-in-circle decorations, illustration empty states, more than one primary button per screen.
