import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { Amber, KidsGreen, MediaPink, Radius, UserBlue } from '@/theme';
import { UsageSegment } from '@/domain/model/downloads';
import { withAlpha } from '@/ui/color';
import { DataMeta } from '@/ui/components/Primitives';

/**
 * A segmented bar showing what is eating a volume, with a mono legend.
 *
 * Used twice: the phone's storage on Saved, and the server's disk on the admin
 * Disk tab. Whatever is left over renders as unfilled track rather than being
 * padded out with a "free" segment, so the empty space reads as free space.
 *
 * Ported from ui/components/UsageBar.kt.
 */
export function UsageBar({
  segments,
  height = 10,
  showLegend = true,
  trackColor = withAlpha('#FFFFFF', 0.07),
  style,
}: {
  segments: UsageSegment[];
  height?: number;
  showLegend?: boolean;
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const used = segments.reduce((sum, s) => sum + s.fraction, 0);

  return (
    <View style={[{ width: '100%' }, style as never]}>
      <View
        accessibilityLabel={describe(segments)}
        style={[styles.track, { height, backgroundColor: trackColor }]}
      >
        {segments
          .filter((s) => s.fraction > 0)
          .map((segment) => (
            <View
              key={segment.label}
              style={{ flex: segment.fraction, backgroundColor: colorFor(segment) }}
            />
          ))}
        {/* The remainder. Weighting it keeps the segments honest about scale. */}
        {used < 1 && <View style={{ flex: 1 - used }} />}
      </View>

      {showLegend && (
        <View style={styles.legend}>
          {segments.map((segment) => (
            <View key={segment.label} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: colorFor(segment) }]} />
              <DataMeta text={segment.label} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Category colours follow the palette's own assignments: blue is home video,
 * pink is music and photos. Amber is the fallback because an unnamed segment is
 * usually the one wanting attention (a conversion in flight, a cache).
 */
function colorFor(segment: UsageSegment): string {
  switch (segment.kind) {
    case 'FILM':
      return Amber;
    case 'ANIME':
      return KidsGreen;
    case 'HOME_VIDEO':
      return UserBlue;
    case 'MUSIC':
    case 'PHOTO':
      return MediaPink;
    default:
      return withAlpha(Amber, 0.55);
  }
}

function describe(segments: UsageSegment[]): string {
  if (segments.length === 0) return 'Storage usage';
  return `Storage usage: ${segments.map((s) => s.label.toLowerCase()).join(', ')}`;
}

/** The 3px bar welded under a card or a conversion in flight. */
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
  const clamped = Math.min(1, Math.max(0, fraction));
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
  track: {
    flexDirection: 'row',
    width: '100%',
    borderRadius: Radius.Pill,
    overflow: 'hidden',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    gap: 14,
    paddingTop: 11,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatch: {
    width: 7,
    height: 7,
    borderRadius: 2,
  },
});
