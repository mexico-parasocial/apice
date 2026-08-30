import { NextFunction, Request, Response } from "express";
import { CatchAsyncError } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import { prisma } from "../utils/db";

const COURSE_COLLECTION = "app.civic.course";
const LESSON_COLLECTION = "app.civic.lesson";

interface LessonStrongRef {
  uri: string;
  cid: string;
}

function rkeyFromAtUri(uri: string): string | null {
  const parts = uri.split("/");
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

/**
 * GET /api/v1/network/courses
 *
 * Courses discovered on the ATProto network (app.civic.course records from any
 * author), newest first. Proof that the standard is consumable by anyone.
 */
export const getNetworkCourses = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 100);
      const cursor = req.query.cursor ? new Date(String(req.query.cursor)) : undefined;

      const rows = await prisma.networkCourse.findMany({
        where: {
          collection: COURSE_COLLECTION,
          ...(cursor ? { indexedAt: { lt: cursor } } : {}),
        },
        orderBy: { indexedAt: "desc" },
        take: limit + 1,
      });

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      const courses = page.map((row) => {
        const record = row.record as any;
        return {
          uri: `at://${row.did}/${row.collection}/${row.rkey}`,
          cid: row.cid,
          authorDid: row.did,
          title: record?.title ?? null,
          description: record?.description ?? null,
          tags: record?.tags ?? [],
          sectionCount: Array.isArray(record?.sections)
            ? record.sections.length
            : 0,
          indexedAt: row.indexedAt,
        };
      });

      res.status(200).json({
        success: true,
        courses,
        cursor: hasMore ? page[page.length - 1].indexedAt.toISOString() : null,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);

/**
 * GET /api/v1/network/courses/:did/:rkey
 *
 * Full course record with its lessons resolved from the same author's repo
 * (as indexed).
 */
export const getNetworkCourse = CatchAsyncError(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { did, rkey } = req.params;

      const course = await prisma.networkCourse.findUnique({
        where: {
          did_collection_rkey: { did, collection: COURSE_COLLECTION, rkey },
        },
      });

      if (!course) {
        return next(new ErrorHandler("Course not found on the network", 404));
      }

      const record = course.record as any;
      const sections = Array.isArray(record?.sections) ? record.sections : [];

      // Resolve lesson refs to indexed lesson records from the same author.
      const lessonRkeys = new Set<string>();
      for (const section of sections) {
        for (const ref of (section?.lessons ?? []) as LessonStrongRef[]) {
          const lessonRkey = rkeyFromAtUri(ref?.uri ?? "");
          if (lessonRkey) lessonRkeys.add(lessonRkey);
        }
      }

      const lessonRows = lessonRkeys.size
        ? await prisma.networkCourse.findMany({
            where: {
              did,
              collection: LESSON_COLLECTION,
              rkey: { in: Array.from(lessonRkeys) },
            },
          })
        : [];

      const lessonByRkey = new Map(lessonRows.map((l) => [l.rkey, l]));

      const resolvedSections = sections.map((section: any) => ({
        title: section?.title ?? null,
        lessons: ((section?.lessons ?? []) as LessonStrongRef[])
          .map((ref) => {
            const lessonRkey = rkeyFromAtUri(ref?.uri ?? "");
            const row = lessonRkey ? lessonByRkey.get(lessonRkey) : undefined;
            const value = row?.record as any;
            return {
              uri: ref.uri,
              cid: ref.cid,
              title: value?.title ?? null,
              durationSeconds: value?.durationSeconds ?? null,
              videoRef: value?.videoRef ?? null,
              indexed: Boolean(row),
            };
          }),
      }));

      res.status(200).json({
        success: true,
        course: {
          uri: `at://${did}/${COURSE_COLLECTION}/${rkey}`,
          cid: course.cid,
          authorDid: did,
          record,
          sections: resolvedSections,
          indexedAt: course.indexedAt,
        },
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }
  }
);
