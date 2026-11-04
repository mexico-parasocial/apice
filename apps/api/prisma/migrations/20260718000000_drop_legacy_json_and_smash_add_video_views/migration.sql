-- ============================================================================
-- Consolidated cleanup migration (Q3 Phase 0)
--
-- 1. Adds the VideoView audit table (was in schema.prisma without a migration)
-- 2. Drops legacy Smash/SSBU tables and columns (product pivot to civic MOOC)
-- 3. Drops the deprecated JSON columns now replaced by relational tables
-- 4. Adds referential integrity to Order (userId -> User, courseId -> Course)
--
-- ⚠️  If your database still has data in the legacy JSON columns
-- ("User"."courses", "Course"."courseData", "Course"."reviews"), run
-- `npx ts-node scripts/migrate-json-to-relational.ts` BEFORE applying this.
--
-- All statements are idempotent (IF [NOT] EXISTS / constraint guards) because
-- some environments received parts of this shape via `prisma db push`.
-- ============================================================================

-- ─── 1. VideoView ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "VideoView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "playbackUrl" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VideoView_userId_idx" ON "VideoView"("userId");
CREATE INDEX IF NOT EXISTS "VideoView_lessonId_idx" ON "VideoView"("lessonId");
CREATE INDEX IF NOT EXISTS "VideoView_courseId_idx" ON "VideoView"("courseId");
CREATE INDEX IF NOT EXISTS "VideoView_createdAt_idx" ON "VideoView"("createdAt");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VideoView_userId_fkey') THEN
        ALTER TABLE "VideoView" ADD CONSTRAINT "VideoView_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VideoView_lessonId_fkey') THEN
        ALTER TABLE "VideoView" ADD CONSTRAINT "VideoView_lessonId_fkey"
            FOREIGN KEY ("lessonId") REFERENCES "CourseLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VideoView_courseId_fkey') THEN
        ALTER TABLE "VideoView" ADD CONSTRAINT "VideoView_courseId_fkey"
            FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── 2. Legacy Smash/SSBU ───────────────────────────────────────────────────

DROP TABLE IF EXISTS "_MatchupLikes";
DROP TABLE IF EXISTS "Matchup";
DROP TABLE IF EXISTS "Coach";
DROP TABLE IF EXISTS "TierListLike";
DROP TABLE IF EXISTS "TierList";

ALTER TABLE "User" DROP COLUMN IF EXISTS "isSmashProSubscribed";

-- ─── 3. Deprecated JSON columns (replaced by relational tables) ─────────────

ALTER TABLE "User" DROP COLUMN IF EXISTS "courses";
ALTER TABLE "Course" DROP COLUMN IF EXISTS "courseData";
ALTER TABLE "Course" DROP COLUMN IF EXISTS "reviews";

-- ─── 4. Order referential integrity ─────────────────────────────────────────

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_courseId_fkey') THEN
        ALTER TABLE "Order" ADD CONSTRAINT "Order_courseId_fkey"
            FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_userId_fkey') THEN
        ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
