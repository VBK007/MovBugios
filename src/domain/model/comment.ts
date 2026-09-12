/**
 * One comment under a title.
 *
 * Written by a *profile* and moderated by an *account*, which is why `mine` and
 * `canDelete` are separate answers rather than one: on a shared login "dad
 * thought it dragged" and "the eight-year-old loved it" have to be told apart by
 * profile to mean anything, while who may take a comment down is a question
 * about the account.
 *
 * Ported from domain/model/Comment.kt.
 */
export interface Comment {
  id: string;
  /** The profile's *current* name — a rename re-signs everything it wrote. */
  author: string;
  body: string;
  /** ISO-8601 instant from the server. */
  postedAt?: string | null;
  /** Null while the comment stands as first posted. */
  editedAt?: string | null;
  /** Written by the profile now reading it: which side the bubble sits on. */
  mine: boolean;
  /** True for the author and for a parent on the same account. */
  canDelete: boolean;
}

export function wasEdited(comment: Comment): boolean {
  return comment.editedAt != null;
}

/** A page of a title's thread, newest first. */
export interface CommentPage {
  comments: Comment[];
  page: number;
  totalItems: number;
  totalPages: number;
}

export function hasMore(page: CommentPage): boolean {
  return page.page + 1 < page.totalPages;
}
