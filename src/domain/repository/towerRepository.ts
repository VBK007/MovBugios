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

  search(query: string): Promise<Title[]>;

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
