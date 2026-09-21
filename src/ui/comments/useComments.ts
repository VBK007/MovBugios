import { failureCopy } from '@/ui/failureCopy';
import { useCallback, useEffect, useRef, useState } from 'react';

import { RemoteTowerRepository } from '@/data/remote/remoteTowerRepository';
import { Comment } from '@/domain/model/comment';
import { Loading, UiState, dataOrNull, empty, loaded, loadState } from '@/ui/uiState';
import { useRepository } from '@/ui/hooks';

const MAX_LENGTH = 1000;
const NO_COMMENTS = 'Nobody has said anything yet.';
const GUEST_MESSAGE = 'Sign in to read and leave comments.';
const POST_FAILED = 'That could not be posted.';

/** Everything the thread needs to draw itself. */
export interface CommentsState {
  /** Fetched only when the sheet is opened; a thread nobody reads costs nothing. */
  comments: UiState<Comment[]>;
  open: boolean;
  draft: string;
  /** Non-null while rewriting an existing comment rather than adding one. */
  editing: Comment | null;
  posting: boolean;
  error: string | null;
}

/**
 * The comment thread for one title, independent of which screen is showing it.
 *
 * Pulled out of the detail screen when the player needed the same thread: saying
 * something about a film while it is playing is the moment people actually want
 * to, and the alternative was leaving the film to do it. Two copies of posting,
 * editing, deleting and the optimistic bookkeeping around them would have been
 * two places for the same bug.
 *
 * Ported from ui/comments/CommentsController.kt.
 */
export function useComments(
  titleId: string,
  /**
   * +1 for a comment added, -1 for one removed.
   *
   * The detail screen prints a count beside the poster and would otherwise have
   * to refetch the title to keep it honest. The player has nowhere to show one
   * and ignores this.
   */
  onCountChanged: (by: number) => void = () => {},
) {
  const repository = useRepository();
  /**
   * Comments need a real server; the sample library has no thread to read. Null
   * means signed out, which every entry point below treats as "say so rather
   * than fail".
   */
  const remote = repository instanceof RemoteTowerRepository ? repository : null;

  const [state, setState] = useState<CommentsState>({
    comments: Loading,
    open: false,
    draft: '',
    editing: null,
    posting: false,
    error: null,
  });

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const patch = useCallback((next: Partial<CommentsState>) => {
    if (alive.current) setState((s) => ({ ...s, ...next }));
  }, []);

  const load = useCallback(async () => {
    if (!remote) {
      patch({ comments: empty(GUEST_MESSAGE) });
      return;
    }
    patch({ comments: Loading });
    const result = await loadState(async () => (await remote.comments(titleId)).comments, {
      emptyWhen: (list) => list.length === 0,
      emptyMessage: NO_COMMENTS,
    });
    patch({ comments: result });
  }, [remote, titleId, patch]);

  const open = useCallback(() => {
    patch({ open: true });
    void load();
  }, [load, patch]);

  /** Clears the draft: a half-typed line is about a moment that has passed. */
  const close = useCallback(() => {
    patch({ open: false, editing: null, draft: '' });
  }, [patch]);

  const onDraftChange = useCallback(
    (value: string) => patch({ draft: value, error: null }),
    [patch],
  );

  /** Puts an existing comment into the composer. Only ever your own. */
  const startEditing = useCallback(
    (comment: Comment) => patch({ editing: comment, draft: comment.body }),
    [patch],
  );

  const cancelEditing = useCallback(() => patch({ editing: null, draft: '' }), [patch]);

  const submit = useCallback(async () => {
    if (!remote) return;
    const body = state.draft.trim();
    if (body === '') return;
    if (body.length > MAX_LENGTH) {
      patch({ error: `That is longer than ${MAX_LENGTH} characters.` });
      return;
    }
    const editing = state.editing;
    patch({ posting: true, error: null });

    try {
      const saved = editing
        ? await remote.editComment(titleId, editing.id, body)
        : await remote.postComment(titleId, body);

      if (!alive.current) return;
      setState((current) => {
        const existing = dataOrNull(current.comments) ?? [];
        const next = editing
          ? existing.map((c) => (c.id === saved.id ? saved : c))
          : // Newest first, matching the order the server returns.
            [saved, ...existing];
        return { ...current, comments: loaded(next), draft: '', editing: null, posting: false };
      });
      if (!editing) onCountChanged(1);
    } catch (e) {
      patch({ posting: false, error: failureCopy(e) });
    }
  }, [remote, state.draft, state.editing, titleId, onCountChanged, patch]);

  const remove = useCallback(
    async (comment: Comment) => {
      if (!remote) return;
      // Removed first: the row is gone from the user's point of view the moment
      // they confirm, and a failure puts it back with a reason.
      const before = dataOrNull(state.comments) ?? [];
      const after = before.filter((c) => c.id !== comment.id);
      patch({
        // Back to the empty state rather than an empty list: removing the last
        // comment used to leave a blank void where the "nobody has said
        // anything" invitation should be.
        comments: after.length === 0 ? empty(NO_COMMENTS) : loaded(after),
      });
      onCountChanged(-1);

      try {
        await remote.deleteComment(titleId, comment.id);
      } catch (e) {
        patch({
          comments: loaded(before),
          error: failureCopy(e),
        });
        onCountChanged(1);
      }
    },
    [remote, state.comments, titleId, onCountChanged, patch],
  );

  return {
    state,
    open,
    close,
    load,
    onDraftChange,
    startEditing,
    cancelEditing,
    submit: () => void submit(),
    remove: (c: Comment) => void remove(c),
  };
}

export type CommentsController = ReturnType<typeof useComments>;
