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

/**
 * `1448 TITLES · 146.5 GB`, or just the count when the size is not known.
 *
 * A signed-out visitor is counted but not measured — the public endpoint
 * reports how many items match and nothing about the disk, which is not a
 * visitor's business. Printing the missing half as "0 B" would be a claim
 * rather than an omission.
 */
export function summaryMonoLine(s: LibrarySummary): string {
  if (s.totalBytes === 0) return `${s.itemCount} TITLES`;
  return `${s.itemCount} TITLES · ${formatBytes(s.totalBytes)}`;
}

export type LibrarySort = 'TITLE' | 'ADDED' | 'YEAR' | 'RATING' | 'CAPTURED' | 'VIEWS';

export const LibrarySortMeta: Record<LibrarySort, { label: string; wire: string }> = {
  TITLE: { label: 'A→Z', wire: 'title' },
  ADDED: { label: 'RECENT', wire: 'added' },
  YEAR: { label: 'YEAR', wire: 'year' },
  RATING: { label: 'RATING', wire: 'rating' },
  CAPTURED: { label: 'CAPTURED', wire: 'captured' },
  /**
   * How often it has been played, most first.
   *
   * The server has counted this all along and nothing asked for it. Note what it
   * is not: an all-time count, not a trend — the catalogue has no time window to
   * ask for, so "most watched" is honest where "top this week" would not be.
   */
  VIEWS: { label: 'MOST WATCHED', wire: 'views' },
};

/** The order the sort chip cycles through when tapped. */
export const LibrarySortCycle: LibrarySort[] = [
  'TITLE',
  'ADDED',
  'YEAR',
  'RATING',
  'CAPTURED',
  'VIEWS',
];

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
