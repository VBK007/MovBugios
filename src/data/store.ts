/**
 * The smallest thing that behaves like a Kotlin `StateFlow`: a value that can be
 * read synchronously and subscribed to.
 *
 * The repository interface is built on flows in the original — `serverState`,
 * `savedItems` and `profiles` are all live — and screens react to them rather
 * than polling. Pulling in a state library to get that back would be ceremony
 * around thirty lines, and `useSyncExternalStore` already expects exactly this
 * shape: a `subscribe` that returns an unsubscribe, and a `getSnapshot`.
 */
export interface Flow<T> {
  /** Current value, readable without subscribing. */
  get(): T;
  /** Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export class MutableStateFlow<T> implements Flow<T> {
  private value: T;
  private listeners = new Set<() => void>();

  constructor(initial: T) {
    this.value = initial;
    // Bound so they can be handed straight to useSyncExternalStore without the
    // caller having to remember to bind them at every call site.
    this.get = this.get.bind(this);
    this.subscribe = this.subscribe.bind(this);
  }

  get(): T {
    return this.value;
  }

  set(next: T): void {
    if (Object.is(next, this.value)) return;
    this.value = next;
    this.listeners.forEach((listener) => listener());
  }

  update(transform: (current: T) => T): void {
    this.set(transform(this.value));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
