import { UsageSegment } from '@/domain/model/downloads';
import { formatBytes } from '@/domain/model/library';
import { FileSpec, MediaKind } from '@/domain/model/media';

/** Ported from domain/model/Admin.kt. */

/** Admin · Health. Everything here comes from the server's own logs. */
export interface ServerHealth {
  uptimeDays: number;
  streamingNow: number;
  profileCount: number;
  outboundMbps: number;
  cpuPercent: number;
  activeTranscodes: number;
  /** "Bedroom stick is converting Copper Sky from 4K." */
  transcodeNote?: string | null;
  week: WatchDay[];
  weekTotalHours: number;
  peakNote?: string | null;
  needsALook: NeedsALook[];
}

export const EmptyServerHealth: ServerHealth = {
  uptimeDays: 0,
  streamingNow: 0,
  profileCount: 0,
  outboundMbps: 0,
  cpuPercent: 0,
  activeTranscodes: 0,
  week: [],
  weekTotalHours: 0,
  needsALook: [],
};

/** One bar in the 7-day chart. Peak day renders solid amber, others 35–55%. */
export interface WatchDay {
  day: string; // MON
  hours: number;
  /** 0..1 of the tallest bar. */
  relative: number;
  isPeak: boolean;
}

/** A hairline row under "Needs a look". */
export interface NeedsALook {
  text: string;
  actionLabel: string; // FIX / REVIEW / OK
  urgent: boolean;
  route?: string | null;
}

/** Admin · Disk. */
export interface DiskUsage {
  usedBytes: number;
  freeBytes: number;
  totalBytes: number;
  segments: UsageSegment[];
  biggestFiles: BigFile[];
  reclaimable: Reclaimable[];
}

export const EmptyDiskUsage: DiskUsage = {
  usedBytes: 0,
  freeBytes: 0,
  totalBytes: 0,
  segments: [],
  biggestFiles: [],
  reclaimable: [],
};

/** `1.9 TB USED · 2.1 TB FREE · 4 TB HDD` */
export function diskMonoLine(disk: DiskUsage): string {
  return (
    `${formatBytes(disk.usedBytes)} USED · ${formatBytes(disk.freeBytes)} FREE · ` +
    `${formatBytes(disk.totalBytes)} HDD`
  );
}

export function reclaimableBytes(disk: DiskUsage): number {
  return disk.reclaimable.reduce((sum, r) => sum + r.bytes, 0);
}

export interface BigFile {
  id: string;
  title: string;
  sizeBytes: number;
  /** `ALWAYS TRANSCODES`, `NEVER WATCHED` — why this file is worth attention. */
  note?: string | null;
  kind: MediaKind;
}

export interface Reclaimable {
  label: string;
  bytes: number;
}

/** A title the server matched to the wrong thing. */
export interface Mismatch {
  id: string;
  file: FileSpec;
  guessedTitle: string;
  candidates: MatchCandidate[];
  /** How many more are waiting behind this one. */
  remainingInQueue: number;
}

export interface MatchCandidate {
  id: string;
  title: string;
  year?: number | null;
  /** Null when the candidate is already in the library rather than a match score. */
  matchPercent?: number | null;
  alreadyInLibrary: boolean;
}

/** `2022 · THRILLER · 96% MATCH` / `2019 · ALREADY IN LIBRARY` */
export function candidateMonoMeta(candidate: MatchCandidate, genre?: string | null): string {
  const parts: string[] = [];
  if (candidate.year != null) parts.push(String(candidate.year));
  if (genre) parts.push(genre.toUpperCase());
  if (candidate.alreadyInLibrary) parts.push('ALREADY IN LIBRARY');
  else if (candidate.matchPercent != null) parts.push(`${candidate.matchPercent}% MATCH`);
  return parts.join(' · ');
}
