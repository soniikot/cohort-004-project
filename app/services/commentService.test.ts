import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
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
  getLessonComments,
  getCommentCount,
  getCommentById,
  addComment,
  addReply,
  editComment,
  deleteComment,
} from "./commentService";

// Create a lesson (with module) in the test db and return its id.
function createLesson(courseId: number): number {
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId, title: "Module 1", position: 1 })
    .returning()
    .get();
  const lesson = testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Lesson 1", position: 1 })
    .returning()
    .get();
  return lesson.id;
}

let lessonId: number;

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  lessonId = createLesson(base.course.id);
});

describe("addComment / getLessonComments", () => {
  it("creates a top-level comment with author info", () => {
    addComment(lessonId, base.user.id, "First!");

    const comments = getLessonComments(lessonId);
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe("First!");
    expect(comments[0].author.name).toBe("Test User");
    expect(comments[0].replies).toEqual([]);
  });

  it("orders top-level comments newest-first", () => {
    const a = addComment(lessonId, base.user.id, "older");
    // Force a later timestamp on the second comment
    const b = addComment(lessonId, base.user.id, "newer");
    testDb
      .update(schema.lessonComments)
      .set({ createdAt: "2020-01-01T00:00:00.000Z" })
      .where(eqId(a.id))
      .run();
    testDb
      .update(schema.lessonComments)
      .set({ createdAt: "2025-01-01T00:00:00.000Z" })
      .where(eqId(b.id))
      .run();

    const comments = getLessonComments(lessonId);
    expect(comments.map((c) => c.body)).toEqual(["newer", "older"]);
  });
});

describe("addReply", () => {
  it("nests replies under their root, oldest-first", () => {
    const root = addComment(lessonId, base.user.id, "question");
    const r1 = addReply(lessonId, base.instructor.id, root.id, "answer 1");
    const r2 = addReply(lessonId, base.user.id, root.id, "answer 2");
    testDb
      .update(schema.lessonComments)
      .set({ createdAt: "2025-01-01T00:00:00.000Z" })
      .where(eqId(r1!.id))
      .run();
    testDb
      .update(schema.lessonComments)
      .set({ createdAt: "2025-02-01T00:00:00.000Z" })
      .where(eqId(r2!.id))
      .run();

    const comments = getLessonComments(lessonId);
    expect(comments).toHaveLength(1);
    expect(comments[0].replies.map((r) => r.body)).toEqual([
      "answer 1",
      "answer 2",
    ]);
  });

  it("re-parents a reply-to-a-reply onto the root (one-level threading)", () => {
    const root = addComment(lessonId, base.user.id, "root");
    const reply = addReply(lessonId, base.user.id, root.id, "reply");
    const nested = addReply(lessonId, base.user.id, reply!.id, "nested");

    // nested should point at the root, not at the reply
    expect(getCommentById(nested!.id)?.parentId).toBe(root.id);
    const comments = getLessonComments(lessonId);
    expect(comments[0].replies).toHaveLength(2);
  });

  it("returns null for an unknown parent", () => {
    expect(addReply(lessonId, base.user.id, 9999, "orphan")).toBeNull();
  });
});

describe("editComment", () => {
  it("updates the body and stamps editedAt", () => {
    const c = addComment(lessonId, base.user.id, "typo");
    expect(getCommentById(c.id)?.editedAt).toBeNull();

    editComment(c.id, "fixed");
    const updated = getCommentById(c.id);
    expect(updated?.body).toBe("fixed");
    expect(updated?.editedAt).not.toBeNull();
  });
});

describe("deleteComment", () => {
  it("deletes a reply without touching its root", () => {
    const root = addComment(lessonId, base.user.id, "root");
    const reply = addReply(lessonId, base.user.id, root.id, "reply");

    deleteComment(reply!.id);

    expect(getCommentById(reply!.id)).toBeUndefined();
    expect(getCommentById(root.id)).toBeDefined();
  });

  it("cascades to replies when a root is deleted", () => {
    const root = addComment(lessonId, base.user.id, "root");
    addReply(lessonId, base.user.id, root.id, "reply 1");
    addReply(lessonId, base.user.id, root.id, "reply 2");
    expect(getCommentCount(lessonId)).toBe(3);

    deleteComment(root.id);

    expect(getCommentCount(lessonId)).toBe(0);
    expect(getLessonComments(lessonId)).toEqual([]);
  });
});

// Local helper to keep the timestamp-override assertions terse.
function eqId(id: number) {
  return eq(schema.lessonComments.id, id);
}
