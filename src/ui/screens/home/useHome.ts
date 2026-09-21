import { failureCopy } from '@/ui/failureCopy';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Title } from '@/domain/model/media';
import { Recommendation } from '@/domain/model/collection';
import { DefaultLibraryFilters, LibraryFilters } from '@/domain/model/library';
import { ServerState } from '@/domain/model/server';
import { Loading, ServerAsleepError, UiState, dataOrNull, empty, loaded, offline } from '@/ui/uiState';
import { useActiveProfileId, useFlow, useIsGuest, useRepository } from '@/ui/hooks';
import { RecentArt } from '@/data/remote/recentArt';

export interface HomeContent {
  continueWatching: Title[];
  /**
   * Chosen for whoever is signed in, each carrying why.
   *
   * Kept as `Recommendation` rather than flattened to titles: the reason is the
   * only thing separating this rail from the four around it.
   */
  forYou: Recommendation[];
  recentlyAdded: Title[];
  /** Empty until the library has matched metadata; the rail then hides itself. */
  topRated: Title[];
  fromCameraRoll: Title[];
  /**
   * One shelf of music, and its name.
   *
   * Whichever rail the server put first, carried with its own heading rather
   * than flattened under a fixed "Music" — the server computed it from what the
   * tracks actually sound like, so "Feeling Energetic" says something "Music"
   * does not. The Library tab has the other seventeen.
   */
  music: Title[];
  musicHeading: string;
  /**
   * What a signed-out visitor gets instead of the rails that need a profile.
   *
   * Home is mostly personal — continue watching, what we think you would like,
   * the music you stopped halfway through — and every one of those is a 403
   * without a session. That left a visitor two rails on an otherwise empty
   * screen, which reads as a library with nothing in it rather than one they
   * have not signed into.
   *
   * These are plain category browses through the public endpoint: what is on the
   * disk, grouped the way the Library tab groups it. Nothing personal, because
   * there is nobody to be personal about.
   */
  guestRails: HomeRail[];
}

/** One titled row on Home. Named so several can be added without a field each. */
export interface HomeRail {
  heading: string;
  titles: Title[];
}

function isEmptyContent(c: HomeContent): boolean {
  return (
    c.continueWatching.length === 0 &&
    c.forYou.length === 0 &&
    c.recentlyAdded.length === 0 &&
    c.topRated.length === 0 &&
    c.fromCameraRoll.length === 0 &&
    c.music.length === 0 &&
    c.guestRails.length === 0
  );
}

/** How many tiles a guest rail carries. A rail is a glance, not a page. */
const GUEST_RAIL_SIZE = 12;

/**
 * The rows a signed-out visitor sees, in the order they appear.
 *
 * Categories rather than anything computed, because everything computed needs a
 * profile: what somebody watched, liked or stopped halfway. These say only what
 * is on the disk, which is the whole of what a visitor is allowed to know and is
 * enough to show the library is not empty.
 *
 * Films first — it is the largest shelf in most houses and the one somebody
 * browsing without an account is most likely looking for. Photos last: they are
 * the household's own, and least likely to be what brought a visitor here.
 */
const GUEST_RAILS: { heading: string; filters: LibraryFilters }[] = [
  {
    heading: 'Most watched films',
    filters: { ...DefaultLibraryFilters, category: 'FILM', sort: 'VIEWS' },
  },
  { heading: 'Films', filters: { ...DefaultLibraryFilters, category: 'FILM' } },
  { heading: 'Anime', filters: { ...DefaultLibraryFilters, category: 'ANIME' } },
  {
    heading: 'Most played music',
    filters: { ...DefaultLibraryFilters, category: 'MUSIC', sort: 'VIEWS' },
  },
  { heading: 'Music', filters: { ...DefaultLibraryFilters, category: 'MUSIC' } },
  { heading: 'Photos', filters: { ...DefaultLibraryFilters, category: 'PHOTO' } },
];

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

async function attempt<T>(block: () => Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await block() };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Home's state, ported from ui/screens/home/HomeViewModel.kt.
 *
 * The one behaviour worth preserving carefully is that **each rail is fetched
 * independently**. They used to share one try-block, so a single failing
 * endpoint blanked the whole screen — a 500 on continue-watching left Home
 * reading "Cannot reach Tower" while recently-added was answering 200 the whole
 * time. A shelf with three of four rails is far more useful than an error page,
 * and the server is entitled to have one endpoint broken without taking the app
 * down with it.
 */
export function useHome() {
  const repository = useRepository();
  const serverState = useFlow(repository.serverState);
  const profile = useFlow(repository.activeProfile);
  const profileId = useActiveProfileId();
  // A dependency of the load, not just a question asked during it: signing in
  // and signing out change which half of Home can be filled at all.
  const isGuest = useIsGuest();

  const [content, setContent] = useState<UiState<HomeContent>>(Loading);
  const [refreshing, setRefreshing] = useState(false);
  const [waking, setWaking] = useState(false);

  const alive = useRef(true);
  const sequence = useRef(0);
  // Read inside `refresh` without making it a dependency — otherwise every
  // load would rebuild the callback and re-trigger the effect below.
  const contentRef = useRef(content);
  contentRef.current = content;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const run = ++sequence.current;

    // Only fall back to the skeleton when there is nothing to show yet.
    // Replacing loaded content with a skeleton on every pull would make the
    // screen flicker for a refresh that usually changes nothing.
    if (contentRef.current.type === 'LOADED') {
      setRefreshing(true);
    } else {
      setContent(Loading);
    }

    /*
     * Only for a visitor. A signed-in Home already has rails about them, and
     * these would push those down with rows the Library tab exists to show.
     */
    const guest = isGuest;

    const [
      [continueWatching, forYou, recentlyAdded, topRated, cameraRoll, music],
      guestRailResults,
    ] = await Promise.all([
      Promise.all([
        attempt(() => repository.continueWatching()),
        attempt(() => repository.recommendations(12)),
        attempt(() => repository.recentlyAdded()),
        attempt(() => repository.topRated(12)),
        attempt(() => cameraRollTitles(repository)),
        attempt(() => homeMusicShelf(repository)),
      ]),
      Promise.all(
        guest
          ? GUEST_RAILS.map(async ({ heading, filters }) => ({
              heading,
              result: await attempt(() =>
                repository.browse(filters, 0).then((t) => t.slice(0, GUEST_RAIL_SIZE)),
              ),
            }))
          : [],
      ),
    ]);

    if (!alive.current || run !== sequence.current) return;

    const results = [
      continueWatching,
      forYou,
      recentlyAdded,
      topRated,
      cameraRoll,
      music,
      // A guest's rails count here too, and they are usually the only ones that
      // can. Every personal rail above answers 403 without a session, so judging
      // reachability on those alone would put "We cannot reach Tower" over six
      // rows of a library that had just answered.
      ...guestRailResults.map((r) => r.result),
    ];
    const anySucceeded = results.some((r) => r.ok);

    const next: HomeContent = {
      continueWatching: continueWatching.ok ? continueWatching.value : [],
      forYou: forYou.ok ? forYou.value : [],
      recentlyAdded: recentlyAdded.ok ? recentlyAdded.value : [],
      topRated: topRated.ok ? topRated.value : [],
      fromCameraRoll: cameraRoll.ok ? cameraRoll.value : [],
      music: music.ok ? music.value.tracks : [],
      musicHeading: music.ok ? music.value.heading : 'Music',
      // Empty rows are dropped rather than drawn as headings over nothing — a
      // library with no anime should not say "Anime" and show a gap, and the
      // music row is empty exactly whenever the disk holding it is not mounted.
      guestRails: guestRailResults
        .filter((r) => r.result.ok && r.result.value.length > 0)
        .map(({ heading, result }) => ({
          heading,
          titles: (result as { ok: true; value: Title[] }).value,
        })),
    };

    if (!anySucceeded) {
      // Only an error when *nothing* came back — that is the case where the
      // server really is unreachable rather than partly broken.
      const cause = [continueWatching, recentlyAdded].find((r) => !r.ok) as
        | { ok: false; error: unknown }
        | undefined;
      setContent(failureState(cause?.error));
    } else if (isEmptyContent(next)) {
      setContent(empty('Nothing on the disk yet. Point Tower at a folder and rescan.'));
    } else {
      setContent(loaded(next));
    }
    setRefreshing(false);

    /*
     * What the next cold start will show behind its mark.
     *
     * Backdrops first — they are wide, which suits a full-screen montage, where
     * a poster has to be cropped hard to fill one.
     */
    const art = [...next.recentlyAdded, ...next.topRated, ...next.continueWatching]
      .map((title) => title.backdropUrl ?? title.posterUrl)
      .filter((url): url is string => url != null);
    if (art.length > 0) void RecentArt.save(art);
    // Keyed on the profile too: every rail is per-person server-side.
  }, [repository, profileId, isGuest]);

  // Load once, unconditionally. Waiting for a particular server state left the
  // screen on its skeleton forever whenever the state was anything else — being
  // away from home is not a reason to stop browsing, it only changes what
  // streaming costs.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-read only on the transition into reachable: a server that just woke up
  // has a library worth re-reading, but re-fetching on every emission would loop.
  const wasReachable = useRef(false);
  useEffect(() => {
    const reachable = serverState.type === 'ONLINE' || serverState.type === 'AWAY_FROM_HOME';
    if (reachable && !wasReachable.current) void refresh();
    wasReachable.current = reachable;
  }, [serverState, refresh]);

  const wakeServer = useCallback(async () => {
    setWaking(true);
    try {
      await repository.wakeServer();
    } finally {
      if (alive.current) setWaking(false);
    }
  }, [repository]);

  return {
    content,
    serverState,
    profile,
    refreshing,
    waking,
    refresh: () => void refresh(),
    wakeServer: () => void wakeServer(),
    data: dataOrNull(content),
  };
}

/**
 * Home videos for the camera-roll rail, the sure way round.
 *
 * `recently-added?types=HOME_VIDEO` is the direct question and is tried first.
 * But a server that does not understand the `types` filter answers with an
 * error, and `attempt` above turns any failure into an empty list — so a
 * rejected request and a library with no home videos produced exactly the same
 * blank rail, with nothing to tell them apart.
 *
 * Browsing the category is a different endpoint answering the same question, so
 * it stands in when the first comes back with nothing. A library that genuinely
 * has no home videos still yields an empty rail, which is correct — the rail
 * hides itself and nothing is claimed that is not there.
 */
async function cameraRollTitles(repository: ReturnType<typeof useRepository>): Promise<Title[]> {
  try {
    const direct = await repository.recentlyAdded(['HOME_VIDEO'], 10);
    if (direct.length > 0) return direct;
  } catch {
    // Fall through: the browse below is the same question asked differently.
  }
  const browsed = await repository.browse(
    { ...DefaultLibraryFilters, category: 'HOME_VIDEO' },
    0,
  );
  return browsed.slice(0, 10);
}

/**
 * The one shelf of music Home carries, and what to call it.
 *
 * Part-played tracks win when there are any — a song somebody stopped halfway is
 * a better offer than anything computed. Otherwise the first rail the server
 * sent, under its own name.
 */
async function homeMusicShelf(
  repository: ReturnType<typeof useRepository>,
): Promise<{ heading: string; tracks: Title[] }> {
  const home = await repository.musicHome(12);
  if (home.continueListening.length > 0) {
    return { heading: 'Pick up where you left off', tracks: home.continueListening };
  }
  const first = home.rails[0];
  if (first != null) return { heading: first.title, tracks: first.tracks };
  return { heading: 'Music', tracks: [] };
}

/** A dead connection means asleep; anything else is reported as offline. */
function failureState(cause: unknown): UiState<HomeContent> {
  if (cause instanceof ServerAsleepError) return { type: 'ASLEEP' };
  return offline(failureCopy(cause));
}
