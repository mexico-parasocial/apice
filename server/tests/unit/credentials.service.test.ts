import { describe, it, expect, vi, beforeEach } from "vitest";

const { putRecordMock } = vi.hoisted(() => ({
  putRecordMock: vi.fn(),
}));

vi.mock("@atproto/api", () => ({
  AtpAgent: class {
    com = { atproto: { repo: { putRecord: putRecordMock } } };
  },
}));

vi.mock("../../utils/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    course: { findUnique: vi.fn() },
    enrollmentLesson: { findMany: vi.fn() },
  },
}));

vi.mock("../../services/atprotoOAuth.service", () => ({
  restoreSession: vi.fn(),
}));

import {
  publishCourseCredential,
  publishLessonCredential,
} from "../../services/credentials.service";
import { prisma } from "../../utils/db";
import { restoreSession } from "../../services/atprotoOAuth.service";

const DID = "did:plc:learner1";
const COURSE_URI = "at://did:plc:instructor1/app.civic.course/abc";
const COURSE_CID = "bafy-course";
const LESSON_URI = "at://did:plc:instructor1/app.civic.lesson/xyz";
const LESSON_CID = "bafy-lesson";

function mockHappyPath() {
  (prisma.user.findUnique as any).mockResolvedValue({ blueskyDid: DID });
  (prisma.course.findUnique as any).mockResolvedValue({
    atprotoUri: COURSE_URI,
    atprotoCid: COURSE_CID,
    atprotoLessonRefs: { "lesson-1": { uri: LESSON_URI, cid: LESSON_CID } },
  });
  (restoreSession as any).mockResolvedValue({ sub: DID });
}

describe("credentials.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putRecordMock.mockResolvedValue({ uri: "at://x", cid: "c" });
  });

  it("writes a lesson progress record to the learner's repo", async () => {
    mockHappyPath();

    const ok = await publishLessonCredential("user-1", "course-1", "lesson-1");

    expect(ok).toBe(true);
    expect(putRecordMock).toHaveBeenCalledTimes(1);
    const call = putRecordMock.mock.calls[0][0];
    expect(call.repo).toBe(DID);
    expect(call.collection).toBe("app.civic.progress");
    expect(call.rkey).toMatch(/^[a-f0-9]{20}$/);
    expect(call.record).toMatchObject({
      $type: "app.civic.progress",
      learnerDid: DID,
      courseRef: { uri: COURSE_URI, cid: COURSE_CID },
      lessonRef: { uri: LESSON_URI, cid: LESSON_CID },
      progressPercent: 100,
    });
    expect(call.record.completedAt).toBeDefined();
  });

  it("is idempotent — same lesson yields the same rkey", async () => {
    mockHappyPath();

    await publishLessonCredential("user-1", "course-1", "lesson-1");
    await publishLessonCredential("user-1", "course-1", "lesson-1");

    expect(putRecordMock).toHaveBeenCalledTimes(2);
    expect(putRecordMock.mock.calls[0][0].rkey).toBe(
      putRecordMock.mock.calls[1][0].rkey
    );
  });

  it("writes a course-level record without lessonRef", async () => {
    mockHappyPath();

    const ok = await publishCourseCredential("user-1", "course-1");

    expect(ok).toBe(true);
    const call = putRecordMock.mock.calls[0][0];
    expect(call.record.lessonRef).toBeUndefined();
    expect(call.record.courseRef.uri).toBe(COURSE_URI);
  });

  it("skips when the learner has no Bluesky DID", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ blueskyDid: null });

    const ok = await publishLessonCredential("user-1", "course-1", "lesson-1");

    expect(ok).toBe(false);
    expect(putRecordMock).not.toHaveBeenCalled();
  });

  it("skips when the course is not published to the Atmosphere", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ blueskyDid: DID });
    (prisma.course.findUnique as any).mockResolvedValue({
      atprotoUri: null,
      atprotoCid: null,
      atprotoLessonRefs: null,
    });

    const ok = await publishLessonCredential("user-1", "course-1", "lesson-1");

    expect(ok).toBe(false);
    expect(putRecordMock).not.toHaveBeenCalled();
  });

  it("skips when there is no OAuth session for the learner", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ blueskyDid: DID });
    (prisma.course.findUnique as any).mockResolvedValue({
      atprotoUri: COURSE_URI,
      atprotoCid: COURSE_CID,
      atprotoLessonRefs: {},
    });
    (restoreSession as any).mockRejectedValue(new Error("no session"));

    const ok = await publishCourseCredential("user-1", "course-1");

    expect(ok).toBe(false);
    expect(putRecordMock).not.toHaveBeenCalled();
  });

  it("refuses to write when session DID != learner DID (self-attestation)", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ blueskyDid: DID });
    (prisma.course.findUnique as any).mockResolvedValue({
      atprotoUri: COURSE_URI,
      atprotoCid: COURSE_CID,
      atprotoLessonRefs: {},
    });
    (restoreSession as any).mockResolvedValue({ sub: "did:plc:someone-else" });

    const ok = await publishCourseCredential("user-1", "course-1");

    expect(ok).toBe(false);
    expect(putRecordMock).not.toHaveBeenCalled();
  });

  it("skips when the lesson has no published app.civic.lesson ref", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ blueskyDid: DID });
    (prisma.course.findUnique as any).mockResolvedValue({
      atprotoUri: COURSE_URI,
      atprotoCid: COURSE_CID,
      atprotoLessonRefs: {},
    });
    (restoreSession as any).mockResolvedValue({ sub: DID });

    const ok = await publishLessonCredential("user-1", "course-1", "lesson-1");

    expect(ok).toBe(false);
    expect(putRecordMock).not.toHaveBeenCalled();
  });

  it("returns false instead of throwing when putRecord fails", async () => {
    mockHappyPath();
    putRecordMock.mockRejectedValue(new Error("PDS unreachable"));

    const ok = await publishLessonCredential("user-1", "course-1", "lesson-1");

    expect(ok).toBe(false);
  });
});
