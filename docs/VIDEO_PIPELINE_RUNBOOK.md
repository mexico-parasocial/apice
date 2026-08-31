# Video Pipeline Runbook — Self-hosted Streamplace

This document describes how to prove and operate the end-to-end Ápice video pipeline: admin publishes a video to the self-hosted Streamplace node, saves the AT URI in Ápice, and a mobile learner streams it through the Ápice server.

---

## Architecture recap

```
┌─────────────┐     OAuth + TUS      ┌──────────────────────┐
│  Admin web  │ ───────────────────▶ │ Self-hosted Streamplace
│  (Next.js)  │   publish video      │ node + SeaweedFS S3  │
└─────────────┘                      └──────────┬───────────┘
       │                                        │
       │ POST /api/v1/videos/lessons/:id/videoRef
       │ saves AT URI in Ápice                    │
       ▼                                        ▼
┌─────────────────────┐              ┌──────────────────────┐
│   Ápice Server      │              │  place.stream.video  │
│  (Node/Express/Prisma)             │  record in node repo │
└──────────┬──────────┘              └──────────────────────┘
           │
           │ GET /api/v1/videos/lessons/:id/playback
           │ verifies auth + Bluesky DID, audits view
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Mobile app (expo-video) receives HLS playlist URL            │
│  and streams segments directly from Streamplace/SeaweedFS     │
└─────────────────────────────────────────────────────────────┘
```

---

## Pre-flight checklist

### 1. Infrastructure is up

- [ ] Postgres container is running with both `apice_prod` and `apice_streamplace` databases.
- [ ] Redis container is running.
- [ ] SeaweedFS cluster is running: master, volume, filer, S3 gateway, bucket `apice-videos` created.
- [ ] Streamplace node container is running and healthy.
- [ ] Caddy is reverse-proxying `vod.apice.example.com` → `streamplace-node:38080`.
- [ ] Server and admin containers are running and can reach Postgres/Redis.

### 2. Environment variables

| Service | Required vars |
|---|---|
| Server | `STREAMPLACE_VOD_BASE_URL=https://vod.apice.example.com`, `ALLOWED_ORIGINS`, `ACCESS_TOKEN`, DB/Redis credentials. |
| Admin | `NEXT_PUBLIC_SERVER_URI=https://api.apice.example.com/api/v1`, `NEXT_PUBLIC_STREAMPLACE_NODE_URL=https://vod.apice.example.com`, `NEXT_PUBLIC_ADMIN_URL=https://admin.apice.example.com`, `NEXTAUTH_SECRET`. |
| Mobile | `EXPO_PUBLIC_API_URL=https://api.apice.example.com` (no `/api/v1`). |
| Streamplace node | `SP_BROADCASTER_HOST=vod.apice.example.com`, `SP_SERVER_HOST=vod.apice.example.com`, `SP_S3_ENDPOINT`, `SP_S3_BUCKET=apice-videos`, S3 keys, `SP_DB_URL`, `SP_BEHIND_HTTPS_PROXY=true`. |

### 3. Upload authorization

Choose **one** strategy on the Streamplace node:

- **Production:** `STREAMPLACE_WIDE_OPEN=false` and `STREAMPLACE_ALLOWED_STREAMS=<instructor-did-1>,<instructor-did-2>`.
- **Testing only:** `STREAMPLACE_WIDE_OPEN=true` (allows any DID to publish).

> ⚠️ Never use `--wide-open` in production.

---

## Proving the pipeline

### Step 1 — Verify the node can serve playback

Use the smoke-test script from the server directory. You need a real `place.stream.video` AT URI published on your node.

A sample test clip is available locally at `server/fixtures/videos/TESTCLIP.MP4` (H.264, 1080×1920, 22.8 s).

```bash
cd server
npx ts-node-dev --transpile-only --no-notify --exit-child \
  scripts/verify-streamplace-playback.ts \
  "at://did:web:vod.apice.example.com/place.stream.video/<record-key>"
```

Expected output:

```
✅ Node reachable (HTTP 200)
✅ Resolved playback URL: https://vod.apice.example.com/xrpc/place.stream.playback.getVideoPlaylist?uri=...
✅ Playlist fetched (...
✅ First segment reachable (HTTP 206, ... bytes)
🎉 Streamplace playback pipeline looks healthy!
```

If this fails, fix the node/S3/network before continuing.

**Headless path (CLI, no browser — repeatable / CI-friendly):**

```bash
# one-time: instructor app password (NOT the account password)
export ATPROTO_HANDLE="instructor.bsky.social"
export ATPROTO_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"
# optional: STREAMPLACE_PUBLISH_URL (defaults to STREAMPLACE_VOD_BASE_URL, else stream.place)

# normalize the source first (bitrate ladder tuned for prepaid data)
./scripts/prepare-lesson-video.sh raw-capture.mp4

# publish → verify playback → attach to the lesson
cd server && pnpm exec ts-node-dev --transpile-only --no-notify --exit-child \
  scripts/publish-lesson-video.ts ../normalized.mp4 \
  --title "Lección 1 — Introducción" \
  --lesson <lessonId>
```

The script creates an app-password session, registers the upload, pushes
the bytes over TUS (resumable), polls transcoding, publishes the
`place.stream.video` record, verifies the playlist resolves through the
server's own delivery provider, and attaches it to the lesson. If
verification fails after publish it exits with the AT URI printed so you
can retry attaching later.

**Primary path (direct upload from the admin):**

1. In the Ápice admin, open the course editor and find the lesson.
2. In **"Subir video nuevo"**, click **"Conectar con Bluesky"** and authorize in the popup (first time only — the session persists).
3. Pick the video file, set the title, and click **"Subir y publicar"**. The panel shows upload → processing → publish progress and links the resulting `place.stream.video` AT URI to the lesson automatically.

**Fallback path (manual paste):**

1. Open the Streamplace web dashboard at `https://vod.apice.example.com`.
2. Sign in with an allowed instructor Bluesky account.
3. Upload a video (or use the local test clip `server/fixtures/videos/TESTCLIP.MP4`) and wait for transcoding to complete.
4. Copy the resulting `place.stream.video` AT URI.
5. In the Ápice admin, open the course editor, find the lesson, paste the AT URI, and click **“Vincular video ahora”**.
6. Confirm the server responds with `success: true`.

### Step 3 — Verify the mobile playback API

You need:

- a learner user with a linked Bluesky DID (`User.blueskyDid` is set),
- an enrollment in the course,
- the lesson has the `videoUrl` set to the AT URI.

From the mobile app (or curl with a valid access token):

```bash
curl -H "access-token: <learner-token>" \
  https://api.apice.example.com/api/v1/videos/lessons/<lessonId>/playback
```

Expected response:

```json
{
  "success": true,
  "provider": "streamplace",
  "playbackUrl": "https://vod.apice.example.com/xrpc/place.stream.playback.getVideoPlaylist?uri=..."
}
```

### Step 4 — Verify mobile playback

1. Open the lesson in the mobile app.
2. The player should call the playback endpoint, receive the HLS URL, and pass it to `expo-video` with `contentType: "hls"`.
3. The video should play; segments are served directly by Streamplace/SeaweedFS.

---

## Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| `Node not reachable` from smoke test | Caddy misconfig, Streamplace container down, DNS not pointing to VPS. | Check `docker ps`, Caddy logs, DNS A record for `vod.apice.example.com`. |
| Playlist fetch fails with 4xx/5xx | AT URI points to a different node or record does not exist. | Verify the URI came from this node and transcoding finished. |
| Segment fetch fails | SeaweedFS S3 misconfiguration or CORS. | Check `SP_S3_*` env vars and that segments are in the bucket. |
| Mobile gets 400/401 | Missing `access-token` header or token expired. | Verify mobile login stores token and `api` interceptor adds it. |
| Mobile gets 403 “Bluesky identity required” | Learner has no `blueskyDid` in the `User` table. | Link identity via iM8/OAuth flow first. |
| `Lesson not found` from `POST /videoRef` | The lesson does not exist in relational tables yet. | Run JSON → relational migration (`scripts/migrate-json-to-relational.ts`) or create the lesson through the new relational flow. |

---

## Next improvements

- Add server-side integration tests for `getLessonPlayback` and `setLessonVideoRef`.
- Add mobile E2E test that plays a known test video.
- Surface transcoding errors from the node in the admin upload component (currently generic).
