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
  toggleBookmark,
  isLessonBookmarked,
  getBookmarkedLessonIds,
} from "./bookmarkService";

// Create a module with the given number of lessons in the test course.
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

describe("bookmarkService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("toggleBookmark", () => {
    it("adds a bookmark when none exists", () => {
      const [lessonId] = createLessons(1);

      const result = toggleBookmark({ userId: base.user.id, lessonId });

      expect(result.bookmarked).toBe(true);
      expect(isLessonBookmarked({ userId: base.user.id, lessonId })).toBe(true);
    });

    it("removes the bookmark when one already exists", () => {
      const [lessonId] = createLessons(1);

      toggleBookmark({ userId: base.user.id, lessonId });
      const result = toggleBookmark({ userId: base.user.id, lessonId });

      expect(result.bookmarked).toBe(false);
      expect(isLessonBookmarked({ userId: base.user.id, lessonId })).toBe(false);
    });
  });

  describe("isLessonBookmarked", () => {
    it("returns false when the lesson is not bookmarked", () => {
      const [lessonId] = createLessons(1);
      expect(isLessonBookmarked({ userId: base.user.id, lessonId })).toBe(false);
    });
  });

  describe("getBookmarkedLessonIds", () => {
    it("returns only the bookmarked lessons within the course", () => {
      const [a, b, c] = createLessons(3);

      toggleBookmark({ userId: base.user.id, lessonId: a });
      toggleBookmark({ userId: base.user.id, lessonId: c });

      const ids = getBookmarkedLessonIds({
        userId: base.user.id,
        courseId: base.course.id,
      });

      expect(ids.sort()).toEqual([a, c].sort());
      expect(ids).not.toContain(b);
    });

    it("returns an empty array when nothing is bookmarked", () => {
      createLessons(2);
      expect(
        getBookmarkedLessonIds({
          userId: base.user.id,
          courseId: base.course.id,
        })
      ).toEqual([]);
    });
  });
});
