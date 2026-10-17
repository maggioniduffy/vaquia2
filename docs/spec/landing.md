# Landing page

Public marketing page at `/`. Source: handoff in `docs/design/landing/` (README + `.dc.html` reference; inline styles there are the exact values).

## Route and behavior
- `/` is in `PUBLIC_PATHS` (`src/lib/routes.ts`). `src/app/page.tsx` reads the session with `auth.api.getSession` (not `getSession()`, which redirects to `/login`): session present -> redirect to `homePathFor(role)`; else render `LandingPage`.
- Metadata from `t.landing.meta`. Smooth scroll via `html:has(.landing)` (disabled for `prefers-reduced-motion`). No JS animations.
- Components: `src/components/landing/` (server components, except `ascii-canvas.tsx` and the shared `ThemeToggle variant="round"`).

## Sections
Nav (76px) · Hero · ASCII landscape + "Inicio" dashboard · Pillars (`#producto`) · Campo (`#campo`, three phones) · Oficina (`#oficina`, 4 steps + "Acciones" screenshot) · Precios (`#precios`, 3 tier cards + Mensual/Anual toggle) · Footer (glows, giant wordmark, bottom row). Desktop artboard max 1440px; section padding 80, nav/footer 40.
- Breakpoints: `min-[68.75rem]:` (>=1100px) is the desktop layout. Below: grids stack, pillars get bottom dividers, phones scroll horizontally with snap, steps 2x2, dashboard in-flow at ~92% width. `<640`: h1 44px, screenshots full-bleed, nav center links hidden, nav sign-up button hidden (hero has it), footer wordmark scales with `vw`. Center links also hidden below 900px.

## Tokens
Landing-only tokens live in `globals.css` under `.landing` (`--l-muted`, `--l-pill`, `--l-border`, `--l-line`, `--l-section`, `--l-footer`, `--l-label`, `--l-footer-text`, `--l-btn`, `--l-btn-text`) with light/dark in the same three patterns as the app tokens (system dark without `data-theme=light`, `[data-theme=dark]`). bg/text/accent reuse app tokens. Theme is the app's cookie toggle.

## ASCII canvas
`AsciiCanvas` (client): 1440x760 logical, Geist Mono 500 9px (family from `--font-geist-mono`), ramp/colors/alphas/0.6 y-bias exactly as the handoff README. Waits for fonts, renders once per theme into an offscreen canvas (cached), redraws on `data-theme` mutation or system scheme change. Decorative (`aria-hidden`), vertical mask gradient.

## Assets
- `public/landing/{inicio,acciones,hoy,charla,firma}-{light,dark}.webp` are **placeholders from the handoff** (renders of the design prototype); replace with real app captures (same names and aspect ratios: inicio 2160x1442, acciones 2560x1708, phones 548x1188). Both themes are rendered; CSS (`.lp-light`/`.lp-dark`) shows the active one (no hydration flash).
- `public/landing/patagonia.png`: 330x247 source photo for the ASCII art (replace with a higher-res photo if available).

## CTAs
- Primary "Crear cuenta" (hero and nav) -> `/signup`.
- Secondary "Ver demo" (hero) -> guest sign-in via a form posting `guestDemo` (`components/landing/actions.ts`, wraps `signInAsGuest`); only when `env.guestLoginEnabled`, otherwise falls back to the "Ver cómo funciona" anchor (`#oficina`).
- "Solicitar demo" -> `mailto:hola@vaquia.com?subject=Demo%20Vaquia`, footer only (swap for a demo form later).
- "Ingresar" -> `/login`. "Ver cómo funciona" -> `#oficina`. "Contratistas" -> `#campo`.

- "Probar 30 días gratis" (pricing cards) -> `/signup?plan=<base|pro|premium>`. The `plan` param is ignored until phase 1c.
- Nav center link "Precios" -> `#precios`.

## Pricing
Plans and prices come from `src/lib/billing/tiers.ts` (single source, reused by billing later). Prices are illustrative (ARS, + IVA); annual = 10x monthly (2 months free). `pricing-toggle.tsx` is the only client piece (Mensual/Anual, `aria-pressed`, default Mensual). Cards: 3 columns at `min-[68.75rem]:`, stacked below.

## Copy
All strings in `t.landing`. Marketing copy uses voseo ("Llevá", "Registrá"); this is the only exception to the no-vos rule in `design.md`.
