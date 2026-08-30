# MOOCs on ATProto — the `app.civic.*` standard

**Status:** v1 (2026-07) · **Reference implementation:** [Ápice](https://github.com/apice)
**Lexicons:** [`/lexicons/*.json`](../lexicons) · TS package: `@apice/lexicons`

---

## 1. What this is

`app.civic.*` is an open set of ATProto lexicons for structured online
learning (MOOCs). It lets:

- **Instructors** publish courses they *own* — records live in their own
  repository, under their own DID, on whatever PDS they choose.
- **Learners** own their progress — completion attestations live in the
  learner's own repository, signed by their repo's key, portable to any app.
- **Apps** consume courses from the whole network via any relay/Jetstream —
  Ápice is the first, not the only, intended consumer.
- **Video** stay where video belongs: on CDN/object storage (e.g. a
  Streamplace node), referenced by AT URI — never as PDS blobs.

## 2. Design philosophy

**Bytes are public; the structured experience is the product.**

ATProto records are public by design. We do not fight that:

| Concern | Where it lives |
|---|---|
| Course structure & metadata | `app.civic.course` / `app.civic.lesson` records (public) |
| Video manifest (pointers, not bytes) | `app.civic.video` record (public) |
| Video bytes | CDN / Streamplace node / S3 — content-addressed, referenced by AT URI |
| Learner progress / completion | `app.civic.progress` **in the learner's own repo** |
| Monetization / gating | App-side (server decides what experience to sell); never in the records |
| Social proof | Native ATProto primitives (likes/reposts on the records) |

## 3. The records

### 3.1 `app.civic.course` (key: `tid`)

Published by the instructor. Required: `title`, `createdAt`, `ownerDid`.

```json
{
  "$type": "app.civic.course",
  "title": "Derechos y Deberes Ciudadanos",
  "description": "…",
  "createdAt": "2026-07-20T00:00:00Z",
  "ownerDid": "did:plc:instructor…",
  "tags": ["civismo", "derechos"],
  "sections": [
    {
      "title": "Fundamentos",
      "lessons": [
        { "uri": "at://did:plc:instructor…/app.civic.lesson/3jx…", "cid": "bafy…" }
      ]
    }
  ]
}
```

### 3.2 `app.civic.lesson` (key: `tid`)

Required: `title`, `durationSeconds`, `courseRef`, `createdAt`.
`videoRef` is optional (text-only lessons are valid).

### 3.3 `app.civic.video` (key: `tid`)

Required: `title`, `sources` (min 1), `createdAt`. A source `uri` may be any
URI — for Streamplace-hosted content it is the `place.stream.video` AT URI;
playback resolves via `place.stream.playback.getVideoPlaylist`.

### 3.4 `app.civic.progress` (key: `tid`)

Required: `learnerDid`, `courseRef`, `completedAt`. Optional: `lessonRef`,
`progressPercent`.

> **Invariant (the core of the standard):** `learnerDid` MUST equal the DID of
> the repository holding the record. Progress is **self-attested**: a learner's
> completion claims live in their own repo, signed by their own key. Apps
> verify by construction — no trusted third party needed.

Two granularities: lesson-level (`lessonRef` present) and course-level
(`lessonRef` omitted, `progressPercent: 100`).

### 3.5 `app.civic.courseSpace` (key: `tid`)

Reserved for permissioned/paid access control. Unused in v1 — everything in
the reference implementation is free this quarter. It exists so the revenue
model can be layered later without breaking v1 records.

## 4. Flows

### 4.1 Instructor: publish a course

1. Authenticate with ATProto OAuth (scope: repo write).
2. For each lesson with video: `createRecord app.civic.video` (source = the
   video's `place.stream.video` AT URI or direct HLS/MP4 URL).
3. `createRecord app.civic.lesson` per lesson (videoRef from step 2).
4. `createRecord app.civic.course` with section/lesson strongRefs.
5. `putRecord` each lesson with the final courseRef.

Reference: `admin/app/utils/civicPublish.ts` (browser, instructor DID) and
`server/services/atproto.service.ts` (service-account fallback).

### 4.2 Learner: earn a credential

1. Learner grants the app OAuth repo-write at login (one consent screen).
2. App computes completion locally (its own DB stays the UX source of truth).
3. On lesson/course completion, the app `putRecord`s `app.civic.progress`
   **into the learner's repo** with a deterministic rkey (idempotent).
4. Any other app can now read and trust that credential.

Reference: `server/services/credentials.service.ts`.

### 4.3 App: consume the network

Subscribe to Jetstream for the four collections, validate with
`@atproto/lexicon` + `@apice/lexicons`, index. Reference:
`server/workers/jetstreamIndexer.ts` (+ `GET /api/v1/network/courses`).

## 5. Invariants & rules for implementers

1. **Never** write progress records into anyone's repo but the learner's own.
2. Video bytes **never** go on a PDS. Records carry pointers.
3. `sources` in `app.civic.video` must have ≥ 1 entry; lessons without video
   simply omit `videoRef` (don't create empty video records).
4. strongRef CIDs change when a record is updated — re-read before chaining.
5. Treat every consumed record as untrusted: validate against the lexicons
   before indexing or rendering.

## 6. Versioning

- Lexicon changes are additive-only within `app.civic.*` v1 (new optional
  fields may appear; existing fields never change meaning or get removed).
- Breaking changes will ship under new NSIDs (e.g. `app.civic.v2.course`)
  with a migration note here.
- The npm package `@apice/lexicons` follows semver (1.1.0 = current).

## 7. OAuth scopes (v1 → v2)

v1 uses `atproto transition:generic` (full repo access) for pragmatic
compatibility with today's PDS implementations — the same scope Streamplace
uses. The v2 refinement is per-collection scopes
(`repo:app.civic.progress`, `repo:app.civic.course`, …) as PDS support
matures. Implementers should request the narrowest scope their PDS accepts.

## 8. Reference implementation map

| Piece | Where |
|---|---|
| Lexicon schemas | `/lexicons/*.json`, `@apice/lexicons` |
| Instructor publishing (own DID) | `admin/app/utils/civicPublish.ts` |
| Learner credential writer | `server/services/credentials.service.ts` |
| ATProto OAuth (learners) | `server/services/atprotoOAuth.service.ts` |
| Network indexer | `server/workers/jetstreamIndexer.ts` |
| Network read API | `server/controllers/network.controller.ts` |
| Video delivery (Streamplace) | `server/services/videoDelivery.service.ts` |
