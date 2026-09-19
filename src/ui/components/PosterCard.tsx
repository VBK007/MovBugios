import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Amber, OnInkFaint, Radius, TowerType } from '@/theme';
import { formatBytes } from '@/domain/model/library';
import { Title, resolution } from '@/domain/model/media';
import { gradientFor } from '@/ui/color';
import { artSource } from '@/ui/imageSource';
import { DataMeta } from '@/ui/components/Primitives';

/**
 * A 2:3 poster. The library has no artwork server, so the placeholder *is* the
 * design: a 160° gradient picked stably from the title, with the name typeset
 * over a scrim at the bottom.
 *
 * Posters are the only thing in Tower that gets a real shadow.
 *
 * Ported from ui/components/PosterCard.kt.
 */
export function PosterCard({
  title,
  onPress,
  width = 112,
  showUnwatchedDot = true,
  /** The mono line under the poster, e.g. `1080p · 4.2 GB`. */
  meta,
  /** Two for a sentence, one for a measurement. See `DataMeta`. */
  metaMaxLines = 1,
  style,
}: {
  title: Title;
  onPress: () => void;
  width?: number | null;
  showUnwatchedDot?: boolean;
  meta?: string | null;
  metaMaxLines?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [from, to] = gradientFor(title.name);
  const unavailable = title.missing;
  const line = meta ?? defaultMeta(title);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={posterDescription(title)}
      onPress={onPress}
      style={({ pressed }) => [
        width != null ? { width } : null,
        { opacity: pressed ? 0.8 : 1 },
        style as never,
      ]}
    >
      {/*
       * Shadow and clip are deliberately on different views. On iOS a shadow is
       * not painted on the same view that sets `overflow: hidden`, so the two
       * have to be split or the posters lose the one real shadow in the app.
       */}
      <View style={[styles.artShadow, { opacity: unavailable ? 0.4 : 1 }]}>
        <View style={styles.art}>
        {/*
         * The gradient is the backdrop, not a fallback that gets swapped out:
         * it stays underneath while artwork loads and if it never arrives, so a
         * poster is never a grey box — and a title with no artwork is not a
         * broken image, it is the placeholder the design intends.
         */}
        <LinearGradient
          colors={[from, to]}
          // 160° measured from the +x axis, as a long diagonal so the ramp
          // survives whatever aspect the tile ends up at.
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

        {/* The scrim, then the title above it — never the other way round. */}
        <LinearGradient
          colors={['transparent', '#06080BD9']}
          locations={[0.55, 1]}
          style={StyleSheet.absoluteFill}
        />

        <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
          {title.name}
        </Text>

        {showUnwatchedDot && title.watchState === 'UNWATCHED' && !unavailable && (
          <View style={styles.unwatchedDot} />
        )}
        </View>
      </View>

      {line != null && (
        <DataMeta
          text={line}
          color={unavailable ? 'rgba(246,243,236,0.22)' : OnInkFaint}
          maxLines={metaMaxLines}
          style={{ marginTop: 6 }}
        />
      )}
    </Pressable>
  );
}

/** A small thumb used in candidate lists and handoff cards — no title, no dot. */
export function PosterThumb({
  seed,
  width = 44,
  height = 64,
  /** Artwork when the server has it; the gradient is the fallback. */
  imageUrl,
  style,
}: {
  seed: string;
  width?: number;
  height?: number;
  imageUrl?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const [from, to] = gradientFor(seed);
  return (
    <View style={[{ width, height, borderRadius: 5, overflow: 'hidden' }, style as never]}>
      <LinearGradient
        colors={[from, to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.33, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {artSource(imageUrl) != null && (
        <Image source={artSource(imageUrl)!} contentFit="cover" style={StyleSheet.absoluteFill} />
      )}
    </View>
  );
}

/**
 * The mono line under a poster.
 *
 * Grid tiles come from the summary endpoint, which carries no file size and
 * often no `quality` — so a line built only from resolution and size was empty
 * for most of a real library. Runtime is nearly always present and is the fact
 * someone actually wants from a shelf: how long is it.
 */
function defaultMeta(title: Title): string | null {
  const bits: string[] = [];
  const res = resolution(title.file);
  if (res) bits.push(res);
  if (title.file.sizeBytes > 0) bits.push(formatBytes(title.file.sizeBytes));
  if (title.runtimeMinutes != null && title.runtimeMinutes > 0) {
    bits.push(runtimeLabel(title.runtimeMinutes));
  }
  return bits.length > 0 ? bits.join(' · ') : null;
}

/** `2H 28M` over `148 MIN` — hours read faster at a glance on a shelf. */
function runtimeLabel(minutes: number): string {
  const hours = Math.trunc(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0 && rest > 0) return `${hours}H ${rest}M`;
  if (hours > 0) return `${hours}H`;
  return `${minutes} MIN`;
}

/**
 * Screen readers get the human facts and the state, not the codec soup — the
 * mono line is decoration for people who can see the grid at a glance.
 */
function posterDescription(title: Title): string {
  const parts: string[] = [title.name];
  if (title.year != null) parts.push(String(title.year));
  switch (title.watchState) {
    case 'UNWATCHED':
      parts.push('not watched yet');
      break;
    case 'IN_PROGRESS':
      parts.push('part-watched');
      break;
    case 'WATCHED':
      parts.push('watched');
      break;
  }
  if (title.missing) parts.push('unavailable while the server is asleep');
  return parts.join(', ');
}

const styles = StyleSheet.create({
  artShadow: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: Radius.Thumb,
    // Posters are the only thing in Tower that gets a real shadow.
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  art: {
    flex: 1,
    borderRadius: Radius.Thumb,
    overflow: 'hidden',
  },
  title: {
    ...TowerType.titleRow,
    color: 'rgba(255,255,255,0.94)',
    position: 'absolute',
    left: 9,
    right: 9,
    bottom: 9,
  },
  unwatchedDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Amber,
  },
});
