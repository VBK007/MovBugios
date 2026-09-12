import { MediaKind, Title } from './media';

/** Ported from domain/model/Library.kt. */

/** Bytes → `4.2 GB`, `361 GB`, `1.9 TB`. The server measured it, so it is mono. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  const tb = gb * 1024;
  if (bytes >= tb) return `${round1(bytes / tb)} TB`;
  if (bytes >= gb) return `${round1(bytes / gb)} GB`;
  if (bytes >= mb) return `${Math.trunc(bytes / mb)} MB`;
  if (bytes >= kb) return `${Math.trunc(bytes / kb)} KB`;
  return `${bytes} B`;
}

function round1(value: number): string {
  // Rounds rather than truncates: 4.2 GB stored as 4.2 * 1024^3 comes back as
  // 4.19999…, and truncating turned every size in the app a tenth light.
  const scaled = Math.trunc(value * 10 + 0.5);
  const whole = Math.trunc(scaled / 10);
  const frac = scaled % 10;
  // Whole terabytes read better without a trailing .0 in a 10sp mono label.
  return frac === 0 ? `${whole}` : `${whole}.${frac}`;
}

/** One category chip and its share of the disk. */
export interface Category {
  kind: MediaKind;
  itemCount: number;
  totalBytes: number;
}

/** The mono line under the Library title: `84 TITLES · 1.9 TB`. */
export interface LibrarySummary {
  itemCount: number;
  totalBytes: number;
  categories: Category[];
  genres: string[];
}

export const EmptyLibrarySummary: LibrarySummary = {
  itemCount: 0,
  totalBytes: 0,
  categories: [],
  genres: [],
};

export function summaryMonoLine(s: LibrarySummary): string {
  return `${s.itemCount} TITLES · ${formatBytes(s.totalBytes)}`;
}

export type LibrarySort = 'TITLE' | 'ADDED' | 'YEAR' | 'RATING' | 'CAPTURED';

export const LibrarySortMeta: Record<LibrarySort, { label: string; wire: string }> = {
  TITLE: { label: 'A→Z', wire: 'title' },
  ADDED: { label: 'RECENT', wire: 'added' },
  YEAR: { label: 'YEAR', wire: 'year' },
  RATING: { label: 'RATING', wire: 'rating' },
  CAPTURED: { label: 'CAPTURED', wire: 'captured' },
};

/** The order the sort chip cycles through when tapped. */
export const LibrarySortCycle: LibrarySort[] = ['TITLE', 'ADDED', 'YEAR', 'RATING', 'CAPTURED'];

/** Library grid filters. Mono chips, because each one names a measured property. */
export interface LibraryFilters {
  category: MediaKind | null;
  unwatchedOnly: boolean;
  fourKOnly: boolean;
  /**
   * Newest first, matching the server's own default.
   *
   * Was A→Z. In a library of eighty titles a film that just landed on the disk
   * sorts wherever its name puts it, which reads as "it did not show up" when it
   * is only buried past the first page. The client sends `sort` on every
   * request, so leaving this on title would have quietly overridden the server's
   * default and kept the old behaviour.
   */
  sort: LibrarySort;
}

export const DefaultLibraryFilters: LibraryFilters = {
  category: null,
  unwatchedOnly: false,
  fourKOnly: false,
  sort: 'ADDED',
};

/** How the home-video timeline is grouped. */
export type TimelineGrouping = 'DATE' | 'PERSON' | 'PLACE';

export const TimelineGroupingMeta: Record<TimelineGrouping, { label: string; wire: string }> = {
  DATE: { label: 'By date', wire: 'date' },
  PERSON: { label: 'By person', wire: 'person' },
  PLACE: { label: 'By place', wire: 'place' },
};

/**
 * One group on the home-video timeline. The server formats `label` for the left
 * gutter already — `DEC / 2024` — so the client never parses dates to render it.
 */
export interface TimelineGroup {
  key: string;
  label: string;
  itemCount: number;
  items: Title[];
}

export interface Timeline {
  grouping: TimelineGrouping;
  groups: TimelineGroup[];
  /** Footer nudge: "9 clips have no date — tag them?" */
  undatedCount: number;
}

/** A "Jump to" chip on search — a folder the results live under, or a person. */
export interface JumpTarget {
  label: string;
  kind: 'FOLDER' | 'PERSON';
}
