-- CreateTable
CREATE TABLE "LessonRef" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "uri" TEXT NOT NULL,
    "cid" TEXT NOT NULL,

    CONSTRAINT "LessonRef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LessonRef_courseId_idx" ON "LessonRef"("courseId");

-- CreateIndex
CREATE INDEX "LessonRef_lessonId_idx" ON "LessonRef"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonRef_courseId_lessonId_key" ON "LessonRef"("courseId", "lessonId");

-- AddForeignKey
ALTER TABLE "LessonRef" ADD CONSTRAINT "LessonRef_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MigrateData: unpack atprotoLessonRefs JSON (lessonId -> {uri, cid}) into rows
INSERT INTO "LessonRef" ("id", "courseId", "lessonId", "uri", "cid")
SELECT
  gen_random_uuid()::text,
  c."id",
  key AS "lessonId",
  (value ->> 'uri') AS "uri",
  (value ->> 'cid') AS "cid"
FROM "Course" c,
LATERAL jsonb_each_text(c."atprotoLessonRefs"::jsonb) AS refs(key, value)
WHERE c."atprotoLessonRefs" IS NOT NULL
  AND c."atprotoLessonRefs"::text != 'null'
  AND c."atprotoLessonRefs"::text != '{}';

-- Drop column after data is migrated
ALTER TABLE "Course" DROP COLUMN "atprotoLessonRefs";
