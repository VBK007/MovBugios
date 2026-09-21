import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { Flow } from '@/data/store';
import { repositoryFlow, usingSampleDataFlow } from '@/di/serviceLocator';
import { TowerRepository } from '@/domain/repository/towerRepository';
import { Loading, UiState, loadState } from '@/ui/uiState';

/** Subscribes a component to a repository flow. The `StateFlow` equivalent. */
export function useFlow<T>(flow: Flow<T>): T {
  return useSyncExternalStore(flow.subscribe, flow.get, flow.get);
}

/**
 * The repository currently installed. Reading it through a flow rather than as a
 * plain import is what lets signing in swap the whole app onto the real server
 * without a screen knowing.
 */
export function useRepository(): TowerRepository {
  return useFlow(repositoryFlow);
}

/**
 * The profile every request is being made on behalf of.
 *
 * Worth having as its own hook because it belongs in the dependency list of
 * anything that loads data: the server keys resume positions, likes and comments
 * to `X-Profile-Id`, so switching person changes what nearly every endpoint
 * returns. A screen that does not re-read on this is showing the last person's
 * library.
 */
export function useActiveProfileId(): string | null {
  const repository = useRepository();
  return useFlow(repository.activeProfile)?.id ?? null;
}

/**
 * True while nobody is signed in.
 *
 * No longer the same as "on the sample library": a visitor browses the real
 * server's public catalogue, and this flag is what withholds the half that needs
 * a token rather than what chooses which library is shown.
 */
export function useIsGuest(): boolean {
  return useFlow(usingSampleDataFlow);
}

export interface Loadable<T> {
  state: UiState<T>;
  /** Re-runs the loader. Bound to pull-to-refresh and to "Try again". */
  refresh: () => void;
  /** True only during a refresh, so the spinner is not shown on first load. */
  refreshing: boolean;
}

/**
 * Runs an async load into a `UiState`, the way each Kotlin ViewModel does in its
 * `init` block.
 *
 * Two things this has to get right that a naive `useEffect` does not:
 *
 *  - A load that resolves after the screen is gone must not set state. Popping
 *    Detail mid-fetch would otherwise warn and, worse, leave a stale result
 *    attached to the next screen that reuses the slot.
 *  - A refresh started while one is in flight must not let the older, slower
 *    response win. Each run carries a sequence number and only the newest one is
 *    allowed to land.
 */
export function useLoad<T>(
  load: (repository: TowerRepository) => Promise<T>,
  deps: readonly unknown[],
  options: { emptyWhen?: (value: T) => boolean; emptyMessage?: string } = {},
): Loadable<T> {
  const repository = useRepository();
  const [state, setState] = useState<UiState<T>>(Loading);
  const [refreshing, setRefreshing] = useState(false);

  const alive = useRef(true);
  const sequence = useRef(0);

  // `load` and `options` are re-created on every render by every call site, so
  // they are held in refs and deliberately kept out of the effect's dependencies
  // — listing them would re-fetch on each render.
  const loadRef = useRef(load);
  loadRef.current = load;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(
    async (isRefresh: boolean) => {
      const run = ++sequence.current;
      if (isRefresh) setRefreshing(true);
      const next = await loadState(() => loadRef.current(repository), optionsRef.current);
      // Stale: either the screen is gone, or a newer run has already started.
      if (!alive.current || run !== sequence.current) return;
      setState(next);
      if (isRefresh) setRefreshing(false);
    },
    [repository],
  );

  useEffect(() => {
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ...deps]);

  const refresh = useCallback(() => {
    void run(true);
  }, [run]);

  return { state, refresh, refreshing };
}
