import { failureCopy } from '@/ui/failureCopy';
import { TowerAuthError, TowerHttpError } from '@/data/remote/errors';
/**
 * The four states every screen in Tower has to be able to draw.
 *
 * The design brief is explicit that degraded states are most of real usage, so
 * they are modelled here rather than left to a nullable field and a spinner.
 * `Asleep` is separate from `Offline` because they mean different things and
 * have different remedies: one has a button, the other does not.
 *
 * Ported from ui/UiState.kt.
 */
export type UiState<T> =
  | { type: 'LOADING' }
  | { type: 'LOADED'; data: T }
  /** The request succeeded and there is genuinely nothing to show. */
  | { type: 'EMPTY'; message: string }
  /** The disk is spun down. Recoverable by waking it. */
  | { type: 'ASLEEP' }
  /** We cannot reach the server at all. */
  | {
      type: 'OFFLINE';
      message: string;
      /**
       * `HTTP 503` — what the server actually said, where it said anything.
       *
       * Separate from `message` because the two are different registers and the
       * app types them differently: the message is a sentence a person reads,
       * this is a measurement, so it is mono and hidden with the other technical
       * badges. Null when nothing answered at all, which is its own fact.
       */
      detail?: string | null;
    };

export const Loading: UiState<never> = { type: 'LOADING' };
export const Asleep: UiState<never> = { type: 'ASLEEP' };

export function loaded<T>(data: T): UiState<T> {
  return { type: 'LOADED', data };
}

export function empty(message: string): UiState<never> {
  return { type: 'EMPTY', message };
}

export function offline(message: string, detail?: string | null): UiState<never> {
  return { type: 'OFFLINE', message, detail: detail ?? null };
}

export function dataOrNull<T>(state: UiState<T>): T | null {
  return state.type === 'LOADED' ? state.data : null;
}

/**
 * Thrown by the repository when the disk is spun down, so `loadState` can map it
 * onto `Asleep` rather than the generic offline message. A named class rather
 * than a message check: the string is UI copy and will be rewritten.
 */
export class ServerAsleepError extends Error {
  constructor(message = 'The disk spun down.') {
    super(message);
    this.name = 'ServerAsleepError';
  }
}

/** Runs `block`, mapping a sleeping disk onto `Asleep`. */
export async function loadState<T>(
  block: () => Promise<T>,
  options: { emptyWhen?: (value: T) => boolean; emptyMessage?: string } = {},
): Promise<UiState<T>> {
  const { emptyWhen, emptyMessage = 'Nothing here.' } = options;
  try {
    const value = await block();
    return emptyWhen?.(value) ? empty(emptyMessage) : loaded(value);
  } catch (error) {
    if (error instanceof ServerAsleepError) return Asleep;
    // The app's words, not the server's. See `failureCopy`.
    return offline(failureCopy(error), statusLine(error));
  }
}

/**
 * `HTTP 503` — the one line worth showing from a failure, or null.
 *
 * Deliberately only the code. The server's own detail string is already the
 * message above it, and repeating it in mono underneath would be the same
 * sentence twice in two typefaces.
 */
export function statusLine(error: unknown): string | null {
  if (error instanceof TowerAuthError) return `HTTP ${error.code}`;
  if (error instanceof TowerHttpError) {
    return error.missingEndpoint ? 'ENDPOINT NOT ON THIS SERVER' : `HTTP ${error.code}`;
  }
  return null;
}
