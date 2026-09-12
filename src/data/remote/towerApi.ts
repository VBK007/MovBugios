import {
  AuthResponseDto,
  ContinueWatchingDto,
  ItemDetailDto,
  ItemPageDto,
  ItemSummaryDto,
  LibrarySummaryDto,
  ProfileDto,
  TimelineDto,
  CommentDto,
  CommentPageDto,
  LikeDto,
  ClientCapabilitiesRequestDto,
  PlaybackDecisionDto,
  PlayerStateDto,
  LoginEventDto,
  PartyDto,
  MediaSettingsDto,
} from '@/data/remote/dto';
import { TowerAuthError, TowerHttpError, TowerNotPairedError } from '@/data/remote/errors';
import { TowerSession } from '@/data/remote/towerSession';

/**
 * ngrok's free tier serves an interstitial HTML page to anything that looks like
 * a browser. Without this header every JSON call comes back as that page.
 */
const NGROK_SKIP_WARNING = 'ngrok-skip-browser-warning';

/**
 * A LAN server answers fast; a sleeping disk does not answer at all until it has
 * spun up, which is what the longer request timeout is for.
 */
const CONNECT_TIMEOUT_MS = 4_000;
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * The only place in the app that knows the server speaks HTTP.
 *
 * One method per endpoint, no domain types in or out — mapping happens a layer
 * up in `RemoteTowerRepository`. Keeping this boundary sharp is what makes the
 * transport swappable, which is the whole reason `TowerRepository` is an
 * interface.
 *
 * Auth is a bearer JWT for the account; the `X-Profile-Id` header selects which
 * person in the household the request is for. Both are read fresh from the
 * session on every call, so switching profile takes effect immediately.
 *
 * Ported from data/remote/TowerApi.kt. Ktor's `HttpSend` interceptor becomes an
 * explicit wrapper around `fetch`; the behaviour it encodes is identical.
 */
export class TowerApi {
  constructor(private readonly session: TowerSession) {}

  /**
   * Called with a renewed pair so the repository can persist it.
   *
   * A callback rather than a store write here: the access token and the refresh
   * token are written together wherever the session is kept, and the transport
   * should not have to know where that is.
   */
  onTokensRenewed: ((auth: AuthResponseDto) => Promise<void>) | null = null;

  /** Serialises refreshes; see `renewAccessToken`. */
  private refreshInFlight: Promise<string | null> | null = null;

  private url(path: string): string {
    const base = this.session.baseUrl.get();
    if (base == null) throw new TowerNotPairedError();
    return base + path;
  }

  /** Applies auth headers. Every request goes through here. */
  private authHeaders(admin = false): Record<string, string> {
    const headers: Record<string, string> = { [NGROK_SKIP_WARNING]: 'true' };
    const token = this.session.token.get();
    if (token) headers.Authorization = `Bearer ${token}`;
    const profileId = this.session.profileId.get();
    if (profileId) headers['X-Profile-Id'] = profileId;
    if (admin) {
      const key = this.session.adminKey.get();
      if (key) headers['X-Admin-Key'] = key;
    }
    return headers;
  }

  /**
   * Headers an image loader needs, so artwork behind the API can be fetched.
   *
   * Read per call rather than captured, so re-signing-in or switching profile is
   * picked up without rebuilding anything that holds them.
   */
  imageHeaders(): Record<string, string> {
    return this.authHeaders();
  }

  /**
   * One request, with a single 401 retry against a freshly minted access token.
   *
   * At the send layer rather than in each call site: a token expires mid-session,
   * and forty-odd endpoints should not each have to know how to recover from it.
   */
  private async send(
    path: string,
    init: RequestInit & { admin?: boolean } = {},
  ): Promise<Response> {
    const { admin, ...rest } = init;
    const url = this.url(path);

    const attempt = (extra?: Record<string, string>) =>
      fetchWithTimeout(url, {
        ...rest,
        headers: { ...this.authHeaders(admin), ...(rest.headers as object), ...extra },
      });

    const sentToken = this.session.token.get();
    let response = await attempt();

    // The auth endpoints answer 401 to mean "these credentials are wrong", which
    // no amount of refreshing fixes.
    const refreshable = response.status === 401 && !path.includes('/api/auth/');
    if (refreshable) {
      const renewed = await this.renewAccessToken(sentToken);
      if (renewed != null) {
        response = await attempt({ Authorization: `Bearer ${renewed}` });
      }
    }
    return response;
  }

  /**
   * Mints a new access token, one caller at a time.
   *
   * Two refreshes in flight with the same token means the server rejects one of
   * them — and the loser must retry with what the winner received rather than
   * signing the user out. Sharing one in-flight promise and then re-reading the
   * token does both: whoever arrives second finds the work already done.
   *
   * `staleToken` is the bearer that just failed. If the session already holds a
   * different one, another caller refreshed while this request was in flight and
   * its token is the answer.
   */
  private renewAccessToken(staleToken: string | null): Promise<string | null> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        const current = this.session.token.get();
        if (current != null && current !== staleToken) return current;

        const refreshToken = this.session.refreshToken.get();
        if (!refreshToken || refreshToken.trim() === '') return null;

        let auth: AuthResponseDto;
        try {
          auth = await this.refresh(refreshToken);
        } catch {
          // Unknown, spent or expired — all one answer, and all mean the same
          // thing to us. Clearing stops every later request retrying too.
          this.session.refreshToken.set(null);
          return null;
        }

        this.session.token.set(auth.token);
        // Rotation: what came back replaces what was sent, or the next refresh
        // presents a spent token and the server revokes the whole account.
        if (auth.refreshToken) this.session.refreshToken.set(auth.refreshToken);
        await this.onTokensRenewed?.(auth);
        return auth.token;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  private async getJson<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const response = await this.send(path + query(params), { method: 'GET' });
    return bodyOrThrow<T>(response);
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await this.send(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return bodyOrThrow<T>(response);
  }

  // --- Health and auth ---------------------------------------------------

  /** Unauthenticated. Used to tell "asleep" from "wrong address". */
  async health(): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(this.url('/api/health'), {
        headers: { [NGROK_SKIP_WARNING]: 'true' },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  login(usernameOrEmail: string, password: string): Promise<AuthResponseDto> {
    return this.postJson<AuthResponseDto>('/api/auth/login', { usernameOrEmail, password });
  }

  /**
   * Creates an account and returns a session, so nobody signs in twice.
   *
   * **409** means the username or the email is already taken — the server says
   * which in its message, and the screen repeats it rather than guessing.
   */
  register(
    username: string,
    email: string,
    password: string,
    displayName: string,
  ): Promise<AuthResponseDto> {
    return this.postJson<AuthResponseDto>('/api/auth/register', {
      username,
      email,
      password,
      displayName,
    });
  }

  /** Google sign-in. 501 when the server has no Firebase credentials set. */
  loginWithFirebase(idToken: string): Promise<AuthResponseDto> {
    return this.postJson<AuthResponseDto>('/api/auth/firebase', { idToken });
  }

  /**
   * Trades a refresh token for a new access token.
   *
   * Public, and deliberately unauthenticated — the expired access token is no
   * use here. A **401** means unknown, spent or expired, which the server
   * answers identically on purpose so this cannot be used to probe for live
   * tokens; the only response to it is to sign in again.
   */
  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    const response = await fetchWithTimeout(this.url('/api/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [NGROK_SKIP_WARNING]: 'true' },
      body: JSON.stringify({ refreshToken }),
    });
    return bodyOrThrow<AuthResponseDto>(response);
  }

  // --- Per-profile settings ----------------------------------------------

  settings(): Promise<MediaSettingsDto> {
    return this.getJson<MediaSettingsDto>('/api/media/settings');
  }

  async updateSettings(request: {
    awayMaxHeight?: number;
    preferredLanguage?: string;
    preferredGenres?: string[];
  }): Promise<void> {
    await ensureSuccess(
      await this.send('/api/media/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }),
    );
  }

  // --- Owner panel -------------------------------------------------------
  //
  // Every one of these carries `X-Admin-Key` in addition to the JWT: the key is
  // a shared secret the owner types once, not something the login flow issues.

  serverHealth(): Promise<unknown> {
    return this.getJsonAdmin('/api/media/admin/health');
  }

  watchHabits(): Promise<unknown> {
    return this.getJsonAdmin('/api/media/admin/people');
  }

  diskUsage(): Promise<unknown> {
    return this.getJsonAdmin('/api/media/admin/disk');
  }

  seedAnalytics(): Promise<{ message?: string }> {
    return this.postAdmin('/api/media/admin/seed-analytics');
  }

  backfillArtwork(): Promise<{ message?: string }> {
    return this.postAdmin('/api/media/admin/backfill-artwork');
  }

  async endSession(sessionId: string): Promise<void> {
    await ensureSuccess(
      await this.send(`/api/media/admin/sessions/${sessionId}`, {
        method: 'DELETE',
        admin: true,
      }),
    );
  }

  mismatches(page = 0, size = 20): Promise<unknown> {
    return this.getJsonAdmin(`/api/media/admin/matches?page=${page}&size=${size}`);
  }

  async applyMatch(id: string, candidateId: string): Promise<void> {
    await ensureSuccess(
      await this.send(`/api/media/admin/matches/${id}`, {
        method: 'PUT',
        admin: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId }),
      }),
    );
  }

  async reclassify(id: string, type: string): Promise<void> {
    await ensureSuccess(
      await this.send(`/api/media/admin/matches/${id}/reclassify`, {
        method: 'POST',
        admin: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      }),
    );
  }

  async unmatch(id: string): Promise<void> {
    await ensureSuccess(
      await this.send(`/api/media/admin/matches/${id}/unmatch`, { method: 'POST', admin: true }),
    );
  }

  async rescanLibrary(): Promise<void> {
    await ensureSuccess(
      await this.send('/api/media/admin/rescan', { method: 'POST', admin: true }),
    );
  }

  private async getJsonAdmin<T>(path: string): Promise<T> {
    return bodyOrThrow<T>(await this.send(path, { method: 'GET', admin: true }));
  }

  private async postAdmin<T>(path: string): Promise<T> {
    return bodyOrThrow<T>(await this.send(path, { method: 'POST', admin: true }));
  }

  /** The owner's shared secret, held in the session so every call can read it. */
  setAdminKey(key: string | null) {
    this.session.adminKey.set(key);
  }

  adminKey(): string | null {
    return this.session.adminKey.get();
  }

  // --- Watch together ----------------------------------------------------

  createParty(mediaItemId: string, maxMembers?: number): Promise<PartyDto> {
    return this.postJson<PartyDto>('/api/parties', { mediaItemId, maxMembers });
  }

  joinParty(code: string): Promise<PartyDto> {
    return this.postJson<PartyDto>(`/api/parties/${code}/join`, {});
  }

  partyState(code: string): Promise<PartyDto> {
    return this.getJson<PartyDto>(`/api/parties/${code}/state`);
  }

  async leaveParty(code: string): Promise<void> {
    await ensureSuccess(await this.send(`/api/parties/${code}/leave`, { method: 'POST' }));
  }

  async endParty(code: string): Promise<void> {
    await ensureSuccess(await this.send(`/api/parties/${code}`, { method: 'DELETE' }));
  }

  admitGuest(code: string, requestId: string, allow: boolean): Promise<PartyDto> {
    return this.postJson<PartyDto>(`/api/parties/${code}/admit`, { requestId, allow });
  }

  /**
   * The socket address for a party.
   *
   * The token rides in the query string because a WebSocket handshake from a
   * browser-style client cannot carry custom headers.
   */
  partySocketUrl(code: string, token: string): string {
    const base = this.session.baseUrl.get();
    if (base == null) throw new TowerNotPairedError();
    const ws = base.startsWith('https://')
      ? base.replace('https://', 'wss://')
      : base.startsWith('http://')
        ? base.replace('http://', 'ws://')
        : base;
    return `${ws}/ws/party?code=${code}&token=${token}`;
  }

  /** The token the socket needs, which is the one every request already carries. */
  sessionToken(): string | null {
    return this.session.token.get();
  }

  // --- Sign-in analytics -------------------------------------------------

  /**
   * Records this sign-in. Called straight after obtaining a token, because the
   * server reads the IP and geo off *this* request to describe that sign-in.
   */
  async logLogin(deviceId: string, platform: string | null, appVersion: string | null) {
    try {
      await this.postJson<unknown>('/api/analytics/login', { deviceId, platform, appVersion });
    } catch {
      // A missing log line is not worth failing a sign-in over.
    }
  }

  loginHistory(): Promise<LoginEventDto[]> {
    return this.getJson<LoginEventDto[]>('/api/analytics/login');
  }

  // --- Profiles ----------------------------------------------------------

  profiles(): Promise<ProfileDto[]> {
    return this.getJson<ProfileDto[]>('/api/profiles');
  }

  // --- Likes and comments ------------------------------------------------

  /**
   * Toggles this profile's like and returns the new count, so the screen can
   * move a number by one without refetching the whole title.
   */
  async like(id: string): Promise<LikeDto> {
    const response = await this.send(`/api/media/items/${id}/like`, { method: 'PUT' });
    return bodyOrThrow<LikeDto>(response);
  }

  async unlike(id: string): Promise<LikeDto> {
    const response = await this.send(`/api/media/items/${id}/like`, { method: 'DELETE' });
    return bodyOrThrow<LikeDto>(response);
  }

  comments(id: string, page = 0, size = 20): Promise<CommentPageDto> {
    return this.getJson<CommentPageDto>(`/api/media/items/${id}/comments`, { page, size });
  }

  postComment(id: string, body: string): Promise<CommentDto> {
    return this.postJson<CommentDto>(`/api/media/items/${id}/comments`, { body });
  }

  async editComment(id: string, commentId: string, body: string): Promise<CommentDto> {
    const response = await this.send(`/api/media/items/${id}/comments/${commentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    return bodyOrThrow<CommentDto>(response);
  }

  async deleteComment(id: string, commentId: string): Promise<void> {
    const response = await this.send(`/api/media/items/${id}/comments/${commentId}`, {
      method: 'DELETE',
    });
    await ensureSuccess(response);
  }

  // --- Browsing ----------------------------------------------------------

  browse(options: {
    category?: string;
    query?: string | null;
    genre?: string | null;
    unwatched?: boolean;
    minHeight?: number | null;
    sort?: string;
    page?: number;
    size?: number;
  } = {}): Promise<ItemPageDto> {
    return this.getJson<ItemPageDto>('/api/media/items', {
      category: options.category ?? 'all',
      q: options.query ?? undefined,
      genre: options.genre ?? undefined,
      unwatched: options.unwatched ?? false,
      minHeight: options.minHeight ?? undefined,
      sort: options.sort ?? 'title',
      page: options.page ?? 0,
      size: options.size ?? 40,
    });
  }

  detail(id: string): Promise<ItemDetailDto> {
    return this.getJson<ItemDetailDto>(`/api/media/items/${id}`);
  }

  recentlyAdded(types?: string | null, limit = 20): Promise<ItemSummaryDto[]> {
    return this.getJson<ItemSummaryDto[]>('/api/media/recently-added', {
      types: types ?? undefined,
      limit,
    });
  }

  librarySummary(): Promise<LibrarySummaryDto> {
    return this.getJson<LibrarySummaryDto>('/api/media/library-summary');
  }

  continueWatching(limit = 20): Promise<ContinueWatchingDto[]> {
    return this.getJson<ContinueWatchingDto[]>('/api/media/continue-watching', { limit });
  }

  people(): Promise<string[]> {
    return this.getJson<string[]>('/api/media/people');
  }

  genres(): Promise<string[]> {
    return this.getJson<string[]>('/api/media/genres');
  }

  /**
   * Sends both the old `limit` and the new `page`/`size`.
   *
   * The server replaced `limit` with paging in a later build, and each version
   * ignores the parameters it does not know. Sending all three means one client
   * works against a deployment on either side of that change, which matters
   * because the app updates independently of the box in the cupboard.
   */
  timeline(groupBy = 'date', page = 0, size = 60): Promise<TimelineDto> {
    return this.getJson<TimelineDto>('/api/media/timeline', {
      groupBy,
      page,
      size,
      limit: size,
    });
  }

  /** The reasons without starting anything — works while the disk is asleep. */
  explainPlayback(id: string, capabilities: unknown): Promise<string[]> {
    return this.postJson<string[]>(
      `/api/media/items/${id}/playback-decision/explain`,
      capabilities,
    );
  }

  /**
   * Asks the server how this device should play the title.
   *
   * Can start an ffmpeg process for a transcode, so it is called once the user
   * has committed to playing rather than on every detail-screen visit.
   */
  playbackDecision(
    id: string,
    capabilities: ClientCapabilitiesRequestDto,
    startSeconds: number,
  ): Promise<PlaybackDecisionDto> {
    return this.postJson<PlaybackDecisionDto>(
      `/api/media/items/${id}/playback-decision?startSeconds=${startSeconds}`,
      capabilities,
    );
  }

  playerState(id: string): Promise<PlayerStateDto> {
    return this.getJson<PlayerStateDto>(`/api/media/items/${id}/player-state`);
  }

  async setTracks(
    id: string,
    subtitleTrackIndex: number | null,
    audioTrackIndex: number | null,
  ): Promise<void> {
    const response = await this.send(`/api/media/items/${id}/tracks`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtitleTrackIndex, audioTrackIndex }),
    });
    await ensureSuccess(response);
  }

  async setSubtitleOffset(id: string, offsetSeconds: number): Promise<void> {
    const response = await this.send(`/api/media/items/${id}/subtitle-offset`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offsetSeconds }),
    });
    await ensureSuccess(response);
  }

  /**
   * The server returns stream URLs relative to its own root; the player needs an
   * absolute one.
   */
  absolute(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return this.url(url.startsWith('/') ? url : `/${url}`);
  }

  /**
   * What the player must send to read a stream. Never leaves this layer.
   *
   * The ngrok header matters as much as the token: without it a tunnelled server
   * hands the video element an HTML consent page where the video should be,
   * which surfaces as an unplayable file rather than as an auth problem.
   */
  streamHeaders(): Record<string, string> {
    return this.authHeaders();
  }

  async recordProgress(id: string, positionSeconds: number, finished: boolean): Promise<void> {
    const response = await this.send(`/api/media/items/${id}/progress`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionSeconds, finished }),
    });
    await ensureSuccess(response);
  }
}

// --- Error handling ------------------------------------------------------

async function bodyOrThrow<T>(response: Response): Promise<T> {
  await ensureSuccess(response);
  return (await response.json()) as T;
}

async function ensureSuccess(response: Response): Promise<void> {
  if (response.ok) return;
  const detail = await humanDetail(response);
  if (response.status === 401 || response.status === 403) {
    throw new TowerAuthError(response.status, detail);
  }
  throw new TowerHttpError(response.status, detail);
}

/**
 * A sentence a person can read, never the raw body.
 *
 * Two things sit between the app and the server, and both answer in JSON. Kido
 * sends `{"message": "..."}`, which is written for a human and is worth showing.
 * Cloudflare sends a 400-character diagnostic blob, which is not — an early
 * version rendered one of those verbatim on the admin screen.
 */
async function humanDetail(response: Response): Promise<string | null> {
  try {
    const text = await response.text();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text) as { message?: unknown; error?: unknown };
      const message = parsed.message ?? parsed.error;
      if (typeof message === 'string' && message.trim() !== '') return message;
    } catch {
      // Not JSON — fall through to the length guard below.
    }
    return text.length <= 200 ? text : null;
  } catch {
    return null;
  }
}

/** `fetch` has no timeout of its own; without this a sleeping disk hangs forever. */
async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function query(params?: Record<string, unknown>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.append(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export { CONNECT_TIMEOUT_MS };
