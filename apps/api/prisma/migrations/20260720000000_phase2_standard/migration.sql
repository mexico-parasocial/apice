-- ============================================================================
-- Phase 2 — The Standard
--
-- 1. Course.atprotoLessonRefs: map lessonId -> { uri, cid } for the
--    app.civic.lesson records published under an instructor's DID. Consumed by
--    the credential writer (app.civic.progress lessonRef strongRefs).
-- 2. NetworkCourse: civic records discovered on the ATProto network via the
--    Jetstream indexer (Workstream F).
-- ============================================================================

ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "atprotoLessonRefs" JSONB;

CREATE TABLE IF NOT EXISTS "NetworkCourse" (
    "id" TEXT NOT NULL,
    "did" TEXT NOT NULL,
    "rkey" TEXT NOT NULL,
    "collection" TEXT NOT NULL,
    "cid" TEXT NOT NULL,
    "record" JSONB NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkCourse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NetworkCourse_did_collection_rkey_key"
    ON "NetworkCourse"("did", "collection", "rkey");
CREATE INDEX IF NOT EXISTS "NetworkCourse_collection_idx"
    ON "NetworkCourse"("collection");
CREATE INDEX IF NOT EXISTS "NetworkCourse_indexedAt_idx"
    ON "NetworkCourse"("indexedAt");
