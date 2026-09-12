import { Chapter, PlaybackPlan } from '@/domain/model/media';

/** Ported from domain/model/Player.kt. */

/**
 * The sprite-sheet manifest behind thumbnail scrubbing.
 *
 * The client turns a timecode into a sheet and a tile locally, so dragging the
 * scrubber costs no requests and the six-frame filmstrip usually comes from a
 * sheet already in memory. That is the whole point of the feature: seeking is
 * instant because the file is on your own disk.
 */
export interface Trickplay {
  state: 'READY' | 'GENERATING' | 'FAILED';
  intervalSeconds: number;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  framesPerSheet: number;
  frameCount: number;
  sheetCount: number;
  /** Path with a `{sheet}` placeholder for the zero-padded four-digit index. */
  sheetUrlTemplate: string;
}

export interface FrameLocation {
  sheetIndex: number;
  column: number;
  row: number;
  sheetUrl: string;
}

export function trickplayReady(t: Trickplay): boolean {
  return t.state === 'READY';
}

/** Which frame a timecode lands on. */
export function frameAt(t: Trickplay, seconds: number): number {
  const raw = Math.trunc(seconds / t.intervalSeconds);
  return Math.min(Math.max(raw, 0), Math.max(t.frameCount - 1, 0));
}

export function locateFrame(t: Trickplay, frame: number): FrameLocation {
  const safeFrame = Math.min(Math.max(frame, 0), Math.max(t.frameCount - 1, 0));
  const sheet = Math.trunc(safeFrame / t.framesPerSheet);
  const inside = safeFrame % t.framesPerSheet;
  return {
    sheetIndex: sheet,
    column: inside % t.columns,
    row: Math.trunc(inside / t.columns),
    sheetUrl: t.sheetUrlTemplate.replace('{sheet}', String(sheet).padStart(4, '0')),
  };
}

/** The six neighbouring frames of the filmstrip, current one in the middle. */
export function filmstripAround(t: Trickplay, seconds: number, count = 6): number[] {
  if (t.frameCount <= 0) return [];
  const current = frameAt(t, seconds);
  const before = Math.trunc(count / 2);
  const start = Math.min(Math.max(current - before, 0), Math.max(t.frameCount - count, 0));
  const end = Math.min(start + count, t.frameCount);
  const frames: number[] = [];
  for (let i = start; i < end; i++) frames.push(i);
  return frames;
}

/**
 * Everything the player restores when it opens, fetched in one request because
 * the player opens on a tap and every extra round trip is delay before frame one.
 */
export interface PlayerState {
  titleId: string;
  positionSeconds: number;
  durationSeconds?: number | null;
  watched: boolean;
  subtitleOffsetSeconds: number;
  subtitleTrackIndex?: number | null;
  audioTrackIndex?: number | null;
  chapters: Chapter[];
  trickplay?: Trickplay | null;
}

/**
 * Where the bytes come from once the server has decided.
 *
 * `headers` carries whatever the player must send to be allowed to read the
 * stream — the bearer token today. It is supplied by the repository rather than
 * assembled in the player, so the token never has to be reachable from the UI.
 */
export interface PlaybackSource {
  url: string;
  sessionId?: string | null;
  plan: PlaybackPlan;
  /**
   * The offset this decision was made for — and it means two different things
   * depending on the plan, which is why nothing should read it directly.
   *
   * A direct play serves the whole file, so this is a position to seek to inside
   * it. A transcode is encoded *starting* at this offset, so the stream's own
   * timeline begins at zero here and this is where that zero sits in the film.
   * Use `playerStartSeconds` and `originSeconds`.
   */
  startSeconds: number;
  headers: Record<string, string>;
}

/**
 * Where the player should start within *this stream*.
 *
 * Zero for a transcode. Seeking a transcode to its own start offset applied that
 * offset twice: a seek to 1:56:25 of a 2:32 film put the scrubber at 3:52:50 —
 * exactly double — pinned it to the end, and left a black frame.
 */
export function playerStartSeconds(source: PlaybackSource): number {
  return source.plan.type === 'TRANSCODE' ? 0 : source.startSeconds;
}

/** What this stream's zero means in the film's timeline. */
export function originSeconds(source: PlaybackSource): number {
  return source.plan.type === 'TRANSCODE' ? source.startSeconds : 0;
}

/**
 * What this device can actually decode. Sent to the server before playback so it
 * can decide direct-play vs transcode — the server cannot infer any of it, and a
 * field left null is treated as "unknown", which biases toward transcoding rather
 * than a stall on the user's device.
 */
export interface ClientCapabilities {
  deviceName: string;
  videoCodecs: string[];
  audioCodecs: string[];
  containers: string[];
  maxHeight?: number | null;
  maxBitrate?: number | null;
  supportsHls: boolean;
}

/** `+1.40` — the large mono readout; the `s` is typeset separately. */
export function subtitleOffsetDisplay(seconds: number): string {
  const sign = seconds >= 0 ? '+' : '−';
  const abs = seconds < 0 ? -seconds : seconds;
  const hundredths = Math.trunc(abs * 100);
  const whole = Math.trunc(hundredths / 100);
  const frac = String(hundredths % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

/** The plain-English reading underneath it. */
export function subtitleOffsetExplanation(seconds: number): string {
  if (seconds > 0) {
    const abs = Math.trunc(seconds * 10) / 10;
    return `Subtitles appear ${abs} seconds later.`;
  }
  if (seconds < 0) {
    const abs = Math.trunc(-seconds * 10) / 10;
    return `Subtitles appear ${abs} seconds earlier.`;
  }
  return 'Subtitles play exactly with the audio.';
}
