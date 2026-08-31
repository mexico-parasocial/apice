# Pilot checklist — first real cohort

Everything before this was built and verified by developers. This is the
handoff to reality: five to ten real learners, real courses, the real
streaming node. Watch what they do, not what they say — every complaint
becomes October's backlog.

## Before the session (one-time)

- [ ] **One real video published to the node** (the last "mock" standing):
      ```bash
      export ATPROTO_HANDLE="…" ATPROTO_APP_PASSWORD="…"
      cd server && pnpm exec ts-node-dev --transpile-only --no-notify --exit-child \
        scripts/publish-lesson-video.ts ../lesson.mp4 --title "…" --lesson <first-lesson-id>
      ```
      Instructor DID must be in `STREAMPLACE_ALLOWED_STREAMS`.
      Until this box is ticked, lessons play the local fixture (dev) or nothing (prod).
- [ ] **Deployment is prod-profile**: `make prod-doctor` passes all checks.
- [ ] **Monitoring is watching**: uptime-kuma running (`--profile monitoring`),
      one monitor on `https://api…/ready` and one on `/metrics`; alerts land
      somewhere a human reads (`ALERT_WEBHOOK`).
- [ ] **Backups + restore proven**: `scripts/restore-drill-check.sh` has run
      green at least once (see `docs/BACKUP_RESTORE_DRILL.md`).
- [ ] **Seed reality check**: courses on the device are the ones the org
      actually wants taught first (`seed-courses.ts` content reviewed and
      edited by the org, not the demo placeholders if those differ).

## Cohort setup

- [ ] 5–10 learners identified by name; each has (or creates) a Bluesky
      account — the federated identity is the point, lean on it.
- [ ] Every learner links identity via iM8 **before** the session (video
      playback requires `User.blueskyDid`; the 403 is the #1 avoidable
      support load).
- [ ] Learners enrolled in **one** course to start. Depth over breadth.
- [ ] Phones: note the device model + OS version per learner (for the
      October performance pass).

## During the session (facilitator notes)

- [ ] Say the vocabulary out loud (see DEMO_RUNSHEET §0) — observe where the
      words don't land.
- [ ] Let learners drive their own phone. Watch hands: where do they tap
      first? Where do they hesitate?
- [ ] Note every moment of confusion verbatim, with the screen it happened
      on. No fixing during the session.
- [ ] If connectivity drops, note what the app showed (offline banner?
      raw error?) — this validates the October offline work.

## After (within 48h)

- [ ] Metrics: `curl :8000/metrics | grep apice_video` — playback counts by
      provider/outcome; `VideoView` rows in admin; quiz pass rates; any
      certificate claimed.
- [ ] One-page retro: top 3 confusions, top 1 delight, top 1 breakage.
- [ ] File each finding as an issue tagged `pilot-feedback`. October's
      priorities come from these, not from any roadmap.
- [ ] If nobody finished lesson 1: stop and understand why before building
      anything else.
