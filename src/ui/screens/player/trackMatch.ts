/** The little each side knows about a track, and the only fields they share. */
export interface NamedTrack {
  language?: string | null;
}

/**
 * The player's track that corresponds to the one the server numbered.
 *
 * Matched on language first and position second, and that order is the whole
 * point. The server numbers tracks as they sit in the file; the player lists
 * only what it can actually decode. The two agree until they do not — a track
 * this phone cannot play is simply absent from the player's list, and every
 * index after it is then off by one, so a Japanese track is selected and English
 * comes out.
 *
 * Language is the one thing both ends genuinely know about the same track.
 * Position is the fallback for a file whose tracks are untagged, which is common
 * enough that refusing to guess would leave those unswitchable.
 *
 * Null when neither finds anything, which the caller should treat as "leave it
 * alone" rather than as a reason to reset to the default — the person asked for
 * something, and silently moving them somewhere else is worse than not moving.
 */
export function matchTrack<T extends NamedTrack>(
  available: T[],
  wantedLanguage: string | null | undefined,
  wantedIndex: number,
): T | null {
  if (available.length === 0) return null;

  const language = wantedLanguage?.trim().toLowerCase();
  if (language != null && language !== '') {
    const byLanguage = available.find(
      (track) => track.language?.trim().toLowerCase() === language,
    );
    if (byLanguage != null) return byLanguage;
  }

  return available[wantedIndex] ?? null;
}
