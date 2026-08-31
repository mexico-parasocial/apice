import { describe, it, expect, beforeEach } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  enqueueProgress,
  drainProgressQueue,
  peekProgressQueue,
  removeProgressItem,
  _resetQueueForTesting,
} from "./offlineProgressQueue";

// Mock AsyncStorage
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

const mockStorage = AsyncStorage as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.getItem.mockResolvedValue(null);
  mockStorage.setItem.mockResolvedValue(undefined);
  _resetQueueForTesting();
});

describe("offlineProgressQueue", () => {
  it("enqueues a progress update", async () => {
    const item = await enqueueProgress({
      courseId: "course-1",
      lessonId: "lesson-1",
      completed: true,
      watchedSeconds: 120,
    });

    expect(item.courseId).toBe("course-1");
    expect(item.lessonId).toBe("lesson-1");
    expect(item.completed).toBe(true);
    expect(item.watchedSeconds).toBe(120);
    expect(item.id).toContain("lesson-1");
    expect(item.timestamp).toBeGreaterThan(0);
    expect(mockStorage.setItem).toHaveBeenCalled();
  });

  it("enqueues multiple items and drains them in order", async () => {
    await enqueueProgress({ courseId: "c1", lessonId: "l1", completed: true });
    await enqueueProgress({ courseId: "c1", lessonId: "l2", watchedSeconds: 30 });

    const items = await drainProgressQueue();
    expect(items).toHaveLength(2);
    expect(items[0].lessonId).toBe("l1");
    expect(items[1].lessonId).toBe("l2");

    // Storage should be cleared after drain
    expect(mockStorage.setItem).toHaveBeenLastCalledWith(
      expect.any(String),
      "[]"
    );
  });

  it("drains an empty queue", async () => {
    const items = await drainProgressQueue();
    expect(items).toHaveLength(0);
  });

  it("loads from storage on first access", async () => {
    const stored = [
      { id: "stored-1", courseId: "c1", lessonId: "l1", completed: true, timestamp: 1000 },
    ];
    mockStorage.getItem.mockResolvedValue(JSON.stringify(stored));

    // Reset so ensureLoaded re-reads from storage
    _resetQueueForTesting();

    const items = await peekProgressQueue();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("stored-1");
  });

  it("peek does not drain the queue", async () => {
    await enqueueProgress({ courseId: "c1", lessonId: "l1" });

    // Clear setItem call history from enqueueProgress
    mockStorage.setItem.mockClear();

    const items = await peekProgressQueue();
    expect(items).toHaveLength(1);

    // Peek again — should still be there
    const items2 = await peekProgressQueue();
    expect(items2).toHaveLength(1);

    // setItem should NOT have been called by peek
    expect(mockStorage.setItem).not.toHaveBeenCalled();
  });

  it("removes a specific item from the queue", async () => {
    await enqueueProgress({ courseId: "c1", lessonId: "l1" });
    const item2 = await enqueueProgress({ courseId: "c1", lessonId: "l2" });
    await enqueueProgress({ courseId: "c1", lessonId: "l3" });

    await removeProgressItem(item2.id);

    const items = await peekProgressQueue();
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.id === item2.id)).toBeUndefined();
  });
});
