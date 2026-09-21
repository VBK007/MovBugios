import { FakeTowerRepository } from '@/data/fake/fakeTowerRepository';
import { RemoteTowerRepository } from '@/data/remote/remoteTowerRepository';
import { TowerApi } from '@/data/remote/towerApi';
import { TowerSession } from '@/data/remote/towerSession';
import { MutableStateFlow } from '@/data/store';
import { TowerRepository } from '@/domain/repository/towerRepository';

/**
 * Deliberately not a DI framework.
 *
 * There is one dependency worth injecting — the repository — and the whole point
 * of the exercise is that it can be swapped for the real HTTP one without
 * touching a screen. A graph library would be ceremony around a single value.
 *
 * Ported from di/ServiceLocator.kt.
 */

/**
 * The address to try before asking for one. Empty means ask.
 *
 * Comes from the environment at build time, never from a constant in this file:
 * the value is the address of somebody's house, and this repository is a public
 * place.
 *
 * Only ever a default. A remembered address wins, and the connect screen can
 * still be reached to change it.
 */
export const DEFAULT_BASE_URL: string = process.env.EXPO_PUBLIC_TOWER_BASE_URL ?? '';

export const session = new TowerSession();

const api = new TowerApi(session);

const fake = new FakeTowerRepository();

const remote = new RemoteTowerRepository(api, session);

/**
 * Starts on `remote`, not `fake`: a visitor should see the real catalogue from
 * the first frame whenever a server address is known at all. `useSampleData` is
 * the fallback for the one case where that is not true — no address has ever
 * been paired and none is baked into this build.
 */
const _repository = new MutableStateFlow<TowerRepository>(remote);

/** What every screen reads. Changes only in the no-server-known fallback. */
export const repositoryFlow = _repository;

/**
 * True when nobody is signed in — which is no longer the same question as
 * "which repository is installed".
 *
 * It used to be: signed out meant the sample library, so one flag answered both.
 * Now a visitor browses the real server's public catalogue, and only the things
 * that need a token — playback, liking, resuming — are withheld. So this is
 * driven by the session rather than by the repository object: true on `fake`
 * unconditionally, since there is no account to hold a token against, and true
 * on `remote` whenever the session is unauthenticated.
 *
 * A flow because screens redraw on it, and it changes at sign-in and sign-out
 * without the repository underneath changing at all.
 */
const _guest = new MutableStateFlow(true);

export const usingSampleDataFlow = _guest;

/** Re-reads the session. Called wherever a token is gained or lost. */
function refreshGuest(): void {
  _guest.set(_repository.get() === fake || !session.isAuthenticated);
}

export const ServiceLocator = {
  DEFAULT_BASE_URL,

  get repository(): TowerRepository {
    return _repository.get();
  },

  /** Playback needs a real server and a real token; browsing does not. */
  get isGuest(): boolean {
    return _guest.get();
  },

  /**
   * Re-reads whether anybody is signed in.
   *
   * Signing in no longer swaps the repository, so something has to say that the
   * answer changed. Called after login, after a restored session, and after a
   * sign-out that keeps the server.
   */
  refreshGuest,

  session,

  /** The remote repository, for the connect screen's login call. */
  remoteRepository(): RemoteTowerRepository {
    return remote;
  },

  towerApi(): TowerApi {
    return api;
  },

  /**
   * Puts the whole app on the real server.
   *
   * Signed in or not: the guest flag is read off the session afterwards, so the
   * one call covers both a restored session and a visitor who has an address and
   * no account.
   */
  useRemote(): void {
    _repository.set(remote);
    refreshGuest();
  },

  /**
   * Falls back to the sample library.
   *
   * Only for the case where there is no server to browse at all — not for
   * signing out, which now leaves the visitor on the real catalogue.
   */
  useSampleData(): void {
    session.clear();
    session.setBaseUrl(null);
    _repository.set(fake);
    _guest.set(true);
  },

  /**
   * Test seam: install any implementation, including a stub.
   *
   * A stub stands in for a server that answers, so it is treated as signed in —
   * a test that wants the guest half installs nothing and clears the session.
   */
  install(repository: TowerRepository): void {
    _repository.set(repository);
    _guest.set(repository instanceof FakeTowerRepository);
  },
};
