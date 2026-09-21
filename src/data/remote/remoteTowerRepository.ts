import { Answer } from '@/domain/model/assistant';
import { Teaser, TeaserPage } from '@/domain/model/teaser';
import { CastMember } from '@/domain/model/people';
import { TeaserClipDto } from '@/data/remote/dto';
import { MusicHome } from '@/domain/model/musicHome';
import {
  answerToDomain,
  musicHomeToDomain,
  castMemberToDomain,
  teaserToDomain,
} from '@/data/remote/mappers';
import {
  Collections,
  Recommendation,
  SearchResults,
} from '@/domain/model/collection';
import { Language } from '@/domain/model/preferences';
import {
  collectionToDomain,
  languagesToDomain,
  recommendationToDomain,
  searchResultToDomain,
} from '@/data/remote/mappers';
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
  publicDetailToTitle,
  publicSummaryToTitle,
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
import { RecentArt } from '@/data/remote/recentArt';
import {
  ClientCapabilities,
  PlaybackSource,
  PlayerState,
} from '@/domain/model/player';
import { TowerApi } from '@/data/remote/towerApi';
import { CredentialKeys, TowerSession } from '@/data/remote/towerSession';
import { lookupPublishedBaseUrl } from '@/data/remote/serverDirectory';
import { EmptySavedSummary, SavedItem, SavedSummary } from '@/domain/model/downloads';
import {
  EmptyLibrarySummary,
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
 * How many results a signed-out search asks for.
 *
 * One page and no paging. The parsed search a signed-in user gets returns a
 * considered set rather than everything that matches, and a visitor scrolling
 * to the four-hundredth title containing "a" is not browsing, it is waiting.
 */
const GUEST_SEARCH_PAGE_SIZE = 60;

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
    // H.264 only — see the player's capabilities for the evidence. An HEVC
    // file direct-played to this phone shows no picture at all.
    videoCodecs: ['h264'],
    // No Dolby Digital: AVPlayer on an iPhone will not decode it, and claiming
    // it here had the server direct-play films that then arrived silent.
    audioCodecs: ['aac', 'mp3', 'alac', 'flac'],
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
    // The stored address first: somebody who typed one has said something more
    // specific than any lookup can.
    let baseUrl = await CredentialStore.read(CredentialKeys.baseUrl);

    // Nothing stored — ask where the server is. This is how a fresh install
    // with no baked-in address finds the house without being told.
    if (!baseUrl) baseUrl = await this.adoptPublishedAddress();
    if (!baseUrl) return false;
    this.session.setBaseUrl(baseUrl);

    const token = await CredentialStore.read(CredentialKeys.token);
    if (!token) return false;
    this.session.token.set(token);
    this.session.refreshToken.set(await CredentialStore.read(CredentialKeys.refreshToken));
    this.session.profileId.set(await CredentialStore.read(CredentialKeys.profileId));

    if (await this.loadProfilesQuietly()) return true;

    // The address we had stopped answering, which is the ordinary end of a
    // tunnel's life — a free hostname changes on every restart. Ask where the
    // server moved to before giving up. Only after a failure, so a working
    // address never costs a round trip.
    const published = await this.adoptPublishedAddress();
    if (!published || published === baseUrl) return false;

    this.session.setBaseUrl(published);
    return this.loadProfilesQuietly();
  }

  /** `loadProfiles`, reporting failure rather than throwing it. */
  private async loadProfilesQuietly(): Promise<boolean> {
    try {
      await this.loadProfiles(null);
      this._serverState.set(online());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Takes the published address, and remembers it.
   *
   * Written to the credential store as well as returned, because the point is
   * that the next launch starts in the right place rather than discovering it
   * again — and because everything else that asks "where is the server" reads
   * that key.
   */
  private async adoptPublishedAddress(): Promise<string | null> {
    const published = await lookupPublishedBaseUrl();
    if (!published) return null;
    await CredentialStore.write(CredentialKeys.baseUrl, published);
    return published;
  }

  async selectProfile(profileId: string): Promise<void> {
    const profile = this._profiles.get().find((p) => p.id === profileId) ?? null;
    this.session.profileId.set(profileId);
    this._activeProfile.set(profile);
    await CredentialStore.write(CredentialKeys.profileId, profileId);
  }

  /**
   * Gives up the account and keeps the house.
   *
   * The address survives, in the session and on disk. It used to be wiped along
   * with everything else, which made signing out the same as forgetting where
   * the server is: the next launch had nothing to browse and fell back to the
   * sample library, and signing back in meant finding the address again. A
   * visitor is allowed the public catalogue, and that needs an address.
   *
   * Everything that identifies a person does go: the tokens, the profile, the
   * admin key, and the splash montage — that artwork is the last account's
   * library, and showing it to whoever signs in next would leak what they watch.
   */
  async signOut(): Promise<void> {
    this.session.clear();
    for (const key of Object.values(CredentialKeys)) {
      if (key === CredentialKeys.baseUrl) continue;
      await CredentialStore.write(key, null);
    }
    await RecentArt.clear();
    this._profiles.set([]);
    this._activeProfile.set(null);
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
        // The server holds this per profile, so a second device inherits it.
        showTechnicalBadges: dto.showTechnicalBadges ?? true,
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
    return this.guarded(async () => {
      if (!this.session.isAuthenticated) {
        /*
         * `/api/media/library-summary` counts bytes on the disk and lists the
         * categories a profile may see, so it needs one. The public browse
         * reports `totalItems` for a query, which is the count and nothing else
         * — so a visitor gets "1448 TITLES" rather than a header that fails to
         * load. `libraryMonoLine` omits the size when it is zero, so the missing
         * half reads as an omission instead of a claim about a disk nobody
         * measured.
         */
        const page = await this.api.publicBrowse({ size: 1 });
        return { ...EmptyLibrarySummary, itemCount: page.totalItems ?? 0 };
      }
      return librarySummaryToDomain(await this.api.librarySummary());
    });
  }

  browse(filters: LibraryFilters, page = 0): Promise<Title[]> {
    return this.guarded(async () => {
      if (!this.session.isAuthenticated) {
        // The public endpoint has no notion of "unwatched" or a height floor —
        // both are per-profile and per-device questions a visitor cannot
        // meaningfully ask, so they are dropped rather than sent somewhere the
        // server would reject them.
        const guest = await this.api.publicBrowse({
          category: filters.category ?? 'all',
          sort: LibrarySortMeta[filters.sort].wire,
          page,
        });
        return (guest.items ?? []).map((i) => publicSummaryToTitle(i, this.baseUrl()));
      }
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
      if (!this.session.isAuthenticated) {
        // No dedicated public recently-added route; the public browse's single
        // category chip covers the common case — one kind, or "all" — that the
        // home screen's rails actually ask for as a guest.
        const guest = await this.api.publicBrowse({
          category: kinds.length === 1 ? kinds[0] : 'all',
          sort: 'added',
          size: limit,
        });
        return (guest.items ?? []).map((i) => publicSummaryToTitle(i, this.baseUrl()));
      }
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
      const titles = this.session.isAuthenticated
        ? (await this.api.browse({ sort: 'rating', size: limit })).items?.map((i) =>
            summaryToTitle(i, this.baseUrl()),
          )
        : (await this.api.publicBrowse({ sort: 'rating', size: limit })).items?.map((i) =>
            publicSummaryToTitle(i, this.baseUrl()),
          );
      return (
        (titles ?? [])
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
      if (!this.session.isAuthenticated) {
        // No playback plan for a guest: they cannot press play — the gate stops
        // them — so there is nothing to ask `explainPlayback`, which needs a
        // token anyway.
        return publicDetailToTitle(await this.api.publicDetail(titleId), this.baseUrl());
      }

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

  /**
   * The phrase, read by the server where it can be.
   *
   * Falls back to the plain title match on a server that has no
   * `/api/media/search`. This is the one new endpoint that *replaced* a working
   * one rather than adding to the app, so failing hard here would take
   * away search itself from a server that is merely older — and the fallback
   * loses only the chips, which a server that cannot parse a sentence was never
   * going to send.
   */
  search(query: string): Promise<SearchResults> {
    return this.guarded(async () => {
      if (!this.session.isAuthenticated) {
        /*
         * `/api/media/search` is the parsed kind — it reads "tamil comedies from
         * the nineties", returns the terms it understood, and sometimes asks a
         * model. None of that is public, and calling it without a token is a 401
         * rather than an empty result, so a guest typing in the search box got an
         * error where a list should be.
         *
         * The public browse takes a `q` and runs it through the same query
         * engine, which is a plain title/artist/album match. So a visitor gets
         * real results and no parsing: `terms` stays empty and the screen draws
         * the list without the "Named: …" chips, which is honest — nothing was
         * understood, because nothing was parsed.
         */
        const page = await this.api.publicBrowse({ query, size: GUEST_SEARCH_PAGE_SIZE });
        return {
          titles: (page.items ?? []).map((i) => publicSummaryToTitle(i, this.baseUrl())),
          terms: [],
          understoodNothing: false,
          readByModel: false,
        };
      }

      try {
        const dto = await this.api.smartSearch(query);
        return searchResultToDomain(dto, this.baseUrl());
      } catch (error) {
        if (!(error instanceof TowerHttpError) || !error.missingEndpoint) throw error;
        const page = await this.api.browse({ query, size: 60 });
        return {
          titles: (page.items ?? []).map((i) => summaryToTitle(i, this.baseUrl())),
          terms: [],
          // Not a claim about the phrase — this server has no grammar to have
          // read it with, so the screen must not say the words were taken
          // literally as though that were a finding.
          understoodNothing: false,
          readByModel: false,
        };
      }
    });
  }

  /**
   * Not [guarded]: this decorates a question rather than answering one, and a
   * server that cannot say should leave the first-run screen showing its usual
   * list instead of failing the step.
   */
  async libraryLanguages(): Promise<Language[]> {
    try {
      return languagesToDomain(await this.api.languages());
    } catch {
      return [];
    }
  }

/**
   * False for anything that goes wrong, including an older server with no such
   * endpoint at all. The only consumer of this hides a text box, so a failure to
   * answer and a "no" want exactly the same handling.
   */
  async assistantAvailable(): Promise<boolean> {
    try {
      return (await this.api.assistantAvailable()).available ?? false;
    } catch {
      return false;
    }
  }

  /**
   * The one repository method that swallows its own failure into a value.
   *
   * Everywhere else, unreachable is a state a screen renders. Here the server
   * has already decided that a question always gets prose back rather than an
   * error, and a transport failure is the same shape of thing — so it becomes an
   * unanswered `Answer` instead of an exception the screen would have to
   * translate into a sentence anyway.
   */
  async ask(question: string): Promise<Answer> {
    try {
      return answerToDomain(await this.api.ask(question));
    } catch {
      return {
        text:
          'Tower could not be reached to ask that. It may be asleep, or the ' +
          'question may have taken too long.',
        lookups: [],
        answered: false,
      };
    }
  }

  teaserFeed(page = 0, seed?: number | null): Promise<TeaserPage> {
    return this.guarded(async () => {
      const dto = await this.api.teaserFeed(page, 10, seed);
      return {
        teasers: this.playableTeasers(dto.items ?? []),
        // Zero is the default an older server leaves behind, and is not a seed
        // it would honour — treated as "did not say" so the client stops passing
        // one rather than pinning every page to deal zero.
        seed: dto.seed != null && dto.seed !== 0 ? dto.seed : null,
      };
    });
  }

  async cast(titleId: string): Promise<CastMember[]> {
    try {
      const dtos = await this.api.cast(titleId);
      return dtos.flatMap((dto) => {
        const member = castMemberToDomain(dto, this.baseUrl());
        return member == null ? [] : [member];
      });
    } catch {
      // A rail of initials is what this screen drew before there were photos at
      // all, and is the right answer when the lookup is unavailable.
      return [];
    }
  }

  /**
   * Empty rather than a failure when the server has no teasers at all. Older
   * builds 404 here, and a detail screen that shows an error where it could show
   * nothing is a regression for every library that never cut a clip.
   */
  async teasers(titleId: string): Promise<Teaser[]> {
    try {
      return this.playableTeasers(await this.api.teasers(titleId));
    } catch {
      return [];
    }
  }

  async trackPreview(titleId: string): Promise<PlaybackSource | null> {
    const base = this.baseUrl();
    if (base == null || base.trim() === '') return null;
    return {
      url: `${base}/api/media/items/${encodeURIComponent(titleId)}/preview`,
      sessionId: null,
      // Always direct: twenty seconds of audio is never worth transcoding, and
      // the server does not offer a decision for it.
      plan: { type: 'DIRECT_PLAY', reasons: [] },
      headers: this.api.streamHeaders(),
      startSeconds: 0,
    };
  }

  /** Drops the unplayable ones and gives the rest the token they need. */
  private playableTeasers(dtos: TeaserClipDto[]): Teaser[] {
    const headers = this.api.streamHeaders();
    return dtos.flatMap((dto) => {
      const teaser = teaserToDomain(dto, this.baseUrl());
      return teaser == null ? [] : [{ ...teaser, headers }];
    });
  }

    musicHome(limit = 20): Promise<MusicHome> {
    return this.guarded(async () => musicHomeToDomain(await this.api.musicHome(limit), this.baseUrl()));
  }

  collections(): Promise<Collections> {
    return this.guarded(async () => {
      const list = await this.api.collections();
      return {
        builtin: (list.builtin ?? []).map((c) => collectionToDomain(c, 'BUILTIN')),
        custom: (list.custom ?? []).map((c) => collectionToDomain(c, 'CUSTOM')),
        discovered: (list.discovered ?? []).map((c) => collectionToDomain(c, 'DISCOVERED')),
      };
    });
  }

  collectionItems(id: string, page = 0): Promise<Title[]> {
    return this.guarded(async () => {
      const dto = await this.api.collectionItems(id, page);
      return (dto.items ?? []).map((i) => summaryToTitle(i, this.baseUrl()));
    });
  }

  /**
   * Not [guarded]: a home rail that cannot be filled should be absent, not an
   * error. Every other rail on that screen already works this way — a server
   * having nothing to recommend is not a reason to fail the whole shelf.
   */
  async recommendations(limit = 20): Promise<Recommendation[]> {
    try {
      const dto = await this.api.recommendations(limit);
      return (dto.items ?? []).map((r) => recommendationToDomain(r, this.baseUrl()));
    } catch {
      return [];
    }
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
