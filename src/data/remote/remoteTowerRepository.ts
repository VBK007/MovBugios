import { Flow, MutableStateFlow } from '@/data/store';
import { CredentialStore } from '@/data/remote/credentialStore';
import { AuthResponseDto } from '@/data/remote/dto';
import { TowerAuthError, TowerHttpError } from '@/data/remote/errors';
import {
  capabilitiesToDto,
  commentPageToDomain,
  commentToDomain,
  decisionToSource,
  continueWatchingToTitle,
  detailToTitle,
  humanisedReason,
  librarySummaryToDomain,
  partyToDomain,
  playerStateToDomain,
  profileToDomain,
  summaryToTitle,
  timelineToDomain,
} from '@/data/remote/mappers';
import { Comment, CommentPage } from '@/domain/model/comment';
import { SignInRecord } from '@/domain/model/signInRecord';
import { Preferences, QualityCap, QualityCaps } from '@/domain/model/preferences';
import { WatchParty, normalisePartyCode } from '@/domain/model/watchParty';
import { PartySocket } from '@/data/remote/partySocket';
import { DiskUsage, Mismatch, ServerHealth } from '@/domain/model/admin';
import { LiveSession, WatchHabit } from '@/domain/model/people';
import {
  diskToDomain,
  habitsToDomain,
  healthToDomain,
  mismatchesToDomain,
  sessionsToDomain,
} from '@/data/remote/adminMappers';
import { deviceId } from '@/data/remote/deviceIdentity';
import {
  ClientCapabilities,
  PlaybackSource,
  PlayerState,
} from '@/domain/model/player';
import { TowerApi } from '@/data/remote/towerApi';
import { CredentialKeys, TowerSession } from '@/data/remote/towerSession';
import { EmptySavedSummary, SavedItem, SavedSummary } from '@/domain/model/downloads';
import {
  JumpTarget,
  LibraryFilters,
  LibrarySortMeta,
  LibrarySummary,
  Timeline,
  TimelineGrouping,
  TimelineGroupingMeta,
} from '@/domain/model/library';
import {
  Engagement,
  MediaKind,
  PlaybackPlan,
  Title,
  directPlay,
  transcode,
} from '@/domain/model/media';
import { CastDevice, Profile } from '@/domain/model/people';
import { DiscoveredServer, ServerState, Sleeping, online } from '@/domain/model/server';
import { TowerRepository } from '@/domain/repository/towerRepository';
import { ServerAsleepError } from '@/ui/uiState';

/**
 * `explain` returns reasoning, not a verdict, and it is never silent: a direct
 * play comes back as ["Direct play: container and codecs match client
 * capabilities"]. An earlier version treated any non-empty list as a transcode,
 * which labelled every playable file "will transcode". That one sentinel prefix
 * is the only marker the server gives.
 */
const DIRECT_PLAY_PREFIX = 'direct play';

/**
 * What this device can decode, sent so the server can decide how to send a file.
 *
 * Conservative on purpose: iOS decodes H.264 and HEVC in hardware, but 10-bit
 * HEVC in MKV is exactly the case the sample library's "Copper Sky" exercises,
 * and claiming it would turn a working transcode into a black screen.
 */
function currentCapabilities() {
  return {
    containers: ['mp4', 'mov', 'm4v'],
    videoCodecs: ['h264', 'hevc'],
    audioCodecs: ['aac', 'mp3', 'ac3', 'eac3'],
    maxHeight: 2160,
  };
}

/** The nearest cap to a height the server reported. */
function capForHeight(height?: number | null): QualityCap {
  if (height == null) return 'MEDIUM';
  if (height <= 480) return 'LOW';
  if (height <= 720) return 'MEDIUM';
  return 'HIGH';
}

/**
 * The real server, over HTTP.
 *
 * Ported from data/remote/RemoteTowerRepository.kt — the browse-flow surface.
 * Everything that is not implemented here throws rather than returning an empty
 * value, so a missing feature reads as a missing feature rather than an empty
 * library.
 */
export class RemoteTowerRepository implements TowerRepository {
  private readonly _serverState = new MutableStateFlow<ServerState>(online());
  private readonly _profiles = new MutableStateFlow<Profile[]>([]);
  private readonly _activeProfile = new MutableStateFlow<Profile | null>(null);
  private readonly _saved = new MutableStateFlow<SavedItem[]>([]);
  private readonly _cast = new MutableStateFlow<CastDevice[]>([]);
  private readonly _discovered = new MutableStateFlow<DiscoveredServer[]>([]);

  constructor(
    private readonly api: TowerApi,
    private readonly session: TowerSession,
  ) {
    this.api.onTokensRenewed = (auth) => this.storeTokens(auth);
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

  private baseUrl(): string | null {
    return this.session.baseUrl.get();
  }

  /**
   * Maps a dead connection onto "asleep", which is a state the UI can offer a
   * remedy for, and lets everything else through as itself.
   */
  private async guarded<T>(block: () => Promise<T>): Promise<T> {
    try {
      return await block();
    } catch (error) {
      if (error instanceof TowerAuthError || error instanceof TowerHttpError) throw error;
      // A network-level failure against a paired server is what a spun-down disk
      // looks like from here.
      this._serverState.set(Sleeping);
      throw new ServerAsleepError();
    }
  }

  // --- Connection --------------------------------------------------------

  discoverServers(): Flow<DiscoveredServer[]> {
    return this._discovered;
  }

  async pair(_server: DiscoveredServer): Promise<void> {
    throw new Error('Pairing by discovery is not wired yet.');
  }

  async pairManually(baseUrl: string): Promise<void> {
    this.session.setBaseUrl(baseUrl);
    if (!(await this.api.health())) {
      this.session.setBaseUrl(null);
      throw new TowerHttpError(0, `No server answered at ${baseUrl}`);
    }
    await CredentialStore.write(CredentialKeys.baseUrl, this.session.baseUrl.get());
    this._serverState.set(online());
  }

  /**
   * Wake-on-LAN is a magic packet on the LAN, not an HTTP call — a sleeping
   * machine cannot serve the request that would wake it. This polls until the
   * server answers; the packet itself belongs to the platform layer.
   */
  async wakeServer(): Promise<void> {
    this._serverState.set({ type: 'WAKING' });
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (await this.api.health()) {
        this._serverState.set(online());
        return;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
    this._serverState.set(Sleeping);
    throw new TowerHttpError(0, 'The server did not wake within twenty seconds.');
  }

  // --- Auth --------------------------------------------------------------

  async login(usernameOrEmail: string, password: string): Promise<void> {
    await this.adoptSession(await this.api.login(usernameOrEmail, password));
  }

  /**
   * Creates an account and signs straight into it.
   *
   * The server hands back the same `AuthResponse` a login does, so everything
   * after it is identical — which is why both go through `adoptSession`.
   */
  async register(
    username: string,
    email: string,
    password: string,
    displayName: string,
  ): Promise<void> {
    await this.adoptSession(await this.api.register(username, email, password, displayName));
  }

  /**
   * Signs in with Google.
   *
   * The Firebase ID token is proof of identity to Tower, not a session — the
   * server verifies it and issues its own JWT, which is what every later request
   * carries. A **501** means the server has no Firebase credentials configured,
   * which is about the server rather than about this phone.
   */
  async loginWithFirebase(idToken: string): Promise<void> {
    await this.adoptSession(await this.api.loginWithFirebase(idToken));
  }

  /**
   * The half of signing in that happens once the server has said yes.
   *
   * The token is persisted immediately, before anything that can throw. This
   * used to run last, after loading profiles. Either can fail on a flaky
   * connection, and because the caller was a catch-all that aborted the write —
   * leaving a session that worked for the rest of the run and vanished on
   * relaunch. Signing in is a thing you do once per device, so the token is
   * saved the moment it exists and the rest is best-effort.
   */
  private async adoptSession(auth: AuthResponseDto): Promise<void> {
    this.session.token.set(auth.token);
    await this.storeTokens(auth);

    try {
      await this.loadProfiles(auth.user?.displayName ?? auth.user?.username ?? null);
      await CredentialStore.write(CredentialKeys.profileId, this.session.profileId.get());
    } catch {
      // Best-effort, as above. A signed-in session with no profile list is still
      // a signed-in session.
    }
    this._serverState.set(online());
  }

  private async storeTokens(auth: AuthResponseDto): Promise<void> {
    if (auth.refreshToken) this.session.refreshToken.set(auth.refreshToken);
    await CredentialStore.write(CredentialKeys.token, auth.token);
    await CredentialStore.write(CredentialKeys.refreshToken, this.session.refreshToken.get());
  }

  private async loadProfiles(fallbackName: string | null): Promise<void> {
    const dtos = await this.api.profiles();
    const profiles = dtos.map(profileToDomain);
    this._profiles.set(profiles);

    const remembered = this.session.profileId.get();
    const chosen = profiles.find((p) => p.id === remembered) ?? profiles[0] ?? null;
    if (chosen) {
      this.session.profileId.set(chosen.id);
      this._activeProfile.set(chosen);
    } else if (fallbackName) {
      // A server with no profiles still has an account, and Home's greeting is
      // better with a name than without one.
      this._activeProfile.set({
        id: '',
        name: fallbackName,
        ageMode: 'OLDER',
        isOwner: true,
      });
    }
  }

  /** Restores a session saved by a previous run. Returns true if one was found. */
  async restoreSession(): Promise<boolean> {
    const baseUrl = await CredentialStore.read(CredentialKeys.baseUrl);
    if (!baseUrl) return false;
    this.session.setBaseUrl(baseUrl);

    const token = await CredentialStore.read(CredentialKeys.token);
    if (!token) return false;
    this.session.token.set(token);
    this.session.refreshToken.set(await CredentialStore.read(CredentialKeys.refreshToken));
    this.session.profileId.set(await CredentialStore.read(CredentialKeys.profileId));

    try {
      await this.loadProfiles(null);
      this._serverState.set(online());
      return true;
    } catch {
      return false;
    }
  }

  async selectProfile(profileId: string): Promise<void> {
    const profile = this._profiles.get().find((p) => p.id === profileId) ?? null;
    this.session.profileId.set(profileId);
    this._activeProfile.set(profile);
    await CredentialStore.write(CredentialKeys.profileId, profileId);
  }

  async signOut(): Promise<void> {
    this.session.clear();
    this.session.setBaseUrl(null);
    for (const key of Object.values(CredentialKeys)) {
      await CredentialStore.write(key, null);
    }
  }

  // --- Per-profile settings ----------------------------------------------

  /**
   * The first-run answers as the server holds them, or null if it has none.
   *
   * What makes storing them worth the round trip: a reinstall, or a second
   * device, reads these instead of asking the same three questions again. Null
   * on any failure too, which means asking — the safe way to be wrong.
   */
  async remotePreferences(): Promise<Preferences | null> {
    try {
      const dto = await this.api.settings();
      const language = dto.preferredLanguage?.trim();
      const genres = dto.preferredGenres ?? [];
      // A profile that has never been asked comes back with nothing set, which
      // is not an answer — treating it as one would skip the questions for
      // somebody who has not seen them.
      if (!language && genres.length === 0) return null;
      return {
        language: language && language !== '' ? language : null,
        genres,
        mobileQuality: capForHeight(dto.awayMaxHeight),
        completed: true,
      };
    } catch {
      return null;
    }
  }

  async savePreferences(preferences: Preferences): Promise<void> {
    try {
      await this.api.updateSettings({
        awayMaxHeight: QualityCaps[preferences.mobileQuality].maxHeight,
        // Empty string rather than omitted: an absent field means "leave
        // unchanged" server-side, so it is the only way to say "no language".
        preferredLanguage: preferences.language ?? '',
        preferredGenres: preferences.genres,
      });
    } catch {
      // The phone's copy is the one the app reads; this is the one that
      // survives a reinstall, and losing it is not worth an error.
    }
  }

  // --- Owner panel -------------------------------------------------------

  serverHealth(): Promise<ServerHealth> {
    return this.guarded(async () => healthToDomain(await this.api.serverHealth()));
  }

  watchHabits(): Promise<WatchHabit[]> {
    return this.guarded(async () => habitsToDomain(await this.api.watchHabits()));
  }

  diskUsage(): Promise<DiskUsage> {
    return this.guarded(async () => diskToDomain(await this.api.diskUsage()));
  }

  mismatches(): Promise<Mismatch[]> {
    return this.guarded(async () => mismatchesToDomain(await this.api.mismatches()));
  }

  applyMatch(mismatchId: string, candidateId: string): Promise<void> {
    return this.guarded(() => this.api.applyMatch(mismatchId, candidateId));
  }

  /** Home videos are a library root, not a genre — the server moves the file. */
  moveToHomeVideos(mismatchId: string): Promise<void> {
    return this.guarded(() => this.api.reclassify(mismatchId, 'HOME_VIDEO'));
  }

  /** Leaves the file on the disk and stops asking about it. */
  leaveUnmatched(mismatchId: string): Promise<void> {
    return this.guarded(() => this.api.unmatch(mismatchId));
  }

  endSession(sessionId: string): Promise<void> {
    return this.guarded(() => this.api.endSession(sessionId));
  }

  rescanLibrary(): Promise<void> {
    return this.guarded(() => this.api.rescanLibrary());
  }

  async seedAnalytics(): Promise<string | null> {
    const result = await this.api.seedAnalytics();
    return result.message ?? null;
  }

  async backfillArtwork(): Promise<string | null> {
    const result = await this.api.backfillArtwork();
    return result.message ?? null;
  }

  setAdminKey(key: string | null): void {
    this.api.setAdminKey(key);
  }

  adminKey(): string | null {
    return this.api.adminKey();
  }

  /**
   * Live sessions, polled.
   *
   * The Kotlin has a flow the server pushes to; there is no such stream here, so
   * the panel polls while it is open. Every few seconds is right for something
   * that changes when somebody presses play.
   */
  liveSessions(onChange: (sessions: LiveSession[]) => void): () => void {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const health = await this.api.serverHealth();
        onChange(sessionsToDomain(health));
      } catch {
        // A poll that fails is not worth surfacing; the next one is seconds away.
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 5_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }

  // --- Watch together ----------------------------------------------------
  //
  // Not on the TowerRepository interface: a party needs a live server — a join
  // code, a socket, a shared clock — so there is no sample implementation to put
  // behind it, and its surface is several calls rather than one flow.

  async hostParty(mediaItemId: string): Promise<WatchParty> {
    return partyToDomain(await this.api.createParty(mediaItemId));
  }

  async joinParty(code: string): Promise<WatchParty> {
    return partyToDomain(await this.api.joinParty(normalisePartyCode(code)));
  }

  async partyState(code: string): Promise<WatchParty> {
    return partyToDomain(await this.api.partyState(normalisePartyCode(code)));
  }

  async admitGuest(code: string, requestId: string, allow: boolean): Promise<WatchParty> {
    return partyToDomain(await this.api.admitGuest(code, requestId, allow));
  }

  /**
   * Leaving is not the same as ending.
   *
   * The host closing the party ends it for everyone; anyone else only gives up
   * their own seat, and the film carries on without them.
   */
  async leaveParty(code: string, asHost: boolean): Promise<void> {
    try {
      if (asHost) await this.api.endParty(code);
      else await this.api.leaveParty(code);
    } catch {
      // Already gone, or the server ended it first. Either way the caller is
      // leaving the screen.
    }
  }

  partySocket(): PartySocket {
    return new PartySocket(this.api);
  }

  /** The token the socket handshake carries in its query string. */
  socketToken(): string | null {
    return this.api.sessionToken();
  }

  // --- Sign-in history ---------------------------------------------------

  /**
   * Where this account has been used.
   *
   * Not wrapped in `guarded`: the screen distinguishes a server that predates
   * the endpoint from one that is unreachable, and `guarded` would flatten both
   * into "asleep".
   */
  async loginHistory(): Promise<SignInRecord[]> {
    // Resolved rather than read from a cache: that is only populated by a
    // sign-in, so on a launch that restored a saved token it would still be null
    // and no row would be marked as the phone in your hand.
    const thisDevice = await deviceId();
    const events = await this.api.loginHistory();
    return events.map((event) => ({
      id: event.id,
      deviceId: event.deviceId ?? null,
      device: event.platform ?? 'Unknown device',
      appVersion: event.appVersion ?? null,
      ip: event.ip ?? null,
      place:
        [event.region, event.country].filter((p) => p != null && p !== '').join(', ') || null,
      at: event.at ?? null,
      isThisDevice: event.deviceId === thisDevice,
    }));
  }

  // --- Likes and comments ------------------------------------------------

  /**
   * Toggles this profile's like and returns the new count.
   *
   * The count comes back from the server rather than being incremented locally,
   * so a second device liking the same title is reflected without refetching the
   * whole title.
   */
  setLiked(titleId: string, liked: boolean): Promise<Engagement> {
    return this.guarded(async () => {
      const dto = liked ? await this.api.like(titleId) : await this.api.unlike(titleId);
      return {
        views: 0,
        likes: dto.likeCount ?? 0,
        comments: 0,
        likedByMe: dto.liked ?? false,
      };
    });
  }

  comments(titleId: string, page = 0): Promise<CommentPage> {
    return this.guarded(async () => commentPageToDomain(await this.api.comments(titleId, page)));
  }

  postComment(titleId: string, body: string): Promise<Comment> {
    return this.guarded(async () => commentToDomain(await this.api.postComment(titleId, body)));
  }

  editComment(titleId: string, commentId: string, body: string): Promise<Comment> {
    return this.guarded(async () =>
      commentToDomain(await this.api.editComment(titleId, commentId, body)),
    );
  }

  deleteComment(titleId: string, commentId: string): Promise<void> {
    return this.guarded(() => this.api.deleteComment(titleId, commentId));
  }

  // --- Browsing ----------------------------------------------------------

  librarySummary(): Promise<LibrarySummary> {
    return this.guarded(async () => librarySummaryToDomain(await this.api.librarySummary()));
  }

  browse(filters: LibraryFilters, page = 0): Promise<Title[]> {
    return this.guarded(async () => {
      const dto = await this.api.browse({
        category: filters.category ?? 'all',
        unwatched: filters.unwatchedOnly,
        minHeight: filters.fourKOnly ? 2160 : null,
        sort: LibrarySortMeta[filters.sort].wire,
        page,
      });
      return (dto.items ?? []).map((i) => summaryToTitle(i, this.baseUrl()));
    });
  }

  recentlyAdded(kinds: MediaKind[] = [], limit = 20): Promise<Title[]> {
    return this.guarded(async () => {
      const items = await this.api.recentlyAdded(
        kinds.length > 0 ? kinds.join(',') : null,
        limit,
      );
      return items.map((i) => summaryToTitle(i, this.baseUrl()));
    });
  }

  continueWatching(limit = 20): Promise<Title[]> {
    return this.guarded(async () => {
      const items = await this.api.continueWatching(limit);
      return items.map((i) => continueWatchingToTitle(i, this.baseUrl()));
    });
  }

  topRated(limit = 20): Promise<Title[]> {
    return this.guarded(async () => {
      const dto = await this.api.browse({ sort: 'rating', size: limit });
      return (
        (dto.items ?? [])
          .map((i) => summaryToTitle(i, this.baseUrl()))
          // The server sorts nulls last rather than excluding them, so the tail
          // of this page is unrated files. Dropping them here is what keeps the
          // rail honest about being "top rated".
          .filter((t) => (t.rating ?? 0) > 0)
      );
    });
  }

  /**
   * Fetches the title and its playback plan together.
   *
   * The detail screen's whole point is showing what will happen before the user
   * commits, and `explain` is the endpoint that answers that without opening a
   * session or starting an ffmpeg process.
   */
  detail(titleId: string): Promise<Title> {
    return this.guarded(async () => {
      const dto = await this.api.detail(titleId);

      let reasons: string[] = [];
      try {
        reasons = await this.api.explainPlayback(titleId, currentCapabilities());
      } catch {
        // No verdict is a grey "not checked yet", which is honest.
      }

      const isDirect =
        reasons.length === 0 ||
        reasons.some((r) => r.toLowerCase().startsWith(DIRECT_PLAY_PREFIX));

      const height = dto.mediaInfo?.height;
      const plan: PlaybackPlan = isDirect
        ? directPlay({
            resolution: height != null ? `${height}p` : null,
            bitrateMbps:
              dto.mediaInfo?.bitrate != null
                ? Math.round(dto.mediaInfo.bitrate / 100_000) / 10
                : null,
            // The server's own sentence is dropped here: "container and codecs
            // match client capabilities" restates the heading, and the card
            // writes a better one.
            reasons: [],
          })
        : transcode({
            fromResolution: height != null ? `${height}p` : null,
            toResolution: '1080p',
            reasons: reasons.map(humanisedReason),
          });

      return detailToTitle(dto, plan, this.baseUrl());
    });
  }

  search(query: string): Promise<Title[]> {
    return this.guarded(async () => {
      const dto = await this.api.browse({ query, size: 60 });
      return (dto.items ?? []).map((i) => summaryToTitle(i, this.baseUrl()));
    });
  }

  /**
   * The server has `/genres` and `/people` but no endpoint that says which of
   * them match a query, so the chips are filtered client-side from the two full
   * lists. Both are small.
   */
  jumpTargets(query: string): Promise<JumpTarget[]> {
    return this.guarded(async () => {
      if (query.trim() === '') return [];
      let people: string[] = [];
      try {
        people = await this.api.people();
      } catch {
        return [];
      }
      return people
        .filter((p) => p.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 4)
        .map((p): JumpTarget => ({ label: p, kind: 'PERSON' }));
    });
  }

  timeline(grouping: TimelineGrouping = 'DATE'): Promise<Timeline> {
    return this.guarded(async () => {
      const dto = await this.api.timeline(TimelineGroupingMeta[grouping].wire);
      return timelineToDomain(dto, this.baseUrl());
    });
  }

  // --- Playback ----------------------------------------------------------

  /**
   * Asks the server how to play this, which is what produces a URL.
   *
   * The stream headers are attached here rather than in the player, so the
   * bearer token never has to be reachable from the UI.
   */
  async playbackDecision(
    titleId: string,
    capabilities: ClientCapabilities,
    startSeconds = 0,
  ): Promise<PlaybackSource> {
    const decision = await this.api.playbackDecision(
      titleId,
      capabilitiesToDto(capabilities),
      startSeconds,
    );
    const source = decisionToSource(decision, this.api.absolute(decision.url));
    return { ...source, headers: this.api.streamHeaders() };
  }

  playerState(titleId: string): Promise<PlayerState> {
    return this.guarded(async () => playerStateToDomain(await this.api.playerState(titleId)));
  }

  async setTracks(
    titleId: string,
    subtitleTrackIndex: number | null,
    audioTrackIndex: number | null,
  ): Promise<void> {
    try {
      await this.api.setTracks(titleId, subtitleTrackIndex, audioTrackIndex);
    } catch {
      // A remembered track choice is a convenience; failing to store it must not
      // interrupt the film it was made during.
    }
  }

  async setSubtitleOffset(titleId: string, offsetSeconds: number): Promise<void> {
    try {
      await this.api.setSubtitleOffset(titleId, offsetSeconds);
    } catch {
      // As above.
    }
  }

  async recordProgress(titleId: string, positionSeconds: number, finished = false): Promise<void> {
    try {
      await this.api.recordProgress(titleId, positionSeconds, finished);
    } catch {
      // Idempotent and called every few seconds; a lost one is caught by the next.
    }
  }

  // --- Saved copies ------------------------------------------------------
  //
  // Saving to the device is a file-download concern rather than an API one, and
  // it lands with the player. These are deliberately empty rather than throwing:
  // the Saved tab is meant to keep working when nothing else does.

  async savedSummary(): Promise<SavedSummary> {
    return EmptySavedSummary;
  }

  async download(_titleId: string): Promise<void> {
    throw new Error('Saving to this device is not wired yet.');
  }

  async cancelDownload(_savedItemId: string): Promise<void> {}

  async deleteSaved(_savedItemId: string): Promise<void> {}

  // --- Casting and handoff ----------------------------------------------

  castDevices(): Flow<CastDevice[]> {
    return this._cast;
  }
}
