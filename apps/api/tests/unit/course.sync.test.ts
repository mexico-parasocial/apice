import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/platform/db", () => ({ prisma: {} }));

import { syncCourseContent } from "../../src/modules/courses/courses.service";

function fakeClient(withProgress: string[]) {
  return {
    courseSection: {
      findMany: vi.fn(async () => [
        {
          id: "s1",
          title: "Intro",
          lessons: [
            { id: "l1", title: "Welcome" },
            { id: "l2", title: "Rights" },
          ],
        },
      ]),
      update: vi.fn(async () => ({ id: "s1" })),
      create: vi.fn(async () => ({ id: "s2" })),
      delete: vi.fn(),
    },
    courseLesson: { delete: vi.fn(), update: vi.fn(), create: vi.fn() },
    lessonRef: { deleteMany: vi.fn() },
    enrollmentLesson: {
      groupBy: vi.fn(async () => withProgress.map((lessonId) => ({ lessonId, _count: { _all: 3 } }))),
    },
  } as any;
}

// The payload drops lesson l2 ("Rights").
const payload = [{ id: "l1", title: "Welcome", videoSection: "Intro" }];

describe("syncCourseContent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses to delete a lesson that has learner progress", async () => {
    const client = fakeClient(["l2"]);
    await expect(syncCourseContent("c1", payload, client)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('"Rights"'),
    });
    expect(client.courseLesson.delete).not.toHaveBeenCalled();
  });

  it("deletes it when the editor confirms", async () => {
    const client = fakeClient(["l2"]);
    await syncCourseContent("c1", payload, client, { confirmDeleteLessonsWithProgress: true });
    expect(client.courseLesson.delete).toHaveBeenCalledWith({ where: { id: "l2" } });
  });

  it("deletes a lesson nobody has progress on without asking", async () => {
    const client = fakeClient([]);
    await syncCourseContent("c1", payload, client);
    expect(client.courseLesson.delete).toHaveBeenCalledWith({ where: { id: "l2" } });
  });
});
