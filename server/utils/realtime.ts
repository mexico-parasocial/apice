import type { Server as SocketIOServer } from "socket.io";

/**
 * The one Socket.IO server, registered by socketServer.ts at boot.
 *
 * Emits are server-side only: clients never relay events to other clients.
 * When no server is registered (tests, the indexer worker, scripts), emits
 * are silently dropped — the notification row in Postgres is the record,
 * realtime delivery is a convenience on top.
 */
let io: SocketIOServer | null = null;

export const ADMIN_ROOM = "admins";
export const userRoom = (userId: string) => `user:${userId}`;

export function registerRealtime(server: SocketIOServer | null) {
  io = server;
}

export function emitToRoom(room: string, event: string, payload: unknown) {
  io?.to(room).emit(event, payload);
}

export function emitToAll(event: string, payload: unknown) {
  io?.emit(event, payload);
}
