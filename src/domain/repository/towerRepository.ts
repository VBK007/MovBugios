import { MusicHome } from '@/domain/model/musicHome';
import { Answer } from '@/domain/model/assistant';
import { Teaser, TeaserPage } from '@/domain/model/teaser';
import { CastMember } from '@/domain/model/people';
import {
  Collections,
  Recommendation,
  SearchResults,
} from '@/domain/model/collection';
import { Language } from '@/domain/model/preferences';
import { Flow } from '@/data/store';
import { SavedItem, SavedSummary } from '@/domain/model/downloads';
import {
  JumpTarget,
  LibraryFilters,
  LibrarySummary,
  Timeline,
  TimelineGrouping,
} from '@/domain/model/library';
import { MediaKind, Title } from '@/domain/model/media';
import { CastDevice, Profile } from '@/domain/model/people';
import {
  ClientCapabilities,
  PlaybackSource,
  PlayerState,
} from '@/domain/model/player';
import { DiscoveredServer, ServerState } from '@/domain/model/server';

/**
 * Everything the app needs from a home media server.
 *
 * The whole point of this interface is that the transport behind it is
 * replaceable: `data/remote` speaks to the real server over HTTP, `data/fake`
 * serves the sample library so previews and the whole app run without one.
 * Nothing above this line knows which is in use, and nothing above this line
 * imports anything from `data/remote`.
 *
 * Ported from domain/repository/TowerRepository.kt. This is the browse-flow
 * surface; requests, mismatches and admin arrive with the screens that use them.
 */
export interface TowerRepository {
  // --- Connection --------------------------------------------------------

  /** Live. Every screen reacts to this rather than polling. */
  readonly serverState: Flow<ServerState>;

  /** mDNS/SSDP sweep of the local network. */
  discoverServers(): Flow<DiscoveredServer[]>;

  pair(server: DiscoveredServer): Promise<void>;

  pairManually(baseUrl: string): Promise<void>;

  /** Wake-on-LAN, then poll until it answers. Takes about 8 seconds. */
  wakeServer(): Promise<void>;

  // --- Profiles ----------------------------------------------------------

  readonly profiles: Flow<Profile[]>;

  readonly activeProfile: Flow<Profile | null>;

  selectProfile(profileId: string): Promise<void>;

  // --- Browsing ----------------------------------------------------------

  librarySummary(): Promise<LibrarySummary>;

  /**
   * The languages this library actually holds, for the first-run question.
   *
   * Empty is a real answer and means "the server cannot say" — nothing probed,
   * nothing scanned, or no server at all. Callers fall back to
   * `OfferedLanguages` rather than showing an empty list, because a question
   * with no options is worse than a question with the wrong ones.
   */
  libraryLanguages(): Promise<Language[]>;

  browse(filters: LibraryFilters, page?: number): Promise<Title[]>;

  recentlyAdded(kinds?: MediaKind[], limit?: number): Promise<Title[]>;

  continueWatching(limit?: number): Promise<Title[]>;

  /**
   * Highest-rated titles, for the Home rail.
   *
   * Returns only items that actually carry a rating. The server will happily
   * sort by rating with nulls last, but a "Top rated" shelf of unrated files is
   * just the library in a different order — so an unmatched library correctly
   * yields an empty list and the rail does not appear at all.
   */
  topRated(limit?: number): Promise<Title[]>;

  detail(titleId: string): Promise<Title>;

  /**
   * A whole phrase, and what the server made of it.
   *
   * Distinct from a title substring match: the server reads "Tamil films under
   * 2 hours" into filters and returns its reading alongside the results, so the
   * screen can show the reading and let somebody take a wrong part back off.
   */
  search(query: string): Promise<SearchResults>;

  /**
   * Whether this server has an assistant to ask.
   *
   * Asked before the box is offered, not discovered by asking. The server ships
   * it switched off, and an empty text field that can only ever reply "that is
   * off" is a worse feature than no text field.
   */
  assistantAvailable(): Promise<boolean>;

  /**
   * Asks the library a question in whatever words somebody used.
   *
   * Never throws for an assistant that is off, stuck or unreachable — those come
   * back as an `Answer` with `answered = false` and prose explaining itself,
   * because there is nothing useful to retry into.
   */
  ask(question: string): Promise<Answer>;

  /**
   * The teaser feed: short vertical clips cut from films across the library.
   *
   * Paged, because this is meant to be scrolled. Only finished, published clips
   * come back — a queued or failed one has no file to play, and this app has no
   * admin screen to show a job on.
   */
  teaserFeed(page?: number, seed?: number | null): Promise<TeaserPage>;

  /**
   * The billed names for a film, with faces where the server resolved one.
   *
   * Empty is the ordinary answer, not a failure: the catalogue gives a cast
   * member no identity beyond their name, so a photo is looked up by a slug of
   * it and often does not resolve.
   */
  cast(titleId: string): Promise<CastMember[]>;

  /** The published clips for one film, for its detail screen. */
  teasers(titleId: string): Promise<Teaser[]>;

  /**
   * The twenty-second preview of a track: where the bytes are, and the headers
   * to fetch them with.
   *
   * No round trip — the URL is a deterministic function of the id, and the
   * server generates the clip on first request and caches it. Returned as a
   * `PlaybackSource` rather than a bare string because a URL without the bearer
   * token that opens it is not something a player can use, and that pairing is
   * exactly what this type is.
   *
   * Null for anything that is not music, and on a server too old to have the
   * endpoint — the row that shows it is then simply absent.
   */
  trackPreview(titleId: string): Promise<PlaybackSource | null>;

  /**
   * The music screen: shelves computed from the audio itself.
   *
   * A separate call from `browse` because it answers a different question. The
   * grid is right for films — a poster is how you recognise one — and wrong for
   * three hundred tracks, which at tile size all look the same.
   */
  musicHome(limit?: number): Promise<MusicHome>;

  /** Saved searches, split into the three kinds by the server. */
  collections(): Promise<Collections>;

  collectionItems(id: string, page?: number): Promise<Title[]>;

  /**
   * What to watch, chosen for whoever is signed in.
   *
   * Empty is a real answer: no server, or a library too small to say anything.
   * The rail then does not appear, which is better than a shelf of guesses
   * under a heading promising they are for you.
   */
  recommendations(limit?: number): Promise<Recommendation[]>;

  jumpTargets(query: string): Promise<JumpTarget[]>;

  timeline(grouping?: TimelineGrouping): Promise<Timeline>;

  // --- Playback ----------------------------------------------------------

  /**
   * Asks the server how this device should play the title. Call this before
   * committing to playback so the plan can be shown first.
   */
  playbackDecision(
    titleId: string,
    capabilities: ClientCapabilities,
    startSeconds?: number,
  ): Promise<PlaybackSource>;

  playerState(titleId: string): Promise<PlayerState>;

  setTracks(
    titleId: string,
    subtitleTrackIndex: number | null,
    audioTrackIndex: number | null,
  ): Promise<void>;

  setSubtitleOffset(titleId: string, offsetSeconds: number): Promise<void>;

  /** Idempotent; called every few seconds and again on pause and stop. */
  recordProgress(titleId: string, positionSeconds: number, finished?: boolean): Promise<void>;

  // --- Saved copies ------------------------------------------------------

  readonly savedItems: Flow<SavedItem[]>;

  savedSummary(): Promise<SavedSummary>;

  download(titleId: string): Promise<void>;

  cancelDownload(savedItemId: string): Promise<void>;

  deleteSaved(savedItemId: string): Promise<void>;

  // --- Casting and handoff ----------------------------------------------

  castDevices(): Flow<CastDevice[]>;
}
