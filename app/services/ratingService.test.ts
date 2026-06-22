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
  upsertCourseRating,
  getUserCourseRating,
  getCourseAverageRating,
} from "./ratingService";

// Create an additional user so multiple ratings can be recorded.
function createUser(email: string): number {
  return testDb
    .insert(schema.users)
    .values({ name: email, email, role: schema.UserRole.Student })
    .returning()
    .get().id;
}

describe("ratingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("upsertCourseRating", () => {
    it("records a new rating for a user/course pair", () => {
      upsertCourseRating({
        userId: base.user.id,
        courseId: base.course.id,
        rating: 4,
      });

      expect(
        getUserCourseRating({ userId: base.user.id, courseId: base.course.id })
      ).toBe(4);
    });

    it("updates the existing rating instead of inserting a duplicate", () => {
      upsertCourseRating({
        userId: base.user.id,
        courseId: base.course.id,
        rating: 2,
      });
      upsertCourseRating({
        userId: base.user.id,
        courseId: base.course.id,
        rating: 5,
      });

      expect(
        getUserCourseRating({ userId: base.user.id, courseId: base.course.id })
      ).toBe(5);

      // Only one row should exist for this user/course pair.
      const { count } = getCourseAverageRating(base.course.id);
      expect(count).toBe(1);
    });
  });

  describe("getUserCourseRating", () => {
    it("returns null when the user has not rated the course", () => {
      expect(
        getUserCourseRating({ userId: base.user.id, courseId: base.course.id })
      ).toBeNull();
    });
  });

  describe("getCourseAverageRating", () => {
    it("returns the average and count across all ratings", () => {
      const other = createUser("other@example.com");

      upsertCourseRating({
        userId: base.user.id,
        courseId: base.course.id,
        rating: 4,
      });
      upsertCourseRating({
        userId: other,
        courseId: base.course.id,
        rating: 2,
      });

      const result = getCourseAverageRating(base.course.id);
      expect(result.average).toBe(3);
      expect(result.count).toBe(2);
    });

    it("returns null average and zero count when there are no ratings", () => {
      const result = getCourseAverageRating(base.course.id);
      expect(result.average).toBeNull();
      expect(result.count).toBe(0);
    });
  });
});
