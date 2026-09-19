import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Amber,
  AmberInk,
  Hairline,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  Surface1,
  TowerType,
} from '@/theme';
import { gradientFor } from '@/ui/color';
import { artSource } from '@/ui/imageSource';
import { MusicPlayback } from '@/player/musicPlayback';
import { useFlow } from '@/ui/hooks';
import { CloseGlyph, PauseGlyph, PlayGlyph } from '@/ui/components/Glyphs';
import { HairlineDivider } from '@/ui/components/Primitives';

/**
 * What is playing, on every screen, once the full player has been dismissed.
 *
 * Reads `MusicPlayback` directly rather than taking state through a parameter.
 * There is exactly one thing playing in this app and every part of the UI should
 * be looking at the same one — routing it through a screen would add a place for
 * the bar and the player to disagree about what a song is doing.
 *
 * Absent entirely when nothing is loaded. `nowPlaying` being null is the same
 * condition as "no music session", so nothing here checks a flag.
 *
 * Sits above the bottom bar rather than over the content, so nothing it covers
 * was reachable a moment ago and is not now.
 *
 * Ported from ui/components/MiniPlayer.kt.
 */
export function MiniPlayer({
  onExpand,
  /** For the screens with no tab bar beneath to carry the home indicator. */
  withNavigationPadding = false,
}: {
  onExpand: (titleId: string) => void;
  withNavigationPadding?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const track = useFlow(MusicPlayback.nowPlaying);
  const playing = useFlow(MusicPlayback.playing);
  const progress = useFlow(MusicPlayback.progress);

  if (track == null) return null;

  const [from, to] = gradientFor(track.name);
  /*
   * A hairline of progress along the top, not a scrubber.
   *
   * The bar is 58 points tall and mostly thumb targets; a draggable track in
   * there would be a control nobody can hit accurately. This says how far
   * through the song is and nothing else — dragging belongs on the screen with
   * room for it, one tap away.
   */
  const fraction =
    progress.durationSeconds > 0
      ? Math.min(1, Math.max(0, progress.positionSeconds / progress.durationSeconds))
      : 0;

  return (
    <View
      style={[
        styles.bar,
        withNavigationPadding && { paddingBottom: insets.bottom },
      ]}
    >
      <HairlineDivider />

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${fraction * 100}%` }]} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${track.name}`}
        onPress={() => onExpand(track.titleId)}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.8 : 1 }]}
      >
        <View style={styles.art}>
          <LinearGradient
            colors={[from, to]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.33, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {track.artworkUrl != null && (
            <Image
              source={artSource(track.artworkUrl)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[TowerType.titleRow, { color: OnInk }]} numberOfLines={1}>
            {track.name}
          </Text>
          <Text
            style={[TowerType.bodyNote, { color: OnInkMuted, marginTop: 1 }]}
            numberOfLines={1}
          >
            {/* "Playing" rather than an empty line: most loose MP3s carry no
                artist, and a bar that loses its second line for those would
                change height as the queue moved through them. */}
            {track.artist ?? 'Playing'}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          onPress={() => MusicPlayback.togglePlay()}
          style={styles.play}
        >
          {playing ? (
            <PauseGlyph color={AmberInk} size={15} />
          ) : (
            // Nudged right: a triangle's visual centre is left of its box.
            <PlayGlyph color={AmberInk} size={15} />
          )}
        </Pressable>

        {/*
         * Ends the session rather than pausing it. Without this the bar is
         * permanent once anything has played, which makes it furniture rather
         * than a thing that is currently true.
         */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Stop"
          onPress={() => MusicPlayback.stop()}
          style={styles.stop}
        >
          <CloseGlyph color={OnInkFaint} size={13} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: '100%',
    backgroundColor: Surface1,
  },
  progressTrack: {
    height: 2,
    width: '100%',
    backgroundColor: Hairline,
  },
  progressFill: {
    height: 2,
    backgroundColor: Amber,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    height: 58,
    paddingLeft: 12,
    paddingRight: 6,
  },
  art: {
    width: 40,
    height: 40,
    borderRadius: Radius.Thumb,
    overflow: 'hidden',
  },
  play: {
    width: 42,
    height: 42,
    borderRadius: 21,
    // Filled amber: this is the one action on the bar, and the app spends amber
    // on actions.
    backgroundColor: Amber,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 3,
  },
  stop: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
