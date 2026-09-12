import { MutableStateFlow } from '@/data/store';

/**
 * Who we are talking to, as whom, on behalf of which profile.
 *
 * Held separately from the HTTP client so the client can be built once and the
 * values it needs can change underneath it — switching profile must not tear
 * down a connection pool.
 *
 * The token is kept in memory only. Persisting it belongs in platform secure
 * storage (Keychain on iOS) behind `CredentialStore`; nothing here writes it to
 * disk.
 *
 * Ported from data/remote/TowerSession.kt.
 */
export class TowerSession {
  readonly baseUrl = new MutableStateFlow<string | null>(null);
  readonly token = new MutableStateFlow<string | null>(null);
  readonly profileId = new MutableStateFlow<string | null>(null);

  /**
   * Trades for a new access token. Never sent as a bearer; only to
   * `/api/auth/refresh`, and replaced by whatever that returns.
   */
  readonly refreshToken = new MutableStateFlow<string | null>(null);

  /** Admin-only endpoints want this in addition to the JWT. */
  readonly adminKey = new MutableStateFlow<string | null>(null);

  constructor(baseUrl?: string | null, token?: string | null, profileId?: string | null) {
    if (baseUrl != null) this.setBaseUrl(baseUrl);
    this.token.set(token ?? null);
    this.profileId.set(profileId ?? null);
  }

  get isPaired(): boolean {
    return this.baseUrl.get() != null;
  }

  get isAuthenticated(): boolean {
    return this.token.get() != null;
  }

  setBaseUrl(url: string | null): void {
    this.baseUrl.set(url == null ? null : normaliseBaseUrl(url));
  }

  clear(): void {
    this.token.set(null);
    this.refreshToken.set(null);
    this.profileId.set(null);
    this.adminKey.set(null);
  }
}

/**
 * Turns what someone typed into something fetch can use.
 *
 * The connect screen offers `192.168.1.__:8096`-style input, so a bare host gets
 * `http://` and a trailing slash is dropped to keep path joins simple. Plain
 * HTTP is correct for a box on the same LAN, usually without a certificate —
 * which is why the iOS build sets `NSAllowsArbitraryLoads`.
 */
export function normaliseBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `http://${trimmed}`;
}

/** Keys under which the session is persisted. Ported from `CredentialStore`. */
export const CredentialKeys = {
  baseUrl: 'tower.baseUrl',
  token: 'tower.token',
  profileId: 'tower.profileId',
  /**
   * Trades for a new access token when the current one expires.
   *
   * Kept beside the access token rather than in place of it: the access token is
   * what every request carries, and this is only ever sent to
   * `/api/auth/refresh`. The server stores a hash, so whatever is here is the
   * only copy — losing it means signing in again, not a broken session.
   */
  refreshToken: 'tower.refreshToken',
  /**
   * The server's `app.admin.api-key`. Held separately from the JWT because it is
   * a shared secret the owner types once, not something the login flow issues.
   */
  adminKey: 'tower.adminKey',
} as const;
