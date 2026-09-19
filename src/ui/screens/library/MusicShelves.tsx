import { Image } from 'expo-image';
import React from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  Hairline,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  Space,
  TowerType,
} from '@/theme';
import { gradientFor, withAlpha } from '@/ui/color';
import { Title } from '@/domain/model/media';
import { MusicHome, railKicker } from '@/domain/model/musicHome';
import { UiState } from '@/ui/uiState';
import { artSource } from '@/ui/imageSource';
import { UiStateError } from '@/ui/components/ServerError';
import { ChevronGlyph } from '@/ui/components/Glyphs';
import { DataLabel } from '@/ui/components/Primitives';
import { Skeleton } from '@/ui/components/Rails';

/** The tile width, and with it how many fit across a phone. */
export const TILE = 132;

/** One line of the title style, for the two-line box under each sleeve. */
const TITLE_LINE = Math.ceil((TowerType.bodyNote.fontSize ?? 13) * 1.35);

/**
 * The music screen: shelves rather than a grid.
 *
 * The library grid is right for films — a poster is how you recognise one, and a
 * wall of them is a shelf you scan. Music has neither property. Three hundred
 * tracks at tile size all look the same, and nobody scans an alphabetical wall
 * of songs looking for something to put on.
 *
 * So this offers ways *in*: what you were part-way through, then shelves by
 * mood, activity, era and who scored them. The server computes those from each
 * track's own tempo, energy and brightness rather than guessing from titles, and
 * this renders whatever rails it sends in the order it sends them — a new mood
 * appears as a new shelf with no client release.
 *
 * Ported from ui/screens/library/MusicShelves.kt.
 */
export function MusicShelves({
  music,
  onPlay,
  onOpenRail,
}: {
  music: UiState<MusicHome>;
  /** The shelf a track was tapped in becomes the queue. */
  onPlay: (tracks: Title[], index: number) => void;
  onOpenRail: (key: string, title: string) => void;
}) {
  if (music.type === 'LOADING') return <ShelfSkeleton />;
  if (music.type !== 'LOADED') return <UiStateError state={music} />;

  const home = music.data;
  const shelves: { id: string; heading: string; kicker: string | null; tracks: Title[]; key: string | null }[] =
    [
      ...(home.continueListening.length > 0
        ? [
            {
              id: 'continue',
              heading: 'Pick up where you left off',
              kicker: null,
              tracks: home.continueListening,
              key: null,
            },
          ]
        : []),
      ...home.rails.map((rail) => ({
        id: rail.key || rail.title,
        heading: rail.title,
        kicker: railKicker(rail.key),
        tracks: rail.tracks,
        key: rail.key,
      })),
    ];

  return (
    <FlatList
      data={shelves}
      keyExtractor={(shelf) => shelf.id}
      contentContainerStyle={{ paddingTop: 6, paddingBottom: 28 }}
      renderItem={({ item }) => (
        <Shelf
          heading={item.heading}
          kicker={item.kicker}
          tracks={item.tracks}
          onPlay={onPlay}
          onOpen={item.key != null ? () => onOpenRail(item.key!, item.heading) : undefined}
        />
      )}
    />
  );
}

function Shelf({
  heading,
  kicker,
  tracks,
  onPlay,
  onOpen,
}: {
  heading: string;
  kicker: string | null;
  tracks: Title[];
  onPlay: (tracks: Title[], index: number) => void;
  onOpen?: () => void;
}) {
  const headingBlock = (
    <View style={{ flex: 1 }}>
      {kicker != null && (
        // Faint rather than amber on purpose. Amber is this app's accent for
        // actions, and eighteen headings are not eighteen actions.
        <DataLabel text={kicker} technical={false} color={OnInkFaint} style={{ marginBottom: 3 }} />
      )}
      <Text style={[TowerType.titleSection, { color: OnInk }]} numberOfLines={1}>
        {heading}
      </Text>
    </View>
  );

  return (
    <View style={{ marginBottom: 28 }}>
      {onOpen != null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${heading}`}
          onPress={onOpen}
          style={({ pressed }) => [styles.heading, { opacity: pressed ? 0.7 : 1 }]}
        >
          {headingBlock}
          <ChevronGlyph color={OnInkFaint} size={14} />
        </Pressable>
      ) : (
        <View style={styles.heading}>{headingBlock}</View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {tracks.map((track, index) => (
          <AlbumTile key={track.id} track={track} onPress={() => onPlay(tracks, index)} />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * A square sleeve, which is this app's only square art.
 *
 * It is the shape the server actually has for a track, and cropping a sleeve to
 * the 2:3 a poster uses would cut the top and bottom off the only picture the
 * file has.
 */
export function AlbumTile({ track, onPress }: { track: Title; onPress: () => void }) {
  const [from, to] = gradientFor(track.name);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${track.name}`}
      onPress={onPress}
      style={({ pressed }) => [{ width: TILE, opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={styles.sleeve}>
        <LinearGradient
          colors={[from, to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.33, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/*
         * Under the art rather than instead of it. The disk is full of MP3s the
         * server reports as having a cover and then serves nothing for, and an
         * `else` branch never runs for those — they came out as bare gradients.
         * Painting the initial first means the tile reads as a sleeve whether the
         * art arrives, fails, or was never there.
         *
         * Large and faint rather than small and legible: this is the texture of a
         * blank sleeve, not a label anyone reads.
         */}
        <Text style={[TowerType.titleDisplay, { color: withAlpha(OnInk, 0.22) }]}>
          {track.name.slice(0, 1).toUpperCase()}
        </Text>
        {track.posterUrl != null && (
          <Image
            source={artSource(track.posterUrl)}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={140}
          />
        )}
      </View>

      {/*
       * Two lines always, not at most two. Song titles wrap often enough that
       * letting each tile take its natural height leaves the artist names down a
       * shelf sitting at four different heights.
       *
       * A fixed height rather than a trailing newline: the newline was a hack
       * that reserved the space but also fed the ellipsis an extra line, so a
       * one-line title lost its tail to a "…" it did not need.
       */}
      <View style={styles.tileTitle}>
        <Text style={[TowerType.bodyNote, { color: OnInk }]} numberOfLines={2}>
          {track.name}
        </Text>
      </View>
      <Text style={[TowerType.bodyNote, { color: OnInkMuted, marginTop: 2 }]} numberOfLines={1}>
        {track.artist ?? ''}
      </Text>
    </Pressable>
  );
}

/** Two shelves' worth, so the wait looks like the thing that is coming. */
function ShelfSkeleton() {
  return (
    <View style={{ paddingTop: 6 }}>
      {[0, 1].map((shelf) => (
        <View key={shelf} style={{ marginBottom: 28 }}>
          <View style={{ paddingHorizontal: Space.Screen }}>
            <Skeleton cornerRadius={3} style={{ width: 90, height: 9 }} />
            <Skeleton cornerRadius={4} style={{ width: 160, height: 18, marginTop: 8 }} />
          </View>
          <View style={[styles.row, { flexDirection: 'row' }]}>
            {[0, 1, 2].map((tile) => (
              <Skeleton
                key={tile}
                cornerRadius={8}
                style={{ width: TILE, height: TILE }}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Space.Screen,
    paddingBottom: 12,
  },
  row: {
    gap: 12,
    paddingHorizontal: Space.Screen,
  },
  tileTitle: {
    // Two lines of bodyNote, reserved whether the title fills them or not.
    height: TITLE_LINE * 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  sleeve: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.Thumb,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    // A hairline inside the clip. On a near-black background an untextured
    // square has no edge at all and the shelf reads as floating colour; one
    // pixel of light mounts every tile the same way, art or gradient.
    borderWidth: 1,
    borderColor: Hairline,
  },
});
