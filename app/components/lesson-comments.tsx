import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { MessageSquare, Pencil, Reply, Trash2 } from "lucide-react";
import type {
  CommentNode,
  CommentWithReplies,
} from "~/services/commentService";
import { UserAvatar } from "~/components/user-avatar";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Textarea } from "~/components/ui/textarea";
import { formatRelativeTime, cn } from "~/lib/utils";

const MAX_COMMENT_LENGTH = 2000;

type CommentFetcherData =
  | { commentSuccess: true }
  | { commentError: string }
  | undefined;

export function LessonComments({
  comments,
  commentCount,
  currentUserId,
  instructorId,
  isAdmin,
  canPost,
}: {
  comments: CommentWithReplies[];
  commentCount: number;
  currentUserId: number | null;
  instructorId: number;
  isAdmin: boolean;
  canPost: boolean;
}) {
  return (
    <section className="mt-12 border-t pt-8">
      <div className="mb-6 flex items-center gap-2">
        <MessageSquare className="size-5 text-primary" />
        <h2 className="text-xl font-semibold">Discussion ({commentCount})</h2>
      </div>

      {canPost && <CommentComposer intent="add-comment" />}

      {comments.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No comments yet — start the discussion.
        </p>
      ) : (
        <ul className="mt-8 space-y-8">
          {comments.map((comment) => (
            <li key={comment.id}>
              <CommentItem
                comment={comment}
                currentUserId={currentUserId}
                instructorId={instructorId}
                isAdmin={isAdmin}
                canPost={canPost}
                isReply={false}
              />
              {comment.replies.length > 0 && (
                <ul className="mt-4 space-y-4 border-l pl-4 sm:pl-6">
                  {comment.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentItem
                        comment={reply}
                        currentUserId={currentUserId}
                        instructorId={instructorId}
                        isAdmin={isAdmin}
                        canPost={canPost}
                        isReply={true}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentComposer({
  intent,
  parentId,
  initialBody = "",
  commentId,
  autoFocus = false,
  onDone,
  submitLabel = "Post",
  placeholder = "Add to the discussion…",
}: {
  intent: "add-comment" | "add-reply" | "edit-comment";
  parentId?: number;
  initialBody?: string;
  commentId?: number;
  autoFocus?: boolean;
  onDone?: () => void;
  submitLabel?: string;
  placeholder?: string;
}) {
  const fetcher = useFetcher();
  const data = fetcher.data as CommentFetcherData;
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = fetcher.state !== "idle";

  // After a successful submit: reset the composer (for new posts) and notify
  // the parent (so reply/edit forms can close).
  useEffect(() => {
    if (fetcher.state === "idle" && data && "commentSuccess" in data) {
      if (intent === "add-comment") formRef.current?.reset();
      onDone?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, data]);

  const error = data && "commentError" in data ? data.commentError : null;

  return (
    <fetcher.Form ref={formRef} method="post" className="space-y-2">
      <input type="hidden" name="intent" value={intent} />
      {parentId !== undefined && (
        <input type="hidden" name="parentId" value={parentId} />
      )}
      {commentId !== undefined && (
        <input type="hidden" name="commentId" value={commentId} />
      )}
      <Textarea
        name="body"
        defaultValue={initialBody}
        placeholder={placeholder}
        maxLength={MAX_COMMENT_LENGTH}
        rows={3}
        autoFocus={autoFocus}
        required
        className="resize-y"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Posting…" : submitLabel}
        </Button>
        {onDone && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onDone}
            disabled={submitting}
          >
            Cancel
          </Button>
        )}
      </div>
    </fetcher.Form>
  );
}

function CommentItem({
  comment,
  currentUserId,
  instructorId,
  isAdmin,
  canPost,
  isReply,
}: {
  comment: CommentNode;
  currentUserId: number | null;
  instructorId: number;
  isAdmin: boolean;
  canPost: boolean;
  isReply: boolean;
}) {
  const deleteFetcher = useFetcher();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);

  const isAuthor = currentUserId === comment.userId;
  const isInstructor = comment.userId === instructorId;
  const canEdit = isAuthor;
  const canDelete = isAuthor || isAdmin;
  const deleting = deleteFetcher.state !== "idle";

  return (
    <div className={cn("flex gap-3", deleting && "opacity-50")}>
      <UserAvatar
        name={comment.author.name}
        avatarUrl={comment.author.avatarUrl}
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium">{comment.author.name}</span>
          {isInstructor && (
            <Badge variant="secondary" className="text-[10px]">
              Instructor
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(comment.createdAt)}
            {comment.editedAt && " · edited"}
          </span>
        </div>

        {editing ? (
          <div className="mt-2">
            <CommentComposer
              intent="edit-comment"
              commentId={comment.id}
              initialBody={comment.body}
              autoFocus
              submitLabel="Save"
              onDone={() => setEditing(false)}
            />
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">
            {comment.body}
          </p>
        )}

        {!editing && (
          <div className="mt-2 flex items-center gap-1">
            {!isReply && canPost && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => setReplying((r) => !r)}
              >
                <Reply className="size-3" />
                Reply
              </Button>
            )}
            {canEdit && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => setEditing(true)}
              >
                <Pencil className="size-3" />
                Edit
              </Button>
            )}
            {canDelete && (
              <deleteFetcher.Form
                method="post"
                onSubmit={(e) => {
                  if (!confirm("Delete this comment?")) e.preventDefault();
                }}
              >
                <input type="hidden" name="intent" value="delete-comment" />
                <input type="hidden" name="commentId" value={comment.id} />
                <Button
                  type="submit"
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={deleting}
                >
                  <Trash2 className="size-3" />
                  Delete
                </Button>
              </deleteFetcher.Form>
            )}
          </div>
        )}

        {replying && (
          <div className="mt-3">
            <CommentComposer
              intent="add-reply"
              parentId={comment.id}
              autoFocus
              submitLabel="Reply"
              placeholder="Write a reply…"
              onDone={() => setReplying(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
