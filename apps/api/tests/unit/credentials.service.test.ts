import { describe, it, expect, vi, beforeEach } from "vitest";

const { putRecordMock } = vi.hoisted(() => ({
  putRecordMock: vi.fn(),
}));

vi.mock("@atproto/api", () => ({
  AtpAgent: class {
    com = { atproto: { repo: { putRecord: putRecordMock } } };
  },
}));

vi.mock("../../src/platform/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    course: { findUnique: vi.fn() },
    enrollmentLesson: { findMany: vi.fn() },
    enrollment: { findMany: vi.fn() },
    credentialPublication: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("../../src/modules/auth/atprotoOAuth.service", () => ({
  restoreSession: vi.fn(),
}));

import {
  drainCredentialOutbox,
  enqueueCredential,
  publishCourseCredential,
  publishLessonCredential,
} from "../../src/modules/credentials/credentials.service";
import { prisma } from "../../src/platform/db";
import { restoreSession } from "../../src/modules/auth/atprotoOAuth.service";

const DID = "did:plc:learner1";
const COURSE_URI = "at://did:plc:instructor1/app.civic.course/abc";
const COURSE_CID = "bafyreib2rxk3rybk3aobmv5cjuql3bm2twh4jo5uxgf5y5xhj4bvb6vgxa";
const LESSON_URI = "at://did:plc:instructor1/app.civic.lesson/xyz";
const LESSON_CID = "bafyreie5737gdxlw5i64vzichcalba3z2v5n6icifvx5xytvske7mr3hpm";

function mockHappyPath() {
  (prisma.user.findUnique as any).mockResolvedValue({ blueskyDid: DID });
  (prisma.course.findUnique as any).mockResolvedValue({
    atprotoUri: COURSE_URI,
    atprotoCid: COURSE_CID,
    lessonRefs: [{ lessonId: "lesson-1", uri: LESSON_URI, cid: LESSON_CID }],
  });
  (restoreSession as any).mockResolvedValue({ sub: DID });
}

describe("credentials.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putRecordMock.mockResolvedValue({ data: { uri: "at://x", cid: "c" } });
  });

  it("writes a lesson progress record to the learner's repo", async () => {
    mockHappyPath();

    const out = await publishLessonCredential("user-1", "course-1", "lesson-1");

    expect(out).toEqual({ status: "published", uri: "at://x", cid: "c" });
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

    const out = await publishCourseCredential("user-1", "course-1");

    expect(out.status).toBe("published");
    const call = putRecordMock.mock.calls[0][0];
    expect(call.record.lessonRef).toBeUndefined();
    expect(call.record.courseRef.uri).toBe(COURSE_URI);
  });

  it("skips when the learner has no Bluesky DID", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ blueskyDid: null });

    const out = await publishLessonCredential("user-1", "course-1", "lesson-1");

    expect(out.status).toBe("skipped");
    expect(putRecordMock).not.toHaveBeenCalled();
  });

  it("skips when the course is not published to the Atmosphere", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ blueskyDid: DID });
    (prisma.course.findUnique as any).mockResolvedValue({
      atprotoUri: null,
      atprotoCid: null,
      lessonRefs: [],
    });

    const out = await publishLessonCredential("user-1", "course-1", "lesson-1");

    expect(out.status).toBe("skipped");
    expect(putRecordMock).not.toHaveBeenCalled();
  });

  it("skips when there is no OAuth session for the learner", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ blueskyDid: DID });
    (prisma.course.findUnique as any).mockResolvedValue({
      atprotoUri: COURSE_URI,
      atprotoCid: COURSE_CID,
      lessonRefs: [],
    });
    (restoreSession as any).mockRejectedValue(new Error("no session"));

    const out = await publishCourseCredential("user-1", "course-1");

    expect(out.status).toBe("skipped");
    expect(putRecordMock).not.toHaveBeenCalled();
  });

  it("refuses to write when session DID != learner DID (self-attestation)", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ blueskyDid: DID });
    (prisma.course.findUnique as any).mockResolvedValue({
      atprotoUri: COURSE_URI,
      atprotoCid: COURSE_CID,
      lessonRefs: [],
    });
    (restoreSession as any).mockResolvedValue({ sub: "did:plc:someone-else" });

    const out = await publishCourseCredential("user-1", "course-1");

    expect(out.status).toBe("skipped");
    expect(putRecordMock).not.toHaveBeenCalled();
  });

  it("skips when the lesson has no published app.civic.lesson ref", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ blueskyDid: DID });
    (prisma.course.findUnique as any).mockResolvedValue({
      atprotoUri: COURSE_URI,
      atprotoCid: COURSE_CID,
      lessonRefs: [],
    });
    (restoreSession as any).mockResolvedValue({ sub: DID });

    const out = await publishLessonCredential("user-1", "course-1", "lesson-1");

    expect(out.status).toBe("skipped");
    expect(putRecordMock).not.toHaveBeenCalled();
  });

  it("reports a retryable failure instead of throwing when putRecord fails", async () => {
    mockHappyPath();
    putRecordMock.mockRejectedValue(new Error("PDS unreachable"));

    const out = await publishLessonCredential("user-1", "course-1", "lesson-1");

    expect(out).toEqual({ status: "failed", error: "PDS unreachable" });
  });

  it("validates the record against the app.civic.progress lexicon before writing", async () => {
    mockHappyPath();
    (prisma.course.findUnique as any).mockResolvedValue({
      atprotoUri: "not-an-at-uri",
      atprotoCid: COURSE_CID,
      lessonRefs: [],
    });

    const out = await publishCourseCredential("user-1", "course-1");

    expect(out.status).toBe("skipped");
    expect(putRecordMock).not.toHaveBeenCalled();
  });
});

describe("credential outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putRecordMock.mockResolvedValue({ data: { uri: "at://x", cid: "c" } });
    (prisma.credentialPublication.updateMany as any).mockResolvedValue({ count: 1 });
  });

  it("queues nothing without the learner's consent", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ credentialsConsent: false });

    expect(await enqueueCredential("user-1", "course-1", "lesson-1")).toBe(false);
    expect(prisma.credentialPublication.upsert).not.toHaveBeenCalled();
  });

  it("queues with consent, keyed per learner × course × lesson", async () => {
    (prisma.user.findUnique as any).mockResolvedValue({ credentialsConsent: true });
    (prisma.credentialPublication.findUnique as any).mockResolvedValue(null);

    expect(await enqueueCredential("user-1", "course-1", "lesson-1")).toBe(true);
    expect((prisma.credentialPublication.upsert as any).mock.calls[0][0].where).toEqual({
      key: "user-1:course-1:lesson-1",
    });
  });

  it("marks a row published with the record's uri", async () => {
    mockHappyPath();
    (prisma.credentialPublication.findMany as any).mockResolvedValue([
      { id: "p1", userId: "user-1", courseId: "course-1", lessonId: "lesson-1", attempts: 0 },
    ]);

    await drainCredentialOutbox();

    const update = (prisma.credentialPublication.update as any).mock.calls[0][0];
    expect(update.data).toMatchObject({ status: "published", uri: "at://x", cid: "c" });
  });

  it("keeps a failed row pending with backoff, then gives up after max attempts", async () => {
    mockHappyPath();
    putRecordMock.mockRejectedValue(new Error("PDS unreachable"));
    (prisma.credentialPublication.findMany as any).mockResolvedValue([
      { id: "p1", userId: "user-1", courseId: "course-1", lessonId: null, attempts: 0 },
    ]);

    await drainCredentialOutbox();
    let data = (prisma.credentialPublication.update as any).mock.calls[0][0].data;
    expect(data.status).toBe("pending");
    expect(data.attempts).toBe(1);
    expect(data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    vi.clearAllMocks();
    (prisma.credentialPublication.updateMany as any).mockResolvedValue({ count: 1 });
    mockHappyPath();
    putRecordMock.mockRejectedValue(new Error("PDS unreachable"));
    (prisma.credentialPublication.findMany as any).mockResolvedValue([
      { id: "p1", userId: "user-1", courseId: "course-1", lessonId: null, attempts: 7 },
    ]);
    await drainCredentialOutbox();
    data = (prisma.credentialPublication.update as any).mock.calls[0][0].data;
    expect(data.status).toBe("failed");
  });

  it("skips a row another instance already claimed", async () => {
    (prisma.credentialPublication.findMany as any).mockResolvedValue([
      { id: "p1", userId: "user-1", courseId: "course-1", lessonId: null, attempts: 0 },
    ]);
    (prisma.credentialPublication.updateMany as any)
      .mockResolvedValueOnce({ count: 0 }) // stale-processing reset
      .mockResolvedValueOnce({ count: 0 }); // claim lost

    expect(await drainCredentialOutbox()).toBe(0);
    expect(putRecordMock).not.toHaveBeenCalled();
  });
});
