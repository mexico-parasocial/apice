import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../../src/platform/db", () => ({
  prisma: {
    course: { findUnique: vi.fn() },
    courseLesson: { findUnique: vi.fn() },
    enrollment: { findUnique: vi.fn() },
    question: { create: vi.fn(), findUnique: vi.fn() },
    answer: { create: vi.fn() },
    notification: { create: vi.fn(async ({ data }: any) => ({ id: "n", ...data })) },
  },
}));
vi.mock("../../src/platform/redis", () => ({ redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() } }));

let role = "user";
vi.mock("../../src/http/auth", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: "learner-1", name: "Ana", role };
    next();
  },
  authorizeRoles: () => (_req: any, _res: any, next: any) => next(),
}));

import communityRouter from "../../src/modules/community/community.routes";
import { ErrorMiddleware } from "../../src/http/error";
import { prisma } from "../../src/platform/db";

const app = express();
app.use(express.json());
app.use("/api/v1", communityRouter);
app.use(ErrorMiddleware);

const m = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const body = { question: "¿Qué dice el artículo 9?", courseId: "course-1", contentId: "lesson-1" };

beforeEach(() => {
  vi.clearAllMocks();
  role = "user";
  m(prisma.course.findUnique).mockResolvedValue({ id: "course-1" });
  m(prisma.courseLesson.findUnique).mockResolvedValue({
    id: "lesson-1",
    title: "Derechos",
    section: { courseId: "course-1" },
  });
  m(prisma.question.create).mockResolvedValue({ id: "q1" });
});

describe("PUT /api/v1/add-question", () => {
  it("403s a learner who is not enrolled in the course", async () => {
    m(prisma.enrollment.findUnique).mockResolvedValue(null);
    const res = await request(app).put("/api/v1/add-question").send(body);
    expect(res.status).toBe(403);
    expect(prisma.question.create).not.toHaveBeenCalled();
  });

  it("400s a lesson that belongs to a different course", async () => {
    m(prisma.courseLesson.findUnique).mockResolvedValue({
      id: "lesson-1",
      title: "x",
      section: { courseId: "other-course" },
    });
    const res = await request(app).put("/api/v1/add-question").send(body);
    expect(res.status).toBe(400);
  });

  it("lets an enrolled learner ask, and notifies staff — not the learner", async () => {
    m(prisma.enrollment.findUnique).mockResolvedValue({ id: "e1" });
    const res = await request(app).put("/api/v1/add-question").send(body);
    expect(res.status).toBe(200);
    const data = m(prisma.notification.create).mock.calls[0][0].data;
    expect(data.audience).toBe("admin");
    expect(data.userId).toBeNull();
  });
});
