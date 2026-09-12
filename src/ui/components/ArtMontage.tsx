import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { Ink, Motion, PosterGradients } from '@/theme';
import { gradientFor, withAlpha } from '@/ui/color';
import { artSource } from '@/ui/imageSource';

/** How long one scene holds before the next. Slow: this is not a slideshow. */
const SCENE_MS = 2_200;

const WALL_ROWS = 5;
const WALL_COLUMNS = 3;

/**
 * Artwork from the household's own library, drifting behind whatever is on top.
 *
 * Shared by the splash and the first-run questions so both open on the same
 * thing: a wall of the films actually on the disk, rather than stock imagery of
 * somebody else's cinema.
 *
 * Each frame drifts slowly larger while it shows — the Ken Burns move, which is
 * what keeps a still photograph from reading as a stall. The scrim is not
 * optional: posters are arbitrary images and amber on a pale one is unreadable.
 *
 * With no artwork to show it falls back to the generated poster art the grid
 * already uses for unmatched titles, so the screen is never a flat black field
 * even on a first run with nothing scanned.
 *
 * Ported from ui/components/ArtMontage.kt.
 */
export function ArtMontage({
  art,
  /** Seeds the generated fallback, so two screens do not draw the same tiles. */
  fallbackSeed = 'tower',
  /** How dark to hold it. Raise where text sits directly on top. */
  scrimStrength = 1,
  style,
}: {
  art: string[];
  fallbackSeed?: string;
  scrimStrength?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  return (
    <View style={style} pointerEvents="none">
      {art.length === 0 ? <GeneratedWall seed={fallbackSeed} /> : <ScenePager art={art} />}

      {/* Darkest at top and bottom, where headings and buttons live. */}
      <LinearGradient
        colors={[
          withAlpha(Ink, clamp(0.88 * scrimStrength)),
          withAlpha(Ink, clamp(0.66 * scrimStrength)),
          withAlpha(Ink, clamp(0.94 * scrimStrength)),
        ]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function ScenePager({ art }: { art: string[] }) {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1.06)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      // Crossfaded rather than cut: a cut between two arbitrary photographs
      // reads as a glitch, where a dissolve reads as one scene becoming another.
      Animated.sequence([
        Animated.timing(fade, {
          toValue: 0,
          duration: Motion.Slow,
          easing: Motion.Breathe,
          useNativeDriver: true,
        }),
        Animated.timing(fade, {
          toValue: 1,
          duration: Motion.Slow,
          easing: Motion.Breathe,
          useNativeDriver: true,
        }),
      ]).start();
      setTimeout(() => setIndex((i) => (i + 1) % art.length), Motion.Slow);
    }, SCENE_MS);
    return () => clearInterval(timer);
  }, [art, fade]);

  useEffect(() => {
    // The Ken Burns move: each frame drifts slowly larger while it shows, which
    // is what keeps a still photograph from reading as a stall.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.18,
          duration: SCENE_MS * 2,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.06,
          duration: SCENE_MS * 2,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  const source = artSource(art[index % art.length]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: fade, transform: [{ scale }] }]}
    >
      {source != null && (
        // Dimmed at source as well as under the scrim: two weak veils read as
        // depth where one strong one reads as fog.
        <Image
          source={source}
          contentFit="cover"
          transition={0}
          style={[StyleSheet.absoluteFill, { opacity: 0.5 }]}
        />
      )}
    </Animated.View>
  );
}

/**
 * A wall of generated covers, breathing.
 *
 * The same procedural art the library grid draws for a title with no poster, so
 * a first run looks like a shelf rather than like a missing image.
 */
function GeneratedWall({ seed }: { seed: string }) {
  const scale = useRef(new Animated.Value(1.02)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.12,
          duration: Motion.Ambient * 6,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.02,
          duration: Motion.Ambient * 6,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { opacity: 0.55, transform: [{ scale }] }]}
    >
      {Array.from({ length: WALL_ROWS }, (_, row) => (
        <View key={row} style={styles.wallRow}>
          {Array.from({ length: WALL_COLUMNS }, (_, column) => {
            const [from, to] = gradientFor(`${seed}-${row}-${column}`, PosterGradients);
            return (
              <LinearGradient
                key={column}
                colors={[from, to]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.33, y: 1 }}
                style={styles.wallTile}
              />
            );
          })}
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wallRow: {
    flex: 1,
    flexDirection: 'row',
    // Small: this is a wall, not a grid of cards.
    gap: 6,
    marginBottom: 6,
  },
  wallTile: {
    flex: 1,
  },
});
