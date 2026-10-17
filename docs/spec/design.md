# Design system — minimalist

Source of truth for values: `docs/design/vaquia-2/project/` (Claude Design handoff). Prototypes only; read inline styles for exact values, do not render.

## Principle
- **Greys carry the UI.** Hierarchy through size, weight and whitespace.
- **Teal accent** only for: primary action, focus, selection, links, sync state, current period.
- **Red / amber** only as a 6px dot or a thin (1–2px) border + text, **never a fill**. No green: "Válido" is a neutral check.
- Faint grain texture on the page background. No gradients, colored cards, illustrations or decorative icons (office nav icons are functional wayfinding, not decoration).

## Tokens (CSS variables in `src/app/globals.css`, exposed to Tailwind via `@theme`)
| Token | Design name | Light | Dark | Use |
|---|---|---|---|---|
| `--bg` | base | #F5F7FA | #0D1820 | page (with grain) |
| `--surface` | surf | #FFFFFF | #15232E | panels, inputs, dialogs |
| `--border` | bd | #D6DEE5 | #2B3A47 | 1px lines |
| `--text` | tx | #1F2E3B | #EEF2F5 | primary text |
| `--text-muted` | mu | #5A6F82 | #8CA0B3 | secondary, labels |
| `--accent` | ac | #0E9F9A | #00D1C7 | non-text marks only: dots, borders, focus ring/outline, sync dot, stepper ring, selection bar. As text on light it is 2.9:1 (fails) |
| `--accent-strong` | — | #0A7671 | #00D1C7 | text and primary fill: links, active nav/tab text, primary button bg. Measured: light 4.88:1 on bg, 5.24:1 on surface, 4.84:1 on hover, white on it 5.46:1; dark 9.13:1 on bg, 8.41:1 on surface, `--accent-text` on it 8.21:1 |
| `--accent-hover` | — | #08605C | #5CE8E0 | link / primary hover (darker on light, lighter on dark) |
| `--accent-subtle` | acs | rgba(14,159,154,.10) | rgba(0,209,199,.12) | focus ring, selected row/nav |
| `--accent-text` | onac | #FFFFFF | #0D1820 | text on accent |
| `--danger` | dg | #DC2626 | #F87171 | blocked, expired, errors |
| `--warning` | wn | #D97706 | #FBBF24 | warning, expiring, incomplete |
| `--hover` | hov | #EEF2F5 | #1B2B37 | row/button hover, disabled bg |
| `--scrim` | scrim | rgba(31,46,59,.12) | rgba(0,0,0,.45) | dialog/sheet overlay |
| `--grain` | grain | SVG noise, opacity .07 | SVG noise (white), opacity .05 | `background-image` on `body` |

Theme: `theme` cookie (`light` | `dark` | absent = system). Root layout sets `data-theme` on `<html>`; `ThemeToggle` flips it. `themeColor` = #F5F7FA / #0D1820. Never hard-code hex in components; use tokens.

### Brand
Source: `docs/design/landing` (handoff). `VaquiaMark` / `VaquiaWordmark` (`src/components/ui/brand.tsx`): 120x92 mark, gradient + dark half colored by tokens `--logo-from` / `--logo-to` / `--logo-dark` (light #22E3D9 / #00B5AC / #2E4558; dark #2AF0E5 / #00C2B9 / #4A6478), so it follows the theme without JS. Wordmark sizes: `sm` (mark 18px, text 18px, app rows) and `md` (26px / 24px); text is 600, tracking -0.04em. App icons: `src/app/icon.svg` (favicon), `apple-icon.tsx` (180px), `pwa-icon/[size]` (192/512 PNG) and `manifest.ts`; all use the light icon and are public (no session). Muted text on `--hover` (light) is the tightest pair: 4.63:1.

## Type
- Geist Sans (UI); **Geist Mono + `tabular-nums`** for IDs, dates, numbers, counts, KPIs.
- Scale 12 / 14 (base) / 16 / 20 / 28. Field-only sizes (Movil prototype): 13 / 15 / 17 as tokens `text-field-sm` / `text-field-md` / `text-field-lg`. Weights 400 and 500; 600 only for KPI numbers (28px mono, letter-spacing -0.02em).
- Page title 20px/500 with muted 14px subtitle; labels and table headers 12px muted.

## Layout and shape
- 4px spacing grid. Radius **6** controls (buttons, inputs, chips), **8** panels (cards, dialogs, toasts), **4** checkbox and kbd.
- Shadows only on toast (`0 8px 24px rgba(0,0,0,.12)`), dialog (`0 16px 40px rgba(0,0,0,.18)`), side sheet (`-12px 0 32px rgba(0,0,0,.12)`) and popovers. Nothing else.
- **Office:** 224px sidebar (right border), 64px header (bottom border, 24px side padding), page padding `24px 32px`, vertical gap 16–24px. Tables over cards.
  - Sidebar: brand row 64px (bottom border, aligned with the header) = `VaquiaWordmark` (mark 18px + "Vaquia" 18/600) + 1px divider + muted 12px "Gestión HSE"; nav rows 40px with a 20px line icon + label + optional mono muted count; active = `--accent-subtle` bg + 2px `--accent` left border + `--accent-strong` text/icon; footer (top border) = sync dot + "Sincronizado" and mono muted version.
  - Header: company chip (40px, bordered, name + chevron) · search field (36px, max 576px, "Ctrl K" hint; Ctrl/⌘K focuses it) · 40px bordered bell and theme buttons · bordered user chip (avatar + name + role) opening a menu with "Vista campo" and "Cerrar sesión". No breadcrumb.
  - Mobile (< md): no sidebar. Sticky 64px top bar = hamburger (40px bordered) + `VaquiaWordmark` on the left, bell on the right. The hamburger opens a left drawer (288px, max 85vw, scrim): brand row + close, nav sections top to bottom, and a bottom block (top border) with profile (avatar, name, role), company (switcher if several), theme toggle, "Vista campo", "Cerrar sesión" and the version.
- **Field (390px):** 56px header (back arrow, title + muted subtitle, sync pill, 16px side padding); content padding 16px; primary action **52px pinned at the bottom**; **no tab bar** ("Hoy" is the hub); touch targets **≥ 48px**.

## Components (`src/components/ui`)
- **Button** — variants `primary` (accent-strong bg, onac text), `secondary` (surface + border), `ghost` (transparent), `danger` (red text on surface, never a red fill). Sizes `md` 36px/14px, `sm` 28px/12px, `touch` 52px/16px. Disabled = `--hover` bg + muted text. Focus = accent border + `0 0 0 3px var(--accent-subtle)` (bordered control).
- **Link** — `--accent-strong`, no underline, 500; hover `--accent-hover`.
- **Focus** — base rule for everything (links, nav, tabs, icon buttons): `outline: 2px solid var(--accent); outline-offset: 2px`. Bordered controls (input, select, textarea, chip, bordered button) instead use `outline-none` + accent border + `0 0 0 3px var(--accent-subtle)`. Never use box-shadow for active indicators on focusable elements (use border-bottom / border-left) so the focus style is not overridden.
- **Input / Select / Textarea** — 36px, surface, 1px border, radius 6, padding 12; label 12px muted 6px above. Error = red border + 12px red message below (`FieldError`). Dates/IDs in mono.
- **Checkbox** — 16px, radius 4; checked = accent fill + onac check. **Switch** — 32×18.
- **StatusBadge / StatusDot** — 6px dot + text 500: blocked (red dot), warning (amber dot), expiring (hollow amber ring), expired (red dot), valid (neutral muted check, no color), pending (dashed muted ring).
- **SyncIndicator** — 28px bordered pill, 12px: synced (accent dot), offline (muted wifi-off + mono count "Sin conexión · 3 pendientes"), sending (accent refresh icon, muted text "Enviando 2 de 3…").
- **KpiTile** — surface, border, radius 8, padding 16: 12px muted label, 28px/600 mono value (optional status dot), 12px mono muted delta. Incomplete = 2px amber left border + amber 12px note, value "—" muted.
- **Stepper** — 12px steps joined by 1px lines: done = muted check, current = text 500 + ringed accent dot, todo = empty border ring.
- **Table** — header 12px muted, 1px row dividers, rows 40px (44px for two-line cells); hover `--hover`; selected `--accent-subtle` + 2px left accent bar; draft = muted text.
- **FilterChip** — 32px, "Label Value ▾" (label muted), border; active = accent border.
- **Side sheet** — right panel, surface, left border, sheet shadow, scrim behind; header 16px padding with title 500 + close. Mobile: bottom sheet.
- **Dialog** — surface, radius 8, dialog shadow, padding 20; title 16/500, body muted 1.5 line-height, actions right-aligned (secondary + primary).
- **Toast** — surface, radius 8, toast shadow, check icon muted, optional accent "Deshacer" link. Danger/warning toasts add a 2px colored left border.
- **EmptyState** — one line of muted text + at most one action.
- **SignaturePad** — 140px, 1px dashed border, radius 6, signer + time caption in 12px muted/mono.

## Copy
- Spanish (es-AR), "vos" not used in UI — neutral imperative ("Firmar", "Guardar borrador").
- All strings in `src/i18n/es-AR.ts`.
- Exception: the public landing page (`t.landing`) uses voseo; see `landing.md`.
- Alert copy always states *what* and *why*: "Juan Pérez no puede firmar: Trabajo en altura vencido el 02/10."

## Do / don't
- ✅ Hierarchy through size, weight, whitespace; teal only where the principle says.
- ✅ KPI = big mono number + small muted label + small delta.
- ✅ Status as dot/thin border + text; "Válido" as a neutral check.
- ❌ Filled red/amber/green backgrounds or badges; colored section headers; icon-in-circle decorations; illustration empty states; more than one primary button per screen; teal for decoration.

## Screens (reference mockups in `docs/design/vaquia-2/project/`)
Open `Vaquia.dc.html` for the canvas; each screen is a `<dc-import name=… screen=…>`.

| Id | Screen | File · screen |
|---|---|---|
| O01 | Inicio | Oficina · `inicio` |
| O02 | Notificaciones · resumen diario | Oficina · `notificaciones` |
| O03 | Registros · panel lateral | Oficina · `registros` |
| O04 | Detalle de validación | Oficina · `validacion` |
| O05 | Acciones correctivas · aprobación | Oficina · `acciones` |
| O06 | Personal · legajo | Oficina · `personal` |
| O07 | Importar CSV · errores | Oficina · `importar` |
| O08 | Matriz apto / no apto | Oficina · `habilitaciones` |
| O09 | Indicadores · fórmulas | Oficina · `indicadores` |
| O10 | Cierre · revisión HSE | Oficina · `cierre` |
| O11 | Cierre · aprobación gerencia | Oficina · `cierre-aprobacion` |
| O12 | Cierre · aprobado | Oficina · `cierre-aprobado` |
| O13 | Exportaciones | Oficina · `exportaciones` |
| M01 | Hoy | Movil · `hoy` |
| M02 | Charla 5 min | Movil · `charla` |
| M03 | ATS · EPP | Movil · `ats` |
| M04 | Firma | Movil · `firma` |
| M05 | Bloqueo | Movil · `bloqueo` |
| M06 | Sin conexión | Movil · `cola` |
| M07 | Acción con foto | Movil · `accion` |

Components canvas: `Componentes.dc.html`.

## Auth/onboarding shell
Login, sign-up and onboarding share `src/components/auth/brand-shell.tsx` (`BrandShell`): full-bleed `--bg`, top teal/grey glow, ASCII mountains (`AsciiCanvas` from the landing, full width × 520px, `aria-hidden`), logo-only header (`VaquiaWordmark md`), typed `> Bienvenido a Vaquia` (`typed-welcome.tsx`, 85ms/char, full text under `prefers-reduced-motion`) and a 340px form column (16px gutters on mobile) over a soft scrim; no card. The same file exports the field/button class names (`authInput`, `authPrimary`, ...). Tokens `--a-*` (muted text, label, border, input bg, scrim, glow, focus ring; light/dark) are scoped to `.auth-shell` in `globals.css`; the rest reuse app tokens. Theme follows the app theme (`data-theme` / system).
