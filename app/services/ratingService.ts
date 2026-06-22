import { eq, and, avg, count, sql } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings } from "~/db/schema";

export function upsertCourseRating({
  userId,
  courseId,
  rating,
}: {
  userId: number;
  courseId: number;
  rating: number;
}) {
  return db
    .insert(courseRatings)
    .values({ userId, courseId, rating })
    .onConflictDoUpdate({
      target: [courseRatings.userId, courseRatings.courseId],
      set: { rating },
    })
    .run();
}

export function getUserCourseRating({
  userId,
  courseId,
}: {
  userId: number;
  courseId: number;
}): number | null {
  const row = db
    .select({ rating: courseRatings.rating })
    .from(courseRatings)
    .where(
      and(eq(courseRatings.userId, userId), eq(courseRatings.courseId, courseId))
    )
    .get();
  return row?.rating ?? null;
}

export function getCourseAverageRating(courseId: number): {
  average: number | null;
  count: number;
} {
  const row = db
    .select({
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get();

  return {
    average: row?.average ?? null,
    count: row?.count ?? 0,
  };
}
