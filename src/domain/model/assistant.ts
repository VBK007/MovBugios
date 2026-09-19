/**
 * One lookup the assistant made, in the words a person can check it by.
 *
 * `arguments` arrives as whatever the model chose and is only ever printed, so
 * it is flattened to strings at the mapping boundary rather than carried as
 * JSON into the UI.
 */
export interface Lookup {
  /** `search_library`, `play_counts` — the server's own tool name. */
  tool: string;
  arguments: Record<string, string>;
  /** The lookup errored. The assistant was told and may have worked around it. */
  failed: boolean;
}

/** `max_runtime_minutes 120 · watched NOT_ME`, or empty when it asked for nothing. */
export function argumentLine(lookup: Lookup): string {
  return Object.entries(lookup.arguments)
    .map(([key, value]) => `${key} ${value}`)
    .join(' · ');
}

/**
 * What the assistant said, and what it looked at to say it.
 *
 * `lookups` is not debug output. The whole bargain of asking a model about your
 * own disk is that you can see it searched rather than remembered — an answer
 * with no lookups under it is one that came from nowhere, and a wrong answer
 * should point at which lookup went wrong rather than at the feature.
 *
 * `answered` is false when the assistant gave up, is switched off, or could not
 * be reached. `text` is worth showing either way; this only decides whether
 * offering a retry would be honest.
 */
export interface Answer {
  text: string;
  lookups: Lookup[];
  answered: boolean;
}
