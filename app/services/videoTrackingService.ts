import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "~/db";
import { videoWatchEvents, lessons } from "~/db/schema";

// ─── Video Tracking Service ───
// Logs video watch events and calculates watch progress per lesson.
// Multi-parameter functions take an object parameter (project convention).

export function logWatchEvent(opts: {
  userId: number;
  lessonId: number;
  eventType: string;
  positionSeconds: number;
}) {
  const { userId, lessonId, eventType, positionSeconds } = opts;
  return db
    .insert(videoWatchEvents)
    .values({
      userId,
      lessonId,
      eventType,
      positionSeconds,
    })
    .returning()
    .get();
}

export function getWatchEvents({
  userId,
  lessonId,
}: {
  userId: number;
  lessonId: number;
}) {
  return db
    .select()
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        eq(videoWatchEvents.lessonId, lessonId)
      )
    )
    .orderBy(videoWatchEvents.createdAt)
    .all();
}

export function getLastWatchPosition({
  userId,
  lessonId,
}: {
  userId: number;
  lessonId: number;
}) {
  const lastEvent = db
    .select()
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        eq(videoWatchEvents.lessonId, lessonId)
      )
    )
    .orderBy(desc(videoWatchEvents.createdAt))
    .limit(1)
    .get();

  return lastEvent?.positionSeconds ?? 0;
}

export function getWatchEventCount({
  userId,
  lessonId,
}: {
  userId: number;
  lessonId: number;
}) {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        eq(videoWatchEvents.lessonId, lessonId)
      )
    )
    .get();

  return result?.count ?? 0;
}

export function getMaxWatchPosition({
  userId,
  lessonId,
}: {
  userId: number;
  lessonId: number;
}) {
  const result = db
    .select({ maxPos: sql<number>`max(${videoWatchEvents.positionSeconds})` })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        eq(videoWatchEvents.lessonId, lessonId)
      )
    )
    .get();

  return result?.maxPos ?? 0;
}

export function calculateWatchProgress(opts: {
  userId: number;
  lessonId: number;
  videoDurationSeconds: number;
}) {
  const { userId, lessonId, videoDurationSeconds } = opts;
  if (videoDurationSeconds <= 0) return 0;

  const maxPosition = getMaxWatchPosition({ userId, lessonId });
  const progress = Math.min(
    Math.round((maxPosition / videoDurationSeconds) * 100),
    100
  );

  return progress;
}

export function hasUserWatchedVideo({
  userId,
  lessonId,
}: {
  userId: number;
  lessonId: number;
}) {
  const count = getWatchEventCount({ userId, lessonId });
  return count > 0;
}

export function hasUserCompletedVideo(opts: {
  userId: number;
  lessonId: number;
  videoDurationSeconds: number;
  completionThreshold: number;
}) {
  const { userId, lessonId, videoDurationSeconds, completionThreshold } = opts;
  const progress = calculateWatchProgress({
    userId,
    lessonId,
    videoDurationSeconds,
  });
  return progress >= completionThreshold;
}

export function getUserWatchHistory(userId: number) {
  return db
    .select({
      lessonId: videoWatchEvents.lessonId,
      eventCount: sql<number>`count(*)`,
      lastPosition: sql<number>`max(${videoWatchEvents.positionSeconds})`,
      lastWatched: sql<string>`max(${videoWatchEvents.createdAt})`,
    })
    .from(videoWatchEvents)
    .where(eq(videoWatchEvents.userId, userId))
    .groupBy(videoWatchEvents.lessonId)
    .all();
}

export function deleteWatchEvents({
  userId,
  lessonId,
}: {
  userId: number;
  lessonId: number;
}) {
  return db
    .delete(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        eq(videoWatchEvents.lessonId, lessonId)
      )
    )
    .returning()
    .all();
}
