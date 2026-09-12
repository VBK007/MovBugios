import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Amber, AmberWash, Hairline, OnInkFaint, OnInkMuted, Radius, TowerType } from '@/theme';
import { Engagement } from '@/domain/model/media';
import { withAlpha } from '@/ui/color';
import { DataMeta } from '@/ui/components/Primitives';

/**
 * `1.2K views · ♥ 34 · 5 comments` — what the house has made of a title.
 *
 * The like is a control and the other two are facts, so only the like gets a
 * border and a fill. Counts are abbreviated because the exact number of views is
 * never the point, and a five-digit number would push the row onto two lines.
 *
 * Ported from ui/components/Engagement.kt.
 */
export function EngagementRow({
  engagement,
  onToggleLike,
  onOpenComments,
  style,
}: {
  engagement: Engagement;
  onToggleLike: () => void;
  onOpenComments: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, style as never]}>
      <Pill
        text={engagement.likes > 0 ? `♥  ${count(engagement.likes)}` : '♥  Like'}
        tint={engagement.likedByMe ? Amber : OnInkMuted}
        fill={engagement.likedByMe ? AmberWash : 'transparent'}
        border={engagement.likedByMe ? withAlpha(Amber, 0.45) : Hairline}
        onPress={onToggleLike}
      />
      <Pill
        text={
          engagement.comments === 0
            ? 'Comment'
            : engagement.comments === 1
              ? '1 comment'
              : `${count(engagement.comments)} comments`
        }
        tint={OnInkMuted}
        fill="transparent"
        border={Hairline}
        onPress={onOpenComments}
      />
      {engagement.views > 0 && (
        <DataMeta
          text={`${count(engagement.views)} VIEWS`}
          color={OnInkFaint}
          technical={false}
          style={{ marginLeft: 2 }}
        />
      )}
    </View>
  );
}

function Pill({
  text,
  tint,
  fill,
  border,
  onPress,
}: {
  text: string;
  tint: string;
  fill: string;
  border: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: fill, borderColor: border, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={[TowerType.buttonLabel, { color: tint }]} numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );
}

/**
 * `999` / `1.2K` / `34K` / `1.1M`.
 *
 * One decimal only below ten thousand, where the difference between 1.2K and
 * 1.3K is still worth seeing; above that it is noise.
 */
export function count(value: number): string {
  if (value < 1_000) return String(value);
  if (value < 10_000) return `${tenths(value, 1_000)}K`;
  if (value < 1_000_000) return `${Math.trunc(value / 1_000)}K`;
  if (value < 10_000_000) return `${tenths(value, 1_000_000)}M`;
  return `${Math.trunc(value / 1_000_000)}M`;
}

/** Rounds to one decimal, dropping a trailing `.0`. */
function tenths(value: number, unit: number): string {
  const scaled = Math.trunc((value * 10 + unit / 2) / unit);
  const whole = Math.trunc(scaled / 10);
  const rest = scaled % 10;
  return rest === 0 ? String(whole) : `${whole}.${rest}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pill: {
    borderRadius: Radius.Pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
});
