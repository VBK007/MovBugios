import { formatBytes } from './library';
import { MediaKind, Title } from './media';

/** Ported from domain/model/Downloads.kt. */

/** Where a saved copy is in its life. */
export type DownloadState =
  | { type: 'QUEUED' }
  /** Copied as-is — no conversion needed, so this is just bytes over the LAN. */
  | { type: 'COPYING'; percent: number }
  /** The server is re-encoding before sending. `CONVERTING 4K → 1080p · 68%`. */
  | { type: 'CONVERTING'; percent: number; fromResolution: string; toResolution: string }
  | { type: 'DONE' }
  | { type: 'FAILED'; reason: string };

export const Queued: DownloadState = { type: 'QUEUED' };
export const Done: DownloadState = { type: 'DONE' };

export interface SavedItem {
  id: string;
  title: Title;
  state: DownloadState;
  sizeBytes: number;
}

export function isInProgress(item: SavedItem): boolean {
  const t = item.state.type;
  return t === 'COPYING' || t === 'CONVERTING' || t === 'QUEUED';
}

/** The mono line on the card, e.g. `CONVERTING 4K → 1080p · 68%`. */
export function savedMonoStatus(item: SavedItem): string {
  const s = item.state;
  switch (s.type) {
    case 'CONVERTING':
      return `CONVERTING ${s.fromResolution} → ${s.toResolution} · ${s.percent}%`;
    case 'COPYING':
      return `COPYING · ${s.percent}%`;
    case 'QUEUED':
      return 'QUEUED';
    case 'DONE':
      return `${formatBytes(item.sizeBytes)} SAVED`;
    case 'FAILED':
      return `FAILED · ${s.reason.toUpperCase()}`;
  }
}

export function savedPercent(item: SavedItem): number | null {
  const s = item.state;
  if (s.type === 'CONVERTING' || s.type === 'COPYING') return s.percent;
  return null;
}

/** Header numbers on the Saved screen, and the segmented usage bar beneath them. */
export interface SavedSummary {
  itemCount: number;
  usedBytes: number;
  freeBytes: number;
  segments: UsageSegment[];
}

export const EmptySavedSummary: SavedSummary = {
  itemCount: 0,
  usedBytes: 0,
  freeBytes: 0,
  segments: [],
};

/**
 * One slice of a usage bar. Used for both the phone's storage on the Saved
 * screen and the server's 4 TB on the admin Disk tab.
 */
export interface UsageSegment {
  label: string;
  bytes: number;
  /** 0..1 of the whole volume, so the remainder renders as unfilled track. */
  fraction: number;
  kind?: MediaKind | null;
}
