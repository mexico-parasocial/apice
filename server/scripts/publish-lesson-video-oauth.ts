/**
 * OAuth-based Streamplace publisher (loopback flow).
 *
 * place.stream.media endpoints require an OAuth DPoP session — app-password
 * JWTs are rejected (401 "oauth session required"). This script runs the
 * ATProto loopback flow: it prints an authorization URL, you open it and
 * click "Authorize", the PDS redirects back to 127.0.0.1, and the resulting
 * session publishes every video you pass it, attaching each to a lesson.
 *
 * Usage:
 *   node build/scripts/publish-lesson-video-oauth.js <video-or-dir> \
 *     [--map lessons.json] [--title t] [--lesson id]
 *
 *   <video-or-dir>  one MP4 or a directory of *.mp4 (sorted by name)
 *   --map           optional JSON: { "<filename>": "<lessonId>" } — with a
 *                   directory + map, each video attaches to its lesson;
 *                   without a map, videos are attached in sorted order to
 *                   --lesson, or not attached at all.
 *
 * Env: STREAMPLACE_PUBLISH_URL (node), ATPROTO_HANDLE (defaults to the
 * session's own handle choice via the URL prompt), LESSON_MAP (alternative
 * to --map). The consent session is cached at /tmp/apice-oauth-session.json
 * — reuse means zero clicks on subsequent runs.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import http from "http";
import { randomUUID } from "crypto";
import axios from "axios";
import { NodeOAuthClient } from "@atproto/oauth-client-node";
import { prisma } from "../utils/db";
import { verifyVideoRef } from "../services/videoDelivery.service";

const NODE_URL = (
  process.env.STREAMPLACE_PUBLISH_URL ??
  process.env.STREAMPLACE_VOD_BASE_URL ??
  "https://stream.place"
).replace(/\/$/, "");
const CALLBACK_PORT = 4321;
const SESSION_CACHE = "/tmp/apice-oauth-session.json";

// ─── OAuth client (loopback dev client — no hosted metadata needed) ────

// Loopback clients declare requested scopes inside the client_id itself
// (ATProto OAuth spec) — requesting them only in authorize() yields
// invalid_scope.
const LOOPBACK_CLIENT_ID = "http://localhost";

const clientMetadata = {
  client_id: LOOPBACK_CLIENT_ID,
  client_name: "Ápice Lesson Publisher",
  client_uri: "http://localhost",
  redirect_uris: [`http://127.0.0.1:${CALLBACK_PORT}/callback`],
  scope: "atproto transition:generic",
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
  application_type: "web",
  dpop_bound_access_tokens: true,
};

type Session = { fetchHandler: typeof fetch; did: string; sub: string };

const memory = {
  state: new Map<string, string>(),
  session: undefined as any,
};

const client = new NodeOAuthClient({
  clientMetadata: clientMetadata as any,
  stateStore: {
    get: async (key: string) => memory.state.get(key),
    set: async (key: string, val: any) => void memory.state.set(key, val),
    del: async (key: string) => void memory.state.delete(key),
  },
  sessionStore: {
    get: async (key: string) => memory.session,
    set: async (key: string, val: any) => void (memory.session = val),
    del: async (key: string) => void (memory.session = undefined),
  },
});

async function getSession(): Promise<Session> {
  // Reuse a cached session when present and still valid.
  if (fs.existsSync(SESSION_CACHE)) {
    try {
      const cached = JSON.parse(fs.readFileSync(SESSION_CACHE, "utf8"));
      memory.session = cached;
      const restored = await client.restore(cached.did);
      console.log(`🔑 Reused cached OAuth session for ${cached.did}`);
      return {
        // Bind to the narrow (pathname) signature; xrpc() only ever passes
        // absolute URL strings.
        fetchHandler: ((pathname: string, init?: RequestInit) =>
          (restored.fetchHandler as any)(pathname, init)) as any,
        did: restored.did,
        sub: cached.did,
      };
    } catch {
      console.log("ℹ️  Cached session invalid — starting a fresh flow.");
    }
  }

  const handle = process.argv.find((a) => a.startsWith("--handle="))?.split("=")[1];
  if (!handle) {
    console.error("❌ First run needs --handle=<your.bsky.social> for the consent URL.");
    process.exit(1);
  }

  const url = await client.authorize(handle, { scope: "atproto" });
  console.log("\n🌐 Open this URL in a browser and click \"Authorize\":\n");
  console.log(url);
  console.log("\nWaiting for the redirect on 127.0.0.1:" + CALLBACK_PORT + " …");

  const params: URLSearchParams = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url ?? "/", "http://127.0.0.1");
      if (u.pathname === "/callback") {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>✅ Autorizado — vuelve a la terminal.</h1>");
        resolve(u.searchParams);
        server.close();
      } else {
        res.writeHead(404).end();
      }
    });
    // Bind all interfaces: the browser redirect lands on the HOST's
    // loopback and docker-proxy forwards it into this container.
    server.listen(CALLBACK_PORT);
    server.on("error", (e: any) => {
      reject(new Error(`Port ${CALLBACK_PORT} busy: ${e.message}`));
    });
    setTimeout(() => reject(new Error("Consent timed out (10 min).")), 600_000);
  });

  const { session } = await client.callback(params);
  const did = session.sub;
  fs.writeFileSync(SESSION_CACHE, JSON.stringify({ did }));
  console.log(`🔑 Authorized ${did}`);
  return {
    fetchHandler: ((pathname: string, init?: RequestInit) =>
      (session.fetchHandler as any)(pathname, init)) as any,
    did,
    sub: did,
  };
}

// ─── Streamplace media flow (same lexicons as the admin panel) ─────────

async function xrpc<T>(
  session: Session,
  method: string,
  options?: { body?: unknown }
): Promise<T> {
  const res = await session.fetchHandler(`${NODE_URL}/xrpc/${method}`, {
    method: options?.body ? "POST" : "GET",
    ...(options?.body
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) }
      : {}),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || res.status >= 300) {
    throw new Error(`${method} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data as T;
}

async function tusUpload(
  uploadUrl: string,
  uploadToken: string,
  filePath: string
): Promise<void> {
  const size = fs.statSync(filePath).size;
  const headers = { Authorization: `Bearer ${uploadToken}` };
  const fh = await fs.promises.open(filePath, "r");

  let offset = 0;
  try {
    const head = await axios.head(uploadUrl, { headers, validateStatus: undefined });
    if (head.status === 200 && head.headers["upload-offset"]) {
      offset = parseInt(head.headers["upload-offset"], 10) || 0;
    }
    while (offset < size) {
      const length = Math.min(10 * 1024 * 1024, size - offset);
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
          process.stdout.write(`\r📤 ${path.basename(filePath)} ${Math.round((offset / size) * 100)}%`);
          break;
        }
        if (++attempt > 5) throw new Error(`TUS chunk failed (${patch.status})`);
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
      }
    }
    console.log("");
  } finally {
    await fh.close();
  }
}

async function waitForDone(session: Session, uploadId: string) {
  const http2 = axios.create({ baseURL: `${NODE_URL}/xrpc`, validateStatus: undefined, timeout: 30_000 });
  void http2;
  const deadline = Date.now() + 15 * 60 * 1000;
  for (;;) {
    const res = await session.fetchHandler(
      `${NODE_URL}/xrpc/place.stream.media.getUploadStatus?uploadId=${encodeURIComponent(uploadId)}`,
      { method: "GET" }
    );
    const data = (await (res as any).json().catch(() => ({}))) as any;
    if (data?.status === "done") return data;
    if (data?.status === "error") throw new Error(data.error || "Node failed to process video");
    if (typeof data?.progress === "number") {
      process.stdout.write(`\r🎞️  Transcoding ${data.progress}%   `);
    }
    if (Date.now() > deadline) throw new Error("Transcoding timed out (15 min cap)");
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ─── main ───────────────────────────────────────────────────────────────

async function main() {
  const target = process.argv[2];
  const mapFlag = process.argv.indexOf("--map");
  const mapFile = mapFlag !== -1 ? process.argv[mapFlag + 1] : undefined;
  const lessonFlag = process.argv.indexOf("--lesson");
  const singleLesson = lessonFlag !== -1 ? process.argv[lessonFlag + 1] : undefined;

  if (!target || !fs.existsSync(target)) {
    console.error("❌ Usage: publish-lesson-video-oauth.js <file-or-dir> [--map map.json] [--lesson id] [--handle=you.bsky.social]");
    process.exit(1);
  }

  const session = await getSession();

  const files = fs.statSync(target).isDirectory()
    ? fs
        .readdirSync(target)
        .filter((f) => f.toLowerCase().endsWith(".mp4"))
        .sort()
        .map((f) => path.join(target, f))
    : [target];

  const map = mapFile
    ? JSON.parse(fs.readFileSync(mapFile, "utf8"))
    : undefined;

  const lessonIds: string[] = [];
  if (singleLesson) {
    lessonIds.push(singleLesson);
  } else if (map) {
    // Map keyed by filename → lessonId, in sorted-file order.
    for (const f of files) lessonIds.push(map[path.basename(f)]);
  } else if (mapFile === undefined && files.length > 1) {
    // No map and no --lesson: attach in DB global order.
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT l.id FROM "CourseLesson" l
      JOIN "CourseSection" s ON l."sectionId" = s.id
      JOIN "Course" c ON s."courseId" = c.id
      ORDER BY c."createdAt" ASC, s."order" ASC, l."order" ASC`;
    lessonIds.push(...rows.map((r) => r.id));
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const lessonId = lessonIds[i];
    const title = path.basename(file, path.extname(file));
    console.log(`\n[${i + 1}/${files.length}] ${title}`);

    const created = (await xrpc(session, "place.stream.media.createUpload", {
      body: { size: fs.statSync(file).size, mimeType: "video/mp4", filename: path.basename(file) },
    })) as any;
    await tusUpload(created.uploadUrl, created.uploadToken, file);
    const done = (await waitForDone(session, created.uploadId)) as any;

    const published = (await xrpc(session, "place.stream.media.publishVideo", {
      body: {
        uploadId: created.uploadId,
        record: {
          $type: "place.stream.video",
          title,
          createdAt: new Date().toISOString(),
        },
      },
    })) as { uri: string; cid: string };
    console.log(`🎬 ${published.uri}`);

    const check = await verifyVideoRef(published.uri);
    if (!check.ready) {
      console.error(`⚠️  Published but not servable: ${(check as any).error}`);
    }

    if (lessonId) {
      const lesson = await prisma.courseLesson.findUnique({
        where: { id: lessonId },
        select: { id: true, title: true },
      });
      if (!lesson) {
        console.error(`⚠️  Lesson ${lessonId} not found — attach later.`);
        continue;
      }
      await prisma.courseLesson.update({
        where: { id: lesson.id },
        data: {
          videoUrl: published.uri,
          ...(done.durationMs ? { videoLength: Math.round(done.durationMs / 1000) } : {}),
        },
      });
      console.log(`✅ Attached: ${lesson.title}`);
    }
  }

  console.log("\n🎉 Done.");
}

main()
  .catch((err: any) => {
    console.error("❌ Failed:", err?.message ?? err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
