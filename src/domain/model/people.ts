import { PlaybackPlan } from './media';

/** Ported from domain/model/People.kt. */

/**
 * Which register a profile is rendered in. Mirrors the server's `AgeMode`.
 *
 * Note both values are children — the server's profiles all belong to one adult
 * account, and this only picks the layout. The adult/owner distinction lives on
 * the account instead, as `UserRole`, and is gated by a four-digit parent PIN.
 */
export type AgeMode =
  /** Under 7: the 2×2 grid, narration, no written progress. Tower's kids mode. */
  | 'YOUNG'
  /** 7 and up: the fuller three-column layout and written progress. */
  | 'OLDER';

/** Account-level role. This, not `AgeMode`, is what makes someone the owner. */
export type UserRole = 'CHILD' | 'PARENT';

export interface Profile {
  id: string;
  name: string;
  ageMode: AgeMode;
  /** Hex tint the server stores for the avatar, e.g. "#6A8FD4". */
  avatarTint?: string | null;
  isOwner: boolean;
}

export function makeProfile(p: Partial<Profile> & { id: string; name: string }): Profile {
  return { ageMode: 'OLDER', isOwner: false, ...p };
}

export function profileInitial(p: Profile): string {
  return p.name.slice(0, 1).toUpperCase();
}

/** Drives kids mode: the lighter ground, green accent and no mono type. */
export function isKid(p: Profile): boolean {
  return p.ageMode === 'YOUNG';
}

/** A stream happening right now, as the owner sees it on the admin People tab. */
export interface LiveSession {
  id: string;
  profileName: string;
  deviceName: string;
  titleName: string;
  plan: PlaybackPlan;
  positionSeconds: number;
  durationSeconds: number;
  /** Only set while transcoding, e.g. 58 for "58% CPU". */
  cpuPercent?: number | null;
}

export function sessionProgressFraction(s: LiveSession): number {
  if (s.durationSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, s.positionSeconds / s.durationSeconds));
}

/** `Meera · Living room TV` */
export function sessionWho(s: LiveSession): string {
  return `${s.profileName} · ${s.deviceName}`;
}

/** `The Long Return · 34:12 of 1:41:00` */
export function sessionWhat(s: LiveSession): string {
  return `${s.titleName} · ${formatClock(s.positionSeconds)} of ${formatClock(s.durationSeconds)}`;
}

/** One person's month, as a labelled bar on the People tab. */
export interface WatchHabit {
  profileName: string;
  hours: number;
  /** 0..1 relative to the heaviest viewer, so bars are comparable. */
  relative: number;
  /** `MOSTLY ANIME · LATE EVENINGS` */
  note?: string | null;
  tint?: string | null;
}

/** A device we could hand playback to, and what it would cost. */
export interface CastDevice {
  id: string;
  name: string;
  plan: PlaybackPlan;
  maxResolution?: string | null;
  currentlyPlaying?: string | null;
}

export function isBusy(d: CastDevice): boolean {
  return d.currentlyPlaying != null;
}

/** Seconds → `1:41:00` or `34:12`. */
export function formatClock(seconds: number): string {
  if (seconds < 0) return '0:00';
  const total = Math.trunc(seconds);
  const h = Math.trunc(total / 3600);
  const m = Math.trunc((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Seconds → `−33:44`, for the right-hand side of a scrubber. */
export function formatRemaining(positionSeconds: number, durationSeconds: number): string {
  const remaining = Math.max(0, durationSeconds - positionSeconds);
  return `−${formatClock(remaining)}`;
}
