import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/platform/db", () => ({
  prisma: {
    notification: {
      create: vi.fn(({ data }: any) => Promise.resolve({ id: "n1", ...data })),
    },
  },
}));

vi.mock("../../src/modules/push/push.service", () => ({
  sendPushToUser: vi.fn(),
}));

import { sendPushToUser } from "../../src/modules/push/push.service";
import { notify } from "../../src/modules/notifications/notifications.service";
import { registerRealtime, ADMIN_ROOM } from "../../src/platform/realtime";
import { prisma } from "../../src/platform/db";

const emit = vi.fn();
const to = vi.fn(() => ({ emit }));
const fakeIo = { to, emit } as any;

beforeEach(() => {
  vi.clearAllMocks();
  registerRealtime(fakeIo);
});

describe("notify", () => {
  it("also sends a phone push for a learner's inbox item, never for staff notices", async () => {
    await notify({ audience: "user", userId: "u1", title: "Hola", message: "Mensaje" });
    expect(sendPushToUser).toHaveBeenCalledWith("u1", { title: "Hola", body: "Mensaje" });

    vi.mocked(sendPushToUser).mockClear();
    await notify({ audience: "admin", title: "Nueva pregunta", message: "x" });
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("stores staff notices without a learner id and pushes to the admin room only", async () => {
    await notify({ audience: "admin", title: "New Review", message: "m" });

    expect((prisma.notification.create as any).mock.calls[0][0].data).toEqual({
      audience: "admin",
      userId: null,
      title: "New Review",
      message: "m",
    });
    expect(to).toHaveBeenCalledWith(ADMIN_ROOM);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("pushes a learner notice to that learner's room", async () => {
    await notify({ audience: "user", userId: "u1", title: "t", message: "m" });
    expect(to).toHaveBeenCalledWith("user:u1");
  });

  it("broadcasts a learner-wide announcement", async () => {
    await notify({ audience: "user", title: "t", message: "m" });
    expect(to).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("newNotification", expect.anything());
  });

  it("still stores the row when no socket server is running", async () => {
    registerRealtime(null);
    await expect(
      notify({ audience: "admin", title: "t", message: "m" })
    ).resolves.toMatchObject({ id: "n1" });
  });
});
