# Ápice

**A free, open learning platform for civic education — built on ATProto (Bluesky) infrastructure.**

Ápice is a MOOC platform designed for community organisations: courses, lessons, quizzes, progress tracking, certificates, and streaming video. What makes it different from other LMSs is that **a learner can carry their record with them**: with their consent, each completed lesson and course is published as a signed record in *their own* ATProto repository, so it outlives this platform.

Born from a Mexican civic-education project, the first deployment serves organizers and militantes learning their rights, labour law, and how to participate. The platform itself knows nothing about any particular cause — it's a general MOOC with an ATProto soul.

---

## Why ATProto?

- **Self-attested credentials — opt-in.** If the learner turns it on (Profile → *Credenciales en Bluesky*), each completed lesson and course becomes an `app.civic.progress` record in *their* repo (their DID, signed by their key). ATProto repos are **public**: those records go out on the firehose and are copied by relays, so anyone can see which courses that person completed. That is why it is off by default and explained in plain language before it is enabled. Publishing goes through a durable outbox with retries (`apps/api/src/modules/credentials`).
- **Federated identity.** Login flows through [iM8](https://github.com/) / Bluesky OAuth — no passwords required for the federated path, one identity across services.
- **Network courses.** A Jetstream indexer watches the ATProto firehose for `app.civic.course` records, so courses published by any compatible service appear in the catalogue.
- **Your data is a pointer, not a silo.** The server stores enrollment and progress state for *serving* the course; the portable proof-of-learning record, when the learner wants one, belongs to the learner. Video views are logged per user and lesson for course analytics, without IP addresses.

## Features

- 📚 **Courses** — sections, ordered lessons, checkpoint ("boss") quizzes gating progression
- 🎬 **Streaming video** — self-hosted [Streamplace](https://stream.place) node with HLS playback; videos are normalised server-side for low-bandwidth audiences (see `docs/research/video-encoding.md`)
- 📝 **Quizzes** — checkpoint quizzes with pass-gating; lesson completion requires passing the checkpoint
- 📜 **Certificates** — SVG certificates, claimable on completion, downloadable and shareable
- 🔐 **INE verification** — optional Mexican voter-ID review flow for identity-gated programmes
- 🔔 **Notifications** — staff activity feed and learner inbox, pushed in realtime over Socket.IO
- 📊 **Analytics** — enrollment, progress and revenue charts for organizers
- 🛰️ **ATProto integration** — OAuth login, course/lesson publishing, per-lesson progress credentials, firehose indexing
- 📈 **Observability** — Prometheus metrics (`/metrics`), health/readiness probes, pino structured logging, Sentry crash reporting

## Repository layout

```
apps/                 everything you deploy or run
  api/                Express API (TypeScript, Prisma/PostgreSQL, Redis, Socket.IO)
    src/modules/      one folder per domain: <name>.routes / .controller / .service
    src/http/         middleware, error handling, health + metrics probes
    src/platform/     db, redis, logger, env, mail, cache, realtime, paths
    src/workers/      Jetstream (firehose) indexer
    prisma/           schema + migrations
    scripts/          seed/ (demo content), video/ (publish/attach lesson videos)
    templates/mail/   email templates
  admin/              Next.js panel — src/app (routes), src/features/<area>, src/components, src/lib
  mobile/             Expo learner app — src/screens, src/ui (design system), src/hooks, …
packages/
  lexicons/           app.civic.* ATProto lexicons (JSON schemas + validator)
infra/
  caddy/              reverse proxy config
  streamplace/        self-hosted Streamplace node image
  scripts/            dev/ (dev env, doctor) · ops/ (backups, restore drill, storage init) · video/ (encoding)
docs/
  architecture/  runbooks/  research/  brand/
docker-compose.yml        local Postgres + Redis (and optional API/indexer containers)
docker-compose.prod.yml   the full production stack
```

Rule of thumb: `apps/` is anything deployable, `packages/` is code used by two or more apps, `infra/` is how it runs. The compose files stay at the root on purpose — Docker Compose names the project (and its data volumes) after their directory.

## Quickstart

**Prerequisites:** Node.js ≥ 22.13, pnpm ≥ 11.7, Docker.

```bash
# 1. Install
pnpm install

# 2. Boot infrastructure (Postgres :5434, Redis :6379) + run migrations
make run-dev-env

# 3. Configure the API
cp apps/api/.env.example apps/api/.env

# 4. Start the API (http://localhost:8000)
pnpm dev:api

# 5. In other terminals:
pnpm dev:admin   # admin panel  → http://localhost:3000
pnpm web         # mobile app   → http://localhost:8081

# 6. Seed demo content (5 civic courses)
pnpm seed
```

`make doctor` checks the running stack and prints pass/fail per service — API probes, Postgres, Redis, SeaweedFS, Streamplace.

### Production

`docker-compose.prod.yml` runs the full stack: API, admin, Postgres 16, Redis 7, a SeaweedFS object-storage cluster, a self-hosted Streamplace node, Caddy (direct-origin profile) or a Cloudflare Tunnel profile, and nightly backups. See `docs/runbooks/deployment.md`.

```bash
cp .env.example .env   # fill real values
docker compose -f docker-compose.prod.yml up -d
```

## Observability

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness — process up, reports version |
| `GET /ready` | Readiness — Postgres + Redis checked individually, 503 when degraded |
| `GET /metrics` | Prometheus text format — HTTP latency/counters by route pattern, video playback by provider, Socket.IO connections, readiness gauge. Disable with `METRICS_ENABLED=false` |

Crash reporting is DSN-gated (`EXPO_PUBLIC_SENTRY_DSN` on mobile) — a build without the variable has Sentry fully inert. Logs are pino JSON in production.

## Testing & CI

```bash
pnpm typecheck   # api, admin, mobile
pnpm test        # api + mobile (Vitest), lexicon validation
```

CI (`.github/workflows/ci.yml`) gates every PR on typecheck → tests → API & admin builds.

## The video pipeline

Instructors upload to the self-hosted Streamplace node; Ápice resolves `at://` video references through `place.stream.playback.getVideoPlaylist` and enforces per-lesson access (authenticated + verified Bluesky DID + enrollment). Before a video reference can be attached to a lesson, the server verifies Streamplace can actually serve it — unpublished videos fail at attach time, not in front of a learner. Sources are normalised server-side (`infra/scripts/video/prepare-lesson-video.sh`) because the audience is frequently on prepaid mobile data — the bitrate ladder is documented with VMAF measurements in `docs/research/video-encoding.md`.

## Documentation

- `docs/architecture/mooc-on-atproto.md` — the architectural thesis and the `app.civic.*` standard
- `docs/runbooks/deployment.md` — production deployment, tunnel, backups (and upgrading to this layout)
- `docs/runbooks/video-pipeline.md` — publish a lesson video end-to-end
- `docs/runbooks/` — also: production and pilot checklists, backup/restore drill, demo runsheet
- `docs/research/video-encoding.md` — the bitrate ladder and why; `docs/research/atproto-vod.md` — video on ATProto
- `docs/brand/` — visual identity, community announcement

## Contributing & security

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and PR expectations, [SECURITY.md](SECURITY.md) for responsible disclosure (this platform handles government-ID images and payment records — please report privately), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Status

Pre-launch. Payments are intentionally dormant (free-first); the Stripe code paths exist but the product does not charge. The roadmap prioritises a real-world pilot, offline tolerance for low-connectivity learners, and open-source launch hygiene.

## Acknowledgements

- [Bluesky](https://blueskyweb.xyz) / [atproto](https://atproto.com) — the protocol and reference implementations this platform is built on
- [Streamplace](https://stream.place) — self-hostable live/VOD streaming
- The server scaffolding began from an open LMS starter by Shahriar Sajeeb and was substantially rewritten (MongoDB→PostgreSQL/Prisma, ATProto integration, security hardening)

## Licence

[GPL-3.0](LICENSE) — free software. If you build on Ápice, your derivative must offer its source under the same terms. For a civic-education platform, keeping forks open isn't a restriction; it's the point.
