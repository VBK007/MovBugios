import { VideoPlayer, createVideoPlayer } from 'expo-video';

import { MutableStateFlow } from '@/data/store';
import { NoEngagement, Title } from '@/domain/model/media';

/**
 * The track currently loaded, in the few facts a lock screen and a mini player
 * both need.
 *
 * Deliberately not a `Title`. This outlives the screen that started it, so a
 * domain object full of subtitle tracks and playback plans would be carried
 * around for nothing.
 */
export interface NowPlaying {
  titleId: string;
  name: string;
  artist: string | null;
  artworkUrl: string | null;
  url: string;
  headers: Record<string, string>;
}

/** Where the track is, as the bar and the full player both read it. */
export interface MusicProgress {
  positionSeconds: number;
  durationSeconds: number;
}

/**
 * Music playback, owned by the app rather than by a screen.
 *
 * This is the difference between a player and a music player. A film's player
 * belongs to the screen showing it: leave the screen and the film should stop,
 * because there is nothing left to watch. A song is the opposite — it should
 * keep playing while somebody browses the library, and keep playing when the
 * phone goes in a pocket — so what owns it has to outlive the component.
 *
 * `createVideoPlayer` rather than `useVideoPlayer` is the whole mechanism: the
 * hook ties a player's life to a component's, which is exactly the thing being
 * escaped here.
 *
 * Everything is a flow because two things now draw the same playback: the full
 * player and the bar above the tabs. They are one state seen twice, not two
 * players kept in step.
 *
 * The film player is untouched by all of this and still owns its own.
 *
 * Ported from player/MusicPlayback.kt, whose Android half is a MediaSession
 * foreground service. iOS needs no service: the background audio mode and the
 * now-playing info are player properties, set below.
 */
class MusicPlaybackController {
  /** Null means nothing is loaded, which is what hides the bar. */
  readonly nowPlaying = new MutableStateFlow<NowPlaying | null>(null);
  readonly playing = new MutableStateFlow(false);
  readonly progress = new MutableStateFlow<MusicProgress>({
    positionSeconds: 0,
    durationSeconds: 0,
  });

  /**
   * Made on first use rather than at import.
   *
   * A native player constructed while the module graph is still loading is a
   * player built before the app has decided whether it needs one at all, and on
   * a cold start that is every launch.
   */
  private player: VideoPlayer | null = null;

  /**
   * Whether this client could actually be given background playback.
   *
   * False in a host app whose Info.plist has no `audio` background mode — Expo
   * Go being the one that matters here. Music still plays; it stops when the app
   * leaves the foreground. Recorded rather than assumed so the screen can say so
   * instead of the sound simply stopping for no stated reason.
   */
  backgroundCapable = false;

  /**
   * Whether the app can hold a music session at all.
   *
   * A flow rather than a field because the screen has to redraw when it turns
   * false, and it turns false at the moment somebody presses play — there are no
   * device logs on this delivery path, so a failure that is not on screen is a
   * failure nobody can see.
   */
  readonly unavailable = new MutableStateFlow<string | null>(null);

  /**
   * Told where the track has got to, roughly twice a second.
   *
   * Registered once at the app root rather than called from a screen: the point
   * of this class is that playback continues with no screen alive, and a resume
   * position that stops being recorded the moment somebody swipes down is worse
   * than one that is never recorded at all — it would be confidently wrong.
   */
  onProgress: ((titleId: string, positionSeconds: number) => void) | null = null;

  private ensurePlayer(): VideoPlayer {
    // Built once, on the first track played.
    if (this.player != null) return this.player;

    const player = createVideoPlayer(null);
    player.timeUpdateEventInterval = 0.5;
    player.loop = false;

    /*
     * The properties that make this a music player rather than a video one —
     * each applied on its own, and none of them allowed to take the rest down.
     *
     * Background audio is not a property the client can simply assert: it needs
     * `audio` in the app's own `UIBackgroundModes`, which arrives with the
     * expo-video config plugin and therefore only in a real build. In a host app
     * without it, asking for background playback is asking for something the
     * process is not entitled to.
     *
     * Wrapped because the cost of it failing is out of all proportion: an
     * exception here leaves the player unbuilt, so nothing plays and no mini
     * player ever appears — a client that merely cannot play in the background
     * would lose music entirely. Whatever is refused is skipped, and the rest
     * still applies.
     */
    this.backgroundCapable = attempt(() => {
      player.staysActiveInBackground = true;
    });
    attempt(() => {
      player.showNowPlayingNotification = true;
    });
    attempt(() => {
      player.allowsExternalPlayback = true;
    });

    player.addListener('playingChange', ({ isPlaying }) => {
      this.playing.set(isPlaying);
    });
    player.addListener('timeUpdate', ({ currentTime }) => {
      const durationSeconds = player.duration ?? 0;
      this.progress.set({ positionSeconds: currentTime, durationSeconds });
      const track = this.nowPlaying.get();
      if (track != null) this.onProgress?.(track.titleId, currentTime);
    });
    player.addListener('playToEnd', () => {
      this.ended.set(this.ended.get() + 1);
    });

    this.player = player;
    return player;
  }

  /**
   * Ticks once each time a track runs out.
   *
   * A counter rather than a flag because two tracks ending is two events, and a
   * boolean already true cannot say so.
   */
  readonly ended = new MutableStateFlow(0);

  /** The instance, for a `VideoView` that wants to bind to it. Null until used. */
  get instance(): VideoPlayer | null {
    return this.player;
  }

  /** Loads and starts a track, replacing whatever was playing. */
  play(track: NowPlaying, startSeconds = 0): void {
    let player: VideoPlayer;
    try {
      player = this.ensurePlayer();
    } catch (error) {
      // Said out loud rather than swallowed. Without this the screen sits on a
      // sleeve that never plays and gives no reason at all.
      this.unavailable.set(
        error instanceof Error ? error.message : 'This build cannot play music.',
      );
      return;
    }
    this.unavailable.set(null);
    const current = this.nowPlaying.get();

    if (current?.titleId === track.titleId) {
      /*
       * The same track, asked for again — resumed rather than reloaded.
       *
       * Keyed on the id alone, and that is the fix rather than an oversight.
       * It used to require the URL to match too, which sounds stricter and is
       * simply wrong: a URL comes from a playback decision, a decision is made
       * fresh every time a screen opens, and it carries a new session each
       * time. So the same song opened from the bar never matched itself, the
       * source was replaced, and the track restarted under somebody who had
       * tapped it only to see what was playing.
       */
      player.play();
      return;
    }

    // Set before the load, not after: this is what the bar reads, and a song
    // that is loading is already a session worth showing.
    this.nowPlaying.set(track);
    this.progress.set({ positionSeconds: startSeconds, durationSeconds: 0 });

    // `replaceAsync`, not `replace`: the synchronous one loads the asset on the
    // main thread, which expo-video warns about and is deprecating.
    void player
      .replaceAsync({ uri: track.url, headers: track.headers })
      .then(() => {
        if (this.nowPlaying.get()?.titleId !== track.titleId) return;
        if (startSeconds > 0) player.currentTime = startSeconds;
        player.play();
      })
      .catch(() => {
        // The track will not load. The bar stays on it rather than vanishing,
        // so there is something to press to try again.
      });
  }

  /**
   * Playing or not, as an instruction rather than a toggle.
   *
   * A party decides this for everybody, and a toggle cannot express "be
   * playing" — two devices toggling from different states diverge instead of
   * converging, which is the opposite of what a shared clock is for.
   */
  setPlaying(playing: boolean): void {
    const player = this.player;
    if (player == null || this.nowPlaying.get() == null) return;
    if (playing) player.play();
    else player.pause();
  }

  /**
   * The nudge that keeps a follower level, as a rate.
   *
   * A device a little behind is sped up six per cent for a second or two, which
   * nobody hears, rather than seeked — a seek in a song is audible and a
   * correction should not be.
   */
  setRate(rate: number): void {
    const player = this.player;
    if (player == null) return;
    player.playbackRate = rate;
  }

  togglePlay(): void {
    const player = this.player;
    if (player == null || this.nowPlaying.get() == null) return;
    if (player.playing) player.pause();
    else player.play();
  }

  /**
   * Silences the music without ending the session.
   *
   * For video: a film and a song playing at once is two soundtracks, and nothing
   * within one app arbitrates that. The bar stays, so going back to what was
   * playing is one tap.
   */
  pause(): void {
    this.player?.pause();
  }

  seekTo(positionSeconds: number): void {
    const player = this.player;
    if (player == null) return;
    player.currentTime = positionSeconds;
    this.progress.set({ ...this.progress.get(), positionSeconds });
  }

  /** Skips by a signed amount, clamped to the track. */
  skip(bySeconds: number): void {
    const { positionSeconds, durationSeconds } = this.progress.get();
    const limit = durationSeconds > 0 ? durationSeconds : positionSeconds + Math.abs(bySeconds);
    this.seekTo(Math.min(Math.max(0, positionSeconds + bySeconds), limit));
  }

  /**
   * Stops, forgets the track and takes the bar away.
   *
   * The mini player's dismiss, not its pause — there has to be a way to end a
   * session rather than only to silence it, or the bar is permanent.
   */
  stop(): void {
    this.player?.pause();
    // `replaceAsync` here too: the synchronous one loads on the main thread and
    // warns on every dismiss.
    void this.player?.replaceAsync(null).catch(() => {});
    this.nowPlaying.set(null);
    this.playing.set(false);
    this.progress.set({ positionSeconds: 0, durationSeconds: 0 });
  }
}

export const MusicPlayback = new MusicPlaybackController();

/** Runs a setter that may be refused, and says whether it took. */
function attempt(apply: () => void): boolean {
  try {
    apply();
    return true;
  } catch {
    return false;
  }
}

/**
 * What is coming out of the speaker, as a `Title`.
 *
 * Expanding the mini player pushes a route, and a route means a screen that
 * knows nothing for a moment. That moment used to be a full-screen "Opening…"
 * — for a song that was already playing, whose name and artist and sleeve were
 * on the bar the thumb had just left. Nothing was actually being opened.
 *
 * This is not everything: no album, no bitrate, and the heart stays unset until
 * the real record lands a beat later. It is the sleeve, the title, the artist
 * and every transport control, all of which work on playback rather than on
 * metadata. The expansion then looks like the bar growing into a screen, which
 * is what it is.
 */
export function nowPlayingAsTitle(track: NowPlaying): Title {
  return {
    id: track.titleId,
    name: track.name,
    kind: 'MUSIC',
    artist: track.artist,
    posterUrl: track.artworkUrl,
    genres: [],
    // Empty rather than guessed. The file line under the transport reads
    // container and bitrate off this, and inventing either would put a wrong
    // fact on screen for the second before the right one arrives — worse than
    // the line being briefly blank.
    file: { filename: '', sizeBytes: 0, audioLanguages: [], probed: false },
    watchState: 'UNWATCHED',
    positionSeconds: 0,
    plan: { type: 'UNKNOWN', reasons: [] },
    savedOnDevice: false,
    missing: false,
    subtitles: [],
    audioTracks: [],
    cast: [],
    directors: [],
    engagement: NoEngagement,
    people: [],
  };
}
