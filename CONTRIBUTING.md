# Contributing to Ápice

Ápice is a MOOC platform built on ATProto (Bluesky) infrastructure — courses,
lessons, quizzes, certificates and streaming video, with a political-civic
community organisation as its first deployment. Thanks for considering a
contribution.

## Prerequisites

- **Node.js ≥ 22.13**
- **pnpm ≥ 11.7** (`corepack enable && corepack prepare pnpm@11.7.0 --activate`)
- **Docker** (Postgres + Redis + SeaweedFS + Streamplace run in compose)

## Getting started

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Boot the dev infrastructure (Postgres :5434, Redis :6379) and migrate
make run-dev-env            # or: pnpm dev:env

# 3. Copy env files and adjust if needed
cp apps/api/.env.example apps/api/.env

# 4. Run the API (http://localhost:8000)
pnpm dev:api

# 5. Run the admin panel / mobile web
pnpm dev:admin
pnpm web

# 6. Run native mobile (requires macOS for iOS)
pnpm ios             # iOS simulator — runs pod install automatically
pnpm android         # Android emulator
```

### iOS native builds

After `pnpm install`, CocoaPods must be run once before the first native build:

```bash
cd apps/mobile/ios && pod install && cd ../..
```

Re-run this any time you add or update a native dependency. See
`apps/mobile/README.md` for details on the Expo patches that make the
iOS build work.

`make doctor` checks the running stack (API probes, Postgres, Redis,
SeaweedFS, Streamplace) and prints pass/fail per service.

## Repository layout

| Path | What it is |
|---|---|
| `apps/api/` | Express + TypeScript API. Prisma/Postgres, Redis, Socket.IO, ATProto OAuth |
| `apps/admin/` | Next.js admin panel (MUI) |
| `apps/mobile/` | Expo (React Native) learner app |
| `packages/lexicons/` | ATProto lexicons (`app.civic.*`) |
| `infra/` | Caddy, Streamplace image, dev/ops/video shell scripts |
| `docs/` | `architecture/`, `runbooks/`, `research/`, `brand/` |

Where new code goes:

- **API:** a feature lives in one folder, `apps/api/src/modules/<feature>/`,
  as `<feature>.routes.ts` (HTTP surface), `<feature>.controller.ts`
  (request handling) and `<feature>.service.ts` (logic with no Express
  types). Register the router in `src/modules/index.ts`. Cross-cutting
  infrastructure goes in `src/platform/`, middleware in `src/http/`.
- **Admin:** routes in `src/app/`; screens and their RTK Query slice in
  `src/features/<area>/`; shared UI in `src/components/`. Direct API calls use
  `src/lib/apiFetch.ts` (it sends the HttpOnly session cookie).
- **Mobile:** screens in `src/screens/`, design system in `src/ui/`.
- **`packages/`** is only for code that two or more apps import.

## Before you open a PR

CI (`.github/workflows/ci.yml`) runs on every push and PR:

1. `pnpm typecheck` — api, admin and mobile must typecheck cleanly.
2. `pnpm test` — API and mobile Vitest suites and lexicon validation must pass.
3. The API and admin must build.

Run these locally first; a PR that fails any gate won't be reviewed.

Expectations for changes:

- **Server routes**: every write endpoint validates input with a Zod schema
  (see `apps/api/src/modules/courses/courses.controller.ts` for the pattern) or derives its write data
  server-side. Never pass `req.body` to Prisma unparsed.
- **New env vars**: add them to `apps/api/.env.example` /
  `apps/api/.env.production.example` and to the `KnownEnvVar` union in
  `apps/api/src/platform/env.ts` if they must be validated at boot.
- **Database changes**: create a Prisma migration
  (`pnpm --filter @apice/api exec prisma migrate dev --name <change>`); never edit
  an applied migration.
- **Comments**: explain *why*, especially for anything touching payments,
  access control, or learner privacy. This platform stores government ID
  images (INE verification) and payment records — treat data handling as a
  security surface.

## Reporting bugs and security issues

Bugs: open a GitHub issue with steps to reproduce (stack, endpoint or screen,
expected vs actual).

Security: **do not open a public issue** — see [SECURITY.md](SECURITY.md).

## Licence

Ápice is licensed under the [GNU General Public License v3.0](LICENSE).
