# Handoff: Vaquia — Landing page

## Overview
This is the marketing landing page for **Vaquia**, an HSE (health, safety and environment) platform for oil & gas operations in Vaca Muerta, Neuquén. The page shows two surfaces of the product: the field app, which works offline (safety talks, ATS, signatures), and the office panel (validation, corrective actions, monthly close). Its main CTA is **"Solicitar demo"**. All copy is in Spanish (Argentina, *voseo*).

## About the design files
The files in `design/` are **design references built in HTML**. They are prototypes that show the intended look and behavior, not production code. Recreate them in the target codebase's environment (React/Next, Astro, etc.) using its existing patterns. If there is no codebase yet, a static-first framework works best (Next.js, Astro).

To view the reference, open `design/Landing Final.dc.html` in a browser. It needs `support.js`, `Oficina.dc.html`, `Movil.dc.html` and `assets/` in the same folder. The product screenshots on the page are rendered live from `Oficina.dc.html` and `Movil.dc.html`. In production, replace them with exported PNG/WebP screenshots of the real app, in light and dark versions.

## Fidelity
**High-fidelity.** Colors, typography, spacing and copy are final. Recreate them pixel-accurately.

## Layout
- Desktop artboard: **1440px** wide, centered (`justify-content: safe center`). Horizontal section padding is **80px**; the nav and footer use **40px**.
- The reference is desktop-only, so responsive behavior needs to be defined. Suggested breakpoints:
  - ≤1024: grids stack, phones scroll horizontally.
  - ≤640: the hero h1 drops to 44px and the screenshot goes full-bleed.

## Sections (top → bottom)

### 1. Nav (height 76, padding 0 40)
- **Left:** logo mark (34×26) and the wordmark "Vaquia" (Geist 600, 24px, letter-spacing −0.04em).
- **Center:** links "Producto · Campo · Oficina · Contratistas" (15px, `--muted`, gap 36).
- **Right, gap 10:**
  - Theme toggle: 40×40 circle, 1px `--line` border, transparent background, 18px icon. It shows the moon in light mode and the sun in dark mode.
  - "Ingresar": text link, 15px, padding 10/14.
  - "Solicitar demo →": pill button, 15/500, padding 11/20, `--btn` background, `--btn-text` text.

### 2. Hero (padding-top 72, centered column, gap 22)
- **Eyebrow pill:** "HSE PARA OPERACIONES EN VACA MUERTA". Geist Mono 500, 12px, letter-spacing .12em, `--pill` background, padding 7/14, radius 999.
- **H1:** "Menos planillas.<br>Más tiempo en el campo." Geist 600, 76px, line-height 1.0, letter-spacing −0.045em, max-width 980.
- **Lead:** 19px, line-height 1.5, `--muted`, max-width 640. Text: "Vaquia registra charlas, ATS y firmas en el yacimiento —aun sin señal— y las convierte en validaciones, acciones correctivas y cierres mensuales listos para auditar."
- **CTAs (gap 12, margin-top 8):**
  - Primary: "Solicitar demo →" pill, 16/500, padding 14/24.
  - Secondary: "Ver cómo funciona", 1px `--border` outline, padding 14/22.

### 3. ASCII landscape + dashboard (block height 1000, margin-top 56)
- **ASCII canvas:** 1440×760, absolutely positioned at top 0. It renders `assets/patagonia.png` (a Patagonian plateau) as monospace ASCII. Details are under **ASCII background** below.
  - Vertical mask: `linear-gradient(180deg, transparent 0%, #000 30%, #000 82%, transparent 100%)`.
- **Dashboard screenshot:** 1080×720 at left 180 / top 250, radius 14, overflow hidden.
  - Shadow: `0 0 0 1px rgba(31,46,59,.12), 0 40px 100px rgba(15,27,36,.35)`.
  - Content: the "Inicio" screen of the office app, matching the current theme.

### 4. Pillars (padding 40 40 112; 3 equal columns)
- Each column: padding 8/40, gap 14. The first two have a 1px `--line` divider on the right.
- Each column holds:
  - A 28px line icon in `--accent`.
  - A label in Geist Mono 500, 13px, letter-spacing .12em, uppercase.
  - Body text, 16/1.55, `--muted`.

| Icon | Label | Body |
|---|---|---|
| shield | MEJORES DECISIONES | Indicadores calculados con fórmulas visibles, sobre datos que llegaron firmados desde el campo. |
| heart-pulse | MÁS BIENESTAR | Nadie entra a la locación sin aptitud médica, capacitación y EPP al día. El sistema lo bloquea antes. |
| bars | MAYOR EFICIENCIA | Lo que se firma en el pozo llega a la oficina listo para validar. Sin transcribir, sin papeles perdidos. |

### 5. Campo (`--section` background, padding 112/80)
- Grid `360px | 1fr`, gap 48, vertically centered.
- **Left column (gap 20):**
  - Eyebrow "CAMPO · APP MÓVIL": mono 12, `--accent`.
  - H2 "En el yacimiento, funciona sin señal.": 48/1.05, 600, letter-spacing −0.035em.
  - Paragraph, 17/1.55: "Charla de 5 minutos, ATS y firma de la cuadrilla desde el celular del supervisor. Todo queda en cola y se sincroniza al volver la conexión."
  - Chips: mono 12, padding 7/12, 1px `--line` border, pill shape. Labels: "Charla 5 min", "ATS", "Firma en pantalla", "Cola offline".
- **Right column:** 3 phone screenshots, 274×593 each, radius 30, gap 24, right-aligned.
  - Staggered margin-top: 0 / 48 / 96.
  - Shadow: `0 0 0 1px --line, 0 24px 60px rgba(31,46,59,.12)`.
  - Screens in order: Hoy, Charla 5 min, Firma.

### 6. Oficina (padding 112/80, gap 56)
- **Header row (space-between, aligned to the bottom):**
  - Eyebrow "OFICINA · PANEL HSE".
  - H2 "En la oficina, nada se cierra sin revisión." (48px, max-width 640).
  - Paragraph (17px, max-width 420): "Cada registro recorre el mismo camino, con responsable y fecha en cada paso. Lo que se aprueba queda trazado para la auditoría."
- **Steps:** 4 columns with a 1px `--border` line on top, padding-top 28, 1px `--line` dividers between columns. Each step has a number (mono 13, `--accent`), a title (22/600, −0.02em) and a description (15/1.55, `--muted`).
  1. Registro — Llega desde campo con foto, ubicación y firma de la cuadrilla.
  2. Validación — HSE revisa la evidencia y marca observaciones puntuales.
  3. Acción correctiva — Cada desvío tiene responsable, plazo y aprobación.
  4. Cierre mensual — Revisión HSE, aprobación de gerencia y exportación.
- **Screenshot:** 1280×853, radius 14. Content: the "Acciones correctivas" screen of the office app.

### 7. Footer (`--footer` background, padding 96 40 32, overflow hidden)
- **Glow:** two blurred radial ellipses at the bottom.
  - `radial-gradient(ellipse 40% 55% at 22% 105%, rgba(0,209,199,.30), transparent 70%)`
  - `radial-gradient(ellipse 45% 50% at 72% 108%, rgba(140,160,179,.55), transparent 70%)`
- **Top grid (4 columns, gap 32):**
  - Columns 1–2: CTA "Llevá Vaquia a tu próxima operación." (34/600, −0.03em, max-width 460) with a "Solicitar demo →" button below.
  - Column 3, "Producto": Campo / Oficina / Contratistas.
  - Column 4, "Contacto": hola@vaquia.com / Neuquén, Argentina.
  - Column labels: mono 12, `--label`. Links: 16px.
- **Giant wordmark (margin-top 120, gap 36, aligned to the bottom):**
  - Mark at 300×230.
  - "Vaquia": Geist 600, **318px**, letter-spacing −0.06em, line-height .74.
- **Bottom row (margin-top 56, mono 13, `--footer-text`):** "Tecnología que impulsa la salud" on the left, "© 2026 Vaquia" on the right.

## Interactions & behavior
- **Theme toggle:** switches between `light` (the default) and `dark`. It swaps every token below, the product screenshots (light or dark versions), and the ASCII palette, and redraws the canvas. In production:
  - Persist the choice (localStorage).
  - Respect `prefers-color-scheme` on the first visit.
- The CTAs "Solicitar demo" and "Ver cómo funciona" should go to the demo form and scroll to the Oficina section, respectively.
- No animations are specified. A suggestion: a subtle fade-up on scroll (opacity/translateY 12px, 400ms, ease-out).

## ASCII background (canvas)
- Size 1440×760. Font: Geist Mono 500, 9px, `textBaseline: top`. Cell width is the measured width of "M" (about 5.4px); row height is 10px.
- **Sampling:** draw the image "cover"-cropped into a `cols × rows` offscreen canvas, with a vertical bias of 0.6, and read `getImageData`.
- **Per cell:**
  - Luminance `l = .299r + .587g + .114b` (0–1).
  - Character ramp: `" .,:;-~=+*ixcvzXYJLQ0OZmwqpdbkhao#MW&8%B@"`. The index is `floor(l * len)`; a space is skipped.
- **Light theme:**
  - Background `#F5F7FA`; `l` is inverted (`1 − l`).
  - Color is interpolated from teal `#0E9F9A` to navy `#1F2E3B` by `l`.
  - Alpha is `.25 + l*.65`.
- **Dark theme:**
  - Background `#0D1820`.
  - Color ramp: slate `#4A6478` → teal `#00D1C7` (l < .55), then teal → mist `#EEF2F5`. Mix it 70/30 with the pixel's own color.
  - Alpha is `.35 + l*.6`.
- **Performance:** render once per theme and cache it, for example as a pre-rendered PNG for each theme.
- **Source image:** the photo is only 330×247px. The ASCII treatment hides that, but use a higher-resolution photo if you have one.

## State
- `theme: 'light' | 'dark'` is the only state.

## Design tokens

| Token | Light | Dark |
|---|---|---|
| --bg | #F5F7FA | #0D1820 |
| --text | #1F2E3B | #EEF2F5 |
| --muted | #4A5D6E | #B4C2CF |
| --pill | #E6EBF0 | #15232E |
| --border | #C9D3DC | #2B3A47 |
| --line | #D6DEE5 | #22323F |
| --section | #FFFFFF | #111E28 |
| --accent | #0E9F9A | #00D1C7 |
| --footer | #EEF2F5 | #0B151C |
| --label | #5E7387 | #8CA0B3 |
| --footer-text | #3C4F60 | #B4C2CF |
| --logo-dark-stroke | #2E4558 | #4A6478 |
| --btn / --btn-text | #1F2E3B / #F5F7FA | #EEF2F5 / #0D1820 |

**Brand palette:** teal #00D1C7 · navy #1F2E3B · slate #8CA0B3 · mist #F5F7FA.

**Logo gradient:**
- Light: #22E3D9 → #00B5AC
- Dark: #2AF0E5 → #00C2B9

**Typography:**
- Geist (400/500/600) for UI and headings.
- Geist Mono (400/500) for eyebrows, labels and numbers.
- Both are from Google Fonts.

**Type scale:** 76 / 48 / 34 / 22 / 19 / 17 / 16 / 15 / 13 / 12. Headings use negative tracking (−0.02 to −0.06em); uppercase mono labels use +0.12em.

**Radii:**
- 999 (pills and buttons)
- 30 (phones)
- 14 (desktop screenshots)
- 12 (cards)

## Assets
- `logo/vaquia-mark-light.svg`, `logo/vaquia-mark-dark.svg`: the V mark (120×92 viewBox).
  - It was **redrawn by hand** from the brand sheet. Replace it with the official SVG from the brand files if one exists.
- `logo/vaquia-app-icon-light.svg`, `logo/vaquia-app-icon-dark.svg`: app icons, 512×512, radius 112.
- `icons/*.svg`: 24×24 line icons drawn with `stroke="currentColor"`, stroke-width 1.6, round joins and caps.
  - Files: shield, shield-check, heart-pulse, bars, chart, hard-hat, sun, moon.
  - On the page they are drawn at 28px in `--accent` (pillars) and 18px in `--text` (toggle).
  - If the codebase uses Lucide or similar, equivalents are: `shield`, `shield-check`, `heart-pulse`, `bar-chart-3`, `chart-column`, `hard-hat`, `sun`, `moon`.
- `design/assets/patagonia.png`: the source photo for the ASCII hero (330×247, low resolution).
- `icons-preview.html`: a visual sheet of all logos and icons.

## Screenshots
- `screenshots/01–07-light.png`, `screenshots/01–07-dark.png`: the full page, top to bottom, at 1440px width (scaled down to fit), in light and dark theme.

## Files
- `design/Landing Final.dc.html`: the landing page (reference).
- `design/Oficina.dc.html`, `design/Movil.dc.html`: the app screens embedded in the page (screens `inicio`, `acciones`, `hoy`, `charla`, `firma`).
- `design/support.js`: the runtime needed to open the `.dc.html` files.
