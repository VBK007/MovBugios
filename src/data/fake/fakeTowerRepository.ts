import { EmptyMusicHome, MusicHome } from '@/domain/model/musicHome';
import { Answer } from '@/domain/model/assistant';
import { EmptyTeaserPage, Teaser, TeaserPage } from '@/domain/model/teaser';
import { CastMember } from '@/domain/model/people';
import {
  Collections,
  EmptySearchResults,
  Recommendation,
  SearchResults,
  SearchTerm,
} from '@/domain/model/collection';
import { Language } from '@/domain/model/preferences';
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
  primaryGenre,
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
      case 'VIEWS':
        return [...items].sort((a, b) => b.engagement.views - a.engagement.views);
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

  /**
   * A deliberately small version of the server's sentence parse.
   *
   * It reads a genre and a year out of the phrase and nothing else. The point is
   * not to match the server rule for rule — it is that the chips are real here
   * too, so the screen can be exercised without one, and so a phrase this
   * reading cannot make sense of reports `understoodNothing` honestly rather
   * than pretending to have understood.
   */
  async search(query: string): Promise<SearchResults> {
    await this.pause(220);
    this.requireAwake();
    if (query.trim() === '') return EmptySearchResults;

    const words = query.split(/[ ,]+/).filter((w) => w !== '');
    const genres = [...new Set(SampleLibrary.all.flatMap((t) => t.genres))];

    let genre: { matched: string; name: string } | null = null;
    for (const word of words) {
      const hit = genres.find((g) => g.toLowerCase() === word.toLowerCase());
      if (hit) {
        genre = { matched: word, name: hit };
        break;
      }
    }
    const yearWord = words.find((w) => /^\d{4}$/.test(w));
    const year = yearWord != null ? Number(yearWord) : null;

    const terms: SearchTerm[] = [];
    if (genre) terms.push({ field: 'genre', label: genre.name, matched: genre.matched });
    if (year != null) {
      terms.push({ field: 'year', label: `From ${year}`, matched: String(year) });
    }

    // Whatever the parse claimed is removed from the free text, so "action
    // 2019" does not then also have to appear in a filename.
    const rest = words
      .filter((w) => !terms.some((t) => t.matched?.toLowerCase() === w.toLowerCase()))
      .join(' ');

    const chosen = genre;
    const titles = SampleLibrary.all.filter((title) => {
      if (chosen && !title.genres.some((g) => g.toLowerCase() === chosen.name.toLowerCase())) {
        return false;
      }
      if (year != null && title.year !== year) return false;
      if (rest.trim() === '') return true;
      const needle = rest.toLowerCase();
      return (
        title.name.toLowerCase().includes(needle) ||
        title.file.filename.toLowerCase().includes(needle)
      );
    });

    return { titles, terms, understoodNothing: terms.length === 0, readByModel: false };
  }

  /**
   * Empty, deliberately — the sample library has no standing to answer this.
   *
   * The obvious implementation derives it from the sample files' audio tracks,
   * and that is actively wrong. The first-run questions are asked *before*
   * anyone signs in, so on a fresh install this repository is what they reach:
   * returning English and Hindi because two invented files carry them would
   * offer a Tamil household two languages it does not want and hide the six it
   * might. Empty means "no server to ask", which is the truth here, and the
   * screen falls back to the standing list.
   */
  async libraryLanguages(): Promise<Language[]> {
    return [];
  }

  /**
   * A plausible handful, so the screen has something to be.
   *
   * Unlike the languages above, inventing these is harmless: a collection is a
   * *name for a query*, and the sample library really does contain unwatched
   * titles and 4K ones. The counts are computed from it rather than typed in,
   * so a preview cannot claim nine films the sample disk has never had.
   */
async assistantAvailable(): Promise<boolean> {
    return false;
  }

  async ask(): Promise<Answer> {
    return {
      text: 'There is no server to ask. Connect to Tower to use the assistant.',
      lookups: [],
      answered: false,
    };
  }

  /**
   * Empty, and for the same reason the assistant is off.
   *
   * A teaser is a real encode of a real film's real frames. The sample library
   * has no files behind it, so the only thing that could be returned here is a
   * clip that does not play — and a feed of those is worse than a feed that
   * honestly says the disk has none.
   */
  async teaserFeed(): Promise<TeaserPage> {
    return EmptyTeaserPage;
  }

  async cast(): Promise<CastMember[]> {
    return [];
  }

  async teasers(): Promise<Teaser[]> {
    return [];
  }

  async trackPreview(): Promise<PlaybackSource | null> {
    return null;
  }

    /**
   * Empty, for the same reason the assistant is off: the sample library has no
   * audio to analyse, and rails derived from tempo and energy cannot be invented
   * without claiming a machine listened to something.
   */
  async musicHome(): Promise<MusicHome> {
    return EmptyMusicHome;
  }

  async collections(): Promise<Collections> {
    await this.pause();
    this.requireAwake();
    const unwatched = SampleLibrary.all.filter((t) => t.watchState !== 'WATCHED').length;
    const fourK = SampleLibrary.all.filter((t) => isTitle4k(t)).length;
    const ours = SampleLibrary.homeVideos.length;

    const byGenre = new Map<string, number>();
    for (const genre of SampleLibrary.all.flatMap((t) => t.genres)) {
      byGenre.set(genre, (byGenre.get(genre) ?? 0) + 1);
    }

    return {
      builtin: [
        {
          id: 'builtin:never-watched',
          kind: 'BUILTIN',
          name: 'Never watched',
          icon: '👀',
          pinned: false,
          itemCount: unwatched,
        },
        {
          id: 'builtin:four-k',
          kind: 'BUILTIN',
          name: 'In 4K',
          icon: '✨',
          pinned: false,
          itemCount: fourK,
        },
        {
          id: 'builtin:our-own',
          kind: 'BUILTIN',
          name: 'Ours',
          icon: '🏠',
          pinned: false,
          itemCount: ours,
        },
      ],
      custom: [],
      discovered: [...byGenre.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([genre, count]) => ({
          id: `discovered:genre:${genre.toLowerCase()}`,
          kind: 'DISCOVERED' as const,
          name: genre,
          icon: null,
          pinned: false,
          itemCount: count,
        })),
    };
  }

  async collectionItems(id: string): Promise<Title[]> {
    await this.pause();
    this.requireAwake();
    if (id.endsWith('never-watched')) {
      return SampleLibrary.all.filter((t) => t.watchState !== 'WATCHED');
    }
    if (id.endsWith('four-k')) return SampleLibrary.all.filter((t) => isTitle4k(t));
    if (id.endsWith('our-own')) return SampleLibrary.homeVideos;
    if (id.startsWith('discovered:genre:')) {
      const genre = id.slice(id.lastIndexOf(':') + 1);
      return SampleLibrary.all.filter((t) =>
        t.genres.some((g) => g.toLowerCase() === genre.toLowerCase()),
      );
    }
    return SampleLibrary.all;
  }

  /**
   * Highly-rated titles nobody has finished, with the reason spelled out.
   *
   * Not the real algorithm and not pretending to be — the point is that the rail
   * has the right *shape* offline: a few posters, each carrying a sentence
   * naming why it is there. A reason invented from the sample library's own
   * genres is honest about being sample data.
   */
  async recommendations(limit = 20): Promise<Recommendation[]> {
    await this.pause();
    this.requireAwake();
    const seed =
      SampleLibrary.all.find((t) => t.watchState === 'WATCHED') ?? SampleLibrary.all[0];
    return SampleLibrary.all
      .filter((t) => t.watchState !== 'WATCHED' && (t.rating ?? 0) > 0)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, limit)
      .map((title) => {
        const genre = primaryGenre(title);
        return { title, reason: genre != null ? `More ${genre}, like ${seed.name}` : null };
      });
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
