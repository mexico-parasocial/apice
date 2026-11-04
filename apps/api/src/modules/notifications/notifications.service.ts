import { prisma } from "../../platform/db";
import { ADMIN_ROOM, emitToAll, emitToRoom, userRoom } from "../../platform/realtime";

export type NotificationAudience = "admin" | "user";

interface NotifyInput {
  audience: NotificationAudience;
  /** Required for a learner's inbox; omit for a learner-wide announcement. */
  userId?: string;
  title: string;
  message: string;
}

export const NEW_NOTIFICATION_EVENT = "newNotification";

/**
 * Stores a notification and pushes it to whoever should see it right now.
 *
 * - audience "admin": staff feed; pushed to every connected admin.
 * - audience "user" + userId: that learner's inbox; pushed to their sockets.
 * - audience "user" without userId: announcement to every learner.
 */
export async function notify(input: NotifyInput) {
  const notification = await prisma.notification.create({
    data: {
      audience: input.audience,
      userId: input.userId ?? null,
      title: input.title,
      message: input.message,
    },
  });
  publishNotification(notification);
  return notification;
}

/** Realtime fan-out for a notification row that is already stored. */
export function publishNotification(notification: {
  audience: string;
  userId: string | null;
}) {
  if (notification.audience === "admin") {
    emitToRoom(ADMIN_ROOM, NEW_NOTIFICATION_EVENT, notification);
  } else if (notification.userId) {
    emitToRoom(userRoom(notification.userId), NEW_NOTIFICATION_EVENT, notification);
  } else {
    emitToAll(NEW_NOTIFICATION_EVENT, notification);
  }
}
