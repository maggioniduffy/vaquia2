# Vaquia

HSE platform for oilfield service SMEs (Neuquén basin). PWA on Next.js 16 + Postgres (Neon) + Better Auth.

- Vision and business context: `docs/OVERVIEW.md`
- Plan and current phase: `docs/PLAN.md`
- Specs: `docs/spec/`

## Local setup

Requires Node 22+, pnpm 10, Docker.

```bash
pnpm install
docker compose up -d              # Postgres 17 on localhost:5432
cp .env.example .env.local        # set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:reset                     # migrate + seed (local only)
pnpm dev
```

Demo users from `scripts/seed.mts`. There are no passwords: enter the email, and the 6-digit
code is printed to the `pnpm dev` log (when no email sender is configured):

| Email | Company | Role |
|---|---|---|
| hse@petrosur.test | Petrosur Servicios SRL | hse |
| supervisor@petrosur.test | Petrosur Servicios SRL | supervisor |
| hse@andesservicios.test | Andes Servicios Petroleros SA | hse |
| admin@vaquia.test | both | admin |
| otp@petrosur.test | Petrosur Servicios SRL | supervisor (OTP e2e only) |
| otp-lock@petrosur.test | Petrosur Servicios SRL | supervisor (OTP e2e only) |

"Entrar como invitado" logs into `Empresa Demo` (created by a migration) as `hse`. It is on by
default for now; set `GUEST_LOGIN_ENABLED=false` to hide it.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test   # unit
pnpm test:db                               # RLS + append-only, against DATABASE_URL
pnpm build && pnpm test:e2e                # Playwright: light/dark × desktop/mobile
```

## Deploying (Neon + Vercel)

1. Create a Neon project (Postgres 17, region São Paulo unless the pilot requires otherwise).
2. Migrations run automatically on every merge to `main` that touches `db/migrations`
   (workflow `Migrate Neon`). Set it up once: repo Settings → Secrets and variables → Actions →
   secret `DATABASE_URL` = Neon **direct** connection string (paste it as is), then run the
   workflow by hand (Actions → Migrate Neon → Run workflow). Manual alternative:
   `DATABASE_URL='<neon direct url>' pnpm db:migrate`
3. In Vercel set `DATABASE_URL` (Neon **pooled** URL), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
   (the public URL; can stay unset on previews, it falls back to `VERCEL_URL`) and an email
   sender for the login codes:
   - **Gmail (free, no domain needed):** turn on 2-step verification, create an app password at
     https://myaccount.google.com/apppasswords, then set `SMTP_HOST=smtp.gmail.com`,
     `SMTP_PORT=465`, `SMTP_USER=<your gmail>`, `SMTP_PASSWORD=<the 16-char app password>`,
     `EMAIL_FROM="Vaquia <your gmail>"`. Limit: about 500 emails/day.
   - **Resend:** `RESEND_API_KEY` + `EMAIL_FROM` on a verified domain (without a domain Resend
     only delivers to your own address). Takes precedence over SMTP when set.
4. Create the first company and its admin with the one-off script against the **direct** URL
   (no self-signup: accounts are invite-only):

   ```bash
   DATABASE_URL='<neon direct url>' pnpm admin:create-company \
     --name "Petrosur Servicios SRL" --admin-email ana@petrosur.com.ar \
     --admin-name "Ana López" --cuit 30-71111111-1   # --cuit is optional
   ```

   The admin has no password: they sign in with the 6-digit code sent to their email. The
   script only inserts (it fails if the CUIT already exists). Never run `db:seed` or
   `db:reset` against Neon.
