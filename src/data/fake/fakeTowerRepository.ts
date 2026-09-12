import { Flow, MutableStateFlow } from '@/data/store';
import * as SampleLibrary from '@/data/fake/sampleLibrary';
import { SavedItem, SavedSummary, isInProgress } from '@/domain/model/downloads';
import {
  JumpTarget,
  LibraryFilters,
  LibrarySummary,
  Timeline,
  TimelineGrouping,
} from '@/domain/model/library';
import {
  MediaKind,
  Title,
  effectiveDurationSeconds,
  isTitle4k,
} from '@/domain/model/media';
import {
  ClientCapabilities,
  PlaybackSource,
  PlayerState,
} from '@/domain/model/player';
import { CastDevice, Profile } from '@/domain/model/people';
import { DiscoveredServer, ServerState, online } from '@/domain/model/server';
import { TowerRepository } from '@/domain/repository/towerRepository';
import { ServerAsleepError } from '@/ui/uiState';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Serves the sample library so previews, and the whole app, run with no server
 * on the network.
 *
 * Latency is simulated because a repository that returns instantly hides every
 * loading state, and the loading states are a third of this design.
 *
 * Ported from data/fake/FakeTowerRepository.kt.
 */
export class FakeTowerRepository implements TowerRepository {
  private readonly _serverState: MutableStateFlow<ServerState>;
  private readonly _profiles = new MutableStateFlow<Profile[]>(SampleLibrary.profiles);
  private readonly _activeProfile = new MutableStateFlow<Profile | null>(SampleLibrary.arun);
  private readonly _saved = new MutableStateFlow<SavedItem[]>(SampleLibrary.savedItems);
  private readonly _cast = new MutableStateFlow<CastDevice[]>(SampleLibrary.castDevices);
  private readonly _discovered = new MutableStateFlow<DiscoveredServer[]>([]);

  private readonly progress = new Map<string, number>();
  private readonly subtitleOffsets = new Map<string, number>();

  /** Set false in previews so a snapshot does not sit on a skeleton. */
  private readonly simulateLatency: boolean;

  constructor(
    initialServerState: ServerState = online(41),
    options: { simulateLatency?: boolean } = {},
  ) {
    this._serverState = new MutableStateFlow<ServerState>(initialServerState);
    this.simulateLatency = options.simulateLatency ?? true;
  }

  get serverState(): Flow<ServerState> {
    return this._serverState;
  }

  get profiles(): Flow<Profile[]> {
    return this._profiles;
  }

  get activeProfile(): Flow<Profile | null> {
    return this._activeProfile;
  }

  get savedItems(): Flow<SavedItem[]> {
    return this._saved;
  }

  private async pause(ms = 320): Promise<void> {
    if (this.simulateLatency) await delay(ms);
  }

  /** Nothing reaches the disk while it is spun down. */
  private requireAwake(): void {
    if (this._serverState.get().type === 'SLEEPING') {
      throw new ServerAsleepError();
    }
  }

  // --- Connection --------------------------------------------------------

  discoverServers(): Flow<DiscoveredServer[]> {
    return this._discovered;
  }

  async pair(_server: DiscoveredServer): Promise<void> {
    await this.pause(600);
    this._serverState.set(online(41));
  }

  async pairManually(baseUrl: string): Promise<void> {
    await this.pause(600);
    if (!baseUrl.startsWith('http')) {
      throw new Error('That does not look like an address.');
    }
    this._serverState.set(online(41));
  }

  async wakeServer(): Promise<void> {
    this._serverState.set({ type: 'WAKING' });
    // The board promises about eight seconds; keep it honest but bearable.
    await delay(this.simulateLatency ? 2_500 : 0);
    this._serverState.set(online(41));
  }

  async selectProfile(profileId: string): Promise<void> {
    this._activeProfile.set(this._profiles.get().find((p) => p.id === profileId) ?? null);
  }

  // --- Browsing ----------------------------------------------------------

  async librarySummary(): Promise<LibrarySummary> {
    await this.pause();
    return SampleLibrary.librarySummary;
  }

  async browse(filters: LibraryFilters, _page = 0): Promise<Title[]> {
    await this.pause();
    this.requireAwake();
    let items = SampleLibrary.all;
    if (filters.category != null) {
      items = items.filter((t) => t.kind === filters.category);
    }
    if (filters.unwatchedOnly) {
      items = items.filter((t) => t.watchState !== 'WATCHED');
    }
    if (filters.fourKOnly) {
      items = items.filter((t) => isTitle4k(t));
    }
    switch (filters.sort) {
      case 'TITLE':
        return [...items].sort((a, b) => a.name.localeCompare(b.name));
      case 'YEAR':
        return [...items].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
      case 'RATING':
        return [...items].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      // The sample library is already in the order the disk produced it.
      case 'ADDED':
      case 'CAPTURED':
        return items;
    }
  }

  async recentlyAdded(kinds: MediaKind[] = [], limit = 20): Promise<Title[]> {
    await this.pause();
    this.requireAwake();
    const pool =
      kinds.length === 0
        ? [...SampleLibrary.films, ...SampleLibrary.anime]
        : SampleLibrary.all.filter((t) => kinds.includes(t.kind));
    return pool.slice(0, limit);
  }

  async continueWatching(limit = 20): Promise<Title[]> {
    await this.pause();
    return SampleLibrary.all
      .filter((t) => t.watchState === 'IN_PROGRESS')
      .map((t) => ({ ...t, positionSeconds: this.progress.get(t.id) ?? t.positionSeconds }))
      .slice(0, limit);
  }

  async topRated(limit = 20): Promise<Title[]> {
    await this.pause();
    this.requireAwake();
    return SampleLibrary.all
      .filter((t) => (t.rating ?? 0) > 0)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, limit);
  }

  async detail(titleId: string): Promise<Title> {
    await this.pause();
    const title = SampleLibrary.all.find((t) => t.id === titleId);
    if (!title) throw new Error(`No such title: ${titleId}`);
    return { ...title, positionSeconds: this.progress.get(titleId) ?? title.positionSeconds };
  }

  async search(query: string): Promise<Title[]> {
    await this.pause(220);
    this.requireAwake();
    if (query.trim() === '') return [];
    const needle = query.toLowerCase();
    return SampleLibrary.all.filter(
      (t) =>
        t.name.toLowerCase().includes(needle) ||
        t.file.filename.toLowerCase().includes(needle),
    );
  }

  async jumpTargets(query: string): Promise<JumpTarget[]> {
    if (query.trim() === '') return [];
    return SampleLibrary.jumpTargets;
  }

  async timeline(grouping: TimelineGrouping = 'DATE'): Promise<Timeline> {
    await this.pause();
    this.requireAwake();
    return { ...SampleLibrary.timeline, grouping };
  }

  // --- Playback ----------------------------------------------------------

  async playbackDecision(
    titleId: string,
    _capabilities: ClientCapabilities,
    startSeconds = 0,
  ): Promise<PlaybackSource> {
    await this.pause(450);
    this.requireAwake();
    const title = await this.detail(titleId);
    return {
      // Big Buck Bunny, so the sample library has something that genuinely
      // plays. Every other sample field describes a file on somebody's disk;
      // this is the one that has to exist on the open internet for the player to
      // be testable at all.
      url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      sessionId: `sess-fake-${titleId}`,
      plan: title.plan,
      startSeconds,
      headers: {},
    };
  }

  async playerState(titleId: string): Promise<PlayerState> {
    await this.pause(200);
    const title = await this.detail(titleId);
    return {
      titleId,
      positionSeconds: this.progress.get(titleId) ?? title.positionSeconds,
      durationSeconds: effectiveDurationSeconds(title),
      watched: title.watchState === 'WATCHED',
      subtitleOffsetSeconds: this.subtitleOffsets.get(titleId) ?? 0,
      subtitleTrackIndex: title.subtitles[0]?.index ?? null,
      audioTrackIndex: title.audioTracks[0]?.index ?? null,
      chapters: titleId === SampleLibrary.nightfallDrive.id ? SampleLibrary.chapters : [],
      trickplay: null,
    };
  }

  async setTracks(
    _titleId: string,
    _subtitleTrackIndex: number | null,
    _audioTrackIndex: number | null,
  ): Promise<void> {}

  async setSubtitleOffset(titleId: string, offsetSeconds: number): Promise<void> {
    this.subtitleOffsets.set(titleId, offsetSeconds);
  }

  async recordProgress(
    titleId: string,
    positionSeconds: number,
    _finished = false,
  ): Promise<void> {
    this.progress.set(titleId, positionSeconds);
  }

  // --- Saved copies ------------------------------------------------------

  async savedSummary(): Promise<SavedSummary> {
    await this.pause();
    return SampleLibrary.savedSummary;
  }

  async download(titleId: string): Promise<void> {
    await this.pause(200);
    const title = SampleLibrary.all.find((t) => t.id === titleId);
    if (!title) return;
    if (this._saved.get().some((s) => s.title.id === titleId)) return;
    this._saved.update((items) => [
      ...items,
      {
        id: `s-${titleId}`,
        title,
        state: { type: 'COPYING', percent: 0 },
        sizeBytes: title.file.sizeBytes,
      },
    ]);
  }

  async cancelDownload(savedItemId: string): Promise<void> {
    this._saved.update((items) =>
      items.filter((s) => !(s.id === savedItemId && isInProgress(s))),
    );
  }

  async deleteSaved(savedItemId: string): Promise<void> {
    this._saved.update((items) => items.filter((s) => s.id !== savedItemId));
  }

  // --- Casting and handoff ----------------------------------------------

  castDevices(): Flow<CastDevice[]> {
    return this._cast;
  }
}
