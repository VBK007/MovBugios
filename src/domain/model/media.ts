/**
 * Ported from domain/model/Media.kt.
 *
 * Kotlin data classes carry computed properties; a TS interface cannot, and
 * making these classes would mean rehydrating every object that arrives as JSON.
 * So the shape stays a plain interface and each `val` becomes a function taking
 * the object — `title.heroMeta` reads as `heroMeta(title)`.
 */

/**
 * What a title is. Mirrors the server's `MediaType`, including its chip labels —
 * the server assigns this from the library root a file was found under, never by
 * guessing at the filename.
 */
export type MediaKind = 'FILM' | 'ANIME' | 'HOME_VIDEO' | 'MUSIC' | 'PHOTO';

export const MediaKindLabel: Record<MediaKind, string> = {
  FILM: 'Films',
  ANIME: 'Anime',
  /** "Ours" — made by you, not for you. Browsed as a timeline, not a poster wall. */
  HOME_VIDEO: 'Ours',
  MUSIC: 'Music',
  PHOTO: 'Photos',
};

export function isTimelineKind(kind: MediaKind): boolean {
  return kind === 'HOME_VIDEO' || kind === 'PHOTO';
}

/** Has this profile seen it? Drives the amber unwatched dot in the library grid. */
export type WatchState = 'UNWATCHED' | 'IN_PROGRESS' | 'WATCHED';

/**
 * What the server measured about the file on disk.
 *
 * Every field here is mono-typeset, and every field here disappears when the
 * profile turns "Show technical badges" off.
 *
 * Note `directory` is optional: the server deliberately never exposes absolute
 * filesystem paths over the API, so it is only populated where a caller already
 * knows the root. The fix-metadata screen degrades to showing the filename alone.
 */
export interface FileSpec {
  filename: string;
  directory?: string | null;
  container?: string | null; // MKV
  videoCodec?: string | null; // H.264
  width?: number | null;
  height?: number | null;
  sizeBytes: number;
  audioCodecs?: string | null;
  audioChannels?: number | null;
  audioLanguages: string[];
  bitrateBitsPerSecond?: number | null;
  probed: boolean;
}

export function makeFileSpec(spec: Partial<FileSpec> & { filename: string }): FileSpec {
  return {
    sizeBytes: 0,
    audioLanguages: [],
    probed: false,
    ...spec,
  };
}

export function filePath(file: FileSpec): string {
  return (file.directory ?? '') + file.filename;
}

/** `1080p`, `2160p`, or null when the file has not been probed yet. */
export function resolution(file: FileSpec): string | null {
  return file.height != null ? `${file.height}p` : null;
}

/** `MKV · H.264` — the first cell of the spec row. */
export function containerAndCodec(file: FileSpec): string | null {
  const parts = [prettyContainer(file.container), prettyCodec(file.videoCodec)].filter(
    (p): p is string => p != null,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** `EN + HI`, or null when the server found no audio language tags. */
export function audioSummary(file: FileSpec): string | null {
  return file.audioLanguages.length > 0 ? file.audioLanguages.join(' + ') : null;
}

export function bitrateMbps(file: FileSpec): number | null {
  return file.bitrateBitsPerSecond != null ? file.bitrateBitsPerSecond / 1_000_000 : null;
}

export function isFile4k(file: FileSpec): boolean {
  return (file.height ?? 0) >= 2000;
}

/**
 * Whether this device can take the file untouched, or the server has to convert
 * it first. The server decides this — it is the one that has probed the file —
 * and returns its reasoning in plain sentences, which is what the UI shows.
 *
 * Kotlin's sealed interface becomes a discriminated union, which narrows the
 * same way in a `switch` as `when` did.
 */
export type PlaybackPlan =
  /** The file plays as-is. Green, everywhere. */
  | {
      type: 'DIRECT_PLAY';
      resolution?: string | null;
      bitrateMbps?: number | null;
      reasons: string[];
    }
  /** The server has to re-encode. Amber, everywhere. */
  | {
      type: 'TRANSCODE';
      fromResolution?: string | null;
      toResolution?: string | null;
      reasons: string[];
    }
  /** We have not asked the server yet, or the disk is asleep. Grey. */
  | { type: 'UNKNOWN'; reasons: [] };

export const UnknownPlan: PlaybackPlan = { type: 'UNKNOWN', reasons: [] };

export function directPlay(
  opts: { resolution?: string | null; bitrateMbps?: number | null; reasons?: string[] } = {},
): PlaybackPlan {
  return {
    type: 'DIRECT_PLAY',
    resolution: opts.resolution ?? null,
    bitrateMbps: opts.bitrateMbps ?? null,
    reasons: opts.reasons ?? [],
  };
}

export function transcode(
  opts: { fromResolution?: string | null; toResolution?: string | null; reasons?: string[] } = {},
): PlaybackPlan {
  return {
    type: 'TRANSCODE',
    fromResolution: opts.fromResolution ?? null,
    toResolution: opts.toResolution ?? null,
    reasons: opts.reasons ?? [],
  };
}

export interface SubtitleTrack {
  index: number;
  language: string; // "English"
  format?: string | null; // "SRT"
  embedded: boolean;
  lineCount?: number | null;
  forced: boolean;
  hearingImpaired: boolean;
}

export function makeSubtitleTrack(
  t: Partial<SubtitleTrack> & { index: number; language: string },
): SubtitleTrack {
  return { embedded: true, forced: false, hearingImpaired: false, ...t };
}

/** `EMBEDDED · 1,204 LINES` / `EMBEDDED · FORCED` */
export function subtitleMonoMeta(t: SubtitleTrack): string {
  const parts = [t.embedded ? 'EMBEDDED' : 'EXTERNAL'];
  if (t.forced) parts.push('FORCED');
  if (t.lineCount != null) parts.push(`${groupDigits(t.lineCount)} LINES`);
  return parts.join(' · ');
}

export function subtitleDisplayName(t: SubtitleTrack): string {
  return t.format ? `${t.language} (${t.format})` : t.language;
}

export interface AudioTrack {
  index: number;
  codec?: string | null;
  language?: string | null;
  title?: string | null;
}

/**
 * `EN 5.1`-style short label for the player chip.
 *
 * The embedded title is used only when it looks like a track name. Release
 * groups routinely stamp their URL into that field — a real file on this server
 * has every audio track titled "www.TamilRockers.ws" — and a scene tag is not
 * what someone picking an audio track needs to read.
 */
export function audioShortLabel(t: AudioTrack): string {
  if (t.title && looksLikeTrackName(t.title)) return t.title;
  const language = t.language && t.language !== 'und' ? t.language.toUpperCase() : null;
  const label = [language, prettyCodec(t.codec)].filter((p): p is string => p != null).join(' ');
  return label.trim() || `TRACK ${t.index + 1}`;
}

/** Rejects URLs, domains and anything long enough to be a scene tag. */
function looksLikeTrackName(raw: string): boolean {
  const value = raw.trim();
  if (value.length === 0 || value.length > 24) return false;
  const lower = value.toLowerCase();
  return (
    !lower.includes('://') &&
    !lower.includes('www.') &&
    !lower.includes('.com') &&
    !lower.includes('.ws') &&
    !lower.includes('.net')
  );
}

/** A chapter marker, drawn as a 2px tick on the scrubber. */
export interface Chapter {
  index: number;
  startSeconds: number;
  endSeconds?: number | null;
  title?: string | null;
}

/** `CHAPTER 8 · THE BRIDGE` */
export function chapterLabel(c: Chapter): string {
  return c.title ? `CHAPTER ${c.index + 1} · ${c.title.toUpperCase()}` : `CHAPTER ${c.index + 1}`;
}

/** Views, likes and comments. Only the detail endpoint fills this in. */
export interface Engagement {
  views: number;
  likes: number;
  comments: number;
  likedByMe: boolean;
}

export const NoEngagement: Engagement = { views: 0, likes: 0, comments: 0, likedByMe: false };

export interface Title {
  id: string;
  name: string;
  year?: number | null;
  kind: MediaKind;
  runtimeMinutes?: number | null;
  genres: string[];
  rating?: number | null;
  synopsis?: string | null;
  /** The one-line hook off the poster, where the metadata carried one. */
  tagline?: string | null;
  /** `U/A 13+`, `PG-13`. Whatever the scraper wrote, shown verbatim. */
  certification?: string | null;
  studio?: string | null;
  /**
   * The title in its own language, when the catalogue holds both. Worth showing
   * for a library that is largely Tamil: a film indexed as "Gatta Kusthi 2" is
   * known to the people watching it by its Tamil name.
   */
  originalTitle?: string | null;
  /**
   * IMDb identifier, e.g. `tt0133093`. Evidence the title was matched — not
   * evidence of where `rating` came from, which the server does not record.
   */
  imdbId?: string | null;
  file: FileSpec;
  watchState: WatchState;
  /** Where this profile stopped, in seconds. */
  positionSeconds: number;
  durationSeconds?: number | null;
  plan: PlaybackPlan;
  /** True when the file is on the phone, so it works with the server asleep. */
  savedOnDevice: boolean;
  /** The server could not find the file where it indexed it. Greyed, not hidden. */
  missing: boolean;
  subtitles: SubtitleTrack[];
  audioTracks: AudioTrack[];
  /**
   * Absolute URL of the server's artwork, or null when it has none — in which
   * case the gradient placeholder is the design, not a failure.
   */
  posterUrl?: string | null;
  /**
   * Wide artwork, for the 16:9 continue-watching card. Usually absent — most
   * libraries have a poster and nothing else — so callers fall back to
   * `posterUrl` and then to the gradient.
   */
  backdropUrl?: string | null;
  /** Home videos are described by when and who, not by year and rating. */
  capturedAt?: string | null;
  place?: string | null;
  /** Billing order, as the server stored it. Empty for anything unmatched. */
  cast: string[];
  directors: string[];
  engagement: Engagement;
  people: string[];
}

/** Fills in every default the Kotlin data class declared, so call sites stay short. */
export function makeTitle(
  t: Partial<Title> & { id: string; name: string; kind: MediaKind; file: FileSpec },
): Title {
  return {
    genres: [],
    watchState: 'UNWATCHED',
    positionSeconds: 0,
    plan: UnknownPlan,
    savedOnDevice: false,
    missing: false,
    subtitles: [],
    audioTracks: [],
    cast: [],
    directors: [],
    engagement: NoEngagement,
    people: [],
    ...t,
  };
}

export function primaryGenre(t: Title): string | null {
  return t.genres[0] ?? null;
}

export function effectiveDurationSeconds(t: Title): number {
  return t.durationSeconds ?? (t.runtimeMinutes ?? 0) * 60;
}

export function progressFraction(t: Title): number {
  const total = effectiveDurationSeconds(t);
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, t.positionSeconds / total));
}

export function isTitle4k(t: Title): boolean {
  return isFile4k(t.file);
}

/** `2019 · 1h 58m · Thriller · ★ 7.8` for the detail hero. */
export function heroMeta(t: Title): string {
  const parts: string[] = [];
  if (t.year != null) parts.push(String(t.year));
  if (t.runtimeMinutes != null) parts.push(formatRuntime(t.runtimeMinutes));
  const genre = primaryGenre(t);
  if (genre) parts.push(genre);
  if (t.rating != null) parts.push(`★ ${t.rating}`);
  return parts.join(' · ');
}

/**
 * `2019 · 1h 58m · Thriller` — `heroMeta` without the score.
 *
 * The rating left this string when it became its own element on the hero.
 * Printing it in both places would read as the app saying the same number twice
 * because it forgot it had already said it.
 */
export function heroFacts(t: Title): string {
  const parts: string[] = [];
  if (t.year != null) parts.push(String(t.year));
  if (t.runtimeMinutes != null) parts.push(formatRuntime(t.runtimeMinutes));
  const genre = primaryGenre(t);
  if (genre) parts.push(genre);
  return parts.join(' · ');
}

/**
 * Nothing was ever matched to this file — no story, no cast, no score.
 *
 * Deliberately all three rather than any one: a film can legitimately have a
 * summary and no cast list, and saying "nothing matched" over a perfectly good
 * synopsis would be the app calling itself broken when it is not.
 */
export function lacksMetadata(t: Title): boolean {
  return (
    (t.synopsis == null || t.synopsis.trim() === '') &&
    t.cast.length === 0 &&
    t.directors.length === 0 &&
    t.rating == null
  );
}

/** `42 min left` under a continue-watching card. */
export function remainingLabel(t: Title): string | null {
  const remaining = effectiveDurationSeconds(t) - t.positionSeconds;
  if (remaining <= 0) return null;
  return `${Math.trunc(remaining / 60)} min left`;
}

/**
 * ffprobe reports a container as the comma-joined list of formats it could be —
 * `matroska,webm`, `mov,mp4,m4a,3gp,3g2,mj2`. Rendering that raw is honest but
 * unreadable, so the first name is taken and given the name a person would use.
 */
export function prettyContainer(raw?: string | null): string | null {
  const first = raw?.split(',')[0]?.trim().toLowerCase();
  if (!first) return null;
  switch (first) {
    case 'matroska':
      return 'MKV';
    case 'mov':
      return 'MP4';
    case 'mpegts':
      return 'TS';
    default:
      return first.toUpperCase();
  }
}

/** ffprobe's codec names are lowercase shorthand; these are the printed forms. */
export function prettyCodec(raw?: string | null): string | null {
  const codec = raw?.trim().toLowerCase();
  if (!codec) return null;
  switch (codec) {
    case 'h264':
    case 'avc':
    case 'avc1':
      return 'H.264';
    case 'hevc':
    case 'h265':
      return 'HEVC';
    case 'mpeg4':
      return 'MPEG-4';
    case 'vp9':
      return 'VP9';
    case 'av1':
      return 'AV1';
    default:
      return codec.toUpperCase();
  }
}

export function formatRuntime(minutes: number): string {
  const h = Math.trunc(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function groupDigits(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
