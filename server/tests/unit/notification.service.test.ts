import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../utils/db", () => ({
  prisma: {
    notification: {
      create: vi.fn(({ data }: any) => Promise.resolve({ id: "n1", ...data })),
    },
  },
}));

import { notify } from "../../services/notification.service";
import { registerRealtime, ADMIN_ROOM } from "../../utils/realtime";
import { prisma } from "../../utils/db";

const emit = vi.fn();
const to = vi.fn(() => ({ emit }));
const fakeIo = { to, emit } as any;

beforeEach(() => {
  vi.clearAllMocks();
  registerRealtime(fakeIo);
});

describe("notify", () => {
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
