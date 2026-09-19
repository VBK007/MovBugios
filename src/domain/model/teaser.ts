/**
 * A short vertical clip cut from a film's own file, to hook somebody into
 * watching the whole thing.
 *
 * Only clips that are finished and published reach this type: the server sends
 * the queued and failed ones too, but a teaser with no file is not a teaser, it
 * is a job — and this app has no admin surface to show a job on. They are
 * dropped at the mapping boundary, so nothing downstream has to check.
 *
 * `url` is absolute by then, and needs the bearer token to fetch like any other
 * stream.
 */
export interface Teaser {
  id: string;
  /** The film to open when somebody wants the rest of it. */
  titleId: string;
  titleName: string;
  url: string;
  /**
   * What the player must send to be allowed to read `url`.
   *
   * The clip is served through the same auth-gated streamer a film is, so a
   * player handed the URL alone gets a 403 where the video should be. Filled in
   * by the repository, which is the only layer that holds the session.
   */
  headers: Record<string, string>;
  durationSeconds: number;
  /** What the cut is of, where the admin named it. */
  label: string | null;
  /** Where it sits in the film — used to offer "start from here". */
  startSeconds: number;
}

/**
 * One page of the shorts feed, and the shuffle it came from.
 *
 * The feed is dealt at random so that clips near the end of the library get a
 * turn at being first. `seed` is what makes that survive paging: one seed is one
 * permutation of the whole feed, so handing it back with the next page continues
 * the same deal rather than starting a new one.
 *
 * Null when the server did not send one — an older build, which had no shuffle
 * to keep hold of.
 */
export interface TeaserPage {
  teasers: Teaser[];
  seed: number | null;
}

export const EmptyTeaserPage: TeaserPage = { teasers: [], seed: null };

/**
 * `FROM 2:35:40` — where in the film this was cut from.
 *
 * Hours are split out rather than left as minutes. These are cut from climaxes,
 * so the number is usually past ninety minutes, and "FROM 155:40" is a figure
 * nobody can place in a film without doing arithmetic.
 */
export function teaserTimecode(teaser: Teaser): string | null {
  if (teaser.startSeconds <= 0) return null;
  const total = Math.floor(teaser.startSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}` : `${minutes}`;
  return `FROM ${clock}:${String(seconds).padStart(2, '0')}`;
}

/** `—` rather than `0`: a zero under a heart reads as a score, not an invitation. */
export function engagementCountLabel(count: number): string {
  if (count <= 0) return '—';
  if (count < 1000) return String(count);
  return `${Math.floor(count / 1000)}K`;
}
