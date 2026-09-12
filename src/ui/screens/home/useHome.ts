import { useCallback, useEffect, useRef, useState } from 'react';

import { Title } from '@/domain/model/media';
import { ServerState } from '@/domain/model/server';
import { Loading, ServerAsleepError, UiState, dataOrNull, empty, loaded, offline } from '@/ui/uiState';
import { useFlow, useRepository } from '@/ui/hooks';
import { RecentArt } from '@/data/remote/recentArt';

export interface HomeContent {
  continueWatching: Title[];
  recentlyAdded: Title[];
  /** Empty until the library has matched metadata; the rail then hides itself. */
  topRated: Title[];
  fromCameraRoll: Title[];
}

function isEmptyContent(c: HomeContent): boolean {
  return (
    c.continueWatching.length === 0 &&
    c.recentlyAdded.length === 0 &&
    c.topRated.length === 0 &&
    c.fromCameraRoll.length === 0
  );
}

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

    const [continueWatching, recentlyAdded, topRated, cameraRoll] = await Promise.all([
      attempt(() => repository.continueWatching()),
      attempt(() => repository.recentlyAdded()),
      attempt(() => repository.topRated(12)),
      attempt(() => repository.recentlyAdded(['HOME_VIDEO'], 10)),
    ]);

    if (!alive.current || run !== sequence.current) return;

    const results = [continueWatching, recentlyAdded, topRated, cameraRoll];
    const anySucceeded = results.some((r) => r.ok);

    const next: HomeContent = {
      continueWatching: continueWatching.ok ? continueWatching.value : [],
      recentlyAdded: recentlyAdded.ok ? recentlyAdded.value : [],
      topRated: topRated.ok ? topRated.value : [],
      fromCameraRoll: cameraRoll.ok ? cameraRoll.value : [],
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
  }, [repository]);

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

/** A dead connection means asleep; anything else is reported as offline. */
function failureState(cause: unknown): UiState<HomeContent> {
  if (cause instanceof ServerAsleepError) return { type: 'ASLEEP' };
  const message = cause instanceof Error ? cause.message : null;
  return offline(message ?? 'We cannot reach the server.');
}
