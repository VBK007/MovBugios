import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import {
  Amber,
  AmberInk,
  Asleep,
  DirectPlay,
  Hairline,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  Surface1,
  TowerType,
  useShowTechnicalBadges,
} from '@/theme';
import { withAlpha } from '@/ui/color';

// ---------------------------------------------------------------------------
// The small pieces. Everything larger is assembled from these, which is what
// keeps a hairline the same hairline on all twenty screens.
//
// Ported from ui/components/Primitives.kt.
// ---------------------------------------------------------------------------

/**
 * A mono label naming something the server measured — a section header, a state,
 * a spec. Hidden entirely when the profile has turned technical badges off,
 * which is why every mono string in the app should come through here or
 * `DataValue` rather than a bare `Text`.
 */
export function DataLabel({
  text,
  color = OnInkFaint,
  /** Set false for the rare mono string that is not a technical detail. */
  technical = true,
  style,
}: {
  text: string;
  color?: string;
  technical?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const showBadges = useShowTechnicalBadges();
  if (technical && !showBadges) return null;
  return (
    <Text
      style={[TowerType.dataLabel, { color }, style as never]}
      numberOfLines={2}
      ellipsizeMode="tail"
    >
      {text.toUpperCase()}
    </Text>
  );
}

/** A measured value sitting beside its label. Same hiding rule as `DataLabel`. */
export function DataValue({
  text,
  color = OnInkMuted,
  technical = true,
  style,
}: {
  text: string;
  color?: string;
  technical?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const showBadges = useShowTechnicalBadges();
  if (technical && !showBadges) return null;
  // Not uppercased: a measured value carries its own case, and `1080p` is not
  // `1080P`. Callers pass state words already uppercase.
  return (
    <Text
      style={[TowerType.dataValue, { color }, style as never]}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {text}
    </Text>
  );
}

/** The smallest mono meta line, e.g. under a poster. Never sits over imagery. */
export function DataMeta({
  text,
  color = OnInkFaint,
  technical = true,
  style,
}: {
  text: string;
  color?: string;
  technical?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const showBadges = useShowTechnicalBadges();
  if (technical && !showBadges) return null;
  // Same rule as `DataValue`: preserve the case the value came with.
  return (
    <Text
      style={[TowerType.dataMeta, { color }, style as never]}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {text}
    </Text>
  );
}

/**
 * The 6px dot beside a status line. Pulses while the thing it describes is live;
 * a grey dot for a sleeping server does not pulse, because nothing is happening.
 *
 * Decorative — the adjacent text carries the meaning, so this is hidden from
 * screen readers rather than announced as an unlabelled image.
 */
export function StatusDot({
  color = DirectPlay,
  size = 6,
  pulsing = true,
  style,
}: {
  color?: string;
  size?: number;
  pulsing?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const alpha = useRef(new Animated.Value(pulsing ? 0.35 : 1)).current;

  useEffect(() => {
    if (!pulsing) {
      alpha.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(alpha, {
          toValue: 1,
          duration: 1_200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(alpha, {
          toValue: 0.35,
          duration: 1_200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [alpha, pulsing]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: alpha },
        style as never,
      ]}
    />
  );
}

/** Grey, still — the server is asleep. */
export function AsleepDot({ style }: { style?: StyleProp<ViewStyle> }) {
  return <StatusDot color={Asleep} pulsing={false} style={style} />;
}

/**
 * A rounded pill carrying a mono state, e.g. `DIRECT PLAY · 1080p · 18.4 Mbps`.
 * Tinted by whatever it is reporting, never neutral for a meaningful state.
 */
export function StatePill({
  text,
  tint = DirectPlay,
  fill,
  border,
  withDot = true,
  technical = true,
  style,
}: {
  text: string;
  tint?: string;
  fill?: string;
  border?: string;
  withDot?: boolean;
  technical?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const showBadges = useShowTechnicalBadges();
  if (technical && !showBadges) return null;
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: fill ?? withAlpha(tint, 0.12),
          borderColor: border ?? withAlpha(tint, 0.35),
        },
        style as never,
      ]}
    >
      {withDot && <StatusDot color={tint} size={5} />}
      <Text style={[TowerType.dataLabel, { color: tint }]} numberOfLines={1}>
        {text.toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * The one filled button in the app. Amber means "this is the action", so there
 * is deliberately no colour parameter — a second filled colour would break the
 * rule that amber is the only accent for actions.
 */
export function AmberButton({
  label,
  onPress,
  enabled = true,
  height = 48,
  style,
}: {
  label: string;
  onPress: () => void;
  enabled?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.amberButton,
        {
          height,
          backgroundColor: enabled ? Amber : withAlpha(Amber, 0.35),
          opacity: pressed && enabled ? 0.85 : 1,
        },
        style as never,
      ]}
    >
      <Text style={[TowerType.buttonLabel, { color: AmberInk }]}>{label}</Text>
    </Pressable>
  );
}

/** The secondary action: a hairline outline, never a fill. */
export function OutlineButton({
  label,
  onPress,
  height = 46,
  fillWidth = false,
  borderColor = withAlpha('#FFFFFF', 0.14),
  style,
}: {
  label: string;
  onPress: () => void;
  height?: number;
  fillWidth?: boolean;
  borderColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.outlineButton,
        { height, borderColor, alignSelf: fillWidth ? 'stretch' : 'auto', opacity: pressed ? 0.7 : 1 },
        style as never,
      ]}
    >
      <Text style={[TowerType.buttonLabel, { color: withAlpha(OnInk, 0.75) }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A square icon-ish button beside the primary action (download, cast). */
export function OutlineIconButton({
  accessibilityLabel,
  onPress,
  size = 50,
  children,
  style,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  size?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.outlineIconButton,
        { width: size, height: size, opacity: pressed ? 0.7 : 1 },
        style as never,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** The 1px rule that separates list rows. Cards are for objects; lists get these. */
export function HairlineDivider({
  color = Hairline,
  style,
}: {
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: color }, style as never]} />;
}

/**
 * A surface that reads as a distinct object — a session, a health metric, a
 * sheet. Depth comes from a slightly lighter fill plus a hairline, not elevation.
 */
export function TowerCard({
  fill = Surface1,
  border = Hairline,
  radius = Radius.Card,
  padding = 14,
  children,
  style,
}: {
  fill?: string;
  border?: string;
  radius?: number;
  padding?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { backgroundColor: fill, borderColor: border, borderWidth: 1, borderRadius: radius, padding },
        style as never,
      ]}
    >
      {children}
    </View>
  );
}

/** A text chip that is a word a human wrote, not a measurement. */
export function WordChip({
  label,
  selected = false,
  /**
   * Null for a chip that only labels something.
   *
   * Every chip used to take an `onPress` and half the call sites passed a no-op,
   * which left a pill that highlights under a thumb and announces itself as a
   * button to a screen reader while doing nothing at all. A genre on the detail
   * screen is a fact, not a control.
   */
  onPress,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const body = (
    <Text
      style={[TowerType.chipLabel, { color: selected ? AmberInk : withAlpha(OnInk, 0.7) }]}
      numberOfLines={1}
    >
      {label}
    </Text>
  );

  const chipStyle: StyleProp<ViewStyle> = [
    styles.chip,
    selected
      ? { backgroundColor: Amber }
      : { borderWidth: 1, borderColor: withAlpha('#FFFFFF', 0.15) },
    style as never,
  ];

  if (!onPress) {
    return <View style={chipStyle}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [chipStyle, { opacity: pressed ? 0.7 : 1 }]}
    >
      {body}
    </Pressable>
  );
}

/** A small avatar circle carrying an initial. */
export function Avatar({
  initial,
  size = 38,
  tint = Amber,
  onTint = AmberInk,
  onPress,
  style,
}: {
  initial: string;
  size?: number;
  tint?: string;
  onTint?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const circle = (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style as never,
      ]}
    >
      <Text style={[TowerType.titleRow, { color: onTint }]}>{initial}</Text>
    </View>
  );
  if (!onPress) return circle;
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {circle}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: Radius.Pill,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  amberButton: {
    borderRadius: Radius.Default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineButton: {
    borderRadius: Radius.Default,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  outlineIconButton: {
    borderRadius: Radius.Card,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    minHeight: 32,
    borderRadius: Radius.Pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
});
