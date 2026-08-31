import { useEffect, useRef, useCallback } from "react";
import { useNetInfo } from "./useNetInfo";
import {
  drainProgressQueue,
  enqueueProgress,
  QueuedProgress,
} from "../utils/offlineProgressQueue";

interface UseOfflineProgressOptions {
  /** Called for each queued item when connectivity returns. Replay against the server. */
  onReplay: (item: QueuedProgress) => Promise<void>;
  /** Optional: called after all queued items have been replayed. */
  onDrainComplete?: (count: number) => void;
}

/**
 * Hooks together: listens for connectivity changes, replays queued progress
 * updates when back online, and exposes `queueProgress` for callers to
 * enqueue updates while offline.
 *
 * Usage:
 * ```ts
 * const { isOffline, queueProgress } = useOfflineProgress({
 *   onReplay: async (item) => {
 *     await api.post("/update-progress", item);
 *   },
 * });
 * ```
 */
export function useOfflineProgress({ onReplay, onDrainComplete }: UseOfflineProgressOptions) {
  const { isConnected, isInternetReachable } = useNetInfo();
  const isOnline = isConnected && isInternetReachable !== false;
  const wasOffline = useRef(!isOnline);
  const draining = useRef(false);

  const queueProgress = useCallback(
    async (update: Omit<QueuedProgress, "id" | "timestamp">) => {
      return enqueueProgress(update);
    },
    []
  );

  // When coming back online, drain the queue
  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      return;
    }

    if (!wasOffline.current || draining.current) return;
    wasOffline.current = false;
    draining.current = true;

    (async () => {
      try {
        const items = await drainProgressQueue();
        if (items.length === 0) {
          draining.current = false;
          return;
        }
        for (const item of items) {
          try {
            await onReplay(item);
          } catch {
            // Re-enqueue failed items
            await enqueueProgress(item);
          }
        }
        onDrainComplete?.(items.length);
      } finally {
        draining.current = false;
      }
    })();
  }, [isOnline, onReplay, onDrainComplete]);

  return { isOffline: !isOnline, queueProgress };
}
