# FamilyCradle: Business Requirements Document (BRD) and Build Specification

| Item | Value |
|---|---|
| Product | FamilyCradle (newborn and baby tracker PWA) |
| Document version | 1.0 |
| Date | 22 Nov 2026 |
| Product owner | Fadhil |
| Status | Approved for build (Phase 1) |
| Audience | Product owner and the AI coding agent / developers building the app |

> **How to use this document (for the AI coding agent):**
> 1. Read the whole document before writing code. Sections 5 to 11 are the technical contract.
> 2. Build **Phase 1 only** first (see Section 16). Do not start Phase 2 items until Phase 1 Definition of Done is met.
> 3. Every requirement has an ID (e.g. `FR-MILK-03`). Reference these IDs in commit messages and code comments where useful.
> 4. Items marked **[VERIFY]** contain medical or reference values that must be stored as configurable seed data, never hard-coded in business logic, and must be reviewed before public launch.
> 5. When something is unclear, follow the rule "simplest option that keeps data correct and secure" and add it to `docs/DECISIONS.md`.

---

## 1. Product overview

### 1.1 Vision
FamilyCradle is a shared daily journal for a baby and the people caring for them. Mom, Dad and the caregiver (babysitter / nanny) record everything that happens in the baby's day (milk, breastfeeding, sleep, diapers, MPASI, pumping, medicine, growth, vaccines and milestones) from their own phones, and everyone sees the same live picture. Over time, the app turns these records into growth analytics and friendly AI insights.

### 1.2 Problems it solves
- Parents and caregivers lose track of "when was the last feed / pup / nap" especially at 3 AM.
- Information is scattered across WhatsApp messages, paper notes and the Buku KIA.
- Handover between Mom, Dad and the caregiver is verbal and error-prone.
- Doctor visits need history (feeding, meds, growth, vaccines) that nobody has in one place.
- Parents want to know "is my baby growing well?" in simple language.

### 1.3 Goals and success metrics
| Goal | Metric | Target (first 3 months after public launch) |
|---|---|---|
| Fast logging | Taps needed for a quick log (bottle with shortcut, diaper) | ≤ 2 taps after opening the app |
| Shared usage | Families with ≥ 2 active members | ≥ 50% of active families |
| Retention | Families logging on ≥ 5 of the last 7 days | ≥ 40% |
| Reliability | Successful sync of offline entries | ≥ 99.5% |
| Trust | AI insights reported as wrong/unsafe | < 1% of generated insights |

### 1.4 Product principles
1. **One-hand, half-asleep friendly.** Big tap targets, minimal typing, sensible defaults, works in a dark room.
2. **Shared truth.** Every entry shows who recorded it. Timers live on the server, so they can be started on one phone and stopped on another.
3. **Calm, warm, unisex.** Soft brown base with gentle accent colors; no pink/blue gender coding.
4. **Safe, not clinical.** The app informs and nudges ("konsultasikan ke dokter"); it never diagnoses or prescribes.
5. **Private by default.** Only family members can see a family's data. No public profiles, no social features.

---

## 2. Scope

### 2.1 In scope (all phases)
| # | Module | Short description | Phase |
|---|---|---|---|
| M1 | Milk (Susu) + daily target | Bottle feeds (formula or expressed breast milk / ASIP) with a weight- and age-based daily target that parents can adjust | 1 |
| M2 | Breastfeeding (DBF / Nenen) | Direct breastfeeding sessions by side, with server-side timer or manual entry | 1 |
| M3 | Diaper (Popok & Pup) | Wet / pup / mixed, pup amount, consistency, color | 1 |
| M4 | Sleep (Tidur) | Sleep sessions with category (nap / night) and location, timer or manual, wake window suggestion | 1 (wake window suggestion rule-based in 1) |
| M5 | MPASI | Solid food sessions, foods, texture stage, portion, reactions, new-food allergy watch | 1 |
| M6 | Pumping ASI | Pumping sessions, combined (default) or per side volume, daily total | 1 |
| M7 | Medicine (Obat) | Name, dose, unit, route, time, notes; full history | 1 |
| M8 | Growth (Pertumbuhan) | Weight, length/height, head circumference entries | 1 (entry and list) / 2 (WHO charts, percentiles, analytics) |
| M9 | Vaccine (Vaksin) | Auto-generated IDAI 0–24 month schedule, editable by family, custom vaccines, automatic status | 1 |
| M10 | Milestone | CDC age-based checklist | 1 (checklist) / 2 ("perlu perhatian" flags) |
| X1 | Family and roles | Family, invite code, Mom / Dad / Caregiver roles, multiple families per user, multiple children | 1 |
| X2 | Timeline and Today dashboard | Unified day timeline, daily summary, quick actions | 1 |
| X3 | Twins / multiple children | Fast child switcher, "log for both / all" | 1 |
| X4 | Offline PWA and polling sync | Installable, offline queue, sync every few seconds | 1 |
| X5 | Language | Bahasa Indonesia, English, Mixed | 1 |
| X6 | Night mode | Auto dim theme at night | 1 |
| X7 | Analytics | Weekly analytics, WHO growth charts and percentiles | 2 |
| X8 | AI insights (Gemini) | Weekly summary, pattern insights, growth alerts explained, suggestions | 2 |
| X9 | Web push notifications | Feeding/pumping intervals, med next dose, vaccine reminders, forgotten timer | 2 |
| X10 | PDF doctor summary | Downloadable PDF for pediatrician visits | 2 |

### 2.2 Out of scope (v1, both phases)
- Payments, subscriptions, PRO tiers or paywalls (all features free; AI usage is rate-limited per family).
- Data export (CSV/JSON). Account and family deletion **are** in scope.
- AI Q&A chat.
- Email notifications other than account emails (verification and password reset).
- Social login (Google, Apple). Email + password only.
- Photo uploads (child avatar uses an illustrated avatar picker or initials).
- Breast milk stash / freezer inventory.
- Native mobile apps (PWA only).
- Imperial units and 12-hour time format.
- Mother's own health tracking (postpartum, mood) beyond pumping.

---

## 3. Users, roles and permissions

### 3.1 Personas
| Persona | Description | Key needs |
|---|---|---|
| Bunda (Mom) | Often the primary night feeder, may breastfeed and pump | Fast DBF timer, pumping log, last side used, dim screen |
| Ayah (Dad) | Shares feeding (bottle), diapers, sleep; often checks status at work | See live status, add logs quickly, growth and vaccine overview |
| Caregiver (Mbak / Nanny / Babysitter) | Cares for the baby during the day | Log everything quickly, see what happened before their shift, see insights |

### 3.2 Roles
A user's role is **per family** (a user can be a Caregiver in one family and Dad in another).

| Role value | Display (ID / EN) | Permission group |
|---|---|---|
| `mom` | Bunda / Mom | Parent |
| `dad` | Ayah / Dad | Parent |
| `caregiver` | Pengasuh / Caregiver | Caregiver |

Rules:
- `mom` and `dad` have **identical** permissions (Parent group). The label is only for display.
- A family can have more than one member with the same role (no uniqueness constraint).
- The person who creates a family chooses their own role (`mom` or `dad`).
- There is **no** read-only Viewer role. Only family members can see family data.

### 3.3 Permission matrix
| Capability | Parent (Mom/Dad) | Caregiver |
|---|---|---|
| View all logs, timeline, dashboard of the family's children | ✅ | ✅ |
| Create / edit / delete any log entry (all 10 modules) | ✅ | ✅ |
| Start / stop / edit timers | ✅ | ✅ |
| Add / edit growth measurements | ✅ | ✅ |
| Mark vaccines done, reschedule, add custom vaccine | ✅ | ✅ |
| Check milestones | ✅ | ✅ |
| View analytics and AI insights | ✅ | ✅ |
| Request on-demand AI insight (counts toward family quota) | ✅ | ✅ |
| Download PDF summary (Phase 2) | ✅ | ✅ |
| Edit own reminder/notification preferences (Phase 2) | ✅ | ✅ |
| Add child / edit child profile (name, DOB, sex, birth data, feeding mode, milk target override) | ✅ | ❌ |
| Delete child | ✅ | ❌ |
| Edit family info (name, timezone, AI consent, pumping side mode) | ✅ | ❌ |
| Generate / revoke invite codes | ✅ | ❌ |
| Change a member's role, remove a caregiver | ✅ | ❌ |
| Remove another parent | ❌ (see rule below) | ❌ |
| Delete family | ✅ | ❌ |
| Leave family | ✅ (unless last parent) | ✅ |

Rules:
- **R-ROLE-01** A parent cannot remove another parent; a parent can only leave by themselves. This protects against misuse between separated partners. (Logged as a decision; can be revisited.)
- **R-ROLE-02** A family must always have at least one parent. The last parent cannot leave; they must delete the family or first invite another parent.
- **R-ROLE-03** A parent can switch their own label between `mom` and `dad`. A caregiver cannot be promoted in-app; to become a parent, a parent generates a **parent** invite code and the caregiver redeems it (prevents silent privilege escalation). Parents cannot be demoted to caregiver.
- **R-ROLE-04** All permission checks are enforced on the **server**. The UI hides disallowed actions but is never trusted.

### 3.4 Limits
| Limit | Value (configurable) |
|---|---|
| Families per user | 5 |
| Members per family | 10 |
| Children per family | 10 |
| Active invite codes per family | 5 |

---

## 4. Glossary
| Term | Meaning |
|---|---|
| ASI | Air Susu Ibu (breast milk) |
| ASIP | ASI Perah (expressed breast milk given by bottle) |
| DBF | Direct breastfeeding (menyusui langsung, "nenen") |
| MPASI | Makanan Pendamping ASI (complementary / solid food, usually from 6 months) |
| Pup | Poop / bowel movement |
| Cepirit | Very small smear of pup |
| Posyandu | Community health post where babies are weighed and vaccinated |
| Buku KIA | Indonesian Mother and Child Health book |
| IDAI | Ikatan Dokter Anak Indonesia (Indonesian Pediatric Society) |
| WHO Child Growth Standards | WHO reference growth curves 0–5 years (this app uses 0–24 months) |
| Z-score / SD | Standard deviations from the WHO median |
| Percentile | Position of the measurement relative to WHO reference population |
| Corrected age | Age adjusted for prematurity = chronological age − (40 weeks − gestational age at birth) |
| Wake window | Recommended awake time between sleeps for the baby's age |
| Family day | A calendar day (00:00–23:59) in the family's timezone; used for all daily totals |

---

## 5. Technology and architecture

### 5.1 Tech stack (mandatory)
| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 19 + TypeScript, built with Vite 8 | SPA, mobile-first |
| Styling | Tailwind CSS 4 | CSS-first config using `@theme` tokens (Section 10.2) |
| Backend | Node.js (LTS) + Express 4, TypeScript, run with `tsx` | `tsx` for dev; production may also run with `tsx` or compiled JS, agent decides and documents |
| Database | Turso / libSQL (cloud) in **all environments**, including local development | Separate Turso databases per environment: `familycradle-dev`, `familycradle-prod` (optional `-staging`). See 5.5 |
| Auth | **Better Auth** (email + password) | Replaces hand-rolled JWT. Secure httpOnly cookie sessions, 7-day sliding expiry (Section 6.1) |
| AI | Google Gemini via official `@google/genai` SDK, server-side only, API key | Phase 2. Model name from env var `GEMINI_MODEL` (do not hard-code) |
| Email | Resend | Only for email verification and password reset |
| PWA | Service worker + Web App Manifest | Recommended `vite-plugin-pwa` (Workbox). Agent must confirm Vite 8 compatibility; fall back to Workbox CLI `injectManifest` if needed |
| Hosting | Google Cloud Run, region `asia-southeast3` | Single container serving API and built frontend |
| Scheduled jobs | Google Cloud Scheduler → secured internal HTTP endpoints | Phase 1: data purge. Phase 2: reminders, weekly AI summary |
| Secrets | Google Secret Manager mounted as env vars in Cloud Run | Never commit secrets |

### 5.2 Recommended libraries (agent may substitute with equivalent, must document)
| Purpose | Library |
|---|---|
| ORM / migrations | Drizzle ORM (`drizzle-orm/libsql`) + `drizzle-kit`; Better Auth Drizzle adapter (`provider: "sqlite"`) |
| DB driver | `@libsql/client` |
| Validation (shared client/server) | Zod |
| Server state, polling | TanStack Query (`refetchInterval`) |
| Routing | React Router |
| Offline storage / queue | Dexie (IndexedDB) |
| Dates and timezones | `date-fns` + `date-fns-tz` (or `@date-fns/tz`) |
| Charts (Phase 2) | Recharts (or visx) |
| i18n | `i18next` + `react-i18next` |
| Security middleware | `helmet`, `express-rate-limit`, `cors` (only if cross-origin, which it should not be) |
| Logging | `pino` + `pino-http` (JSON logs for Cloud Logging) |
| IDs | UUID v7 (time-sortable), generated on the client for log entries (enables offline idempotency) |
| Web push (Phase 2) | `web-push` (VAPID) |
| PDF (Phase 2) | `@react-pdf/renderer` on the server (no headless Chromium on Cloud Run) |
| Fonts | `@fontsource/fredoka`, `@fontsource/nunito` (self-hosted for offline) |
| Icons | One consistent set, e.g. Phosphor Icons (duotone) tinted with module colors |

### 5.3 Architecture
```
[ PWA (React) ] --same-origin HTTPS--> [ Cloud Run: Express ]
   |  IndexedDB offline queue              |-- /api/auth/*  (Better Auth)
   |  Service worker cache                 |-- /api/*       (app REST API)
   |  Polling every 5s (visible tab)       |-- /internal/jobs/* (Cloud Scheduler, OIDC protected)
                                           |-- /*           (static frontend, SPA fallback)
                                           |
                                           +--> Turso (libSQL)
                                           +--> Resend (account emails)
                                           +--> Gemini API (Phase 2, server-side only)
                                           +--> Web Push services (Phase 2)
```
- **Same origin is mandatory.** Express serves the built frontend from `apps/web/dist`. This keeps auth cookies first-party (`SameSite=Lax`) and avoids CORS.
- The server is **stateless**. No in-memory session or timer state. Everything lives in Turso so multiple Cloud Run instances behave identically.

### 5.4 Repository structure (npm workspaces monorepo)
```
familycradle/
  apps/
    web/                # React 19 + Vite 8 + Tailwind 4 PWA
      src/
        app/            # routes, layout, providers
        features/       # one folder per module: milk, breastfeed, diaper, sleep, mpasi, pumping, medicine, growth, vaccine, milestone, family, timeline, today, insights
        components/     # shared UI (Button, BottomSheet, Stepper, TimePicker, ...)
        lib/            # api client, query client, offline queue, i18n, time utils
        styles/         # tailwind.css with @theme tokens
        locales/        # id.json, en.json, mixed.json
    server/
      src/
        index.ts        # express bootstrap
        auth.ts         # Better Auth config
        db/             # drizzle schema, migrations, seed
        middleware/     # requireSession, requireFamilyMember, requireParent, rateLimit, errorHandler
        routes/         # families, invites, children, logs, timers, growth, vaccines, milestones, mpasi, sync, analytics, ai, push, reports, internal
        services/       # milkTarget, sleepSplit, vaccineScheduler, growthZScore, redFlags, ai/, push/, pdf/
        seed/           # vaccine_idai_2024.json, milestones_cdc.json, who_lms/*.json, milk_target_reference.json, wake_windows.json
  packages/
    shared/             # Zod schemas, enums, types, constants shared by web and server
  docs/
    BRD.md              # this document
    DECISIONS.md
  Dockerfile
  .env.example
```

### 5.5 Environments and configuration
| Env var | Required | Description |
|---|---|---|
| `NODE_ENV` | yes | `development` / `production` |
| `APP_URL` | yes | Public base URL, e.g. `http://localhost:5173` (dev) / `https://app.familycradle.id` (prod) |
| `TURSO_DATABASE_URL` | yes | `libsql://familycradle-dev-<org>.turso.io` |
| `TURSO_AUTH_TOKEN` | yes | Turso DB token (per environment) |
| `BETTER_AUTH_SECRET` | yes | ≥ 32 random bytes |
| `BETTER_AUTH_URL` | yes | Same as `APP_URL` |
| `TRUSTED_PROXIES` | production | Comma-separated trusted proxy IPs/CIDRs for safe client-IP rate limiting |
| `RESEND_API_KEY` | yes | Resend key |
| `EMAIL_FROM` | yes | e.g. `FamilyCradle <no-reply@familycradle.id>` (domain must be verified in Resend) |
| `GEMINI_API_KEY` | Phase 2 | Server only |
| `GEMINI_MODEL` | Phase 2 | Model ID, configurable |
| `AI_DAILY_ONDEMAND_LIMIT_PER_FAMILY` | Phase 2 | Default `5` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Phase 2 | Web push |
| `INTERNAL_JOB_AUDIENCE` | yes | Expected OIDC audience for Cloud Scheduler calls |
| `INTERNAL_JOB_SA_EMAIL` | yes | Allowed Cloud Scheduler service account email |
| `LOG_LEVEL` | no | Default `info` |

Local development:
- Local dev connects to the **Turso dev database** (`familycradle-dev`), as requested by the product owner. No local SQLite file is used.
- `npm run dev` starts Vite (port 5173) and the Express server with `tsx watch` (port 8080). Vite proxies `/api` to `localhost:8080` so the browser still sees one origin.
- Automated tests may use an in-memory libSQL database (`file::memory:`) for speed and isolation; this is the only exception to "Turso everywhere".
- Migrations: `npm run db:migrate` (drizzle-kit) runs against the env's Turso DB. Production migrations run as a step in the deploy pipeline before traffic shifts, never on app start.

### 5.6 Deployment (Cloud Run)
- Region: `asia-southeast3`. Create the Turso database in the location closest to this region that Turso offers.
- One multi-stage `Dockerfile`: build `packages/shared`, `apps/web`, `apps/server`; final image runs as non-root user, contains only production dependencies and `apps/web/dist`.
- Cloud Run settings: `--ingress all`, HTTPS only, `min-instances` configurable (default 0; consider 1 to avoid cold starts at 3 AM), `max-instances` 10, concurrency 80, memory 512 MiB, CPU 1.
- Secrets from Secret Manager mapped to env vars.
- Health endpoint `GET /healthz` (no DB) and `GET /readyz` (checks DB with `SELECT 1`).
- Custom domain with managed TLS.

---

## 6. Security, privacy and compliance

The app is **public** and stores **children's health data**. Under Indonesia's Personal Data Protection Law (UU PDP No. 27/2022), health data and children's data are categorized as specific (sensitive) personal data. Security is a release blocker, not a nice-to-have.

### 6.1 Authentication (Better Auth)
| ID | Requirement |
|---|---|
| SEC-AUTH-01 | Use Better Auth email + password. Do not implement custom password hashing, token signing or session storage. |
| SEC-AUTH-02 | `emailAndPassword.requireEmailVerification = true`. Unverified users cannot sign in. Verification email sent via Resend. Verification link valid 24 h. |
| SEC-AUTH-03 | Password reset via Resend email link, valid 1 h, single use. On successful reset, revoke all other sessions of that user. |
| SEC-AUTH-04 | Session: `expiresIn = 7 days`, `updateAge = 1 hour`. Effect: the session expires 7 days after the user's **last** activity; any visit extends it again to 7 days (sliding). |
| SEC-AUTH-05 | Session cookie: `httpOnly`, `secure` (prod), `SameSite=Lax`, `path=/`. No tokens in `localStorage`. |
| SEC-AUTH-06 | Password policy: min 8, max 128 characters; reject passwords found in known breach lists (use Better Auth's breached-password plugin if available in the installed version; otherwise document the gap). |
| SEC-AUTH-07 | Rate limits: sign-in 5 attempts / 15 min per IP + email; sign-up 5 / hour per IP; forgot-password 3 / hour per email. Use Better Auth built-in rate limiting with database storage (not memory, because Cloud Run has multiple instances). |
| SEC-AUTH-08 | Responses for sign-in, sign-up and forgot-password must not reveal whether an email exists (generic messages). |
| SEC-AUTH-09 | `trustedOrigins = [APP_URL]`. Better Auth origin checks must stay enabled (CSRF protection). |
| SEC-AUTH-10 | "Log out" ends the current session; "Log out from all devices" revokes all sessions. Changing password revokes other sessions. |
| SEC-AUTH-11 | The Better Auth tables (`user`, `session`, `account`, `verification`) are generated by Better Auth's CLI/schema and managed by Drizzle migrations. Do not modify their core columns. |

### 6.2 Authorization
| ID | Requirement |
|---|---|
| SEC-AZ-01 | Every `/api` route except auth and health requires a valid session (`requireSession`). |
| SEC-AZ-02 | Every family-scoped resource is resolved to its `family_id` **on the server** (e.g. load the child, then its family) and checked against `family_member` for the current user (`requireFamilyMember`). Never trust a `family_id` from the request body. |
| SEC-AZ-03 | Parent-only actions use `requireParent`. |
| SEC-AZ-04 | All DB queries for family data include `family_id` in the WHERE clause (defense against IDOR). |
| SEC-AZ-05 | Non-members get `404` (not `403`) for family resources, to avoid confirming existence. |
| SEC-AZ-06 | Removed members lose access immediately (checked on every request; no cached membership longer than the request). |

### 6.3 Invite codes
| ID | Requirement |
|---|---|
| SEC-INV-01 | Code format `XXXX-XXXX`, 8 characters from a 31-char unambiguous alphabet (no 0/O/1/I/L), generated with a CSPRNG. |
| SEC-INV-02 | Store only the SHA-256 hash of the code. Show the plain code once on creation (with copy and share buttons). |
| SEC-INV-03 | Each code has a target role (`parent` → user picks mom/dad on join, or `caregiver`), expires in 72 h, is **single-use**, and can be revoked. |
| SEC-INV-04 | Redemption rate limit: 5 attempts / 15 min per user and 20 / hour per IP. |
| SEC-INV-05 | Redeeming shows a confirmation screen ("Kamu akan bergabung ke keluarga *Nama* sebagai *Pengasuh*") before joining. |

### 6.4 Application security
| ID | Requirement |
|---|---|
| SEC-APP-01 | `helmet` with a strict Content Security Policy: `default-src 'self'`; no inline scripts; `connect-src 'self'`; `img-src 'self' data:`; `font-src 'self'`; `frame-ancestors 'none'`. |
| SEC-APP-02 | HSTS (prod), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. |
| SEC-APP-03 | Validate every request body, query and param with Zod (from `packages/shared`). Reject unknown fields (`.strict()`). Limit JSON body size to 100 KB. |
| SEC-APP-04 | Use Drizzle query builder / parameterized queries only. No string-concatenated SQL. |
| SEC-APP-05 | Generic API rate limit: 300 requests / 5 min per user (polling at 5 s ≈ 60 / 5 min per open tab, leaves headroom). |
| SEC-APP-06 | Error responses never include stack traces or SQL in production. Use a consistent error shape (Section 11.1). |
| SEC-APP-07 | Logs must not contain passwords, session tokens, invite codes, child names or free-text notes. Log user and family IDs only. |
| SEC-APP-08 | Internal job endpoints (`/internal/jobs/*`) accept only Cloud Scheduler requests with a valid Google OIDC token (verify signature, `aud = INTERNAL_JOB_AUDIENCE`, `email = INTERNAL_JOB_SA_EMAIL`). |
| SEC-APP-09 | Dependency hygiene: `npm audit` (high/critical = build fails), lockfile committed, Dependabot or Renovate enabled. |
| SEC-APP-10 | All free-text fields (notes, names) are rendered as text (React escaping). No `dangerouslySetInnerHTML`. Max lengths enforced (name 60, note 500). |
| SEC-APP-11 | Gemini API key and all secrets exist only on the server. The frontend never calls Gemini directly. |

### 6.5 Privacy (UU PDP alignment)
| ID | Requirement |
|---|---|
| PRV-01 | Sign-up requires accepting Terms of Service and Privacy Policy (checkbox, stored with timestamp and policy version). The user confirms they are 18 or older and a parent/guardian or authorized caregiver. |
| PRV-02 | Privacy Policy (ID and EN) explains: data collected, purpose, storage location (Turso region, Cloud Run region), processors (Google Cloud, Turso, Resend, Google Gemini, Have I Been Pwned password-check API), retention, deletion, and contact. The password-check API receives only the first five characters of a SHA-1 password hash, never the password itself. Product owner provides final legal text; agent creates placeholder pages at `/privacy` and `/terms`. |
| PRV-03 | **AI consent (Phase 2):** AI features are off until a parent enables "Izinkan analisis AI" for the family. The consent dialog explains what is sent to Gemini. Consent is stored (who, when) and can be withdrawn anytime; withdrawal stops all AI calls immediately. |
| PRV-04 | **Data minimization for AI:** never send names, emails, notes free-text, or user identities to Gemini. Send only age (days, corrected age), sex, and aggregated/structured measurements (Section 12.4). |
| PRV-05 | **Account deletion:** user can delete their account from Settings (password re-entry required). Their memberships are removed; entries they created remain in the family but `created_by` shows "Mantan anggota / Former member". If they are the last parent of a family, they must delete that family first (UI guides them). |
| PRV-06 | **Family deletion:** parent only; requires typing the family name. Family is soft-deleted (inaccessible immediately) and hard-deleted with all children and logs after 7 days by the daily purge job. A parent can restore within 7 days. |
| PRV-07 | **Child deletion:** parent only; same 7-day soft delete and purge as family. |
| PRV-08 | No third-party analytics, ads or trackers in v1. |

---

## 7. Data model

### 7.1 Conventions
- Primary keys: `TEXT` UUID v7, except deterministic multi-child log siblings, which use UUID v5 IDs derived from the client-generated base UUIDv7 and child ID (Section 11.2). Log entry base IDs are generated **on the client** for offline idempotency; other tables may generate IDs on the server.
- All timestamps stored as `TEXT` ISO-8601 in **UTC** (e.g. `2026-11-22T03:12:00.000Z`). Date-only values (DOB, vaccine due date) stored as `TEXT` `YYYY-MM-DD`.
- Units stored as integers in base units: volume in **ml**, weight in **grams**, length and head circumference in **millimetres**, duration in **seconds**.
- Every family-owned table has: `family_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `version` (int, starts at 1, +1 on each update), `rev` (int, family-level change counter for sync), `deleted_at` (soft delete / tombstone).
- Foreign keys enabled (`PRAGMA foreign_keys = ON`).

### 7.2 Entity relationship overview
```
user (Better Auth) 1─* family_member *─1 family 1─* child
family 1─* family_invite
child 1─* log_entry            (bottle, breastfeed, diaper, sleep, mpasi, medicine)
family 1─* log_entry           (pumping: child_id NULL, family-level)
child 1─* growth_measurement
child 1─* child_vaccine        (generated from vaccine_definition seed + custom)
child 1─* child_milestone      (status per milestone_definition seed item)
family 1─* mpasi_food          (food catalog per child: first introduced, reactions)
family 1─* audit_log
family 1─1 family_rev_counter
user 1─1 user_profile
Phase 2: ai_insight, ai_usage, push_subscription, reminder_setting, notification_log
```

### 7.3 Tables

**`user_profile`**
| Column | Type | Notes |
|---|---|---|
| user_id | TEXT PK FK user.id | |
| display_name | TEXT | 1–40 chars; shown on entries ("dicatat oleh *display_name*") |
| language | TEXT | `id` / `en` / `mixed`; default from browser (`id-*` → `id`, else `en`) |
| timezone | TEXT | IANA, default from device (`Intl.DateTimeFormat().resolvedOptions().timeZone`), fallback `Asia/Jakarta` |
| night_mode | TEXT | `auto` (default) / `on` / `off` |
| night_start / night_end | TEXT | `HH:mm`, default `19:00` / `06:00` |
| last_active_family_id | TEXT NULL | |
| last_active_child_id | TEXT NULL | |
| tos_accepted_at, tos_version | TEXT | |

**`family`**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| name | TEXT | e.g. "Keluarga Lobma", 1–60 chars |
| timezone | TEXT | IANA; defines the "family day" for daily totals. Default = creator's timezone |
| pumping_side_mode | TEXT | `combined` (default) / `separate` |
| ai_consent | INTEGER | 0/1, default 0 (Phase 2) |
| ai_consent_by / ai_consent_at | TEXT NULL | |
| quick_bottle_ml | TEXT | JSON array of shortcut volumes, default `[60,90,120,150]` |
| created_by, created_at, updated_at, updated_by, version, deleted_at, purge_after | | |

**`family_rev_counter`**: `family_id` PK, `rev` INTEGER. Incremented in the same transaction as every write to family data; the new value is stamped on the written row's `rev` column.

**`family_member`**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| family_id | TEXT FK | |
| user_id | TEXT FK | UNIQUE(family_id, user_id) among non-removed rows |
| role | TEXT | `mom` / `dad` / `caregiver` |
| joined_at | TEXT | |
| removed_at | TEXT NULL | |
| removed_by | TEXT NULL | |

**`family_invite`**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| family_id | TEXT FK | |
| code_hash | TEXT UNIQUE | SHA-256 of normalized code |
| target_role | TEXT | `parent` / `caregiver` |
| created_by, created_at | | |
| expires_at | TEXT | created_at + 72 h |
| used_by, used_at | TEXT NULL | |
| revoked_at | TEXT NULL | |

**`child`**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| family_id | TEXT FK | |
| name | TEXT | required, 1–60 |
| nickname | TEXT NULL | shown in UI if set |
| sex | TEXT | `male` / `female` (required; used only for WHO calculations) |
| date_of_birth | TEXT | `YYYY-MM-DD`, required, not in future, ≤ 5 years ago |
| time_of_birth | TEXT NULL | `HH:mm` |
| gestational_age_weeks | INTEGER NULL | 22–44; default treated as 40 if null |
| gestational_age_days | INTEGER NULL | 0–6 |
| birth_weight_g | INTEGER | required, 400–7000 |
| birth_length_mm | INTEGER NULL | 300–650 |
| birth_head_circ_mm | INTEGER NULL | 200–450 |
| feeding_mode | TEXT | `breastmilk` (DBF and/or ASIP) / `formula` / `mixed`; default `mixed` |
| milk_target_mode | TEXT | `auto` (default) / `manual` |
| milk_target_manual_ml | INTEGER NULL | used when mode = manual |
| allergies_note | TEXT NULL | max 300 |
| avatar | TEXT | key of illustrated avatar or `initials` |
| color | TEXT | child accent color key (helps twins) |
| sort_order | INTEGER | |
| common columns | | |

**`log_entry`** (single table for all event-type logs; module-specific fields in validated JSON)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | client-generated UUID v7 |
| family_id | TEXT FK | |
| child_id | TEXT NULL FK | NULL only for `pumping` |
| type | TEXT | `bottle` / `breastfeed` / `diaper` / `sleep` / `mpasi` / `pumping` / `medicine` |
| status | TEXT | `completed` (default) / `running` / `paused` (timers only) |
| started_at | TEXT | event time (or timer start) |
| ended_at | TEXT NULL | NULL while running; for point events equals `started_at` |
| amount_ml | INTEGER NULL | bottle volume, pumping total, MPASI ml |
| duration_sec | INTEGER NULL | computed for sleep, breastfeed, pumping |
| details | TEXT (JSON) | validated by Zod discriminated union per `type` (Section 7.4) |
| note | TEXT NULL | max 500 |
| batch_id | TEXT NULL | same value for entries created via "log for both/all" |
| source | TEXT | `manual` / `timer` / `quick` |
| common columns | | created_by, updated_by, version, rev, deleted_at, created_at, updated_at |

Indexes: `(family_id, rev)`, `(child_id, type, started_at)`, `(child_id, started_at)`, `(family_id, type, status)`.

Constraint (enforced in service layer + partial unique index): at most **one** `running`/`paused` entry per `(child_id, type)` for `sleep` and `breastfeed`, and per `(family_id, created_by)` for `pumping`.

**`growth_measurement`**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | client-generated |
| family_id, child_id | TEXT FK | |
| measured_at | TEXT | |
| weight_g | INTEGER NULL | at least one of weight/length/head required |
| length_mm | INTEGER NULL | recumbent length < 24 months |
| head_circ_mm | INTEGER NULL | |
| place | TEXT NULL | `home` / `posyandu` / `clinic_doctor` / `hospital` / `other` |
| note | TEXT NULL | |
| common columns | | |

**`vaccine_definition`** (seed, read-only, versioned)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | e.g. `idai2024_dtp_1` |
| schedule_version | TEXT | `IDAI-2024` |
| vaccine_code | TEXT | `HEPB`, `POLIO`, `BCG`, `DTP`, `HIB`, `PCV`, `ROTA`, `INFLUENZA`, `MR`, `MMR`, `JE`, `VARICELLA`, `HEPA`, `TYPHOID`, `IPV` |
| dose_label | TEXT | e.g. "DTP 1" |
| due_offset | TEXT | ISO-8601 duration from DOB, added as calendar units (e.g. `P0D`, `P2M`, `P24W`) |
| window_end_offset | TEXT | ISO-8601 duration from DOB; after this date the dose is "late" |
| option_group | TEXT NULL | e.g. `DTP_SCHEDULE`, `ROTA_PRODUCT` |
| option_value | TEXT NULL | e.g. `2-3-4`, `RV1` |
| category | TEXT | `core` / `optional_endemic` / `annual` |
| combo_hint | TEXT NULL | e.g. "Dapat diberikan dalam vaksin kombinasi (DTP-HB-Hib-IPV)" |
| notes_id / notes_en | TEXT | |

**`child_vaccine`**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| family_id, child_id | TEXT FK | |
| definition_id | TEXT NULL FK | NULL for custom vaccines |
| custom_name | TEXT NULL | for custom vaccines |
| dose_label | TEXT | |
| due_date | TEXT | `YYYY-MM-DD`, editable |
| window_end_date | TEXT | editable |
| status_override | TEXT NULL | `skipped` / NULL; completion is determined by `given_date` (Section 8.11) |
| given_date | TEXT NULL | |
| given_place | TEXT NULL | |
| batch_number | TEXT NULL | |
| note | TEXT NULL | |
| is_custom | INTEGER | |
| follow_optional | INTEGER | 0/1, default 0; applies to `optional_endemic` definitions |
| common columns | | |

**`milestone_definition`** (seed): `id`, `source` (`CDC-2022`), `age_months` (2, 4, 6, 9, 12, 15, 18, 24), `domain` (`social_emotional` / `language_communication` / `cognitive` / `movement_physical`), `text_id`, `text_en`, `sort_order`.

**`child_milestone`**: `id`, `family_id`, `child_id`, `milestone_id`, `achieved` (0/1), `achieved_on` (date NULL), `note`, common columns. UNIQUE(child_id, milestone_id).

**`mpasi_food`** (per child food catalog)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| family_id, child_id | TEXT FK | |
| name | TEXT | normalized lowercase for uniqueness per child |
| food_group | TEXT | `grain` / `protein_animal` / `protein_plant` / `vegetable` / `fruit` / `dairy` / `fat_oil` / `other` |
| is_common_allergen | INTEGER | auto-true if matches allergen list (Section 8.7) or set by user |
| first_introduced_at | TEXT NULL | set from first MPASI log containing it |
| reaction_status | TEXT | `none` / `suspected` / `confirmed_avoid` |
| common columns | | |

**`audit_log`**: `id`, `family_id`, `actor_user_id`, `entity_type`, `entity_id`, `action` (`create`/`update`/`delete`/`restore`), `changes` (JSON diff of changed fields; visible only to family members and never written to server logs), `at`. Retained for up to 1 year while the family remains active; when a family is deleted, its audit rows are hard-deleted with the family after the 7-day restore window (PRV-06).

**Phase 2 tables**
- `ai_insight`: `id`, `family_id`, `child_id`, `kind` (`weekly_summary` / `pattern` / `growth_alert` / `suggestion_mpasi` / `suggestion_sleep`), `period_start`, `period_end`, `language`, `content` (JSON per schema in Appendix E), `red_flags` (JSON), `model`, `prompt_version`, `input_hash`, `created_by` (`system` or user id), `created_at`, `feedback` (`helpful`/`not_helpful`/`unsafe` NULL), `feedback_by`.
- `ai_usage`: `family_id`, `date` (family day), `ondemand_count`. PK(family_id, date).
- `push_subscription`: `id`, `user_id`, `endpoint` UNIQUE, `p256dh`, `auth`, `user_agent`, `created_at`, `last_success_at`, `failure_count`.
- `reminder_setting`: `id`, `user_id`, `family_id`, `child_id` NULL, `kind` (`feed_interval` / `pump_interval` / `medicine_next_dose` / `vaccine` / `timer_running`), `enabled`, `config` JSON (e.g. `{ "hours": 3 }`), `quiet_hours` JSON NULL.
- `notification_log`: `id`, `user_id`, `kind`, `ref_id`, `sent_at`, `status`. Used for de-duplication (never send the same reminder twice).

### 7.4 `log_entry.details` schemas (Zod, in `packages/shared`)
```ts
bottle:     { milkType: "formula" | "asip" | "mixed"; formulaBrand?: string /*≤60*/; leftoverMl?: number }
            // amount_ml required (1–400). Consumed = amount_ml - (leftoverMl ?? 0)
breastfeed: { segments: { side: "left" | "right"; startedAt: string; endedAt?: string }[]; // timer mode
              leftSec?: number; rightSec?: number;   // manual mode
              lastSide: "left" | "right" }
diaper:     { kind: "wet" | "pup" | "mixed" | "dry";
              pupAmount?: "banyak" | "sedang" | "sedikit" | "cepirit";
              consistency?: "cair" | "lembek" | "normal" | "keras" | "berbiji";
              color?: "kuning" | "hijau" | "coklat" | "hitam" | "merah" | "pucat_putih" | "lainnya";
              rash?: boolean }
sleep:      { category: "nap" | "night";
              location?: "crib" | "cosleep" | "contact" | "stroller" | "car" | "swing" | "other";
              fallAsleepMethod?: "self" | "nursing" | "bottle" | "rocking" | "pacifier" | "other";
              quality?: "nyenyak" | "gelisah" | "sering_bangun";
              pauses?: { startedAt: string; endedAt?: string }[] }
mpasi:      { mealType: "sarapan" | "makan_siang" | "makan_malam" | "selingan";
              texture: "puree_halus" | "saring_lumat" | "cincang_halus" | "cincang_kasar" | "finger_food" | "makanan_keluarga";
              foodIds: string[];           // mpasi_food ids, 1–15
              newFoodIds: string[];        // subset, computed by server
              portionEaten?: "habis" | "sebagian_besar" | "setengah" | "sedikit" | "menolak";
              spoons?: number;              // alternative to amount_ml
              reaction?: { kind: "none" | "ruam" | "muntah" | "diare" | "bengkak" | "gatal" | "lainnya"; foodIds?: string[]; note?: string } }
pumping:    { sideMode: "combined" | "separate"; leftMl?: number; rightMl?: number; // amount_ml = total
              pumpedBy?: string /* user_id, default creator */ }
medicine:   { name: string /*≤60*/; dose: number; unit: "ml" | "mg" | "tetes" | "tablet" | "sachet" | "puff" | "oles" | "lainnya";
              route?: "oral" | "tetes_hidung" | "tetes_mata" | "tetes_telinga" | "oles" | "supositoria" | "inhalasi" | "lainnya";
              reason?: string /*≤100*/; nextDoseInHours?: number /*1–48*/ }
```
Enum values are stored as the codes above; display labels come from i18n files.

---

## 8. Business rules

### 8.1 Time, timezone and "family day"
- **BR-TIME-01** All times are stored in UTC and displayed in the **viewer's** timezone (`user_profile.timezone`), 24-hour format (`HH:mm`).
- **BR-TIME-02** Daily totals (milk vs target, sleep hours, diaper counts, pumping total) are computed per **family day**: 00:00–23:59:59 in `family.timezone`. Default `family.timezone` = creator's device timezone; fallback `Asia/Jakarta` (GMT+7). Parents can change it.
- **BR-TIME-03** If a viewer's timezone differs from the family timezone, the Today screen shows a small hint "Waktu keluarga: WIB (GMT+7)".
- **BR-TIME-04** Entries cannot be dated more than 5 minutes in the future (clock-skew tolerance) and not before the child's DOB.
- **BR-TIME-05** Timers always use **server time** (`started_at` is set by the server on start; client sends its own time only for offline-created entries, see 8.13).

### 8.2 Age and corrected age
- **BR-AGE-01** Chronological age = today (family timezone) − `date_of_birth`, shown as "3 bulan 12 hari" / "3 months 12 days"; < 1 month shown as weeks + days; day count also available ("Hari ke-45").
- **BR-AGE-02** If gestational age at birth < 37 weeks, the child is **premature** and the app computes **corrected age** = chronological age − (280 days − gestational age in days).
- **BR-AGE-03** Corrected age is used for: WHO growth plotting, milestone checklist, wake window suggestions, milk target age bands, MPASI readiness hint. It is used until chronological age 24 months.
- **BR-AGE-04** **Chronological** age is always used for vaccines (standard practice).
- **BR-AGE-05** Wherever corrected age is applied, the UI shows a badge "Usia koreksi: 2 bln 5 hr".

### 8.3 Milk (bottle) and daily target (M1)
- **BR-MILK-01** The target applies to **bottle intake** (formula + ASIP). DBF volume cannot be measured, so it is not counted in ml.
- **BR-MILK-02** Target by `feeding_mode`:
  - `formula`: show full auto target.
  - `mixed`: show auto target with a hint "DBF tidak dihitung dalam ml. Sesuaikan target bila perlu." Parent can switch to manual.
  - `breastmilk`: bottle target is shown only if the child had at least one bottle entry in the last 3 days or a manual target is set; otherwise the Today card shows **feeding frequency** (number of DBF + bottle feeds today vs reference 8–12 per 24 h for 0–1 month).
- **BR-MILK-03** Auto target formula (reference values in Appendix B, stored in `seed/milk_target_reference.json`, **[VERIFY]**):
  - Weight source: latest `growth_measurement.weight_g`; if none, `birth_weight_g`.
  - Age (corrected if premature) day 1–3: ramp 60 / 90 / 120 ml/kg/day; day 4 to < 6 months: 150 ml/kg/day, capped at 1,000 ml/day.
  - 6 months and older: fixed age-band reference (MPASI replaces part of milk), not weight-based.
  - Round to nearest 10 ml.
- **BR-MILK-04** Manual target: parent sets ml/day (100–1,500). Shown with label "Target manual". Parent can revert to auto at any time.
- **BR-MILK-05** If the weight used is older than 14 days (for age < 6 months), show a soft prompt "Berat terakhir 16 hari lalu. Timbang lagi untuk target yang lebih akurat."
- **BR-MILK-06** Progress = sum of consumed ml (amount − leftover) for the family day ÷ target. Indicator: < 50% neutral, 50–99% warm amber, ≥ 100% **green** with a small celebration (once per day, no confetti at night mode).
- **BR-MILK-07** Suggested per-feed amount = target ÷ reference feeds per day for age (Appendix B). Shown as a hint only.
- **BR-MILK-08** Quick shortcuts: family-level list `quick_bottle_ml` (default 60/90/120/150, editable by any member in the bottle sheet, max 6 values). Tapping a shortcut on the Today screen logs immediately with time = now and default milk type (last used for this child), then shows an undo snackbar for 5 s.
- **BR-MILK-09** Disclaimer under target: "Target ini perkiraan umum. Ikuti saran dokter/bidan."

### 8.4 Breastfeeding / DBF (M2)
- **BR-DBF-01** Two input modes: **timer** and **manual**.
- **BR-DBF-02** Timer: Start (choose side, default = opposite of last side used for this child) → Switch side → Pause / Resume → Stop. Each action calls the server, which records server timestamps in `details.segments`. The UI computes elapsed time from server timestamps + server/client clock offset (from response `Date` header), so the timer stays correct after screen lock, app close, or when viewed from another phone.
- **BR-DBF-03** Manual: start time, minutes left, minutes right (either can be 0, total > 0, max 120 min).
- **BR-DBF-04** `duration_sec` = sum of segment durations (excluding pauses). `details.lastSide` = side of the final segment.
- **BR-DBF-05** Today card shows "Terakhir: kanan · 2 j 10 m lalu · Mulai dari **kiri**".
- **BR-DBF-06** A running DBF timer older than 90 minutes shows a prompt "Masih menyusui?" with options Stop now / Stop at a chosen time.

### 8.5 Diaper (M3)
- **BR-DIA-01** One big button on Today for "Pipis" and one for "Pup"; long-press or expanding the sheet allows details (amount, consistency, color, rash).
- **BR-DIA-02** Today card shows: wet count today, pup count today, "Pup terakhir: 5 j lalu".
- **BR-DIA-03** Color guidance (informational, deterministic rules in `redFlags` service, **[VERIFY]**): `merah`, `pucat_putih`, and `hitam` after day 4 of life trigger an inline note "Warna ini perlu diperiksakan ke dokter" (pale stool is also highlighted in the Buku KIA stool color card).
- **BR-DIA-04** For babies older than 5 days, fewer than 6 wet diapers in a completed family day triggers a soft notice next day **[VERIFY]**.

### 8.6 Sleep (M4)
- **BR-SLP-01** Every sleep entry has a **category** dropdown (Tidur siang / Nap, Tidur malam / Night) and an optional **location** dropdown. Category default is suggested from start time: 19:00–05:59 family time → `night`, else `nap`; user can change.
- **BR-SLP-02** Timer mode (server-side, same mechanics as DBF: start, pause/resume for night wakings, stop) or manual (start and end times).
- **BR-SLP-03** Overlap: a sleep entry cannot overlap another sleep entry of the same child (server returns 409 with the conflicting entry).
- **BR-SLP-04** **Midnight split for totals:** a session 21:00–06:00 contributes 3 h to day D and 6 h to day D+1. The entry itself stays one record; splitting is done in aggregation (`sleepSplit` service).
- **BR-SLP-05** Today card while awake: "Bangun sejak 1 j 20 m" + **wake window suggestion** "Tidur berikutnya sekitar 10:30–11:00" based on age (corrected) and Appendix C (rule-based, Phase 1). While asleep: running timer.
- **BR-SLP-06** A running sleep timer > 14 hours prompts to confirm or correct the end time.

### 8.7 MPASI (M5)
- **BR-MP-01** Each session: time, meal type, texture stage, foods (multi-select from the child's food catalog with "+ makanan baru"), amount (ml **or** spoons), portion eaten, reaction, note.
- **BR-MP-02** Food catalog is per child. A food becomes "introduced" on the first MPASI entry that contains it; the server sets `newFoodIds` and `first_introduced_at`.
- **BR-MP-03** **New food allergy watch (3-day rule) [VERIFY]:** after a new food is introduced, it is "under observation" for 3 days. If the user adds another new food within that window, show a non-blocking warning: "Telur masih dalam pengamatan 3 hari. Disarankan tunggu sebelum mencoba makanan baru lain." The user can continue.
- **BR-MP-04** Common allergen list (auto-flag, matching ID and EN names and simple synonyms): telur/egg, kacang tanah/peanut, susu sapi/cow's milk & dairy, ikan/fish, udang & kerang/shellfish, gandum/wheat, kedelai/soy, wijen/sesame, kacang pohon/tree nuts (almond, mete, kenari). New allergen foods show an "Alergen umum" chip.
- **BR-MP-05** Reaction logged on a session marks selected foods `reaction_status = suspected`; parent can set `confirmed_avoid`. Foods with `confirmed_avoid` show a red outline when selected again plus a confirmation.
- **BR-MP-06** If the child's (corrected) age is under 6 months when opening MPASI, show an info banner: "MPASI umumnya dimulai usia 6 bulan. Konsultasikan dengan dokter sebelum memulai." Logging is still allowed.
- **BR-MP-07** MPASI entries appear in the same timeline as milk, so meal timing and milk timing are visible together.

### 8.8 Pumping ASI (M6)
- **BR-PMP-01** Pumping entries are **family-level** (`child_id = NULL`) because the milk can be for any child. They appear on every child's timeline with a "Bunda" chip and in the Today screen "ASI" section.
- **BR-PMP-02** Side mode is a family setting (`combined` default, or `separate`). The pumping sheet also has a toggle to switch mode for this entry only.
  - `combined`: one input "Total ml".
  - `separate`: "Kiri ml" and "Kanan ml"; total computed.
- **BR-PMP-03** Optional timer (server-side) or manual start/end; volume is entered at stop.
- **BR-PMP-04** Daily pumping total and session count shown on Today. `pumpedBy` defaults to the current user if role is `mom`; otherwise the user picks which mom (list of members with role `mom`) or leaves empty.

### 8.9 Medicine (M7)
- **BR-MED-01** Fields: name (autocomplete from family history), dose (decimal, comma or dot accepted), unit, route, reason, time, note, optional "next dose in X hours".
- **BR-MED-02** The app **never** suggests a medicine or a dose. No dose calculators.
- **BR-MED-03** If "next dose in X hours" is set, Today shows a countdown chip "Paracetamol berikutnya ~ 18:05". Phase 2 sends a push reminder.
- **BR-MED-04** Medicine history view per child: filter by medicine name and date range; used later in the PDF summary.

### 8.10 Growth (M8)
- **BR-GRW-01** Input in user-friendly units: weight in kg (2 decimals, e.g. `7,45`), length and head circumference in cm (1 decimal). Stored in g / mm.
- **BR-GRW-02** Plausibility checks: weight 0.4–25 kg, length 30–110 cm, head 20–55 cm. Change vs previous measurement > 20% weight within 7 days → confirm dialog "Yakin? Berubah 25% dari 3 hari lalu."
- **BR-GRW-03** Birth data from the child profile is shown as the first point (not duplicated as a measurement).
- **BR-GRW-04** Phase 1: list of measurements with change since previous (e.g. "+320 g dalam 10 hari · ~32 g/hari").
- **BR-GRW-05** Phase 2: WHO 0–24 months z-scores and percentiles (Section 12.2).

### 8.11 Vaccines (M9)
- **BR-VAX-01** When a child is created, the server generates `child_vaccine` rows from `vaccine_definition` (`schedule_version = IDAI-2024`, Appendix A) using default options (`DTP_SCHEDULE = 2-3-4`, `ROTA_PRODUCT = RV1`). `due_date = DOB + due_offset`, `window_end_date = DOB + window_end_offset` (calendar arithmetic, e.g. `addMonths`).
- **BR-VAX-02** Parents and caregivers can: mark done (date, place, batch no., note), undo done, reschedule (edit due date and window end), mark skipped / not applicable, add a custom vaccine (name, dose label, due date), delete a custom vaccine, and switch option groups (DTP schedule, Rotavirus product). Switching options regenerates only **not-done** doses of that group. Marking done sets `given_date` and clears `status_override`; undoing done clears `given_date`. Marking skipped sets `status_override = skipped` and clears `given_date`; undoing skipped clears the override.
- **BR-VAX-03** Computed status:
  - `skipped`: `status_override = skipped`.
  - `done`: `given_date` set (a vaccine cannot be both done and skipped).
  - `upcoming`: today < due_date − 7 days.
  - `due_soon`: due_date − 7 days ≤ today < due_date.
  - `due`: due_date ≤ today ≤ window_end_date.
  - `late`: today > window_end_date and not done.
- **BR-VAX-04** `optional_endemic` vaccines (e.g. JE) are generated but shown in a collapsed "Opsional / sesuai daerah" group. They are excluded from "late" counts unless a parent opts in with "Saya ingin mengikuti"; this choice is stored per child vaccine in `follow_optional`.
- **BR-VAX-05** Vaccines tab header: "Selesai 8 dari 21 · 1 terlambat · Berikutnya: PCV 3 (12 Des)".
- **BR-VAX-06** Disclaimer: "Jadwal berdasarkan rekomendasi IDAI 2024. Ikuti jadwal dari dokter anak Anda."

### 8.12 Milestones (M10)
- **BR-MS-01** Checklist grouped by CDC age checkpoint (2, 4, 6, 9, 12, 15, 18, 24 months) and domain. Default view = current checkpoint (by corrected age) + previous checkpoint.
- **BR-MS-02** Each item: checkbox "Sudah bisa" with optional date and note. Any member can check/uncheck.
- **BR-MS-03** Seed text must come from the official CDC "Learn the Signs. Act Early." milestone checklists (2022 revision) and be translated to Bahasa Indonesia; translations reviewed by the product owner **[VERIFY]**.
- **BR-MS-04** Phase 2 "Perlu perhatian" flag: if, at corrected age ≥ checkpoint + 1 month, any item of that checkpoint is unchecked, show a gentle flag "Beberapa milestone belum tercatat. Diskusikan dengan dokter saat kontrol." Never use alarming language. CDC also advises acting early when a child loses skills they once had; include a static info text about this.

### 8.13 Sync, polling, offline and conflicts
- **BR-SYNC-01 Polling:** TanStack Query polls `GET /api/families/:fid/sync?since=<rev>` every **5 s** while the Today or Timeline screen is visible and the tab is in the foreground; every 30 s on other screens; paused when the tab is hidden; immediate refetch on window focus and on reconnect.
- **BR-SYNC-02 Delta sync:** the server returns all family rows (log_entry, growth_measurement, child_vaccine, child_milestone, mpasi_food, child, family_member, family) with `rev > since`, including soft-deleted rows as tombstones, plus the new `rev`. Max 500 rows per page with `hasMore`.
- **BR-SYNC-03 Offline create/edit:** when offline (or request fails due to network), mutations are stored in a Dexie queue with the client-generated ID and the client timestamp. UI updates optimistically and shows a small "Belum tersinkron" cloud icon on those entries.
- **BR-SYNC-04 Replay:** queue replays in order when online. Creates are idempotent (`PUT /api/logs/:id` upsert by client ID). If the same ID already exists with identical content, return 200.
- **BR-SYNC-05 Conflicts (optimistic concurrency):** updates send `version`. If the server version is higher, the server returns `409` with the current row. Default resolution: **server wins**, and the client shows a toast "Catatan ini sudah diubah oleh Ayah. Perubahanmu tidak disimpan." with a "Lihat" action. Deletes always win over edits.
- **BR-SYNC-06 Timers offline:** starting a timer offline creates a running entry with client time and `source = timer`; on sync the server accepts the client `started_at` only if it is within the last 24 h and also satisfies BR-TIME-04 (no more than 5 minutes in the future and not before the child's DOB). Otherwise, reject it with `VALIDATION_ERROR`. If another member already has a running timer of the same type for that child, the server returns 409 and the client offers "Gabungkan" (keep the earlier start) or "Batalkan punyaku".
- **BR-SYNC-07** Read data cached for offline: the last 14 days of entries per child, child profiles, vaccine list, milestone list.

### 8.14 Multiple children and twins (X3)
- **BR-TWN-01** A child switcher (avatars with each child's accent color) is always visible in the header. The last active child is remembered per user.
- **BR-TWN-02** If the family has ≥ 2 children, entry sheets for bottle, diaper, sleep, MPASI, medicine show "Catat untuk: [Anak A] [Anak B] [Semua]". Selecting multiple creates one entry per child with a shared `batch_id`. Editing later edits each entry individually.
- **BR-TWN-03** Timers can be started for multiple children at once (creates separate running entries).
- **BR-TWN-04** Timeline has an "Semua anak" filter that interleaves entries with each child's color dot.

### 8.15 Audit trail (who logged it)
- **BR-AUD-01** Every entry card shows the creator's display name ("dicatat oleh Bunda") and, if edited by someone else, "· diubah oleh Ayah 10:02".
- **BR-AUD-02** Every create / update / delete / restore writes an `audit_log` row in the same transaction.
- **BR-AUD-03** Entry detail screen shows its history (who, when, what changed).
- **BR-AUD-04** Deleting an entry shows an undo snackbar (5 s). Deleted entries can be restored from "Baru dihapus" (last 7 days) in the timeline menu.

---

## 9. Functional requirements and acceptance criteria

Format: **ID** requirement → *Acceptance criteria (AC)*. Phase shown as [P1] or [P2].

### 9.1 Account and onboarding
- **FR-ACC-01 [P1]** Sign up with display name, email, password, ToS/Privacy + 18+ confirmation.
  *AC:* verification email arrives via Resend in the user's chosen language; account cannot sign in until verified; duplicate email shows generic message.
- **FR-ACC-02 [P1]** Sign in / sign out / sign out of all devices.
  *AC:* session survives app restarts; a user who opens the app at least once every 7 days stays signed in indefinitely; a user inactive 7+ days is sent to login.
- **FR-ACC-03 [P1]** Forgot password / reset password.
  *AC:* link valid 1 h, single use; other sessions revoked after reset.
- **FR-ACC-04 [P1]** Onboarding after first sign-in: choose "Buat keluarga baru" or "Gabung dengan kode undangan".
- **FR-ACC-05 [P1]** Create family: family name, my role (Bunda/Ayah), family timezone (prefilled). Then "Tambah anak".
  *AC:* family created with creator as member; user lands on Add Child.
- **FR-ACC-06 [P1]** Add child (parent only): name, nickname (optional), sex (required, helper text "Hanya untuk perhitungan kurva pertumbuhan WHO"), DOB, time of birth (optional), gestational age (weeks + days, default "Cukup bulan / 40 minggu"), birth weight (required), birth length, birth head circumference (optional), current weight (optional, creates a growth measurement dated today), feeding mode, allergies note, avatar and color.
  *AC:* vaccine schedule generated; milestone checklist available; milk target computed; user lands on Today.
- **FR-ACC-07 [P1]** Join with invite code → confirm screen → if code role is `parent`, choose Bunda/Ayah → joined.
  *AC:* invalid/expired/used/revoked codes show one generic error "Kode tidak valid atau sudah kedaluwarsa"; rate limits enforced.
- **FR-ACC-08 [P1]** Delete account (Settings) per PRV-05.

### 9.2 Family management
- **FR-FAM-01 [P1]** Family switcher (if user belongs to > 1 family) in the profile menu.
- **FR-FAM-02 [P1]** Members list with role chips and "Kamu" marker; parents can remove caregivers; anyone can leave (except last parent).
- **FR-FAM-03 [P1]** Parents generate invite codes (choose Parent or Caregiver), see active codes (role, expiry, created by, without plain code), revoke codes. Share via Web Share API ("Gabung ke keluarga kami di FamilyCradle. Kode: ABCD-EFGH") or copy.
- **FR-FAM-04 [P1]** Family settings (parent): name, timezone, pumping side mode, delete / restore family. [P2] AI consent toggle.
- **FR-FAM-05 [P1]** Children list: add, edit, reorder, delete / restore (parent only).

### 9.3 Today screen (home)
- **FR-TOD-01 [P1]** Header: child switcher, child age (and corrected age badge), family day date, sync status icon.
- **FR-TOD-02 [P1]** Status cards (tap to open detail/timeline filtered):
  1. **Susu**: ring progress "420 / 650 ml", last bottle "2 j 15 m lalu · 120 ml", suggested next amount.
  2. **DBF**: last side and time, "Mulai dari kiri", running timer if active.
  3. **Tidur**: running timer or "Bangun sejak …" + wake window suggestion; today's total sleep.
  4. **Popok**: pipis count, pup count, last pup.
  5. **ASI Perah** (if any pumping in last 7 days or user is `mom`): today's total and sessions.
  6. **Obat**: next dose countdown(s), only if any.
  7. **Vaksin**: only if `due_soon`, `due` or `late` exists.
- **FR-TOD-03 [P1]** Quick action grid of all modules (Susu, DBF, Tidur, Popok, MPASI, Pumping, Obat, Timbang, Vaksin, Milestone) plus bottle ml shortcuts row and big "Pipis" / "Pup" buttons.
  *AC:* bottle shortcut and diaper quick buttons log in 1 tap + show undo; every other module opens its bottom sheet with smart defaults (time = now).
- **FR-TOD-04 [P1]** Any running timer (from any member) is shown as a sticky pill at the top of every screen: "Tidur · 00:42:10 · oleh Bunda [Stop]".
- **FR-TOD-05 [P1]** Today updates within ~5 s when another member logs something.

### 9.4 Timeline
- **FR-TL-01 [P1]** Vertical timeline for a family day, newest first (toggle oldest first), swipe or arrows to change day, date picker.
- **FR-TL-02 [P1]** Each item: module icon/color, title ("Susu 90 ml · ASIP"), time, duration if any, short details, creator name, sync state.
- **FR-TL-03 [P1]** Filters: module chips (multi-select), child (incl. "Semua anak").
- **FR-TL-04 [P1]** Tap item → edit sheet; swipe left → delete with undo; long-press → duplicate ("Catat lagi sekarang").
- **FR-TL-05 [P1]** Sleep sessions crossing midnight appear on both days with "(lanjutan)" marker.
- **FR-TL-06 [P1]** Daily mini-summary at top of the timeline: milk ml, feeds count, sleep total, diapers, pumping total, MPASI sessions.

### 9.5 Module entry sheets (all [P1])
Common to all sheets: time picker defaults to now with quick "-5m / -15m / -30m" chips; note field collapsed by default; Save button always visible; multi-child selector when applicable; validation messages inline.

| Module | Required fields | Optional fields | Special AC |
|---|---|---|---|
| Susu (bottle) | amount ml (stepper ±10 + shortcuts), milk type | leftover ml, brand, note | consumed = amount − leftover; progress updates immediately |
| DBF | timer or manual durations | note | timer survives screen lock and works across devices (start on Mom's phone, stop on Dad's) |
| Popok | kind | pup amount, consistency, color, rash, note | color red/pale/black (day > 4) shows doctor note |
| Tidur | start, (end or running), category | location, fall-asleep method, quality, pauses, note | overlap prevented; midnight split in totals |
| MPASI | time, meal type, texture, ≥ 1 food | ml or spoons, portion, reaction, note | new food detection + 3-day warning + allergen chip |
| Pumping | total ml (combined) or left/right ml (separate) | timer, start/end, pumpedBy, note | daily total updates |
| Obat | name, dose, unit, time | route, reason, next dose hours, note | no dose suggestions anywhere |
| Timbang (growth) | ≥ 1 of weight/length/head, date | place, note | plausibility checks |
| Vaksin | (list screen) | | status auto-computed; edit due date; custom vaccine |
| Milestone | (checklist screen) | date, note | grouped by checkpoint and domain |

### 9.6 Child profile and history
- **FR-CHD-01 [P1]** Child profile page: info, feeding mode, milk target (auto value with explanation "150 ml × 5,2 kg = 780 ml/hari" or manual), allergies, food catalog with reaction status, medicine history.
- **FR-CHD-02 [P1]** Growth page Phase 1: list + add + delete/edit; Phase 2: charts (Section 12).

### 9.7 Settings
- **FR-SET-01 [P1]** Language: Bahasa Indonesia / English / Campuran (Mixed). Applies immediately, stored in `user_profile`.
- **FR-SET-02 [P1]** Night mode: Otomatis (by `night_start`/`night_end`), Selalu, Mati.
- **FR-SET-03 [P1]** Display name, timezone (auto-detect with manual override), password change, sign out, sign out all devices, delete account.
- **FR-SET-04 [P2]** Notifications: enable push on this device, per-reminder toggles and intervals, quiet hours.
- **FR-SET-05 [P1]** About: version, Privacy Policy, Terms, medical disclaimer, open-source licenses.

---

## 10. UX and visual design

### 10.1 Design direction
The reference screenshots shared by the product owner are **inspiration only**. Do **not** replicate their layout, card style or colors. FamilyCradle's own identity:
- **Feel:** warm, cozy, calm, like a soft blanket in a sunlit room. Friendly, playful but not childish.
- **Unisex:** soft brown / latte as the base. Module accents are muted earthy pastels (sage, sand, terracotta, oat, dusty blue, clay, olive, apricot). No dominant pink or baby blue.
- **Shapes:** generous rounded corners (16–24 px), soft shadows, pill-shaped buttons, subtle organic blob shapes in empty states.
- **Illustrations:** simple, flat, warm illustrations (baby, moon, bottle, spoon) for empty states and onboarding. One consistent style.
- **Icons:** one consistent set (e.g. Phosphor duotone) tinted per module. Avoid mixing emoji with icons.
- **Motion:** gentle (150–250 ms ease-out), respects `prefers-reduced-motion`; no motion in night mode except timers.

### 10.2 Design tokens (Tailwind 4 `@theme`)
Values are a starting palette; the agent may fine-tune but must keep WCAG AA contrast (4.5:1 for body text).
```css
@import "tailwindcss";

@theme {
  /* Brand: soft brown / latte */
  --color-cocoa-50:  #FBF7F2;  /* app background (cream) */
  --color-cocoa-100: #F4EBE0;
  --color-cocoa-200: #E8D6C3;
  --color-cocoa-300: #D6B999;
  --color-cocoa-400: #C29A74;
  --color-cocoa-500: #A97C55;  /* primary */
  --color-cocoa-600: #8C6343;  /* primary pressed / text on light */
  --color-cocoa-700: #6E4C34;
  --color-cocoa-800: #4F3626;
  --color-cocoa-900: #33241A;  /* main text */

  /* Module accents (muted, unisex) */
  --color-milk:      #E9C46A;  /* sand-gold */
  --color-breast:    #D4A5A5;  /* dusty clay rose */
  --color-diaper:    #8FBFB0;  /* sage teal */
  --color-sleep:     #8E9AAF;  /* dusty blue-grey */
  --color-mpasi:     #A3B18A;  /* olive sage */
  --color-pumping:   #E0B1A0;  /* apricot */
  --color-medicine:  #C9837A;  /* terracotta */
  --color-growth:    #B5A88F;  /* oat */
  --color-vaccine:   #9DAFC2;  /* soft slate */
  --color-milestone: #C7B377;  /* honey */

  /* Semantic */
  --color-success: #6A994E;
  --color-warning: #E09F3E;
  --color-danger:  #BC4749;

  /* Night mode surfaces */
  --color-night-bg:      #1E1814;
  --color-night-surface: #2A221C;
  --color-night-text:    #E8D9C8;

  --font-display: "Fredoka", ui-rounded, system-ui, sans-serif;
  --font-sans:    "Nunito", system-ui, sans-serif;

  --radius-card: 1.25rem;
  --radius-pill: 9999px;
}
```
- Headings, numbers on cards, buttons: **Fredoka** (500–600). Body and labels: **Nunito** (400–700). Self-host both for offline.
- Base font size 16 px; key numbers (ml, timers) 28–40 px.

### 10.3 Layout and navigation
- Mobile-first (360–430 px), works up to tablet/desktop with centered max-width 560 px column (desktop shows two columns for Today + Timeline).
- **Bottom navigation (5):** Hari ini (Today) · Linimasa (Timeline) · **[+] big center button** (opens module picker) · Tumbuh (Growth, Vaccines, Milestones) · Profil (Family, Settings). Phase 2 adds Insight as a section inside Tumbuh and a card on Today.
- Entry forms open as **bottom sheets** (thumb reach), close by swipe down; unsaved changes prompt.
- Tap targets ≥ 48 × 48 px; primary actions at the bottom.
- Safe-area insets respected (iOS notch / home bar).

### 10.4 Night mode (X6)
- Auto between `night_start` and `night_end` (viewer's timezone), or forced on/off.
- Warm dark palette (night tokens), reduced brightness (no pure white; text `#E8D9C8`), accent colors desaturated 30%.
- Larger quick-action buttons, celebrations and non-essential animations disabled, haptic feedback (Vibration API where available) instead of visual flashes.
- Optional "Layar redup" overlay (adds 40% dark overlay) toggled from the header moon icon.

### 10.5 Language (X5)
- Three locale files: `id.json`, `en.json`, `mixed.json`. `mixed.json` is **English base with Indonesian overrides** for culturally specific terms (Appendix D). Implementation: i18next with `fallbackLng` chain `mixed → en`.
- All enum labels, units, date formats are localized. Number format: `id` and `mixed` use comma decimals (`7,45 kg`), `en` uses dot (`7.45 kg`). Inputs accept both separators in all locales.
- Dates: `id`/`mixed` → "Min, 22 Nov 2026"; `en` → "Sun, 22 Nov 2026". Time always `HH:mm`.
- AI output (Phase 2) is generated in the requesting user's language (for `mixed`, prompt instructs English with the Appendix D Indonesian terms kept).

### 10.6 Empty, loading and error states
- Every list has a friendly empty state with an illustration and a primary action ("Belum ada catatan hari ini. Mulai dengan + di bawah.").
- Skeleton loaders, not spinners, for cards.
- Errors are human: "Ups, belum tersambung. Catatanmu aman dan akan dikirim saat online."

### 10.7 Accessibility
- WCAG 2.2 AA contrast, visible focus states, labels for all inputs, screen-reader labels for icon buttons, timer announced via `aria-live="polite"` at most once per minute.
- Do not rely on color alone (status also uses icons/text).

### 10.8 PWA
- Manifest: name "FamilyCradle", short_name "FamilyCradle", theme color `#A97C55`, background `#FBF7F2`, display `standalone`, icons 192/512 + maskable, shortcuts (Catat susu, Catat popok, Mulai tidur).
- Service worker: precache app shell and fonts; runtime cache `GET /api/*` responses with network-first (3 s timeout) for read endpoints; never cache `/api/auth/*`.
- Install prompt: custom "Pasang aplikasi" banner after the 3rd visit (Android/desktop `beforeinstallprompt`; iOS shows instructions "Bagikan → Tambahkan ke Layar Utama").
- New version available → toast "Versi baru tersedia [Muat ulang]".

---

## 11. API specification

### 11.1 Conventions
- Base path `/api`. JSON only. Auth via Better Auth session cookie.
- Success: `200`/`201` with resource JSON. List responses: `{ items: [], nextCursor?: string }`.
- Error shape: `{ error: { code: "VALIDATION_ERROR" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "RATE_LIMITED" | "UNAUTHENTICATED" | "INTERNAL", message: string, details?: object } }`.
- Mutations of versioned rows accept `version`; mismatch → `409 CONFLICT` with `details.current`.
- Every response includes the `Date` header (used for client clock offset).
- All request/response schemas defined in `packages/shared` with Zod and inferred TS types.

### 11.2 Endpoints
| Method | Path | Who | Description |
|---|---|---|---|
| * | `/api/auth/*` | public | Better Auth handler (sign-up, sign-in, sign-out, verify email, forgot/reset password, sessions) |
| GET | `/api/me` | user | user + profile + memberships (families, roles) |
| PATCH | `/api/me` | user | display name, language, timezone, night mode settings, last active family/child |
| DELETE | `/api/me` | user | delete account (password confirmation) |
| POST | `/api/families` | user | create family (name, myRole, timezone) |
| GET | `/api/families/:fid` | member | family details, members, children |
| PATCH | `/api/families/:fid` | parent | name, timezone, pumping_side_mode, quick_bottle_ml (any member may edit quick_bottle_ml), [P2] ai_consent |
| DELETE | `/api/families/:fid` | parent | soft delete (body: confirmName) |
| POST | `/api/families/:fid/restore` | parent | restore within 7 days |
| POST | `/api/families/:fid/leave` | member | leave family |
| DELETE | `/api/families/:fid/members/:mid` | parent | remove caregiver |
| PATCH | `/api/families/:fid/members/me` | member (parent) | switch own label mom ↔ dad |
| POST | `/api/families/:fid/invites` | parent | create invite (targetRole) → returns plain code once |
| GET | `/api/families/:fid/invites` | parent | list active invites (no plain codes) |
| DELETE | `/api/families/:fid/invites/:iid` | parent | revoke |
| POST | `/api/invites/preview` | user | body {code} → family name + role (rate limited) |
| POST | `/api/invites/redeem` | user | body {code, role?} → membership |
| POST | `/api/families/:fid/children` | parent | create child (generates vaccines) |
| PATCH | `/api/children/:cid` | parent | edit child |
| DELETE | `/api/children/:cid` | parent | soft delete |
| POST | `/api/children/:cid/restore` | parent | restore |
| GET | `/api/children/:cid/logs?from=&to=&types=` | member | entries in range (max 31 days per call) |
| PUT | `/api/logs/:id` | member | idempotent create-or-update (client id). Body includes `childIds?` for multi-child create (the supplied UUIDv7 identifies the first child entry; sibling IDs are deterministic UUIDv5 values derived from `(id, childId)`, as an explicit exception to the UUIDv7 convention) |
| DELETE | `/api/logs/:id` | member | soft delete |
| POST | `/api/logs/:id/restore` | member | restore within 7 days |
| GET | `/api/logs/:id/history` | member | audit history |
| GET | `/api/families/:fid/deleted?type=log` | member | recently deleted (7 days) |
| POST | `/api/timers` | member | start timer {id, type, childIds?, side?, category?} (server sets started_at) |
| POST | `/api/timers/:id/pause` / `resume` / `switch-side` | member | timer actions (server time) |
| POST | `/api/timers/:id/stop` | member | stop {endedAt? (≤ now), amountMl?, leftMl?, rightMl?} |
| GET | `/api/families/:fid/timers/active` | member | running timers for the family |
| GET | `/api/children/:cid/summary/day?date=YYYY-MM-DD` | member | daily totals, milk target + progress, last events, wake window suggestion |
| GET | `/api/families/:fid/sync?since=<rev>` | member | delta sync (Section 8.13) |
| GET/PUT/DELETE | `/api/children/:cid/growth`, `/api/growth/:id` | member | growth CRUD (PUT idempotent by client id) |
| GET | `/api/children/:cid/vaccines` | member | list with computed status |
| PATCH | `/api/vaccines/:id` | member | mark done/undo, reschedule, skip, note |
| POST | `/api/children/:cid/vaccines` | member | add custom vaccine |
| DELETE | `/api/vaccines/:id` | member | delete custom vaccine only |
| POST | `/api/children/:cid/vaccines/options` | member | set option group (e.g. ROTA_PRODUCT=RV5) and regenerate pending doses |
| GET | `/api/children/:cid/milestones?checkpoint=` | member | definitions + status |
| PUT | `/api/children/:cid/milestones/:mid` | member | set achieved/date/note |
| GET | `/api/children/:cid/foods` | member | food catalog |
| POST / PATCH | `/api/children/:cid/foods`, `/api/foods/:id` | member | add food, set reaction status |
| GET | `/api/children/:cid/medicines/history?name=&from=&to=` | member | medicine history |
| GET | `/healthz`, `/readyz` | public | health |
| POST | `/internal/jobs/purge` | Cloud Scheduler | hard-delete items past `purge_after` (daily 03:00 WIB) |
| **Phase 2** | | | |
| GET | `/api/children/:cid/growth/analysis` | member | z-scores, percentiles, velocity, flags |
| GET | `/api/children/:cid/analytics/weekly?weekStart=` | member | weekly aggregates (Section 12.3) |
| GET | `/api/children/:cid/insights?kind=&limit=` | member | stored AI insights |
| POST | `/api/children/:cid/insights` | member | on-demand insight {kind: pattern / suggestion_mpasi / suggestion_sleep} (quota) |
| POST | `/api/insights/:id/feedback` | member | helpful / not_helpful / unsafe |
| POST / DELETE | `/api/push/subscriptions` | user | register / remove push subscription |
| GET / PUT | `/api/reminders` | user | reminder settings |
| GET | `/api/children/:cid/report.pdf?from=&to=&lang=` | member | PDF summary |
| POST | `/internal/jobs/reminders` | Cloud Scheduler | every 5 min: evaluate and send due reminders |
| POST | `/internal/jobs/weekly-summary` | Cloud Scheduler | hourly: generate weekly summaries for families whose local time is Monday 06:00–06:59 |

---

## 12. Analytics and AI (Phase 2)

### 12.1 Principles
1. **Numbers are computed deterministically, never by the AI.** All aggregates, z-scores, percentiles and red-flag checks are calculated in TypeScript services. Gemini only turns these verified numbers into friendly language and suggestions.
2. **Red flags are rule-based.** The AI never decides whether something is a red flag; it can only explain flags already raised by the `redFlags` service.
3. **Not medical advice.** Every AI surface shows: "Insight ini dibuat otomatis oleh AI dan bukan pengganti saran dokter." / "AI-generated, not a substitute for medical advice."
4. **Consent first** (PRV-03) and **data minimization** (PRV-04).

### 12.2 Growth analytics (WHO Child Growth Standards, 0–24 months)
- **Indicators:** weight-for-age (WFA), length-for-age (LFA), head-circumference-for-age (HCFA), weight-for-length (WFL).
- **Reference data:** official WHO Child Growth Standards **expanded tables (by day)** with L, M, S parameters, boys and girls, stored as JSON in `seed/who_lms/` (one file per indicator and sex). Source: WHO child growth standards website. Include a script `scripts/import-who-lms.ts` that converts the official files; the agent must not invent values. **[VERIFY]**
- **Z-score (LMS):** `Z = ((X / M)^L − 1) / (L × S)`. For WFA and WFL, apply WHO's restricted adjustment when |Z| > 3 (as defined in the WHO growth standards technical documentation).
- **Percentile** = Φ(Z) × 100 (standard normal CDF). Display with 1 decimal ("P42,3").
- **Age** used: corrected age in days if premature (BR-AGE-03), else chronological age in days.
- **Charts:** Recharts line chart per indicator with reference curves for P3, P15, P50, P85, P97 (toggle to −3, −2, 0, +2, +3 SD), child's points connected, tooltip with value, age, z, percentile. Shaded band P15–P85. Child color for the line.
- **Classification labels** (Indonesian terms per Kemenkes PMK No. 2/2020, **[VERIFY]**), shown gently and paired with "Diskusikan dengan dokter/bidan" when outside the normal band:

| Indicator | Z range | Label (ID) | Label (EN) |
|---|---|---|---|
| WFA | < −3 | Berat badan sangat kurang | Severely underweight |
| WFA | −3 to < −2 | Berat badan kurang | Underweight |
| WFA | −2 to +1 | Berat badan normal | Normal |
| WFA | > +1 | Risiko berat badan lebih (cek BB/PB) | Possible risk of overweight (check WFL) |
| LFA | < −3 | Sangat pendek | Severely stunted |
| LFA | −3 to < −2 | Pendek | Stunted |
| LFA | −2 to +3 | Normal | Normal |
| LFA | > +3 | Tinggi | Tall |
| WFL | < −3 | Gizi buruk | Severely wasted |
| WFL | −3 to < −2 | Gizi kurang | Wasted |
| WFL | −2 to +1 | Gizi baik | Normal |
| WFL | > +1 to +2 | Berisiko gizi lebih | Possible risk of overweight |
| WFL | > +2 to +3 | Gizi lebih | Overweight |
| WFL | > +3 | Obesitas | Obese |
| HCFA | < −2 or > +2 | Lingkar kepala di luar rentang normal | Head circumference outside normal range |

- **Velocity:** weight gain g/day and g/week between consecutive measurements, and per week (interpolated) for the weekly view.

### 12.3 Weekly analytics ("week by week")
Week = Monday 00:00 to Sunday 23:59 in family timezone. Also "Minggu ke-N" since birth for the first 52 weeks.

| Area | Metrics per week | Visualization |
|---|---|---|
| Milk | total ml, daily avg, days target met (x/7), avg feeds/day, avg ml per feed | daily bars + target line; 12-week trend |
| DBF | sessions/day, avg minutes, left vs right balance | stacked bars |
| Sleep | avg total/day, day vs night split, longest night stretch, avg night wakings (pauses), avg nap count | stacked bars, trend line |
| Diaper | avg wet/day, avg pup/day, any color flags | bars |
| Pumping | total ml, avg/day, sessions/day | bars |
| MPASI | sessions, new foods introduced (names), reactions, texture stage progression | list + chips |
| Medicine | doses count per medicine | list |
| Growth | weight change this week, z-score change, current percentiles | sparkline + percentile chips |

Each metric shows delta vs previous week (▲ +8%). Insight screen: week selector, metric cards, AI weekly summary on top.

### 12.4 AI features (Gemini)
| Code | Feature | Trigger | Quota |
|---|---|---|---|
| A | **Weekly summary** in natural language for the previous week | Automatic, Monday 06:00 family time (Cloud Scheduler hourly job). Only for families with consent and ≥ 3 logged days that week | Not counted; max 1 per child per week |
| B | **Pattern insights** (feeding, sleep, diaper, pumping trends over last 14 days) | On demand ("Lihat pola") | Counts toward daily on-demand quota (default 5 / family / day) |
| C | **Growth alert explanation** | Automatic when `redFlags` raises a growth flag on a new measurement | Not counted |
| E | **Suggestions**: (E1) sleep routine and wake windows based on recent pattern + age; (E2) MPASI ideas based on age, texture stage, foods already tried, avoided allergens, Indonesian home foods | On demand | Counts toward quota |

Global safety cap: max 20 Gemini calls per family per day (all kinds). Quota exceeded → friendly message with reset time.

**Pipeline (all kinds):**
1. Check consent (`family.ai_consent = 1`), quota, and that enough data exists (else show "Butuh data minimal 3 hari").
2. Build a **structured input** (no names, no free-text notes, no emails), e.g.:
```json
{
  "child": { "ageDays": 96, "correctedAgeDays": 82, "sex": "female", "premature": true, "feedingMode": "mixed" },
  "period": { "start": "2026-11-09", "end": "2026-11-15" },
  "metrics": { "milk": { "avgMlPerDay": 640, "targetMlPerDay": 700, "daysTargetMet": 3 }, "sleep": { "avgTotalMin": 840, "avgNightMin": 560, "avgNightWakings": 2.4 }, "...": {} },
  "previousPeriod": { "...": {} },
  "growth": { "latest": { "wfaZ": -0.4, "wfaPct": 34.5 }, "change4w": { "wfaZ": -0.2 } },
  "redFlags": [ { "code": "WFA_CROSSING_DOWN", "severity": "consult" } ],
  "mpasi": { "texture": "saring_lumat", "triedFoods": ["beras", "wortel", "telur"], "avoidFoods": ["udang"] },
  "language": "id"
}
```
3. Call Gemini with: system instruction (Appendix E.1), task prompt (E.2–E.5), `responseMimeType: "application/json"` and `responseSchema` (E.6), temperature 0.3, max output tokens ~800, timeout 20 s, 1 retry on 5xx/timeout.
4. Validate output with Zod. Run **safety post-filter** (E.7). On failure → store nothing, show deterministic fallback text built from metrics ("Rata-rata susu 640 ml/hari, 3 dari 7 hari mencapai target.").
5. Store in `ai_insight` with `model`, `prompt_version`, `input_hash` (identical input within 24 h returns cached result, not counted in quota).
6. Display with disclaimer, "Bermanfaat? 👍 👎 ⚠️ Tidak aman" feedback.

### 12.5 Red flag rules (`redFlags` service, deterministic, **[VERIFY]** before launch)
See Appendix F. Each flag has `code`, `severity` (`info` / `watch` / `consult`), localized message, and is displayed regardless of AI consent (it is not AI). Severity `consult` always shows "Konsultasikan dengan dokter anak" with a calm tone. The app never says "darurat" except for the static info page "Kapan harus segera ke dokter / IGD" (content provided by product owner and reviewed).

---

## 13. Notifications (Phase 2, web push only)
- **NTF-01** Opt-in per device from Settings or a contextual prompt (never on first launch). Explain value before calling `Notification.requestPermission()`.
- **NTF-02** iOS/iPadOS: push works only for PWAs **added to the Home Screen** (iOS 16.4+). Show instructions when on iOS Safari not installed.
- **NTF-03** Reminder kinds (per user, per child where relevant):

| Kind | Default | Rule |
|---|---|---|
| Feed interval | off, 3 h | No bottle/DBF end in the last X h (ignored while a sleep timer runs, configurable) |
| Pump interval | off, 3 h | No pumping by this user in last X h (only for role `mom`) |
| Medicine next dose | on when `nextDoseInHours` set | At `time + X h`, once |
| Vaccine | on | 3 days before `due_date` and on `due_date` (09:00 family time), and once when it becomes `late` |
| Timer still running | on | Sleep > 14 h, DBF > 90 min, pumping > 60 min |
| Weekly summary ready | on | When A is generated |

- **NTF-04** Quiet hours per user (default off). Vaccine and medicine reminders ignore quiet hours only if user enables "Tetap kirim pengingat obat".
- **NTF-05** Dispatcher job every 5 min; de-duplication via `notification_log` (kind + ref_id + user). Expired subscriptions (404/410) are deleted; failure_count ≥ 5 → disable.
- **NTF-06** Lock-screen privacy option "Sembunyikan detail" → generic text "Ada pengingat baru di FamilyCradle".
- **NTF-07** Tapping a notification deep-links to the relevant screen.

---

## 14. PDF doctor summary (Phase 2)
- **PDF-01** From child profile: "Ringkasan untuk dokter". Choose period (7 / 14 / 30 days / custom up to 90 days), language (ID/EN), sections (all on by default), optional note for the doctor (not stored).
- **PDF-02** A4 portrait, FamilyCradle branding, page numbers, generated date/time and "dibuat oleh *display name*".
- **PDF-03** Sections:
  1. Child identity: name, sex, DOB, age + corrected age, gestational age, birth weight/length/HC, feeding mode, allergies note, foods marked to avoid.
  2. Growth: table of measurements (date, weight, length, HC, z-scores, percentiles) + WFA, LFA, HCFA charts.
  3. Feeding: daily averages (bottle ml, feeds, DBF sessions/minutes), target met days, MPASI foods introduced in period, reactions.
  4. Sleep: daily average total, day/night split, night wakings.
  5. Diaper: daily averages, flagged colors with dates.
  6. Medicine history: table (date/time, name, dose, unit, route, reason, given by).
  7. Vaccines: status table (done with dates; upcoming; late).
  8. Milestones: current and previous checkpoint status.
  9. Red flags raised in period (rule-based).
  10. Parent's note.
- **PDF-04** Footer disclaimer: "Data dicatat oleh keluarga melalui FamilyCradle. Bukan dokumen medis resmi."
- **PDF-05** Generated on the fly (not stored), streamed as `application/pdf`; max 10 per family per day; generation < 10 s.

---

## 15. Non-functional requirements
| ID | Area | Requirement |
|---|---|---|
| NFR-01 | Performance | API p95 < 300 ms for non-AI endpoints (server in `asia-southeast3`) ; sync endpoint p95 < 150 ms with no changes |
| NFR-02 | Performance | Today screen LCP < 2.5 s on mid-range Android over 4G; initial JS < 250 KB gzipped; code-split charts and Phase 2 features |
| NFR-03 | Responsiveness | Optimistic UI: logging feels instant (< 100 ms visual feedback) even before server response |
| NFR-04 | Availability | 99.5% monthly target |
| NFR-05 | Data durability | Use Turso backups / point-in-time restore available on the chosen plan; document restore procedure in `docs/RUNBOOK.md` |
| NFR-06 | Scalability | Designed for 10,000 families, 50 writes/family/day; polling load within Cloud Run autoscaling |
| NFR-07 | Observability | Structured JSON logs (pino), request IDs, Cloud Error Reporting, uptime check on `/readyz`, alert on 5xx rate > 2% for 5 min |
| NFR-08 | Browser support | Chrome/Edge Android & desktop (last 2), Safari iOS/iPadOS 16.4+, Firefox desktop (last 2), Samsung Internet (last 2) |
| NFR-09 | Accessibility | WCAG 2.2 AA (Section 10.7); axe checks with 0 critical issues |
| NFR-10 | Maintainability | TypeScript `strict`; ESLint + Prettier; shared Zod schemas; no `any` in shared package |
| NFR-11 | Localization | No hard-coded user-facing strings; CI check for missing keys across `id`, `en`, `mixed` |
| NFR-12 | Battery / data | Polling stops when tab hidden; sync responses only include deltas; gzip/brotli enabled |

---

## 16. Delivery plan (2 phases)

### Phase 1: From sign-up to logging trackers
| Milestone | Scope |
|---|---|
| P1.1 Foundation | Monorepo, TypeScript configs, ESLint/Prettier, Dockerfile, CI (lint, typecheck, test, audit, build), Turso dev DB connection, Drizzle schema + migrations, Better Auth (email+password, verification, reset, 7-day sliding session), Resend templates (ID/EN), security middleware (Section 6), health endpoints, i18n skeleton, design tokens, base components |
| P1.2 Family | Onboarding, create family, invite codes (create/preview/redeem/revoke), roles and permission middleware, members management, add/edit/delete child, multiple families switcher |
| P1.3 Logging core | `log_entry` service + audit log + rev counter, timers (sleep, DBF, pumping) server-side, entry sheets for all modules (bottle, DBF, diaper, sleep, MPASI incl. food catalog and allergy watch, pumping, medicine), multi-child "log for both", Today screen, Timeline, undo/restore |
| P1.4 Health records | Growth entry and list, vaccine schedule generation (Appendix A) and management, milestone checklist (CDC seed), milk target engine (Appendix B), wake window suggestion (Appendix C), diaper color notes |
| P1.5 PWA and sync | Polling sync with delta endpoint, Dexie offline queue and replay, conflict handling, service worker, install prompt, night mode, language toggle (ID/EN/Mixed) |
| P1.6 Hardening and launch | Full permission matrix tests, E2E tests, accessibility pass, privacy/terms placeholder pages, account & family deletion + purge job, Cloud Run deploy in `asia-southeast3`, runbook |

**Phase 1 Definition of Done**
- [ ] A new user can sign up, verify email, create a family, add a child, invite a caregiver and a second parent with codes.
- [ ] All 10 modules support their specified create/update/delete/restore or status-update operations for Mom, Dad and Caregiver (Vaksin and Milestone follow their module-specific rules), and each entry shows who logged it.
- [ ] A timer started on device A shows on device B within 6 s and can be stopped from device B with correct duration.
- [ ] Logging works offline and syncs correctly when back online; conflicts handled per BR-SYNC-05.
- [ ] Caregiver cannot access any parent-only endpoint (automated tests for every route).
- [ ] Milk target, vaccine statuses and wake windows match unit-test fixtures.
- [ ] Language toggle (3 modes) and night mode work across all screens.
- [ ] Lighthouse PWA installable, accessibility ≥ 95; `npm audit` no high/critical.
- [ ] Deployed to Cloud Run with secrets from Secret Manager; purge job scheduled.

### Phase 2: Analytics and AI
| Milestone | Scope |
|---|---|
| P2.1 Growth engine | WHO LMS import, z-score/percentile service with test fixtures, growth charts, classification labels, velocity |
| P2.2 Weekly analytics | Aggregation service, Insight screen, week-by-week trends, comparison vs previous week |
| P2.3 Red flags | Deterministic `redFlags` service (Appendix F), surfacing on Today/Growth, milestone "perlu perhatian" |
| P2.4 AI | Consent flow, Gemini client, prompt templates, schemas, safety filter, quota, caching, features A, B, C, E, feedback |
| P2.5 Notifications | VAPID setup, subscriptions, reminder settings, dispatcher job, iOS guidance |
| P2.6 PDF | Report generation with charts |
| P2.7 Hardening | Load test sync + AI quotas, prompt regression tests, privacy policy update for AI processing |

**Phase 2 Definition of Done**
- [ ] Z-scores match WHO reference test cases within ±0.01.
- [ ] AI never runs without consent; no names/notes in Gemini payload (automated test inspects payload).
- [ ] AI outputs pass schema and safety filter tests on a fixture set of ≥ 30 scenarios (incl. red-flag cases).
- [ ] Weekly summary generated Monday 06:00 family time; reminders delivered without duplicates.
- [ ] PDF renders correctly in ID and EN.

---

## 17. Testing strategy
| Level | Tooling | Must cover |
|---|---|---|
| Unit | Vitest | milk target bands & ramp, corrected age, sleep midnight split, vaccine generation & status, option regeneration, invite code generation/hash, red flag rules, z-score/percentile, allergy watch, number parsing (comma/dot) |
| API integration | Vitest + Supertest, in-memory libSQL | every endpoint: happy path, validation errors, **authz matrix** (non-member → 404, caregiver → 403 on parent routes), idempotent PUT, 409 version conflicts, timers |
| E2E | Playwright (2 browser contexts = 2 family members) | onboarding, invite/join, quick logs, cross-device timer, offline queue, language switch, night mode |
| Security | automated + manual checklist | IDOR attempts, rate limits, CSP headers, cookie flags, auth flows, invite brute force |
| AI (P2) | fixture-based prompt tests | schema validity, safety filter, language, no hallucinated numbers (all numbers in output must exist in input) |
| Accessibility | axe-core in Playwright | 0 critical violations |

Email in tests: mock Resend with a fake transport that captures links.

---

## 18. Assumptions, decisions and open items

### 18.1 Decisions made in this BRD
| # | Decision |
|---|---|
| D1 | Better Auth cookie sessions are used instead of hand-built JWT (product owner approved; same 7-day sliding behaviour, lower security risk). |
| D2 | Mom and Dad have identical permissions; caregivers have everything except family administration. No Viewer role. |
| D3 | A parent cannot remove another parent (R-ROLE-01). |
| D4 | Pumping logs are family-level, not tied to one child. |
| D5 | Single `log_entry` table with typed JSON details for event logs; separate tables for growth, vaccines, milestones, foods. |
| D6 | Server wins on edit conflicts; deletes win over edits. |
| D7 | Turso is used in local development as well; only automated tests use in-memory libSQL. |
| D8 | All features free; AI usage limited by per-family quotas. |
| D9 | Frontend and API served from one Cloud Run service (same origin). |

### 18.2 Open items for the product owner (not blocking Phase 1 start)
1. Final Privacy Policy and Terms text (legal review recommended for UU PDP).
2. Custom domain name and sender domain for Resend.
3. Medical review of all **[VERIFY]** items (Appendix A, B, C, F, milestone translations) by a pediatrician or qualified health professional before public launch.
4. Content for "Kapan harus segera ke dokter" info page.
5. Brand assets: logo, app icon, illustration style.

### 18.3 Medical content review checklist (release blocker for public launch)
- [ ] Vaccine schedule seed (Appendix A) matches the official IDAI 2024 PDF.
- [ ] Milk target reference (Appendix B).
- [ ] Wake windows and sleep reference (Appendix C).
- [ ] Red flag thresholds and wording (Appendix F), diaper color notes.
- [ ] Milestone checklist translation.
- [ ] WHO LMS data imported from official files; z-score test cases pass.
- [ ] Disclaimers present on milk target, vaccines, growth, AI, PDF.

---

## Appendix A: Vaccine schedule seed, IDAI 2024, 0–24 months **[VERIFY]**

Source to verify against: IDAI "Jadwal Imunisasi Anak Usia 0–18 Tahun, Rekomendasi IDAI Tahun 2024" (official PDF on idai.or.id). Windows (`window_end_offset`) are app-defined defaults for "late" status, not IDAI rules, and must be reviewed. Store as `seed/vaccine_idai_2024.json`.

| id | Vaccine code | Dose label | due_offset | window_end_offset | Category | Option group / value | Notes (ID) |
|---|---|---|---|---|---|---|---|
| idai2024_hepb_0 | HEPB | Hepatitis B 0 | P0D | P7D | core | | Segera setelah lahir (< 24 jam), didahului vitamin K |
| idai2024_polio_0 | POLIO | Polio 0 (bOPV) | P0D | P1M | core | | Saat lahir / sebelum pulang |
| idai2024_bcg | BCG | BCG | P0D | P1M | core | | Sebelum usia 1 bulan |
| idai2024_dtp_1 | DTP | DTP 1 | P2M | P3M | core | | Dapat dalam vaksin kombinasi |
| idai2024_hib_1 | HIB | Hib 1 | P2M | P3M | core | | Kombinasi |
| idai2024_hepb_1 | HEPB | Hepatitis B 1 | P2M | P3M | core | | Kombinasi |
| idai2024_polio_1 | POLIO | Polio 1 | P2M | P3M | core | | |
| idai2024_pcv_1 | PCV | PCV 1 | P2M | P3M | core | | |
| idai2024_rota_1_rv1 | ROTA | Rotavirus 1 | P2M | P3M | core | ROTA_PRODUCT / RV1 | |
| idai2024_rota_2_rv1 | ROTA | Rotavirus 2 | P4M | P24W | core | ROTA_PRODUCT / RV1 | Batas usia maksimal dosis terakhir |
| idai2024_rota_1_rv5 | ROTA | Rotavirus 1 | P2M | P3M | core | ROTA_PRODUCT / RV5 | |
| idai2024_rota_2_rv5 | ROTA | Rotavirus 2 | P4M | P5M | core | ROTA_PRODUCT / RV5 | |
| idai2024_rota_3_rv5 | ROTA | Rotavirus 3 | P6M | P32W | core | ROTA_PRODUCT / RV5 | Batas usia maksimal dosis terakhir |
| idai2024_dtp_2_234 | DTP | DTP 2 | P3M | P4M | core | DTP_SCHEDULE / 2-3-4 | Hib, Hep B, Polio dosis 2 ikut jadwal yang sama |
| idai2024_hib_2_234 | HIB | Hib 2 | P3M | P4M | core | DTP_SCHEDULE / 2-3-4 | |
| idai2024_hepb_2_234 | HEPB | Hepatitis B 2 | P3M | P4M | core | DTP_SCHEDULE / 2-3-4 | |
| idai2024_polio_2_234 | POLIO | Polio 2 | P3M | P4M | core | DTP_SCHEDULE / 2-3-4 | |
| idai2024_dtp_3_234 | DTP | DTP 3 | P4M | P5M | core | DTP_SCHEDULE / 2-3-4 | |
| idai2024_hib_3_234 | HIB | Hib 3 | P4M | P5M | core | DTP_SCHEDULE / 2-3-4 | |
| idai2024_hepb_3_234 | HEPB | Hepatitis B 3 | P4M | P5M | core | DTP_SCHEDULE / 2-3-4 | |
| idai2024_polio_3_234 | POLIO | Polio 3 | P4M | P5M | core | DTP_SCHEDULE / 2-3-4 | |
| idai2024_dtp_2_246 / hib / hepb / polio | (same 4 codes) | dose 2 | P4M | P5M | core | DTP_SCHEDULE / 2-4-6 | Alternative schedule |
| idai2024_dtp_3_246 / hib / hepb / polio | (same 4 codes) | dose 3 | P6M | P7M | core | DTP_SCHEDULE / 2-4-6 | Alternative schedule |
| idai2024_ipv_1 | IPV | IPV 1 | P4M | P5M | core | | Sesuai panduan Kemenkes (bisa dalam vaksin heksavalen) |
| idai2024_pcv_2 | PCV | PCV 2 | P4M | P5M | core | | |
| idai2024_pcv_3 | PCV | PCV 3 | P6M | P7M | core | | |
| idai2024_flu_1 | INFLUENZA | Influenza 1 | P6M | P7M | annual | | Dosis pertama |
| idai2024_flu_2 | INFLUENZA | Influenza 2 | P7M | P8M | annual | | Minimal 4 minggu setelah dosis 1 |
| idai2024_mr_1 | MR | MR 1 | P9M | P12M | core | | |
| idai2024_ipv_2 | IPV | IPV 2 | P9M | P10M | core | | Sesuai panduan Kemenkes |
| idai2024_je_1 | JE | Japanese Encephalitis 1 | P9M | P12M | optional_endemic | | Daerah endemis / bepergian |
| idai2024_pcv_4 | PCV | PCV 4 (booster) | P12M | P15M | core | | Booster usia 12–15 bulan |
| idai2024_var_1 | VARICELLA | Varisela 1 | P12M | P15M | core | | |
| idai2024_hepa_1 | HEPA | Hepatitis A 1 | P12M | P15M | core | | |
| idai2024_var_2 | VARICELLA | Varisela 2 | P14M | P18M | core | | |
| idai2024_dtp_4 | DTP | DTP 4 (booster) | P18M | P24M | core | | Kombinasi |
| idai2024_hib_4 | HIB | Hib 4 (booster) | P18M | P24M | core | | |
| idai2024_hepb_4 | HEPB | Hepatitis B 4 | P18M | P24M | core | | |
| idai2024_polio_4 | POLIO | Polio 4 | P18M | P24M | core | | |
| idai2024_mmr_1 | MMR | MMR 1 / MR lanjutan | P18M | P24M | core | | Verify exact IDAI 2024 age (15–18 bln) |
| idai2024_hepa_2 | HEPA | Hepatitis A 2 | P18M | P24M | core | | 6–12 bulan setelah dosis 1 |
| idai2024_flu_annual_1 | INFLUENZA | Influenza (tahunan) | P19M | P24M | annual | | Ulangan tiap tahun |
| idai2024_je_2 | JE | Japanese Encephalitis 2 | P24M | P27M | optional_endemic | | |
| idai2024_typhoid_1 | TYPHOID | Tifoid 1 | P24M | P27M | core | | Ulangan tiap 3 tahun |

Rules: when `DTP_SCHEDULE = 2-3-4`, generate only `_234` rows; when `2-4-6`, only `_246` rows. Same for `ROTA_PRODUCT`. Dose 1 rows (2 months) are shared.

## Appendix B: Milk target reference **[VERIFY]** (`seed/milk_target_reference.json`)

| Age (corrected if premature) | Rule | Reference feeds/day (for per-feed hint) |
|---|---|---|
| Day 1 | 60 ml/kg/day | 8 |
| Day 2 | 90 ml/kg/day | 8 |
| Day 3 | 120 ml/kg/day | 8 |
| Day 4 to < 1 month | 150 ml/kg/day, max 1,000 ml | 8 |
| 1 to < 4 months | 150 ml/kg/day, max 1,000 ml | 7 |
| 4 to < 6 months | 150 ml/kg/day, max 1,000 ml | 6 |
| 6 to < 9 months | fixed 700 ml/day (reference range 600–800) | 5 |
| 9 to < 12 months | fixed 600 ml/day (reference range 500–700) | 4 |
| 12 to 24 months | fixed 400 ml/day (reference range 300–500) | 3 |

JSON shape:
```json
[
  { "fromDay": 1, "toDay": 1, "mode": "per_kg", "mlPerKg": 60, "capMl": 1000, "feedsPerDay": 8 },
  { "fromDay": 183, "toDay": 273, "mode": "fixed", "ml": 700, "rangeMin": 600, "rangeMax": 800, "feedsPerDay": 5 }
]
```
For `fixed` bands the card shows the range ("Target 700 ml · kisaran 600–800 ml").

## Appendix C: Sleep reference **[VERIFY]** (`seed/wake_windows.json`)

| Age (corrected) | Wake window | Typical naps/day | Typical total sleep / 24 h |
|---|---|---|---|
| 0–4 weeks | 35–60 min | 4–8 | 14–17 h |
| 4–12 weeks | 60–90 min | 4–5 | 14–17 h |
| 3–4 months | 75–120 min | 3–4 | 12–16 h |
| 5–7 months | 2–3 h | 2–3 | 12–16 h |
| 7–10 months | 2.5–3.5 h | 2 | 12–16 h |
| 11–14 months | 3–4 h | 1–2 | 11–14 h |
| 14–24 months | 4–6 h | 1 | 11–14 h |

Suggestion = last wake time + window min … last wake time + window max, rounded to 5 min.

## Appendix D: Mixed (Campuran) language glossary
Rule: English UI, but these terms stay in Bahasa Indonesia.

| Concept | Bahasa | English | **Mixed** |
|---|---|---|---|
| Breast milk | ASI | Breast milk | **ASI** |
| Expressed breast milk | ASIP | Expressed milk | **ASIP** |
| Direct breastfeeding | DBF / Nenen | Breastfeeding | **DBF (Nenen)** |
| Solid food | MPASI | Solids | **MPASI** |
| Pumping | Pumping ASI | Pumping | **Pumping ASI** |
| Poop | Pup | Poop | **Pup** |
| Smear | Cepirit | Smear | **Cepirit** |
| Mom | Bunda | Mom | **Bunda** |
| Dad | Ayah | Dad | **Ayah** |
| Caregiver | Pengasuh | Caregiver | **Caregiver** |
| Health post | Posyandu | Health post | **Posyandu** |
| MPASI textures | Puree halus, Saring/lumat, ... | Smooth puree, Mashed, ... | **Bahasa** |
| Meal types | Sarapan, Makan siang, Makan malam, Selingan | Breakfast, Lunch, Dinner, Snack | **English** |
| Sleep | Tidur | Sleep | **Sleep** |
| Nap / Night | Tidur siang / Tidur malam | Nap / Night | **Nap / Night** |
| Diaper | Popok | Diaper | **Diaper** |
| Wet | Pipis | Wet | **Pipis** |
| Medicine | Obat | Medicine | **Medicine** |
| Growth | Pertumbuhan | Growth | **Growth** |
| Vaccine | Vaksin | Vaccine | **Vaccine** |
| Today / Timeline | Hari ini / Linimasa | Today / Timeline | **Today / Timeline** |

## Appendix E: AI prompts and output schema (Phase 2)

### E.1 System instruction (all kinds)
```
You are FamilyCradle's friendly baby-journal assistant for parents and caregivers in Indonesia.
You receive ONLY structured, pre-computed data about one baby. Rules:
1. Use only numbers present in the input. Never invent, estimate or recalculate numbers.
2. Do not diagnose any condition. Do not name diseases as the cause of a pattern.
3. Never recommend medicines, supplements, doses or formula brands.
4. If the input contains redFlags with severity "consult", gently recommend discussing it with a pediatrician/midwife. Do not raise any other red flags yourself.
5. Be warm, encouraging and non-judgmental. Never blame the parents or caregiver.
6. Keep it short and practical. Simple words. No markdown.
7. Respond in the requested language: "id" = Bahasa Indonesia (casual-polite, use "Bunda/Ayah"), "en" = English,
   "mixed" = English but keep these Indonesian terms: ASI, ASIP, DBF, MPASI, Pup, Pipis, Bunda, Ayah, Posyandu, and MPASI texture names.
8. Output must match the JSON schema exactly.
```

### E.2 Weekly summary (A)
```
Task: Write a weekly summary for the period in the input, comparing with previousPeriod when available.
Include: 1 headline, up to 4 highlights (what went well or changed), up to 2 gentle suggestions,
and askYourDoctor items ONLY for redFlags with severity "consult".
```
### E.3 Pattern insights (B)
```
Task: Describe up to 4 notable patterns in the last 14 days (e.g. feeding times clustering, longer night stretches,
sleep after MPASI, pumping output trend). Each pattern must reference the metric it is based on.
```
### E.4 Growth alert explanation (C)
```
Task: Explain in calm, simple language what the growth flag(s) in redFlags mean, using the z-score/percentile values given.
Always include one askYourDoctor item. Do not speculate about causes.
```
### E.5 Suggestions (E1 sleep / E2 MPASI)
```
E1: Suggest up to 3 practical routine tips based on the wake window reference, recent nap pattern and age. No sleep training method names.
E2: Suggest up to 5 MPASI menu ideas suitable for the texture stage and age, using common Indonesian home foods.
    Never include foods in avoidFoods. Mark ideas that contain a common allergen not yet tried with "introduce alone, watch 3 days".
    For age < 12 months: no honey, no added salt or sugar.
```

### E.6 Output schema (shared Zod → converted to Gemini `responseSchema`)
```ts
const InsightOutput = z.object({
  headline: z.string().max(120),
  highlights: z.array(z.object({ title: z.string().max(60), detail: z.string().max(240), metricRef: z.string().max(60).optional() })).max(4),
  suggestions: z.array(z.object({ title: z.string().max(60), detail: z.string().max(240) })).max(5),
  askYourDoctor: z.array(z.string().max(200)).max(3),
});
```
The disclaimer is added by the UI, not by the model.

### E.7 Safety post-filter (reject output and use fallback if any rule fails)
- Contains a medicine name or dose pattern (`\d+(,\d+)?\s?(mg|ml)` next to a medicine keyword list, or keywords like "paracetamol", "ibuprofen", "antibiotik", "dosis").
- Contains diagnosis words list (ID/EN), e.g. "menderita", "terkena", "diagnosis", "stunting" used as a statement about this child (the classification label is shown by the UI, not the AI).
- Contains numbers not present in the input JSON (tolerance: whole-number rounding of input values).
- Mentions honey for age < 12 months in E2.
- Includes any food from `avoidFoods`.
- Language mismatch.

## Appendix F: Red flag rules (deterministic) **[VERIFY]**
| Code | Rule | Severity |
|---|---|---|
| WEIGHT_LOSS_NEWBORN | Weight in first 7 days < 90% of birth weight | consult |
| BIRTH_WEIGHT_NOT_REGAINED | Age ≥ 14 days and latest weight < birth weight | consult |
| WFA_LOW | WFA z < −2 | consult |
| WFL_LOW | WFL z < −2 | consult |
| WFL_HIGH | WFL z > +2 | watch |
| LFA_LOW | LFA z < −2 | consult |
| HC_OUT_OF_RANGE | HCFA z < −2 or > +2 | consult |
| WFA_CROSSING_DOWN | WFA percentile crosses down ≥ 2 major lines (P97, P85, P50, P15, P3) within ≤ 3 months | consult |
| NO_WEIGHT_GAIN | Age < 6 months and no weight increase across measurements spanning ≥ 4 weeks | consult |
| LOW_WET_DIAPERS | Age > 5 days and < 6 wet/mixed diapers in a completed family day (only if ≥ 8 diaper entries were logged on at least 2 of the previous 3 days, to avoid false alarms from incomplete logging) | watch |
| STOOL_COLOR | Diaper color `merah` or `pucat_putih`, or `hitam` after day 4 | consult |
| LOW_MILK_INTAKE | `formula` mode, age < 6 months, intake < 60% of target on 2 consecutive completed days (only if ≥ 4 bottle entries/day were logged) | watch |
| VACCINE_LATE | Any core vaccine `late` > 30 days | info |
| MILESTONE_ATTENTION | BR-MS-04 condition | info |
| MPASI_REACTION | Reaction logged with kind `bengkak` (swelling) | consult (plus static text: seek immediate care if breathing difficulty) |

## Appendix G: Seed data sources (to be downloaded and verified, never invented)
| Seed file | Source |
|---|---|
| `vaccine_idai_2024.json` | IDAI official 2024 immunization schedule (idai.or.id) |
| `who_lms/*.json` | WHO Child Growth Standards, expanded tables by day: weight-for-age, length-for-age, head circumference-for-age, weight-for-length (boys/girls) |
| `milestones_cdc.json` | CDC "Learn the Signs. Act Early." milestone checklists (2022 revision), 2–24 months, translated to Bahasa Indonesia |
| `milk_target_reference.json` | Appendix B (pending medical review) |
| `wake_windows.json` | Appendix C (pending medical review) |
| `allergens.json` | BR-MP-04 list with ID/EN synonyms |

*End of document.*
