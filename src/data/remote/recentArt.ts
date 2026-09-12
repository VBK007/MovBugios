import { CredentialStore } from '@/data/remote/credentialStore';

/**
 * A handful of artwork URLs from the last time the library loaded, kept so the
 * splash can show the household's own films rather than a blank field.
 *
 * Persisted rather than fetched: the splash runs *while* the session is being
 * restored, so asking the server for something to show would put a request on
 * the one path that is already the slowest thing about a cold start. These URLs
 * point at images the image loader has almost certainly cached on disk already,
 * having drawn them on Home last time, so they appear immediately and cost
 * nothing.
 *
 * Ported from data/remote/RecentArt.kt.
 */

const KEY = 'tower.recentArt';

/**
 * How many to keep, which is not how many are shown.
 *
 * The splash was storing six and showing them in the order they were saved. At a
 * minimum of 1.4 seconds on screen and 2.2 per frame, that means one image per
 * launch — the same one, every single launch, because the rails it comes from
 * barely change. A wide pool is what makes the shuffle below worth anything.
 */
const POOL = 24;

/** Newline-separated: a URL cannot contain one, unlike a comma or a space. */
const SEPARATOR = '\n';

export const RecentArt = {
  /**
   * A different handful every launch.
   *
   * Shuffled here rather than by the caller so nobody has to remember to: the
   * whole point of showing the household's own films is that opening the app
   * feels like opening *their* library, and the same frozen frame each time is a
   * logo with extra steps.
   */
  async load(count = 6): Promise<string[]> {
    const pool = await RecentArt.pool();
    return shuffle(pool).slice(0, count);
  },

  async pool(): Promise<string[]> {
    const stored = await CredentialStore.read(KEY);
    if (!stored) return [];
    return stored
      .split(SEPARATOR)
      .map((url) => url.trim())
      .filter((url) => url !== '');
  },

  async save(urls: string[]): Promise<void> {
    const unique = [...new Set(urls.filter((url) => url && url.trim() !== ''))].slice(0, POOL);
    await CredentialStore.write(KEY, unique.length > 0 ? unique.join(SEPARATOR) : null);
  },
};

/** Fisher–Yates, on a copy — the caller's array is not ours to reorder. */
function shuffle<T>(input: T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
