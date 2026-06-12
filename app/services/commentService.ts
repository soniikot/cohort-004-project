import { eq } from "drizzle-orm";
import { db } from "~/db";
import { lessonComments, users } from "~/db/schema";

// ─── Comment Service ───
// Lesson discussion: top-level comments with one level of replies.
// Replies always store the *root* comment's id as parentId (no reply-to-reply).

export type CommentAuthor = {
  id: number;
  name: string;
  avatarUrl: string | null;
};

export type CommentNode = {
  id: number;
  lessonId: number;
  userId: number;
  body: string;
  createdAt: string;
  editedAt: string | null;
  author: CommentAuthor;
};

export type CommentWithReplies = CommentNode & {
  replies: CommentNode[];
};

export function getCommentById(id: number) {
  return db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, id))
    .get();
}

/**
 * Returns the lesson's discussion as a two-tier tree:
 * top-level comments newest-first, each with its replies oldest-first.
 */
export function getLessonComments(lessonId: number): CommentWithReplies[] {
  const rows = db
    .select({
      id: lessonComments.id,
      lessonId: lessonComments.lessonId,
      userId: lessonComments.userId,
      parentId: lessonComments.parentId,
      body: lessonComments.body,
      createdAt: lessonComments.createdAt,
      editedAt: lessonComments.editedAt,
      authorName: users.name,
      authorAvatarUrl: users.avatarUrl,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id))
    .where(eq(lessonComments.lessonId, lessonId))
    .all();

  const toNode = (r: (typeof rows)[number]): CommentNode => ({
    id: r.id,
    lessonId: r.lessonId,
    userId: r.userId,
    body: r.body,
    createdAt: r.createdAt,
    editedAt: r.editedAt,
    author: { id: r.userId, name: r.authorName, avatarUrl: r.authorAvatarUrl },
  });

  const repliesByParent = new Map<number, CommentNode[]>();
  for (const r of rows) {
    if (r.parentId !== null) {
      const list = repliesByParent.get(r.parentId) ?? [];
      list.push(toNode(r));
      repliesByParent.set(r.parentId, list);
    }
  }

  const roots = rows
    .filter((r) => r.parentId === null)
    .map((r) => {
      const replies = (repliesByParent.get(r.id) ?? []).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt)
      );
      return { ...toNode(r), replies };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return roots;
}

export function getCommentCount(lessonId: number): number {
  return db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.lessonId, lessonId))
    .all().length;
}

export function addComment(lessonId: number, userId: number, body: string) {
  return db
    .insert(lessonComments)
    .values({ lessonId, userId, parentId: null, body })
    .returning()
    .get();
}

/**
 * Adds a reply under a root comment. If `parentCommentId` happens to point at
 * a reply, the reply is re-parented to that reply's root, preserving the
 * single-level threading invariant.
 */
export function addReply(
  lessonId: number,
  userId: number,
  parentCommentId: number,
  body: string
) {
  const parent = getCommentById(parentCommentId);
  if (!parent || parent.lessonId !== lessonId) return null;
  const rootId = parent.parentId ?? parent.id;

  return db
    .insert(lessonComments)
    .values({ lessonId, userId, parentId: rootId, body })
    .returning()
    .get();
}

export function editComment(id: number, body: string) {
  return db
    .update(lessonComments)
    .set({ body, editedAt: new Date().toISOString() })
    .where(eq(lessonComments.id, id))
    .returning()
    .get();
}

/**
 * Deletes a comment. If it is a root comment, its replies are deleted first
 * (hard cascade — replies do not survive their parent).
 */
export function deleteComment(id: number) {
  const comment = getCommentById(id);
  if (!comment) return null;

  if (comment.parentId === null) {
    db.delete(lessonComments)
      .where(eq(lessonComments.parentId, id))
      .run();
  }

  return db
    .delete(lessonComments)
    .where(eq(lessonComments.id, id))
    .returning()
    .get();
}
