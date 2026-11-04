# Storage — one owner for app media

Every image the platform serves is written by the server through a single
service: [`server/services/storage.service.ts`](../server/services/storage.service.ts),
backed by SeaweedFS over its S3 API. Clients never choose URLs or object
names — they hand the server bytes (data URI, base64, multipart file) or a
remote URL to re-host, and get back the reference the server decided on.

Before this, media had two owners: Cloudinary (avatars, course thumbnails,
banners) and whatever URL a client posted (INE verification images were
stored verbatim from the request). Both paths are gone.

## Buckets

| Bucket         | Access | Holds                                            |
|----------------|--------|--------------------------------------------------|
| `apice-assets` | public | avatars, course thumbnails, layout banners, the notification sound |
| `apice-private`| signed | INE verification photos (identity documents)     |
| `apice-videos` | —      | Streamplace lesson videos (not managed by this service) |
| `apice-backups`| —      | nightly Postgres dumps + mirrored object data    |

## How each flow works

- **Avatars** (`PUT /update-user-avatar`, social auth): server decodes the
  payload or re-hosts the remote URL, stores under `avatars/<userId>/<uuid>`,
  persists `{ key, url }` in `User.avatar`. Replaced avatars are deleted.
- **Course thumbnails** (`/create-course`, `/edit-course/:id`): same, under
  `courses/...`. An `https` thumbnail value means "keep the current image"
  (the admin editor round-trips it). Deletion of a course deletes its
  thumbnail.
- **Layout banners**: same pattern, under `layout/banner/`.
- **INE verification** (`POST /ine/submit`): multipart upload (`front`,
  `back` image files + optional `ineId`). Files are stored under
  `ine/<userId>/<uuid>` in the **private** bucket; `INEVerification.frontKey`
  / `backKey` hold server-generated keys — never client URLs. Reads go
  through presigned GET URLs (10-minute TTL) minted for the owner
  (`GET /ine/me`) or a reviewing admin (`GET /ine/verifications`,
  fields `frontImageUrl` / `backImageUrl`). Raw keys never leave the server.

## Legacy data

Rows that predate the move may still hold:
- `{ public_id, url }` objects (Cloudinary) in avatar/thumbnail columns —
  `url` keeps rendering; cleanup of the Cloudinary copy is no longer possible.
- Raw client URLs in `INEVerification` — re-host them with
  `npx ts-node-dev --transpile-only scripts/rehost-ine-images.ts`
  (idempotent; also runs per-row on the next resubmission).

## Public URLs

`STORAGE_PUBLIC_BASE_URL` (optional) points at a dedicated media host when
one exists. Unset, public media is served by the API itself at
`/api/v1/assets/<key>` with immutable cache headers (Cloudflare caches it
like any image origin).

## Backups

Object data and dumps are mirrored off the machine nightly — see
`scripts/backup-offsite.sh` and `docs/BACKUP_RESTORE_DRILL.md`. The offsite
job mirrors `apice-backups`, `apice-assets` and `apice-private` by default
(`OFFSITE_BUCKET_LIST` to change; add `apice-videos` only if its size is
acceptable — lesson videos are large).

## Environment

| Variable | Meaning |
|----------|---------|
| `SEAWEED_S3_ENDPOINT` / `SEAWEED_ACCESS_KEY` / `SEAWEED_SECRET_KEY` | S3 gateway + credentials (required in production) |
| `SEAWEED_ASSETS_BUCKET` / `SEAWEED_PRIVATE_BUCKET` | buckets (defaults `apice-assets` / `apice-private`) |
| `STORAGE_PUBLIC_BASE_URL` | optional public media host |
| `OFFSITE_*` | off-machine copy target for the nightly mirror |
