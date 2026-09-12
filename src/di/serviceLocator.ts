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

const _repository = new MutableStateFlow<TowerRepository>(fake);

/** What every screen reads. Changes when the user connects to a server. */
export const repositoryFlow = _repository;

const _usingSampleData = new MutableStateFlow(true);

/**
 * True while the app is running on the sample library.
 *
 * Also means "signed out": the sample library is what a visitor browses before
 * connecting to a real server, so this doubles as the guest flag that gates
 * playback.
 */
export const usingSampleDataFlow = _usingSampleData;

export const ServiceLocator = {
  DEFAULT_BASE_URL,

  get repository(): TowerRepository {
    return _repository.get();
  },

  /** Playback needs a real server and a real token; browsing does not. */
  get isGuest(): boolean {
    return _usingSampleData.get();
  },

  /** The remote repository, for the connect screen's login call. */
  remoteRepository(): RemoteTowerRepository {
    return remote;
  },

  towerApi(): TowerApi {
    return api;
  },

  /** Switches the whole app onto the real server. */
  useRemote(): void {
    _repository.set(remote);
    _usingSampleData.set(false);
  },

  /** Falls back to the sample library — used when signing out. */
  useSampleData(): void {
    session.clear();
    session.setBaseUrl(null);
    _repository.set(fake);
    _usingSampleData.set(true);
  },

  /** Test seam: install any implementation, including a stub. */
  install(repository: TowerRepository): void {
    _repository.set(repository);
    _usingSampleData.set(repository instanceof FakeTowerRepository);
  },
};
