# FamilyCradle

FamilyCradle is a mobile-first shared baby journal PWA for parents and caregivers. The product requirements and current implementation decisions are in [docs/BRD.md](docs/BRD.md) and [docs/DECISIONS.md](docs/DECISIONS.md).

## Requirements

- Node.js 24 LTS
- npm 11
- A Turso development database and token for the API
- A Gmail SMTP account with a Google App Password for account emails

## Local setup

1. Copy `.env.example` to `.env` and fill in the development service credentials. Do not commit `.env`.
2. Install dependencies with `npm ci`.
3. Apply the committed database migrations with `npm run db:migrate`.
4. Start the frontend and API with `npm run dev`.

The frontend is served by Vite at `http://localhost:5173`; `/api`, `/healthz`, and `/readyz` are proxied to Express on port 8080. The backend requires the configured Turso database, Better Auth secret, and email settings; it reports invalid or missing configuration on startup rather than using fake credentials.

Production must set `TRUSTED_PROXIES` to the actual ingress proxy IPs/CIDRs so Better Auth can derive client IPs safely for rate limiting.

## Commands

| Command                | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `npm run dev`          | Start the web and API workspaces            |
| `npm run build`        | Build all workspaces                        |
| `npm run typecheck`    | Type-check all workspaces                   |
| `npm run lint`         | Run ESLint                                  |
| `npm test`             | Run workspace tests                         |
| `npm run format:check` | Check formatting                            |
| `npm run auth:schema`  | Generate Better Auth's Drizzle schema       |
| `npm run db:generate`  | Generate a Drizzle migration                |
| `npm run db:migrate`   | Apply migrations to the configured Turso DB |

The API provides Better Auth email/password endpoints at `/api/auth/*`, using email verification, password reset, database-backed rate limiting, and Gmail SMTP. Sign-in users can request a password reset; the emailed link opens a form to set a new password. Other `/api` requests require a valid session and return structured errors.

After creating an account or attempting to sign in with an unverified email, users can request another verification email. Verification and password-reset requests are limited to three per email per hour. Email delivery requires `SMTP_USER` and `SMTP_APP_PASSWORD`; use a Google App Password, not your Google account password. Set these as secrets in Cloud Run yourself.

The Phase 1.2 onboarding flow is available from **Open journal** in the web app. Users can create an account, verify their email, create or select a family, add a child profile, and create single-use caregiver or parent invites. Family and child management APIs enforce membership, parent permissions, optimistic child-profile versions, and soft deletion. Invite codes are shown once and expire after 72 hours.

The Phase 1.3 logging core is available within the selected family: seven entry types, a day-filtered timeline with a daily summary, server-timed sleep/DBF/pumping sessions with pause/resume and DBF side switching, multi-child logging with deterministic sibling IDs, MPASI food catalog with allergen and reaction tracking, medicine history, audit history endpoints, and soft-delete recovery. Family delta sync is available through `GET /api/families/:fid/sync?since=<rev>`; the journal polls while open and refreshes when family changes arrive. Logging requires an active connection: failed writes are reported and are not queued for later replay. The installable PWA may cache its static app shell, but family data and edits are online-only. Apply the committed migrations with `npm run db:migrate` before using the log endpoints.

For sleep, choose **Still sleeping** to start a server-timed session, or **Already awake** to record start and wake-up times. Additional sleep details are optional. A timer's start time can be corrected after it is stopped.

For DBF, record the minutes on each side after a feed, or choose **Feeding now** to start a server-timed session. Active sessions show each child's current side and offer switch, pause, resume, and finish controls.

The Phase 2 AI consent API is a server-side foundation only: parents can update family consent through `PUT /api/families/:fid/ai-consent` with `{ "enabled": true | false }`. Changes are audited and included in family sync. AI features and the consent UI are not yet implemented; no AI calls are made.

The Phase 2 growth LMS calculation core is not exposed to users. WHO reference data, its reuse terms, reference-case validation, charts, and clinical review are still required before growth analysis can be enabled.

The Wawasan / Insights tab lets family members record and view each child's growth measurements using the existing growth records API. It does not provide WHO growth analysis or AI insights yet.

Riwayat / History opens on Linimasa / Timeline and also has a Pengukuran / Measurements view, where family members can edit or delete a child's recorded measurements. Editing preserves any attached photo; deleting a measurement permanently deletes its photo.

Wawasan also shows weight and length trends, including birth measurements where available, and the change between the latest two recorded values. Family members can add dated weight and length ranges provided by a clinician; the chart compares the last recorded measurement on that exact date with the range. Targets are shared with the family, can be removed and replaced, and are not interpolated across dates. Charts use Recharts and do not compare measurements with growth standards or provide medical assessments.

Chart tooltips show chronological age in completed calendar months and remaining days at each date, without prematurity adjustment.

An optional photo can be captured or selected when recording a growth measurement. The browser resizes and converts it to JPEG before saving it in the database with the measurement. Photos are available to active family members and can be opened from the measurement list or chart tooltip. The original file must be at most 20 MB; the stored image is limited to 300 KiB. Apply the database migrations before using this feature.

The charts also display selected sex-specific p3, p50 and p97 points for ages 0–2 years from Tables 3 and 4 of Pulungan et al., [Indonesian National Synthetic Growth Charts](https://actascientific.com/ASPE/ASPE-01-0006.php) (2018), shared under Creative Commons Attribution. A dashed green line connects the published p50 points as a visual guide; values between the points are not provided by the source. Approximate dates use chronological age and 365.25 days per year. The source calls the linear measurement height; the measurement method has not been verified. These population references are not targets or diagnoses and have not been clinically reviewed for this app.
