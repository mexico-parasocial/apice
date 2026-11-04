import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_KEY = "@apice/offline-progress-queue";

export interface QueuedProgress {
  id: string;
  courseId: string;
  lessonId: string;
  completed?: boolean;
  watchedSeconds?: number;
  timestamp: number;
}

let queue: QueuedProgress[] = [];
let loaded = false;

async function ensureLoaded() {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (raw) queue = JSON.parse(raw);
  } catch {
    queue = [];
  }
  loaded = true;
}

async function persist() {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or unavailable — silently drop
  }
}

/**
 * Queue a progress update for later delivery.
 * Returns the queued item so the caller can optimistically update local state.
 */
export async function enqueueProgress(update: Omit<QueuedProgress, "id" | "timestamp">): Promise<QueuedProgress> {
  await ensureLoaded();
  const item: QueuedProgress = {
    ...update,
    id: `${update.lessonId}-${Date.now()}`,
    timestamp: Date.now(),
  };
  queue.push(item);
  await persist();
  return item;
}

/**
 * Drain the queue — returns all items and clears storage.
 * The caller is responsible for replaying them against the server.
 */
export async function drainProgressQueue(): Promise<QueuedProgress[]> {
  await ensureLoaded();
  const items = [...queue];
  queue = [];
  await persist();
  return items;
}

/**
 * Peek at queued items without draining.
 */
export async function peekProgressQueue(): Promise<QueuedProgress[]> {
  await ensureLoaded();
  return [...queue];
}

/**
 * Remove a specific item from the queue (after successful server delivery).
 */
export async function removeProgressItem(id: string): Promise<void> {
  await ensureLoaded();
  queue = queue.filter((item) => item.id !== id);
  await persist();
}

/**
 * Reset module-level state. For test isolation only.
 */
export function _resetQueueForTesting() {
  queue = [];
  loaded = false;
}
