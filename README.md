# Ápice

**A free, open learning platform for civic education — built on ATProto (Bluesky) infrastructure.**

Ápice is a MOOC platform designed for community organisations: courses, lessons, quizzes, progress tracking, certificates, and streaming video. What makes it different from every other LMS is where the records live — **learner progress is published to the learners' own ATProto repositories**, not held in our database. A political community shouldn't have to be trusted with a record of who studied what; the architecture makes that trust unnecessary.

Born from a Mexican civic-education project, the first deployment serves organizers and militantes learning their rights, labour law, and how to participate. The platform itself knows nothing about any particular cause — it's a general MOOC with an ATProto soul.

---

## Why ATProto?

- **Self-attested credentials.** When a learner completes a lesson, an `app.civic.progress` record lands in *their* repo (their DID, signed by their key). Their credentials outlive this platform.
- **Federated identity.** Login flows through [iM8](https://github.com/) / Bluesky OAuth — no passwords required for the federated path, one identity across services.
- **Network courses.** A Jetstream indexer watches the ATProto firehose for `app.civic.course` records, so courses published by any compatible service appear in the catalogue.
- **Your data is a pointer, not a silo.** The server stores enrollment and progress state for *serving* the course, but the durable proof-of-learning record belongs to the learner.

## Features

- 📚 **Courses** — sections, ordered lessons, checkpoint ("boss") quizzes gating progression
- 🎬 **Streaming video** — self-hosted [Streamplace](https://stream.place) node with HLS playback; videos are normalised server-side for low-bandwidth audiences (see `docs/VIDEO_ENCODING.md`)
- 📝 **Quizzes** — checkpoint quizzes with pass-gating; lesson completion requires passing the checkpoint
- 📜 **Certificates** — SVG certificates, claimable on completion, downloadable and shareable
- 🔐 **INE verification** — optional Mexican voter-ID review flow for identity-gated programmes
- 🔔 **Notifications** — Socket.IO realtime delivery
- 📊 **Analytics** — enrollment, progress and revenue charts for organizers
- 🛰️ **ATProto integration** — OAuth login, course/lesson publishing, per-lesson progress credentials, firehose indexing
- 📈 **Observability** — Prometheus metrics (`/metrics`), health/readiness probes, pino structured logging, Sentry crash reporting

## Repository layout

| Path | What it is |
|---|---|
| `server/` | Express 4 + TypeScript API — Prisma/PostgreSQL, Redis, Socket.IO, Stripe (dormant), ATProto OAuth, Jetstream indexer worker |
| `admin/` | Next.js admin panel (MUI) — course authoring, INE review, analytics |
| `packages/mobile-app/` | Expo (React Native) learner app — iOS, Android, and web |
| `packages/mobile/` | Shared mobile library — theme, components, React Query hooks |
| `packages/lexicons/` | ATProto lexicons (`app.civic.*`) |
| `docs/` | Runbooks: deployment, video pipeline, encoding, branding, demo |
| `scripts/` | Ops: `doctor.sh`, dev-env boot, backups, SeaweedFS setup |

## Quickstart

**Prerequisites:** Node.js ≥ 22.13, pnpm ≥ 11.7, Docker.

```bash
# 1. Install
pnpm install

# 2. Boot infrastructure (Postgres :5434, Redis :6379) + run migrations
make run-dev-env

# 3. Configure the API
cp server/.env.example server/.env

# 4. Start the API (http://localhost:8000)
pnpm dev:server

# 5. In other terminals:
pnpm dev:admin   # admin panel  → http://localhost:3000
pnpm web         # mobile app   → http://localhost:8081

# 6. Seed demo content (5 civic courses)
cd server && pnpm exec ts-node-dev --transpile-only scripts/seed-courses.ts
```

`make doctor` checks the running stack and prints pass/fail per service — API probes, Postgres, Redis, SeaweedFS, Streamplace.

### Production

`docker-compose.prod.yml` runs the full stack: API, admin, Postgres 16, Redis 7, a SeaweedFS object-storage cluster, a self-hosted Streamplace node, Caddy (direct-origin profile) or a Cloudflare Tunnel profile, and nightly backups. See `docs/DEPLOYMENT_RUNBOOK.md`.

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
pnpm -r typecheck   # all five packages
pnpm -r test        # server (Vitest) + mobile shared package (Vitest)
```

CI (`.github/workflows/ci.yml`) gates every PR on typecheck → tests → server & admin builds.

## The video pipeline

Instructors upload to the self-hosted Streamplace node; Ápice resolves `at://` video references through `place.stream.playback.getVideoPlaylist` and enforces per-lesson access (authenticated + verified Bluesky DID + enrollment). Before a video reference can be attached to a lesson, the server verifies Streamplace can actually serve it — unpublished videos fail at attach time, not in front of a learner. Sources are normalised server-side (`scripts/prepare-lesson-video.sh`) because the audience is frequently on prepaid mobile data — the bitrate ladder is documented with VMAF measurements in `docs/VIDEO_ENCODING.md`.

## Documentation

- `docs/DEPLOYMENT_RUNBOOK.md` — production deployment, tunnel, backups
- `docs/VIDEO_PIPELINE_RUNBOOK.md` — publish a lesson video end-to-end
- `docs/VIDEO_ENCODING.md` — the bitrate ladder and why
- `docs/MOOC_ON_ATPROTO.md` — the architectural thesis
- `docs/APICE_BRANDING.md` — visual identity
- `STRATEGIC_ANALYSIS.md` — the honest internal engineering audit (kept public deliberately: its CRITICAL security findings are all resolved and documented inline)

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
