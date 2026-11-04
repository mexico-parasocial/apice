import { Expo } from "expo-server-sdk";
import { prisma } from "../../platform/db";
import { log } from "../../platform/logger";

const expo = new Expo();

/**
 * Fire-and-forget push to every device registered by a user. Never throws:
 * a push failure must not break the request that triggered it. Stale tokens
 * (Expo reports DeviceNotRegistered) are pruned on the spot.
 */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; data?: Record<string, unknown> }
): Promise<void> {
  try {
    const rows = await prisma.pushToken.findMany({ where: { userId } });
    const live = rows.filter((row) => Expo.isExpoPushToken(row.token));
    if (live.length === 0) return;

    const messages = live.map((row) => ({
      to: row.token,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: "default" as const,
    }));

    // expo-server-sdk chunks internally at 100 messages per request.
    const receipts = await expo.sendPushNotificationsAsync(messages);

    const deadIds: string[] = [];
    receipts.forEach((receipt, i) => {
      if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") {
        deadIds.push(live[i].id);
      }
    });
    if (deadIds.length > 0) {
      await prisma.pushToken.deleteMany({ where: { id: { in: deadIds } } });
    }
  } catch (err) {
    log("push").warn({ err }, "push delivery failed (non-blocking)");
  }
}
