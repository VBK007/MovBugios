import { Title } from '@/domain/model/media';
import { MusicPlayback } from '@/player/musicPlayback';
import { MusicQueue } from '@/player/musicQueue';

/**
 * Starts a shelf, and opens the player only when there is a reason to.
 *
 * The first song of a session earns the full screen: nothing was playing, so
 * there is nowhere else for the change to show. After that the bar is already on
 * screen and already correct — it reads the same playback the player does — so
 * throwing a full screen over a shelf somebody is still browsing interrupts the
 * browsing to report something they can already see.
 *
 * Picking six songs in a row should be six taps, not six taps and six trips back
 * from the player.
 */
export function playMusicFrom(
  tracks: Title[],
  index: number,
  openPlayer: (titleId: string) => void,
): void {
  const chosen = tracks[index];
  if (chosen == null) return;
  // Read before starting, or the track just asked for is what it finds.
  const alreadyPlaying = MusicPlayback.nowPlaying.get() != null;
  void MusicQueue.playFrom(tracks, index);
  if (!alreadyPlaying) openPlayer(chosen.id);
}
