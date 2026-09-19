import { Title } from '@/domain/model/media';
import { MutableStateFlow } from '@/data/store';
import { MusicPlayback, NowPlaying } from '@/player/musicPlayback';

/**
 * What plays after this one, and the thing that starts it.
 *
 * Kept separate from `MusicPlayback` because the two know different things. The
 * player knows about bytes; this knows about the library — which titles are
 * queued, and how to turn the next one into a URL.
 *
 * That last part is why the queue cannot simply be handed to the player as a
 * playlist. A stream URL is not a property of a title: it comes from asking the
 * server how this device should play it, and the answer can be a transcode
 * started on the spot. So the queue holds *titles*, and each is resolved into a
 * source at the moment it is reached — one request, once, and never for tracks
 * nobody gets to.
 *
 * Process-scoped, like the player. A track ending while the phone is in a pocket
 * has to advance to the next one, and there is no screen alive to do it.
 *
 * Ported from player/MusicQueue.kt.
 */
class MusicQueueController {
  private tracks: Title[] = [];

  /**
   * A function rather than a stored source, because the repository is swapped
   * when somebody signs in — a queue holding the sample one would resolve every
   * later track against a library that is not theirs.
   */
  private resolve: ((title: Title) => Promise<NowPlaying | null>) | null = null;

  /** Whether anything follows what is playing. */
  readonly hasNext = new MutableStateFlow(false);
  /** Whether anything precedes it. Previous still restarts the track without one. */
  readonly hasPrevious = new MutableStateFlow(false);

  private installed = false;
  private lastTick = 0;
  private advancing = false;

  /**
   * Starts listening for tracks ending. Called once, from the app root.
   *
   * The current tick is read rather than assumed zero: a flow replays its value
   * to a new subscriber, and installing after a track has already ended would
   * otherwise skip a song.
   */
  install(resolve: (title: Title) => Promise<NowPlaying | null>): void {
    this.resolve = resolve;
    if (this.installed) return;
    this.installed = true;
    this.lastTick = MusicPlayback.ended.get();
    MusicPlayback.ended.subscribe(() => {
      const tick = MusicPlayback.ended.get();
      if (tick === this.lastTick) return;
      this.lastTick = tick;
      void this.advance();
    });
  }

  /** The list the Up next sheet shows, in the order it shows it. */
  setTracks(tracks: Title[]): void {
    this.tracks = tracks;
    this.updateHasNext();
  }

  /**
   * Starts a shelf at one of its tracks, and keeps the rest.
   *
   * Picking a track out of "Feeling Energetic" is choosing the mood as much as
   * the song, so the shelf becomes the queue — going quiet three minutes later
   * would throw that away.
   */
  async playFrom(tracks: Title[], index: number): Promise<void> {
    const chosen = tracks[index];
    this.tracks = inOneLanguageFrom(tracks, index);
    if (chosen == null || this.resolve == null) return;
    const source = await this.resolve(chosen).catch(() => null);
    if (source == null) return;
    MusicPlayback.play(source);
    this.updateHasNext();
  }

  private currentIndex(): number {
    const playing = MusicPlayback.nowPlaying.get();
    if (playing == null) return -1;
    return this.tracks.findIndex((track) => track.id === playing.titleId);
  }

  private updateHasNext(): void {
    const index = this.currentIndex();
    this.hasNext.set(index >= 0 && index + 1 < this.tracks.length);
    this.hasPrevious.set(index > 0);
  }

  /** Plays the row before this one, or restarts if there is none. */
  async previous(): Promise<void> {
    /*
     * Past three seconds, previous restarts the track rather than leaving it —
     * the behaviour every music player has settled on, and the one that makes
     * the button safe to press without first working out where you are.
     */
    if (MusicPlayback.progress.get().positionSeconds > RESTART_THRESHOLD_SECONDS) {
      MusicPlayback.seekTo(0);
      return;
    }
    const index = this.currentIndex();
    if (index <= 0) {
      MusicPlayback.seekTo(0);
      return;
    }
    await this.start(index - 1);
  }

  /** Plays the row after this one, if there is one. */
  async next(): Promise<void> {
    const index = this.currentIndex();
    if (index < 0 || index + 1 >= this.tracks.length) return;
    await this.start(index + 1);
  }

  private async start(index: number): Promise<void> {
    const track = this.tracks[index];
    if (track == null || this.resolve == null) return;
    const source = await this.resolve(track).catch(() => null);
    if (source == null) return;
    MusicPlayback.play(source);
    this.updateHasNext();
  }

  /**
   * Plays the row after the current one.
   *
   * Does not wrap: a library that starts again from the top after forty minutes
   * is one nobody asked to keep going. A track the server refuses is skipped
   * rather than ending the queue — one unplayable file in a hundred should cost
   * that file, not the rest of the evening.
   */
  private async advance(): Promise<void> {
    if (this.advancing) return;
    this.advancing = true;
    try {
      let index = this.currentIndex();
      if (index < 0) return;

      while (index + 1 < this.tracks.length) {
        index += 1;
        const next = this.tracks[index];
        const source = this.resolve == null ? null : await this.resolve(next).catch(() => null);
        if (source != null) {
          MusicPlayback.play(source);
          this.updateHasNext();
          return;
        }
      }
      // The end of the list. The bar stays on the last track rather than
      // vanishing, so what just played is still there to restart.
      this.updateHasNext();
    } finally {
      this.advancing = false;
    }
  }
}

/** How far into a track "previous" stops meaning the one before it. */
const RESTART_THRESHOLD_SECONDS = 3;

/**
 * How many confirmed same-language tracks make a queue worth trusting on its own.
 *
 * Below this the untagged tracks are let back in. Five is about a quarter of an
 * hour of music — long enough that nobody notices the queue ended, short enough
 * that a well-tagged shelf almost always clears it and stays pure.
 */
const MIN_CONFIDENT_QUEUE = 5;

/**
 * The queue somebody actually asked for, in one language.
 *
 * A shelf is built by mood, era or who scored it, and none of those care what
 * language a track is in. That is right for browsing — "Feeling Energetic" is a
 * true description of all of them — and wrong the moment the shelf becomes a
 * queue, because a Tamil song followed by an English one three tracks into an
 * evening is not something anybody chose.
 *
 * The rule, in order of how much it knows:
 *
 *  1. The track that was tapped sets the language. Not the majority of the
 *     shelf: somebody who picks the one Hindi song on a Tamil shelf has told us
 *     what they want far more clearly than the other nineteen files have.
 *  2. Tracks in a *different* known language are removed. This is the only
 *     removal, and it is the whole feature.
 *  3. Untagged tracks are kept only if too few tagged ones remain. Most loose
 *     MP3s carry no language at all, so dropping unknowns outright would leave a
 *     queue of one and look like the app had broken — but where the shelf has
 *     plenty of confirmed matches, the uncertain ones are not needed and stay
 *     out. Certainty first, and uncertainty only instead of silence.
 *  4. If the tapped track has no language either, nothing is filtered. There is
 *     no signal to filter on, and inventing one would be worse than leaving the
 *     shelf as it is.
 *
 * Order is never changed — only removals — so the Up next sheet still reads as
 * the shelf it came from, minus what would have jarred. The tapped track always
 * survives: a filter that could refuse to play what was tapped would be
 * overruling the person using it.
 */
export function inOneLanguageFrom(tracks: Title[], startIndex: number): Title[] {
  const anchor = tracks[startIndex];
  if (anchor == null) return tracks;
  const language = anchor.language?.trim();
  if (!language) return tracks;

  const matches = (track: Title) =>
    track.language?.trim().toLowerCase() === language.toLowerCase();

  const confident = tracks.filter((track) => track.id === anchor.id || matches(track));
  if (confident.length >= MIN_CONFIDENT_QUEUE) return confident;

  return tracks.filter(
    (track) => track.id === anchor.id || !track.language?.trim() || matches(track),
  );
}

export const MusicQueue = new MusicQueueController();
