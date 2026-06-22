import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import {
  logWatchEvent,
  getWatchEvents,
  getLastWatchPosition,
  getWatchEventCount,
  getMaxWatchPosition,
  calculateWatchProgress,
  hasUserWatchedVideo,
  hasUserCompletedVideo,
  getUserWatchHistory,
  deleteWatchEvents,
} from "./videoTrackingService";

// Create a module with `count` lessons and return their ids.
function createLessons(count: number): number[] {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Module 1", position: 1 })
    .returning()
    .get();

  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const lesson = testDb
      .insert(schema.lessons)
      .values({ moduleId: mod.id, title: `Lesson ${i + 1}`, position: i + 1 })
      .returning()
      .get();
    ids.push(lesson.id);
  }
  return ids;
}

describe("videoTrackingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("logWatchEvent", () => {
    it("records a watch event", () => {
      const [lessonId] = createLessons(1);

      const event = logWatchEvent({
        userId: base.user.id,
        lessonId,
        eventType: "progress",
        positionSeconds: 12,
      });

      expect(event.userId).toBe(base.user.id);
      expect(event.lessonId).toBe(lessonId);
      expect(event.eventType).toBe("progress");
      expect(event.positionSeconds).toBe(12);
    });
  });

  describe("getWatchEvents", () => {
    it("returns all events for a user/lesson pair", () => {
      const [lessonId] = createLessons(1);
      logWatchEvent({ userId: base.user.id, lessonId, eventType: "play", positionSeconds: 0 });
      logWatchEvent({ userId: base.user.id, lessonId, eventType: "progress", positionSeconds: 5 });

      const events = getWatchEvents({ userId: base.user.id, lessonId });
      expect(events).toHaveLength(2);
    });

    it("does not return events for other lessons", () => {
      const [a, b] = createLessons(2);
      logWatchEvent({ userId: base.user.id, lessonId: a, eventType: "play", positionSeconds: 0 });

      expect(getWatchEvents({ userId: base.user.id, lessonId: b })).toHaveLength(0);
    });
  });

  describe("getWatchEventCount", () => {
    it("counts events for a user/lesson pair", () => {
      const [lessonId] = createLessons(1);
      logWatchEvent({ userId: base.user.id, lessonId, eventType: "play", positionSeconds: 0 });
      logWatchEvent({ userId: base.user.id, lessonId, eventType: "progress", positionSeconds: 5 });

      expect(getWatchEventCount({ userId: base.user.id, lessonId })).toBe(2);
    });

    it("returns 0 when there are no events", () => {
      const [lessonId] = createLessons(1);
      expect(getWatchEventCount({ userId: base.user.id, lessonId })).toBe(0);
    });
  });

  describe("getLastWatchPosition", () => {
    it("returns the logged position", () => {
      const [lessonId] = createLessons(1);
      logWatchEvent({ userId: base.user.id, lessonId, eventType: "progress", positionSeconds: 42 });

      expect(getLastWatchPosition({ userId: base.user.id, lessonId })).toBe(42);
    });

    it("returns 0 when there are no events", () => {
      const [lessonId] = createLessons(1);
      expect(getLastWatchPosition({ userId: base.user.id, lessonId })).toBe(0);
    });
  });

  describe("getMaxWatchPosition", () => {
    it("returns the furthest position reached", () => {
      const [lessonId] = createLessons(1);
      logWatchEvent({ userId: base.user.id, lessonId, eventType: "progress", positionSeconds: 30 });
      logWatchEvent({ userId: base.user.id, lessonId, eventType: "progress", positionSeconds: 10 });

      expect(getMaxWatchPosition({ userId: base.user.id, lessonId })).toBe(30);
    });

    it("returns 0 when there are no events", () => {
      const [lessonId] = createLessons(1);
      expect(getMaxWatchPosition({ userId: base.user.id, lessonId })).toBe(0);
    });
  });

  describe("calculateWatchProgress", () => {
    it("returns the percentage of the video watched", () => {
      const [lessonId] = createLessons(1);
      logWatchEvent({ userId: base.user.id, lessonId, eventType: "progress", positionSeconds: 30 });

      expect(
        calculateWatchProgress({
          userId: base.user.id,
          lessonId,
          videoDurationSeconds: 60,
        })
      ).toBe(50);
    });

    it("caps progress at 100", () => {
      const [lessonId] = createLessons(1);
      logWatchEvent({ userId: base.user.id, lessonId, eventType: "progress", positionSeconds: 120 });

      expect(
        calculateWatchProgress({
          userId: base.user.id,
          lessonId,
          videoDurationSeconds: 60,
        })
      ).toBe(100);
    });

    it("returns 0 for a non-positive duration", () => {
      const [lessonId] = createLessons(1);
      logWatchEvent({ userId: base.user.id, lessonId, eventType: "progress", positionSeconds: 30 });

      expect(
        calculateWatchProgress({
          userId: base.user.id,
          lessonId,
          videoDurationSeconds: 0,
        })
      ).toBe(0);
    });
  });

  describe("hasUserWatchedVideo", () => {
    it("returns true once an event is logged", () => {
      const [lessonId] = createLessons(1);
      logWatchEvent({ userId: base.user.id, lessonId, eventType: "play", positionSeconds: 0 });
      expect(hasUserWatchedVideo({ userId: base.user.id, lessonId })).toBe(true);
    });

    it("returns false when nothing was watched", () => {
      const [lessonId] = createLessons(1);
      expect(hasUserWatchedVideo({ userId: base.user.id, lessonId })).toBe(false);
    });
  });

  describe("hasUserCompletedVideo", () => {
    it("returns true when progress meets the threshold", () => {
      const [lessonId] = createLessons(1);
      logWatchEvent({ userId: base.user.id, lessonId, eventType: "progress", positionSeconds: 55 });

      expect(
        hasUserCompletedVideo({
          userId: base.user.id,
          lessonId,
          videoDurationSeconds: 60,
          completionThreshold: 90,
        })
      ).toBe(true);
    });

    it("returns false when progress is below the threshold", () => {
      const [lessonId] = createLessons(1);
      logWatchEvent({ userId: base.user.id, lessonId, eventType: "progress", positionSeconds: 30 });

      expect(
        hasUserCompletedVideo({
          userId: base.user.id,
          lessonId,
          videoDurationSeconds: 60,
          completionThreshold: 90,
        })
      ).toBe(false);
    });
  });

  describe("getUserWatchHistory", () => {
    it("aggregates events per lesson for a user", () => {
      const [a, b] = createLessons(2);
      logWatchEvent({ userId: base.user.id, lessonId: a, eventType: "progress", positionSeconds: 10 });
      logWatchEvent({ userId: base.user.id, lessonId: a, eventType: "progress", positionSeconds: 20 });
      logWatchEvent({ userId: base.user.id, lessonId: b, eventType: "progress", positionSeconds: 5 });

      const history = getUserWatchHistory(base.user.id);
      expect(history).toHaveLength(2);

      const lessonA = history.find((h) => h.lessonId === a);
      expect(lessonA?.eventCount).toBe(2);
      expect(lessonA?.lastPosition).toBe(20);
    });
  });

  describe("deleteWatchEvents", () => {
    it("removes all events for a user/lesson pair", () => {
      const [lessonId] = createLessons(1);
      logWatchEvent({ userId: base.user.id, lessonId, eventType: "progress", positionSeconds: 10 });

      deleteWatchEvents({ userId: base.user.id, lessonId });

      expect(getWatchEventCount({ userId: base.user.id, lessonId })).toBe(0);
    });
  });
});
