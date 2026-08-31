# VOD Hosting on ATProto — Research Note

## TL;DR

ATProto is good for **identity, social graph, discovery, and signed references**. It is not good for storing large video bytes. The practical path for a Civic video academy is:

1. Host transcoded video bytes on a normal object store (S3/R2/Cloudflare Stream/Mux) or IPFS.
2. Use ATProto records for course metadata, lesson pointers, completion attestations, and social signals.
3. Use ATProto identity (DID/handle) for learner profiles and signed progress claims.

---

## What Eli Mallon / Streamplace does

- **Eli Mallon**: @iame.li on Bluesky, video engineer, previously Livepeer. Runs **Streamplace** (`stream.place`), a live/VOD platform built on ATProto.
- **Streamplace** open source: `github.com/streamplace/streamplace`.
- Funding: Livepeer Treasury.
- Tagline: "Solving Video for Everybody Forever."

### Streamplace architecture

- Identity/auth via Bluesky / ATProto.
- Livestream segments and VOD metadata are stored as ATProto records.
- Actual media bytes are referenced by **content-addressed blobs** (BLAKE-3 / BDASL CID) and served by a media node/CDN, not from the PDS repo directly.
- Lexicons: `place.stream.video`, `place.stream.media.defs`, `place.stream.segment`, `place.stream.vod.*`.
- Signing keys sign ephemeral content keys (C2PA-style provenance).

---

## What this means for Ápice

### Do NOT do

- Put multi-GB course videos as blobs inside a Bluesky PDS.
- Rely on raw ATProto sync for streaming delivery.
- Treat ATProto as a private paywalled content store (records are public by default).

### DO do

| Concern | ATProto | Object Store / CDN |
|---|---|---|
| User identity & auth | DID / handle / OAuth | — |
| Course metadata (title, description, tags, sections) | `app.civic.course` record | — |
| Lesson index / pointers | `app.civic.lesson` record with `videoManifest` strongRef | — |
| Thumbnails / small assets | Blob on PDS or CDN | CDN |
| Video bytes | Reference (CID / URL) | S3/R2/Cloudflare Stream/Mux |
| Completion attestation | `app.civic.progress` record signed by learner | — |
| Social proof / comments | `app.civic.review` record | — |
| Gating / paid access | — | Server-signed short-lived playback URLs |

---

## Implemented lexicons

Implemented in `Ápice/lexicons/` and exported as a TypeScript package from `Ápice/packages/lexicons/`.

> **See [`MOOC_ON_ATPROTO.md`](./MOOC_ON_ATPROTO.md) for the current standard document** — record invariants, publishing/credential flows, and versioning. This research note is historical context.

| Lexicon | Record | Purpose |
|---|---|---|
| `app.civic.course` | `main` | Public course metadata: title, description, thumbnail, tags, sections, refs to lessons. |
| `app.civic.lesson` | `main` | A single lesson with title, duration, thumbnail, order, and refs to course + video. |
| `app.civic.video` | `main` | Video asset manifest: sources, captions, duration, content key/CID. |
| `app.civic.courseSpace` | `main` | Permissioned space controlling access to a course before or instead of public sync. |
| `app.civic.progress` | `main` | Learner-signed completion attestation for a course or lesson. |

Source files:
- `Ápice/lexicons/app.civic.course.json`
- `Ápice/lexicons/app.civic.lesson.json`
- `Ápice/lexicons/app.civic.video.json`
- `Ápice/lexicons/app.civic.courseSpace.json`
- `Ápice/lexicons/app.civic.progress.json`

Generated TypeScript:
- `Ápice/packages/lexicons/src/lexicons.ts`
- `Ápice/packages/lexicons/src/index.ts`

Validation:
- `cd Ápice/packages/lexicons && npx tsc --noEmit` passes.

## Lexicon sketch (archived)

---

## Recommended first implementation

1. Keep videos on **Cloudflare Stream** or **Mux** (transcoding, signed URLs, HLS/DASH, global CDN).
2. In our PostgreSQL DB, store `lesson.videoUrl` as the signed playback URL or manifest URL.
3. Publish an ATProto record per course with `app.civic.course` that includes `videoRef` strong refs to `app.civic.video` records.
4. The `app.civic.video` record stores the HLS manifest URL and `durationSeconds`.
5. Progress/completion is stored both locally (for fast queries) and as an ATProto record for portability and reputation.
6. If we want decentralization, eventually replicate the media bytes to IPFS/Filecoin and add an IPFS URI source in the video record.

---

## Streamplace VOD playback validation (2026-07-10)

We probed Streamplace's VOD playback chain end-to-end.

### What works

- **Production endpoint:** `https://stream.place/xrpc/place.stream.playback.getVideoPlaylist?uri=<at-uri>` returns a valid HLS master playlist for public `place.stream.video` records.
- **Supported record shapes:** Both `place.stream.media.defs#sourceTracks` (full uploads) and `#sourceClip` (clips) are playable.
- **Full delivery chain:** master playlist → media playlist → byte-ranged `getVideoBlob` segment requests all return correct responses (HTTP 200 / 206).
- **CORS:** `access-control-allow-origin: *` is present, so a web/mobile player can stream directly.
- **Latency:** master playlist ~400–800 ms (cold), media playlist ~500–1300 ms, first segment bytes ~1 s.

### What does not work

- **`vod-beta.stream.place` is outdated.** Every sampled record returned `400 InvalidRecord: Unsupported source type on record` against that host. Switch to `stream.place`.

### Upload / publishing path

- Publishing requires an authenticated OAuth session to Streamplace (`place.stream.media.createUpload` returns `401 oauth session required` when unauthenticated).
- VOD uploads are additionally gated by `allowVODUpload`, which checks a configured beta-invite issuer or an allowlist (see `pkg/spxrpc/place_stream_media.go`).
- The expected flow is:
  1. `place.stream.media.createUpload` → receive TUS upload URL + token.
  2. Upload via TUS.
  3. Poll `place.stream.media.getUploadStatus` until `status: "done"`.
  4. `place.stream.media.publishVideo` with a `place.stream.video` record; the server fills `source` tracks and `durationMs`.

### Implications for Ápice

- **Playback is easy:** any `place.stream.video` record with hosted origins plays through `stream.place`.
- **Publishing is hard for a generic LMS:** either Ápice needs a Streamplace account with upload privileges, or it must self-host a Streamplace node (operator complexity + storage/bandwidth costs).
- **No DRM / gating:** records and playlists are public. Paid access cannot be enforced by Streamplace; it must be enforced by our server before we hand out the playlist URL, and even then the underlying `getVideoBlob` URLs are public once known.

## Open questions / risks

- Where do learners’ PDSes live? If we want them to own progress records, we need to write to their PDS or use our own delegated PDS.
- Gating: ATProto records are public, so premium content must be enforced by the server signing playback URLs.
- Rate/bandwidth cost: video delivery will always be the dominant cost; optimize that before optimizing ATProto storage.
- Lexicon registration: `app.civic.*` is not reserved; we can register it informally by using it, but we should document it.
- Streamplace publishing is currently invite-gated. For Ápice's paid course videos we still need a provider with access control (VdoCipher, Mux, Cloudflare Stream) unless we self-host Streamplace and add our own gate.

---

## Identity-gated free video access (2026-07-10)

Ápice needs to know **who** watches each video to prevent bots from burning bandwidth, while keeping videos free for authenticated users.

### Design decisions

1. **Videos are free** — no enrollment or payment check at playback time.
2. **Identity is required** — the caller must be authenticated and must have a linked Bluesky DID (`User.blueskyDid`). This DID comes from the existing iM8 / Bluesky OAuth flow, so it is a real, verifiable identity rather than a throwaway email/password account.
3. **Every playback is logged** — a new `VideoView` row records `userId`, `lessonId`, `courseId`, `provider`, `playbackUrl`, `ip`, `userAgent`, and `createdAt`.
4. **Cooldown** — duplicate `VideoView` rows are suppressed for the same user+lesson within a 60-second window, so normal player retries don't spam the table while bots that hammer the endpoint still stand out.
5. **Streamplace as the default provider** — the backend resolves `at://` references through `stream.place` and returns the HLS playlist URL. The mobile player uses `expo-video` to play it natively.

### Backend changes

- `server/prisma/schema.prisma` — added `VideoView` model.
- `server/controllers/video.controller.ts` — `getLessonPlayback` now:
  - Requires `req.user.blueskyDid`.
  - Skips enrollment checks.
  - Logs the view to `VideoView`.
  - Returns the resolved playback URL plus the verified identity.
- `server/@types/custom.d.ts` — `User` type extended with `blueskyDid` / `blueskyHandle`.
- `server/services/videoDelivery.service.ts` — default Streamplace endpoint switched from outdated `vod-beta` to `stream.place`.

### Mobile changes

- `packages/mobile/src/components/VideoPlayer.tsx` — `expo-video` wrapper with HLS detection.
- `packages/mobile-app/src/screens/LessonPlayerScreen.tsx` — renders the player, shows an explicit error when Bluesky identity is missing, and surfaces the verified identity pill.

### Pending

- Apply the Prisma migration (`npx prisma migrate dev --name add_video_views`) once the PostgreSQL container is running.
- Prebuild / pod-install the mobile app so the `expo-video` native module is linked.

## Watch item: MoQ transport — `atmoq` (2026-08-31)

Streamplace is building its next delivery transport: [`atmoq`](https://crates.io/crates/atmoq),
an ATProto relay that speaks **MoQ (Media over QUIC)** to subscribers — ATProto
records (video included) streamed over QUIC instead of classic HTTP/HLS.

Why it matters to us specifically: QUIC's loss resilience is the difference
between a lesson that stutters and one that stalls on Mexican prepaid data —
the exact failure mode HLS (TCP-ordered) can't fix. If Streamplace ever
exposes MoQ-backed playback for VOD, it becomes the single biggest quality
lever available for our audience.

**Do not act on it yet.** Maturity is pre-0.1: two published versions, and it
depends on a temporary fork of `moq-net` carrying replay-window patches
pending upstreaming. Nothing in our chain speaks MoQ — `@bsky.app/video`
(HLS) on native, the browser player on web, Caddy/cloudflared in front.
Revisit when (a) Streamplace nodes expose MoQ playback as an option, and
(b) a player we already ship gains MoQ support. Until then: HLS forever,
and keep the bitrate ladder (VIDEO_ENCODING.md) as the real lever.

## Sources

 Eli Mallon: https://bsky.app/profile/iame.li
 Eli's Leaflet blog ("The Book of Eli"): https://iameli.leaflet.pub/
 Featured Leaflet post: https://iameli.leaflet.pub/3mprgzkytjs2c — "What is an atproto repository? One repo, multiple sync methods"
 Streamplace: https://stream.place
 Streamplace channel: https://stream.place/iame.li
 Streamplace GitHub: https://github.com/streamplace/streamplace
 Lexicons (raw): https://github.com/streamplace/streamplace/tree/next/lexicons/place/stream
 atmoq (MoQ relay): https://crates.io/crates/atmoq

---

- Written 2026-07-05 for Ápice VOD architecture.
