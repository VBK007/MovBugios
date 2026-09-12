import {
  BigFile,
  DiskUsage,
  EmptyDiskUsage,
  EmptyServerHealth,
  MatchCandidate,
  Mismatch,
  NeedsALook,
  Reclaimable,
  ServerHealth,
  WatchDay,
} from '@/domain/model/admin';
import { UsageSegment } from '@/domain/model/downloads';
import { LiveSession, WatchHabit } from '@/domain/model/people';
import { makeFileSpec } from '@/domain/model/media';
import { toMediaKind } from '@/data/remote/mappers';
import { directPlay, transcode } from '@/domain/model/media';

/**
 * Admin payloads, mapped loosely.
 *
 * Typed as `unknown` on the way in and read defensively: the owner panel is the
 * part of the API most likely to differ between server builds, and a missing
 * field here should leave a card empty rather than blanking the whole panel.
 *
 * Ported from the admin half of data/remote/Mappers.kt.
 */

type Dict = Record<string, unknown>;

const asDict = (value: unknown): Dict => (value != null && typeof value === 'object' ? (value as Dict) : {});
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const bool = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function healthToDomain(raw: unknown): ServerHealth {
  const d = asDict(raw);
  const week = list(d.week).map((entry): WatchDay => {
    const w = asDict(entry);
    return {
      day: str(w.day) ?? '',
      hours: num(w.hours),
      relative: num(w.relative),
      isPeak: bool(w.peak ?? w.isPeak),
    };
  });

  return {
    ...EmptyServerHealth,
    uptimeDays: num(d.uptimeDays),
    streamingNow: num(d.streamingNow),
    profileCount: num(d.profileCount),
    outboundMbps: num(d.outboundMbps),
    cpuPercent: num(d.cpuPercent),
    activeTranscodes: num(d.activeTranscodes),
    transcodeNote: str(d.transcodeNote),
    week,
    weekTotalHours: num(d.weekTotalHours),
    peakNote: str(d.peakNote),
    needsALook: list(d.needsALook).map((entry): NeedsALook => {
      const n = asDict(entry);
      return {
        text: str(n.text) ?? '',
        actionLabel: str(n.actionLabel) ?? 'REVIEW',
        urgent: bool(n.urgent, true),
        route: str(n.route),
      };
    }),
  };
}

export function sessionsToDomain(raw: unknown): LiveSession[] {
  const d = asDict(raw);
  return list(d.sessions).map((entry): LiveSession => {
    const s = asDict(entry);
    const transcoding = str(s.mode)?.toUpperCase() === 'TRANSCODE';
    return {
      id: str(s.id) ?? '',
      profileName: str(s.profileName) ?? 'Someone',
      deviceName: str(s.deviceName) ?? 'A device',
      titleName: str(s.titleName) ?? '',
      plan: transcoding ? transcode({}) : directPlay({}),
      positionSeconds: num(s.positionSeconds),
      durationSeconds: num(s.durationSeconds),
      cpuPercent: typeof s.cpuPercent === 'number' ? s.cpuPercent : null,
    };
  });
}

export function habitsToDomain(raw: unknown): WatchHabit[] {
  const source = Array.isArray(raw) ? raw : list(asDict(raw).habits);
  return source.map((entry): WatchHabit => {
    const h = asDict(entry);
    return {
      profileName: str(h.profileName) ?? 'Someone',
      hours: num(h.hours),
      relative: num(h.relative),
      note: str(h.note),
      tint: str(h.tint),
    };
  });
}

export function diskToDomain(raw: unknown): DiskUsage {
  const d = asDict(raw);
  return {
    ...EmptyDiskUsage,
    usedBytes: num(d.usedBytes),
    freeBytes: num(d.freeBytes),
    totalBytes: num(d.totalBytes),
    segments: list(d.segments).map((entry): UsageSegment => {
      const s = asDict(entry);
      return {
        label: str(s.label) ?? '',
        bytes: num(s.bytes),
        fraction: num(s.fraction),
        kind: str(s.type) ? toMediaKind(str(s.type)) : null,
      };
    }),
    biggestFiles: list(d.biggestFiles).map((entry): BigFile => {
      const b = asDict(entry);
      return {
        id: str(b.id) ?? '',
        title: str(b.title) ?? '',
        sizeBytes: num(b.sizeBytes),
        note: str(b.note),
        kind: toMediaKind(str(b.type)),
      };
    }),
    reclaimable: list(d.reclaimable).map((entry): Reclaimable => {
      const r = asDict(entry);
      return { label: str(r.label) ?? '', bytes: num(r.bytes) };
    }),
  };
}

export function mismatchesToDomain(raw: unknown): Mismatch[] {
  const d = asDict(raw);
  const items = Array.isArray(raw) ? raw : list(d.items ?? d.mismatches);
  const total = num(d.totalItems, items.length);

  return items.map((entry, index): Mismatch => {
    const m = asDict(entry);
    return {
      id: str(m.id) ?? '',
      file: makeFileSpec({
        filename: str(m.fileName) ?? '',
        directory: str(m.directory),
        sizeBytes: num(m.fileSize),
      }),
      guessedTitle: str(m.guessedTitle) ?? str(m.title) ?? '',
      candidates: list(m.candidates).map((candidate): MatchCandidate => {
        const c = asDict(candidate);
        return {
          id: str(c.id) ?? '',
          title: str(c.title) ?? '',
          year: typeof c.year === 'number' ? c.year : null,
          matchPercent: typeof c.matchPercent === 'number' ? c.matchPercent : null,
          alreadyInLibrary: bool(c.alreadyInLibrary),
        };
      }),
      remainingInQueue: Math.max(0, total - index - 1),
    };
  });
}
