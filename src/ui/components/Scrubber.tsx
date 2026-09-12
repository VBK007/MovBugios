import React, { useRef, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { Amber, Radius } from '@/theme';
import { Chapter } from '@/domain/model/media';
import { formatClock } from '@/domain/model/people';
import { withAlpha } from '@/ui/color';

/**
 * The player's transport bar.
 *
 * Amber track, a white thumb with a soft amber halo, and 2px ticks at chapter
 * boundaries. While a drag is in flight the component reports the *previewed*
 * position continuously but only commits on release — the player keeps playing
 * the old position until the user lets go, which is what makes thumbnail
 * scrubbing feel like inspection rather than a series of seeks.
 *
 * Ported from ui/components/Scrubber.kt. The Compose gesture handler becomes the
 * responder system, and for the same reason it was written by hand there: the
 * thumb must move on *press* rather than after a touch slop, or the bar feels
 * reluctant rather than attached to the finger. A tap is a press that never
 * moves, and lands exactly where the finger went down.
 */
export function Scrubber({
  positionSeconds,
  durationSeconds,
  onSeek,
  chapters = [],
  onScrubPreview = () => {},
  onScrubbingChange = () => {},
  enabled = true,
  trackHeight = 3,
  thumbSize = 17,
  style,
}: {
  positionSeconds: number;
  durationSeconds: number;
  onSeek: (seconds: number) => void;
  chapters?: Chapter[];
  /** Fires with the previewed position on every drag sample. */
  onScrubPreview?: (seconds: number) => void;
  /** True while the user has hold of the thumb. */
  onScrubbingChange?: (scrubbing: boolean) => void;
  enabled?: boolean;
  trackHeight?: number;
  thumbSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const width = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [dragFraction, setDragFraction] = useState(0);

  const playedFraction =
    durationSeconds > 0 ? Math.min(Math.max(positionSeconds / durationSeconds, 0), 1) : 0;
  const shownFraction = dragging ? dragFraction : playedFraction;

  const fractionAt = (x: number) =>
    width.current <= 0 ? 0 : Math.min(Math.max(x / width.current, 0), 1);

  const onLayout = (e: LayoutChangeEvent) => {
    width.current = e.nativeEvent.layout.width;
  };

  const track = (e: GestureResponderEvent) => {
    const fraction = fractionAt(e.nativeEvent.locationX);
    setDragFraction(fraction);
    onScrubPreview(fraction * durationSeconds);
    return fraction;
  };

  const responder = enabled
    ? {
        // Captured rather than merely claimed. A bare `onStartShouldSetResponder`
        // still loses the gesture to an ancestor that asks first, and on iOS the
        // navigator's interactive pop is exactly such an ancestor — so a drag
        // that began on the bar was being read as a swipe back, and the screen
        // slid away mid-scrub.
        onStartShouldSetResponderCapture: () => true,
        onMoveShouldSetResponderCapture: () => true,
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        /**
         * And once the bar has the gesture, it keeps it.
         *
         * Without this the native pan can take the responder away part-way
         * through, which leaves `scrubbing` true, the thumb stranded, and no
         * seek ever committed.
         */
        onResponderTerminationRequest: () => false,
        onResponderGrant: (e: GestureResponderEvent) => {
          setDragging(true);
          onScrubbingChange(true);
          track(e);
        },
        onResponderMove: (e: GestureResponderEvent) => {
          track(e);
        },
        onResponderRelease: (e: GestureResponderEvent) => {
          const fraction = track(e);
          setDragging(false);
          onScrubbingChange(false);
          onSeek(fraction * durationSeconds);
        },
        onResponderTerminate: () => {
          // Reached only if the system forcibly takes the gesture. Put the
          // scrubber back rather than leaving it stuck mid-drag.
          setDragging(false);
          onScrubbingChange(false);
        },
      }
    : {};

  return (
    <View
      {...responder}
      onLayout={onLayout}
      accessibilityRole="adjustable"
      accessibilityLabel={`Playback position, ${formatClock(
        shownFraction * durationSeconds,
      )} of ${formatClock(durationSeconds)}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(shownFraction * 100) }}
      // A 3px line is not a touch target; the row is.
      style={[styles.row, style as never]}
    >
      {/* Unplayed track. */}
      <View
        pointerEvents="none"
        style={[
          styles.track,
          { height: trackHeight, backgroundColor: withAlpha('#FFFFFF', 0.16) },
        ]}
      />

      {/* Played track. */}
      <View
        pointerEvents="none"
        style={[
          styles.track,
          {
            height: trackHeight,
            backgroundColor: Amber,
            width: `${shownFraction * 100}%`,
          },
        ]}
      />

      {/* Chapter boundaries, as ticks the eye can aim at. */}
      {durationSeconds > 0 &&
        chapters.map((chapter) => {
          const at = chapter.startSeconds / durationSeconds;
          if (at <= 0 || at >= 1) return null;
          return (
            <View
              key={chapter.index}
              pointerEvents="none"
              style={[
                styles.tick,
                { left: `${at * 100}%`, height: trackHeight + 3, backgroundColor: withAlpha('#FFFFFF', 0.5) },
              ]}
            />
          );
        })}

      {/* The thumb, with its halo. */}
      <View
        pointerEvents="none"
        style={[
          styles.thumb,
          {
            left: `${shownFraction * 100}%`,
            width: thumbSize,
            height: thumbSize,
            borderRadius: thumbSize / 2,
            marginLeft: -thumbSize / 2,
            shadowColor: Amber,
            shadowOpacity: dragging ? 0.9 : 0.55,
            shadowRadius: dragging ? 10 : 6,
          },
        ]}
      />
    </View>
  );
}

/** The 3px bar welded under a card, with no thumb and no gesture. */
export function ProgressTrack({
  fraction,
  height = 3,
  color = Amber,
  style,
}: {
  fraction: number;
  height?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return (
    <View
      style={[
        { width: '100%', height, backgroundColor: withAlpha('#FFFFFF', 0.12) },
        style as never,
      ]}
    >
      <View style={{ width: `${clamped * 100}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    height: 44,
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: 0,
    borderRadius: Radius.Pill,
    width: '100%',
  },
  tick: {
    position: 'absolute',
    width: 2,
    borderRadius: 1,
  },
  thumb: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
});
