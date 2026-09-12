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
  | { type: 'OFFLINE'; message: string };

export const Loading: UiState<never> = { type: 'LOADING' };
export const Asleep: UiState<never> = { type: 'ASLEEP' };

export function loaded<T>(data: T): UiState<T> {
  return { type: 'LOADED', data };
}

export function empty(message: string): UiState<never> {
  return { type: 'EMPTY', message };
}

export function offline(message: string): UiState<never> {
  return { type: 'OFFLINE', message };
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
    const message = error instanceof Error ? error.message : null;
    return offline(message ?? 'We cannot reach the server.');
  }
}
