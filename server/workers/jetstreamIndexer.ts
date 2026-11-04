/**
 * Jetstream indexer (Workstream F).
 *
 * Subscribes to the ATProto firehose (Jetstream) for app.civic.* collections,
 * validates each record against the bundled lexicons, and upserts it into the
 * NetworkCourse table. This is how Ápice becomes network-aware: any course
 * published by anyone (including our own instructors) shows up here.
 *
 * Run (dev):   pnpm worker:indexer
 * Run (prod):  node build/workers/jetstreamIndexer.js
 */
import { createCivicValidator } from "@apice/lexicons";
import { prisma } from "../utils/db";
import { redis } from "../utils/redis";
import { log } from "../utils/logger";

const indexerLog = log("indexer");

const JETSTREAM_URL =
  process.env.JETSTREAM_URL || "wss://jetstream1.us-east.bsky.network";
const CURSOR_KEY = "indexer:cursor";
const CURSOR_FLUSH_MS = 10_000;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;

const COLLECTIONS = [
  "app.civic.course",
  "app.civic.lesson",
  "app.civic.video",
  "app.civic.progress",
];

// Includes com.atproto.repo.strongRef: without it every record carrying a
// ref (course, lesson, progress) failed validation and was dropped.
const lex = createCivicValidator();

interface CommitEvent {
  kind: "commit";
  did: string;
  timeUs: number;
  commit: {
    operation: "create" | "update" | "delete";
    collection: string;
    rkey: string;
    cid?: string;
    record?: unknown;
  };
}

let latestCursor: number | null = null;
let cursorDirty = false;

async function loadCursor(): Promise<number | null> {
  const raw = await redis.get(CURSOR_KEY);
  return raw ? parseInt(raw, 10) : null;
}

async function flushCursor() {
  if (!cursorDirty || latestCursor === null) return;
  await redis.set(CURSOR_KEY, String(latestCursor));
  cursorDirty = false;
}

async function handleEvent(event: CommitEvent): Promise<void> {
  const { did, commit } = event;
  if (!COLLECTIONS.includes(commit.collection)) return;

  latestCursor = event.timeUs;
  cursorDirty = true;

  if (commit.operation === "delete") {
    await prisma.networkCourse.deleteMany({
      where: { did, collection: commit.collection, rkey: commit.rkey },
    });
    return;
  }

  if (!commit.record || !commit.cid) return;

  // Validate against the civic lexicons; invalid records are dropped.
  try {
    lex.assertValidRecord(commit.collection, commit.record);
  } catch (error: any) {
    indexerLog.warn(
      { collection: commit.collection, did, err: error?.message },
      "invalid record dropped"
    );
    return;
  }

  await prisma.networkCourse.upsert({
    where: {
      did_collection_rkey: {
        did,
        collection: commit.collection,
        rkey: commit.rkey,
      },
    },
    update: {
      cid: commit.cid,
      record: commit.record as any,
      indexedAt: new Date(),
    },
    create: {
      did,
      collection: commit.collection,
      rkey: commit.rkey,
      cid: commit.cid,
      record: commit.record as any,
    },
  });
}

function buildSubscribeUrl(cursor: number | null): string {
  const url = new URL(`${JETSTREAM_URL}/subscribe`);
  for (const collection of COLLECTIONS) {
    url.searchParams.append("wantedCollections", collection);
  }
  if (cursor) {
    url.searchParams.set("cursor", String(cursor));
  }
  return url.toString();
}

async function run(): Promise<void> {
  let attempt = 0;

  for (;;) {
    const cursor = await loadCursor();
    const url = buildSubscribeUrl(cursor);
    indexerLog.info({ url: String(url) }, "connecting");

    await new Promise<void>((resolve) => {
      const ws = new WebSocket(url);
      const flushTimer = setInterval(() => {
        void flushCursor().catch(() => {});
      }, CURSOR_FLUSH_MS);

      ws.onopen = () => {
        attempt = 0;
        indexerLog.info("connected");
      };

      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(String(msg.data));
          if (event?.kind === "commit") {
            void handleEvent(event as CommitEvent).catch((error) => {
              indexerLog.error({ err: error?.message }, "event error");
            });
          }
        } catch {
          /* malformed frame — ignore */
        }
      };

      ws.onerror = () => {
        indexerLog.error("websocket error");
      };

      ws.onclose = () => {
        clearInterval(flushTimer);
        void flushCursor().catch(() => {});
        resolve();
      };
    });

    attempt += 1;
    const backoff = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, attempt),
      RECONNECT_MAX_MS
    );
    indexerLog.warn({ backoffMs: backoff }, "disconnected; reconnecting");
    await new Promise((resolve) => setTimeout(resolve, backoff));
  }
}

async function shutdown() {
  indexerLog.info("shutting down");
  await flushCursor().catch(() => {});
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

run().catch(async (error) => {
  indexerLog.fatal({ err: error }, "fatal");
  await prisma.$disconnect();
  process.exit(1);
});
