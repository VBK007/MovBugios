import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Amber, AmberInk, DirectPlay, Hairline, OnInkMuted, TowerType } from '@/theme';
import {
  PlaybackPlan,
  Title,
  progressFraction,
  remainingLabel,
  resolution,
} from '@/domain/model/media';
import { gradientFor } from '@/ui/color';
import { artSource } from '@/ui/imageSource';
import { PlayGlyph } from '@/ui/components/Glyphs';
import { StatePill } from '@/ui/components/Primitives';

/**
 * The one wide 16:9 card at the top of Home.
 *
 * The progress bar is welded to the card's bottom edge rather than floated
 * inside it — it is a property of the card, not a widget sitting on it.
 *
 * Ported from ui/components/ContinueWatchingCard.kt.
 */
export function ContinueWatchingCard({
  title,
  onPlay,
  style,
}: {
  title: Title;
  onPlay: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [from, to] = gradientFor(title.name);
  const pill = planPill(title.plan);
  const line = [remainingLabel(title), resolution(title.file)].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={describe(title)}
      onPress={onPlay}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.9 : 1 }, style as never]}
    >
      <View style={styles.art}>
        <LinearGradient
          colors={[from, to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.33, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/*
         * Backdrop first — it is the 16:9 art this card is shaped for. Most
         * libraries only have a poster, which crops acceptably here, and a title
         * with neither keeps the gradient rather than a grey box.
         */}
        {artSource(title.backdropUrl ?? title.posterUrl) != null && (
          <Image
            source={artSource(title.backdropUrl ?? title.posterUrl)!}
            contentFit="cover"
            transition={180}
            style={StyleSheet.absoluteFill}
          />
        )}

        {/*
         * A scrim so the title, meta and play button stay legible over whatever
         * frame the artwork happens to be.
         */}
        <LinearGradient
          colors={['transparent', '#06080BCC']}
          locations={[0.35, 1]}
          style={StyleSheet.absoluteFill}
        />

        {pill && (
          <StatePill
            text={pill.text}
            tint={pill.tint}
            fill="#0A0A0CB8"
            border="transparent"
            style={styles.pill}
          />
        )}

        <View style={styles.footer}>
          <View style={styles.playButton}>
            <PlayGlyph color={AmberInk} size={15} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text
              style={[TowerType.titleHero, { color: '#FFFFFF' }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {title.name}
            </Text>
            {/*
             * `42 min left · 1080p` — one mono line, per the board. The
             * remaining time is derived from the server's own resume position,
             * so it belongs with the resolution rather than being split across
             * two typefaces.
             */}
            {line !== '' && (
              <Text style={[TowerType.dataTimecode, { color: OnInkMuted, marginTop: 3 }]}>
                {line}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Welded to the bottom edge. */}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progressFraction(title) * 100}%` }]} />
      </View>
    </Pressable>
  );
}

/** The plan as a short pill label plus its colour, or null when unknown. */
export function planPill(plan: PlaybackPlan): { text: string; tint: string } | null {
  switch (plan.type) {
    case 'DIRECT_PLAY':
      return { text: 'DIRECT PLAY', tint: DirectPlay };
    case 'TRANSCODE':
      return { text: 'WILL TRANSCODE', tint: Amber };
    case 'UNKNOWN':
      return null;
  }
}

function describe(title: Title): string {
  const parts: string[] = [`Resume ${title.name}`];
  const remaining = remainingLabel(title);
  if (remaining) parts.push(remaining);
  if (title.plan.type === 'DIRECT_PLAY') parts.push('plays directly on this device');
  if (title.plan.type === 'TRANSCODE') parts.push('the server will convert this first');
  return parts.join(', ');
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#141418',
    borderWidth: 1,
    borderColor: Hairline,
  },
  art: {
    width: '100%',
    height: 150,
  },
  pill: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  fill: {
    height: '100%',
    backgroundColor: Amber,
  },
});
