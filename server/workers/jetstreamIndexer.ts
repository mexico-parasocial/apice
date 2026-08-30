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
import { Lexicons } from "@atproto/lexicon";
import { lexicons as civicLexicons } from "@apice/lexicons";
import { prisma } from "../utils/db";
import { redis } from "../utils/redis";

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

const lex = new Lexicons();
for (const doc of civicLexicons) {
  lex.add(doc as any);
}

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
    console.warn(
      `[indexer] invalid ${commit.collection} from ${did}: ${error?.message}`
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
    console.log(`[indexer] connecting to ${url}`);

    await new Promise<void>((resolve) => {
      const ws = new WebSocket(url);
      const flushTimer = setInterval(() => {
        void flushCursor().catch(() => {});
      }, CURSOR_FLUSH_MS);

      ws.onopen = () => {
        attempt = 0;
        console.log("[indexer] connected");
      };

      ws.onmessage = (msg) => {
        try {
          const event = JSON.parse(String(msg.data));
          if (event?.kind === "commit") {
            void handleEvent(event as CommitEvent).catch((error) => {
              console.error("[indexer] event error:", error?.message);
            });
          }
        } catch {
          /* malformed frame — ignore */
        }
      };

      ws.onerror = () => {
        console.error("[indexer] websocket error");
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
    console.log(`[indexer] disconnected; reconnecting in ${backoff}ms`);
    await new Promise((resolve) => setTimeout(resolve, backoff));
  }
}

async function shutdown() {
  console.log("[indexer] shutting down");
  await flushCursor().catch(() => {});
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

run().catch(async (error) => {
  console.error("[indexer] fatal:", error);
  await prisma.$disconnect();
  process.exit(1);
});
