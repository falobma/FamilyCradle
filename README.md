# FamilyCradle

FamilyCradle is a mobile-first shared baby journal PWA for parents and caregivers. The product requirements and current implementation decisions are in [docs/BRD.md](docs/BRD.md) and [docs/DECISIONS.md](docs/DECISIONS.md).

## Requirements

- Node.js 24 LTS
- npm 11
- A Turso development database and token for the API

## Local setup

1. Copy `.env.example` to `.env` and fill in the development service credentials. Do not commit `.env`.
2. Install dependencies with `npm ci`.
3. Start the frontend and API with `npm run dev`.

The frontend is served by Vite at `http://localhost:5173`; `/api`, `/healthz`, and `/readyz` are proxied to Express on port 8080. The backend requires the configured Turso database, Better Auth secret, and email settings; it reports invalid or missing configuration on startup rather than using fake credentials.

## Commands

| Command                | Purpose                          |
| ---------------------- | -------------------------------- |
| `npm run dev`          | Start the web and API workspaces |
| `npm run build`        | Build all workspaces             |
| `npm run typecheck`    | Type-check all workspaces        |
| `npm run lint`         | Run ESLint                       |
| `npm test`             | Run workspace tests              |
| `npm run format:check` | Check formatting                 |

Phase 1 is being implemented in milestones. The current web screen is the branded foundation; account, family, logging, and sync flows are not yet connected.
