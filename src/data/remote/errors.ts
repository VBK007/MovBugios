/** Ported from the exception types at the bottom of data/remote/TowerApi.kt. */

export class TowerNotPairedError extends Error {
  constructor() {
    super('No server paired yet.');
    this.name = 'TowerNotPairedError';
  }
}

/** The JWT or the admin key was rejected. */
export class TowerAuthError extends Error {
  constructor(
    readonly code: number,
    readonly detail: string | null,
  ) {
    super(detail ?? `Not authorised (${code})`);
    this.name = 'TowerAuthError';
  }
}

export class TowerHttpError extends Error {
  constructor(
    readonly code: number,
    readonly detail: string | null,
  ) {
    super(detail ?? `The server returned ${code}`);
    this.name = 'TowerHttpError';
  }

  /**
   * True when this server has no handler for the path — almost always a build
   * that predates the endpoint.
   *
   * Keyed on Spring's own phrasing, not on a status code. An unmapped path falls
   * through to the static-file handler, which fails with a *500* whose message
   * is about a missing "static resource" rather than the 404 you would expect.
   * Deliberately *not* matching a bare 404: a 404 from a handler that does exist
   * means "no such thing", which several endpoints use to say something specific
   * — an unknown or ended watch party code, for one — and treating those as
   * "your server is too old" tells the user the wrong story about their own
   * server.
   */
  get missingEndpoint(): boolean {
    return this.detail?.toLowerCase().includes('no static resource') ?? false;
  }
}
