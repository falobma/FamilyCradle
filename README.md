# FamilyCradle

FamilyCradle is a mobile-first shared baby journal PWA for parents and caregivers. The product requirements and current implementation decisions are in [docs/BRD.md](docs/BRD.md) and [docs/DECISIONS.md](docs/DECISIONS.md).

## Requirements

- Node.js 24 LTS
- npm 11
- A Turso development database and token for the API
- A Resend API key and verified sender address for account emails

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

The API provides Better Auth email/password endpoints at `/api/auth/*`, using email verification, password reset, database-backed rate limiting, and Resend. Other `/api` requests require a valid session and return structured errors.

The Phase 1.2 onboarding flow is available from **Open journal** in the web app. Users can create an account, verify their email, create or select a family, add a child profile, and create single-use caregiver or parent invites. Family and child management APIs enforce membership, parent permissions, optimistic child-profile versions, and soft deletion. Invite codes are shown once and expire after 72 hours.

The Phase 1.3 logging core is available within the selected family: seven entry types, a day-filtered timeline with a daily summary, family-polling updates, server-timed sleep/DBF/pumping sessions with pause/resume and DBF side switching, multi-child logging with deterministic sibling IDs, MPASI food catalog with allergen and reaction tracking, medicine history, audit history endpoints, and soft-delete recovery. Apply the committed migrations with `npm run db:migrate` before using the log endpoints. Offline replay and sync conflict handling remain in Phase 1.5.
