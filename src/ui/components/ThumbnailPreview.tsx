import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Amber, DirectPlay, Hairline, PosterGradients, Radius, TowerType } from '@/theme';
import { formatClock } from '@/domain/model/people';
import { Trickplay, filmstripAround, frameAt, trickplayReady } from '@/domain/model/player';
import { gradientFor } from '@/ui/color';
import { DataMeta } from '@/ui/components/Primitives';

/**
 * The card that floats above the thumb while the user drags.
 *
 * This exists to sell the one thing a home server does better than a streaming
 * service: the file is twenty feet away on a disk you own, so seeking is
 * instant. The filmstrip is the argument — six neighbouring frames, already
 * decoded, with no spinner between them.
 *
 * Frames render as stable gradients until a real sprite sheet is wired in;
 * `locateFrame` already computes the sheet and tile for each frame, so the swap
 * is a change of leaf component rather than of layout.
 *
 * Ported from ui/components/ThumbnailPreview.kt.
 */
export function ThumbnailPreview({
  positionSeconds,
  trickplay,
  seedForArt = 'frame',
  width = 192,
  showFilmstrip = true,
  /** The green line. Only true when we know the file is on local storage. */
  isLocal = true,
  style,
}: {
  positionSeconds: number;
  trickplay?: Trickplay | null;
  seedForArt?: string;
  width?: number;
  showFilmstrip?: boolean;
  isLocal?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const current = trickplay ? frameAt(trickplay, positionSeconds) : 0;
  const frames =
    showFilmstrip && trickplay != null && trickplayReady(trickplay)
      ? filmstripAround(trickplay, positionSeconds)
      : [];

  return (
    <View
      style={[{ width, alignItems: 'center' }, style as never]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <View style={styles.card}>
        <FrameArt seed={seedForArt} frame={current} style={styles.hero} />
        <View style={styles.timecode}>
          <Text style={[TowerType.dataTimecode, { color: '#FFFFFF' }]}>
            {formatClock(positionSeconds)}
          </Text>
        </View>
      </View>

      {frames.length > 0 && (
        <View style={styles.strip}>
          {frames.map((frame) => (
            <FrameArt
              key={frame}
              seed={seedForArt}
              frame={frame}
              style={[
                styles.stripFrame,
                frame === current ? { borderWidth: 1, borderColor: Amber } : null,
              ]}
            />
          ))}
        </View>
      )}

      {isLocal && (
        <DataMeta
          text="SEEK IS INSTANT · FILE IS LOCAL"
          color={DirectPlay}
          style={{ marginTop: 9 }}
        />
      )}
    </View>
  );
}

/**
 * One trickplay frame. The gradient is keyed by frame index so scrubbing shows
 * visible motion rather than a single flat colour sliding under the thumb.
 */
function FrameArt({
  seed,
  frame,
  style,
}: {
  seed: string;
  frame: number;
  style?: StyleProp<ViewStyle>;
}) {
  // Divided by three so neighbouring frames share a tone and the strip reads as
  // one shot rather than six unrelated colours.
  const [from, to] = gradientFor(`${seed}#${Math.trunc(frame / 3)}`, PosterGradients);
  return (
    <View style={[{ overflow: 'hidden' }, style as never]}>
      <LinearGradient
        colors={[from, to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.33, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: Radius.Default,
    overflow: 'hidden',
    backgroundColor: '#0E0E12',
    borderWidth: 1,
    borderColor: Hairline,
  },
  hero: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  timecode: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: 6,
    alignItems: 'center',
  },
  strip: {
    flexDirection: 'row',
    gap: 4,
    width: '100%',
    marginTop: 9,
  },
  stripFrame: {
    flex: 1,
    height: 24,
    borderRadius: 3,
  },
});
