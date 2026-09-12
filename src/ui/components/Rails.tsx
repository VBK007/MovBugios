import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Amber, HomeVideoGradients, OnInk, OnInkFaint, Radius, Space, TowerType } from '@/theme';
import { formatBytes } from '@/domain/model/library';
import { Title } from '@/domain/model/media';
import { gradientFor } from '@/ui/color';
import { artSource } from '@/ui/imageSource';
import { DataMeta } from '@/ui/components/Primitives';

/**
 * A horizontal rail with its heading.
 *
 * The trailing content padding is deliberately smaller than the leading one so
 * the last tile is clipped by the screen edge. That clipping *is* the scroll
 * affordance — the library is small enough that a rail rarely overflows by much,
 * and without the cut it reads as a complete row with an odd gap.
 *
 * Ported from ui/components/Rails.kt.
 */
export function Rail({
  heading,
  itemSpacing = 12,
  /** The amber link on the right of the heading, e.g. `All 84`. */
  action,
  onAction,
  children,
  style,
}: {
  heading: string;
  itemSpacing?: number;
  action?: string | null;
  onAction?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ width: '100%' }, style as never]}>
      {/*
       * Mono, uppercase, 45% — this names a shelf the server assembled, and the
       * board sets every one of these in Plex Mono rather than Archivo.
       */}
      <View style={styles.railHeader}>
        <Text style={[TowerType.sectionLabel, { color: OnInkFaint, flex: 1 }]}>
          {heading.toUpperCase()}
        </Text>
        {action != null &&
          (onAction ? (
            <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction}>
              <Text style={[TowerType.chipLabel, { color: Amber }]}>{action}</Text>
            </Pressable>
          ) : (
            <Text style={[TowerType.chipLabel, { color: Amber }]}>{action}</Text>
          ))}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingLeft: Space.Screen,
          paddingRight: 6,
          gap: itemSpacing,
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

/**
 * A 16:9 home-video tile — "From your camera roll".
 *
 * Home videos get their own gradient family and their own meta line: minutes,
 * size, and who is in it. A home video has no year, rating or genre, and
 * pretending otherwise is how a shelf starts lying about what it holds.
 */
export function HomeVideoTile({
  title,
  onPress,
  width = 150,
  style,
}: {
  title: Title;
  onPress: () => void;
  width?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [from, to] = gradientFor(title.name, HomeVideoGradients);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${title.name}`}
      onPress={onPress}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.8 : 1 }, style as never]}
    >
      <View style={styles.homeVideoArt}>
        <LinearGradient
          colors={[from, to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.33, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {artSource(title.posterUrl) != null && (
          <Image
            source={artSource(title.posterUrl)!}
            contentFit="cover"
            transition={180}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={['transparent', '#06080BCC']}
          style={styles.homeVideoScrim}
        />
      </View>
      <Text
        style={[TowerType.titleRow, { color: OnInk, marginTop: 8 }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {title.name}
      </Text>
      <DataMeta text={homeVideoMeta(title)} style={{ marginTop: 3 }} />
    </Pressable>
  );
}

/** `18 MIN · 3.2 GB · 4 PEOPLE` */
export function homeVideoMeta(title: Title): string {
  const parts: string[] = [];
  if (title.runtimeMinutes != null) parts.push(`${title.runtimeMinutes} MIN`);
  if (title.file.sizeBytes > 0) parts.push(formatBytes(title.file.sizeBytes));
  if (title.people.length > 0) {
    parts.push(title.people.length === 1 ? '1 PERSON' : `${title.people.length} PEOPLE`);
  }
  return parts.join(' · ');
}

/** A grey block standing in for content that has not arrived yet. */
export function Skeleton({
  cornerRadius = 8,
  style,
}: {
  cornerRadius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { borderRadius: cornerRadius, backgroundColor: 'rgba(255,255,255,0.05)' },
        style as never,
      ]}
    />
  );
}

/**
 * A poster-shaped skeleton, so the loading state matches the loaded layout.
 *
 * Pass `width = null` inside a grid, where the cell already has a width and a
 * fixed one would fight it.
 */
export function PosterSkeleton({
  width = 112,
  style,
}: {
  width?: number | null;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[width != null ? { width } : { width: '100%' }, style as never]}>
      <Skeleton style={{ width: '100%', aspectRatio: 2 / 3 }} />
      <Skeleton cornerRadius={3} style={{ marginTop: 7, width: '70%', height: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  railHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
    paddingHorizontal: Space.Screen,
    paddingBottom: 10,
  },
  homeVideoArt: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.Thumb,
    overflow: 'hidden',
  },
  homeVideoScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 40,
  },
});
