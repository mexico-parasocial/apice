/**
 * Headless publish: MP4 → Streamplace node → lesson videoRef, no browser.
 *
 * Mirrors the admin's browser flow (streamplaceUpload.ts) but authenticates
 * with an instructor app-password session instead of browser OAuth, so a
 * video can be published from a terminal / CI box:
 *
 *   1. com.atproto.server.createSession   (app password, on the instructor's PDS)
 *   2. place.stream.media.createUpload    (on the node → uploadId + TUS endpoint)
 *   3. TUS upload of the file bytes       (Bearer uploadToken)
 *   4. place.stream.media.getUploadStatus (poll until transcoding is done)
 *   5. place.stream.media.publishVideo    → at://…/place.stream.video/<rkey>
 *   6. verify playback through the server's own provider
 *   7. optionally attach to a lesson (--lesson) like attach-lesson-video.ts
 *
 * Env:
 *   ATPROTO_HANDLE           instructor handle (e.g. instructor.bsky.social)
 *   ATPROTO_APP_PASSWORD     app password (NOT the account password)
 *   STREAMPLACE_PUBLISH_URL  node base URL (default: STREAMPLACE_VOD_BASE_URL,
 *                            else https://stream.place)
 *   ATPROTO_PDS_URL          PDS for the session (default https://bsky.social)
 *
 * Usage:
 *   pnpm exec ts-node-dev --transpile-only --no-notify --exit-child \
 *     scripts/publish-lesson-video.ts ./lesson.mp4 \
 *     --title "Lección 1" [--description "..."] [--lesson <lessonId>] [--no-attach-check]
 *
 * The instructor DID must be in STREAMPLACE_ALLOWED_STREAMS on the node
 * (or the node runs SP_WIDE_OPEN, dev only).
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import axios, { AxiosInstance } from "axios";
import { prisma } from "../utils/db";
import { verifyVideoRef } from "../services/videoDelivery.service";

// ─── args ───────────────────────────────────────────────────────────

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const fileArg = process.argv[2];
const title = arg("--title") ?? path.basename(fileArg ?? "", path.extname(fileArg ?? ""));
const description = arg("--description");
const lessonId = arg("--lesson");
const skipAttachCheck = process.argv.includes("--no-attach-check");

const HANDLE = process.env.ATPROTO_HANDLE;
const APP_PASSWORD = process.env.ATPROTO_APP_PASSWORD;
const PDS_URL = (process.env.ATPROTO_PDS_URL ?? "https://bsky.social").replace(/\/$/, "");
const NODE_URL = (
  process.env.STREAMPLACE_PUBLISH_URL ??
  process.env.STREAMPLACE_VOD_BASE_URL ??
  "https://stream.place"
).replace(/\/$/, "");

// ─── helpers ────────────────────────────────────────────────────────

const TUS_CHUNK = 10 * 1024 * 1024;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

function nodeHttp(accessJwt: string): AxiosInstance {
  return axios.create({
    baseURL: `${NODE_URL}/xrpc`,
    headers: { Authorization: `Bearer ${accessJwt}` },
    validateStatus: undefined,
    timeout: 30_000,
  });
}

async function createSession(): Promise<{ did: string; accessJwt: string }> {
  if (!HANDLE || !APP_PASSWORD) {
    console.error(
      "❌ ATPROTO_HANDLE and ATPROTO_APP_PASSWORD are required.\n" +
        "   Create an app password: Settings → App passwords on your PDS host."
    );
    process.exit(1);
  }
  const { data } = await axios.post(
    `${PDS_URL}/xrpc/com.atproto.server.createSession`,
    { identifier: HANDLE, password: APP_PASSWORD },
    { validateStatus: undefined, timeout: 30_000 }
  );
  if (data?.error || !data?.accessJwt) {
    throw new Error(`Session failed: ${data?.message ?? data?.error ?? "no accessJwt"}`);
  }
  console.log(`🔑 Authenticated ${HANDLE} (${data.did})`);
  return { did: data.did, accessJwt: data.accessJwt };
}

/** TUS resumable upload, hand-rolled: HEAD for offset, PATCH per chunk. */
async function tusUpload(
  uploadUrl: string,
  uploadToken: string,
  filePath: string
): Promise<void> {
  const size = fs.statSync(filePath).size;
  const headers = { Authorization: `Bearer ${uploadToken}` };

  let offset = 0;
  const head = await axios.head(uploadUrl, { headers, validateStatus: undefined });
  if (head.status === 200 && head.headers["upload-offset"]) {
    offset = parseInt(head.headers["upload-offset"], 10) || 0;
    if (offset > 0) console.log(`⏩ Resuming TUS upload at byte ${offset}/${size}`);
  }

  const fh = await fs.promises.open(filePath, "r");
  try {
    while (offset < size) {
      const length = Math.min(TUS_CHUNK, size - offset);
      // Uint8Array (not Buffer): newer @types/node make Buffer
      // ArrayBufferLike-generic, which axios's body typing rejects.
      const buf = new Uint8Array(length);
      await fh.read(buf, 0, length, offset);

      let attempt = 0;
      for (;;) {
        const patch = await axios.patch(uploadUrl, buf, {
          headers: {
            ...headers,
            "Tus-Resumable": "1.0.0",
            "Upload-Offset": String(offset),
            "Content-Type": "application/offset+octet-stream",
          },
          maxBodyLength: Infinity,
          validateStatus: undefined,
          timeout: 120_000,
        });
        if (patch.status === 204) {
          offset = parseInt(patch.headers["upload-offset"], 10);
          process.stdout.write(
            `\r📤 Uploaded ${Math.min(offset, size)}/${size} bytes (${Math.round((offset / size) * 100)}%)`
          );
          break;
        }
        if (++attempt > 5) {
          throw new Error(`TUS chunk failed (${patch.status}): ${JSON.stringify(patch.data)}`);
        }
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
      }
    }
    console.log("");
  } finally {
    await fh.close();
  }
}

interface UploadStatus {
  status: "pending" | "processing" | "done" | "error";
  progress?: number;
  durationMs?: number;
  error?: string;
}

async function waitForDone(
  http: AxiosInstance,
  uploadId: string
): Promise<UploadStatus> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error("Transcoding took too long (10 min cap)");
    const { data } = await http.get("place.stream.media.getUploadStatus", {
      params: { uploadId },
    });
    if (data?.status === "done") return data;
    if (data?.status === "error") throw new Error(data.error || "Node failed to process video");
    if (typeof data?.progress === "number") {
      process.stdout.write(`\r🎞️  Transcoding ${data.progress}%`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// ─── main ───────────────────────────────────────────────────────────

async function main() {
  if (!fileArg || !fs.existsSync(fileArg)) {
    console.error("❌ Usage: publish-lesson-video.ts <file.mp4> [--title t] [--description d] [--lesson id] [--no-attach-check]");
    process.exit(1);
  }

  const { did, accessJwt } = await createSession();
  const http = nodeHttp(accessJwt);
  const size = fs.statSync(fileArg).size;

  // 1. Register the upload.
  const created = await http.post("place.stream.media.createUpload", {
    size,
    mimeType: "video/mp4",
    filename: path.basename(fileArg),
  });
  if (created.status >= 300 || !created.data?.uploadId) {
    throw new Error(
      `createUpload failed (${created.status}): ${JSON.stringify(created.data)}`
    );
  }
  const { uploadId, uploadUrl, uploadToken } = created.data;
  console.log(`📎 Upload registered: ${uploadId}`);

  // 2. Push the bytes.
  await tusUpload(uploadUrl, uploadToken, fileArg);

  // 3. Wait out transcoding.
  const done = await waitForDone(http, uploadId);
  console.log("");

  // 4. Publish the place.stream.video record.
  const published = await http.post("place.stream.media.publishVideo", {
    uploadId,
    record: {
      $type: "place.stream.video",
      title,
      ...(description ? { description } : {}),
      createdAt: new Date().toISOString(),
    },
  });
  if (published.status >= 300 || !published.data?.uri) {
    throw new Error(
      `publishVideo failed (${published.status}): ${JSON.stringify(published.data)}`
    );
  }
  const { uri, cid } = published.data as { uri: string; cid: string };
  console.log(`🎬 Published: ${uri}`);

  // 5. Verify through the same provider the server serves learners with.
  if (!skipAttachCheck) {
    console.log("🔎 Verifying playback through the delivery provider…");
    const check = await verifyVideoRef(uri);
    if (!check.ready) {
      console.error(`❌ Published but NOT servable: ${check.error}`);
      console.error(`   Record exists; fix the node, then attach manually: scripts/attach-lesson-video.ts "${uri}"`);
      process.exit(2);
    }
    console.log("✅ Playlist resolves — learners can stream this.");
  }
  // 6. Optional attach.
  if (lessonId) {
    const lesson = await prisma.courseLesson.findUnique({
      where: { id: lessonId },
      select: { id: true, title: true },
    });
    if (!lesson) {
      console.error(`❌ Lesson ${lessonId} not found — attach later with attach-lesson-video.ts`);
      process.exit(2);
    }
    await prisma.courseLesson.update({
      where: { id: lesson.id },
      data: { videoUrl: uri, ...(done.durationMs ? { videoLength: Math.round(done.durationMs / 1000) } : {}) },
    });
    console.log(`✅ Attached to lesson: ${lesson.title}`);
  } else {
    console.log(`\nAttach when ready:\n  pnpm --filter server exec ts-node-dev --transpile-only --no-notify --exit-child scripts/attach-lesson-video.ts "${uri}" --lesson <id>`);
  }

  void did;
}

main()
  .catch((err: any) => {
    console.error("❌ Publish failed:", err.message);
    if (err.response?.data) console.error("   Response:", JSON.stringify(err.response.data));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
