import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  Amber,
  AmberInk,
  Hairline,
  Ink,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  Space,
  TowerType,
} from '@/theme';
import { gradientFor, withAlpha } from '@/ui/color';
import { Title, effectiveDurationSeconds } from '@/domain/model/media';
import { MusicRail, railKicker } from '@/domain/model/musicHome';
import { Loading, UiState, loadState } from '@/ui/uiState';
import { useActiveProfileId, useRepository } from '@/ui/hooks';
import { artSource } from '@/ui/imageSource';
import { UiStateError } from '@/ui/components/ServerError';
import { ChevronGlyph, PlayGlyph, ShuffleGlyph } from '@/ui/components/Glyphs';
import { DataLabel, DataMeta } from '@/ui/components/Primitives';
import { playMusicFrom } from '@/player/playMusic';
import { usePlayGate } from '@/ui/playGate';

/** A shelf opened deliberately is read, not skimmed. */
const PLAYLIST_LIMIT = 60;

/**
 * One shelf, opened.
 *
 * A rail shows four sleeves and hides forty-six. That is the right trade on a
 * screen of eighteen rails, where the job is skimming past the moods you are not
 * in. It is the wrong one the moment somebody picks a shelf: the question stops
 * being "which shelf" and becomes "what is on this one", and a horizontal strip
 * answers it badly — no durations, no sense of length, most of it behind a
 * sideways drag.
 *
 * There is no endpoint for a single shelf, so this asks for the music home again
 * and keeps the one it was sent for. That sounds wasteful and mostly is not: the
 * request is one the server already assembles, and it comes back with every rail
 * computed together rather than eighteen separate queries. What it buys is
 * depth — the shelves ask for twenty because four are visible, and this asks for
 * sixty so a shelf opens as the length it really is.
 *
 * Ported from ui/screens/library/PlaylistScreen.kt.
 */
export function ShelfScreen({
  shelfKey,
  title,
  onBack,
  onOpenPlayer,
}: {
  shelfKey: string;
  title: string;
  onBack: () => void;
  onOpenPlayer: (titleId: string) => void;
}) {
  const repository = useRepository();
  const profileId = useActiveProfileId();
  const [state, setState] = useState<UiState<MusicRail>>(Loading);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      setState(Loading);
      const next = await loadState(
        async () => {
          const home = await repository.musicHome(PLAYLIST_LIMIT);
          return (
            home.rails.find((rail) => rail.key === shelfKey) ?? {
              key: shelfKey,
              title,
              tracks: [],
            }
          );
        },
        {
          emptyWhen: (rail) => rail.tracks.length === 0,
          emptyMessage:
            'This shelf is empty now. The server rebuilds these from the files on the disk, ' +
            'so one can disappear when the music behind it does.',
        },
      );
      if (alive.current) setState(next);
    })();
  }, [repository, shelfKey, title, profileId]);

  const tracks = state.type === 'LOADED' ? state.data.tracks : [];

  const gate = usePlayGate();

  // Gated like a film: a track needs a stream and a stream needs a token, so
  // without one the queue starts, says it is playing, and makes no sound.
  const play = useCallback(
    (index: number) =>
      gate.requireAccount(tracks[index]?.name, () =>
        playMusicFrom(tracks, index, onOpenPlayer),
      ),
    [tracks, onOpenPlayer, gate],
  );

  /**
   * Shuffled once, into a real order, rather than played at random each time.
   *
   * The queue has to know what follows, and "whatever is next after this one" is
   * only answerable if the order exists — a shuffle that picks again at every
   * track end can repeat one and skip another forever.
   */
  const shuffle = useCallback(() => {
    gate.requireAccount(null, () => {
      const shuffled = [...tracks];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      playMusicFrom(shuffled, 0, onOpenPlayer);
    });
  }, [tracks, onOpenPlayer, gate]);

  return (
    <View style={{ flex: 1, backgroundColor: Ink }}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.back}
        >
          <ChevronGlyph rotation={180} color={OnInk} size={18} />
        </Pressable>
      </View>

      <UiStateError state={state} />

      {(state.type === 'LOADED' || state.type === 'LOADING') && (
        <FlatList
          data={tracks}
          keyExtractor={(track) => track.id}
          contentContainerStyle={{ paddingBottom: 28 }}
          ListHeaderComponent={
            <ShelfHead
              shelfKey={shelfKey}
              title={title}
              tracks={tracks}
              onPlay={() => play(0)}
              onShuffle={shuffle}
            />
          }
          renderItem={({ item, index }) => (
            <TrackRow track={item} number={index + 1} onPress={() => play(index)} />
          )}
        />
      )}
      {gate.sheet}
    </View>
  );
}

function ShelfHead({
  shelfKey,
  title,
  tracks,
  onPlay,
  onShuffle,
}: {
  shelfKey: string;
  title: string;
  tracks: Title[];
  onPlay: () => void;
  onShuffle: () => void;
}) {
  const kicker = railKicker(shelfKey);
  const total = tracks.reduce((sum, track) => sum + effectiveDurationSeconds(track), 0);

  return (
    <View style={{ paddingHorizontal: Space.Screen, paddingBottom: 18 }}>
      {/*
       * Four sleeves rather than one. "Feeling Energetic" is a question the
       * server asked of the tempo of eighty files, not a record anybody pressed,
       * and borrowing the first track's art would claim one song stood for the
       * set.
       */}
      <View style={styles.cover}>
        {[0, 1, 2, 3].map((slot) => (
          <CoverQuarter key={slot} track={tracks[slot]} />
        ))}
      </View>

      {kicker != null && (
        <DataLabel text={kicker} technical={false} color={OnInkFaint} style={{ marginTop: 20 }} />
      )}
      <Text style={[TowerType.titleScreen, { color: OnInk, marginTop: 4 }]} numberOfLines={2}>
        {title}
      </Text>
      <DataMeta
        text={`${tracks.length} ${tracks.length === 1 ? 'TRACK' : 'TRACKS'} · ${runningTime(total)}`}
        color={OnInkFaint}
        technical={false}
        style={{ marginTop: 6 }}
      />

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Play"
          onPress={onPlay}
          style={({ pressed }) => [styles.play, { opacity: pressed ? 0.85 : 1 }]}
        >
          <PlayGlyph color={AmberInk} size={13} />
          <Text style={[TowerType.buttonLabel, { color: AmberInk }]}>Play</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Shuffle"
          onPress={onShuffle}
          style={({ pressed }) => [styles.shuffle, { opacity: pressed ? 0.7 : 1 }]}
        >
          <ShuffleGlyph color={OnInk} size={15} />
          <Text style={[TowerType.buttonLabel, { color: OnInk }]}>Shuffle</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CoverQuarter({ track }: { track?: Title }) {
  const [from, to] = gradientFor(track?.name ?? 'shelf');
  return (
    <View style={styles.quarter}>
      <LinearGradient
        colors={[from, to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.33, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {track?.posterUrl != null && (
        <Image
          source={artSource(track.posterUrl)}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      )}
    </View>
  );
}

function TrackRow({
  track,
  number,
  onPress,
}: {
  track: Title;
  number: number;
  onPress: () => void;
}) {
  const seconds = effectiveDurationSeconds(track);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${track.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <DataMeta text={String(number).padStart(2, '0')} color={OnInkFaint} style={{ width: 26 }} />
      <View style={{ flex: 1 }}>
        <Text style={[TowerType.titleRow, { color: OnInk }]} numberOfLines={1}>
          {track.name}
        </Text>
        {track.artist != null && (
          <Text
            style={[TowerType.bodyNote, { color: OnInkMuted, marginTop: 2 }]}
            numberOfLines={1}
          >
            {track.artist}
          </Text>
        )}
      </View>
      {seconds > 0 && <DataMeta text={trackLength(seconds)} color={OnInkFaint} />}
    </Pressable>
  );
}

/** `4H 12M`, or `38M` for anything under the hour. */
function runningTime(seconds: number): string {
  const total = Math.round(seconds / 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0 ? `${hours}H ${minutes}M` : `${minutes}M`;
}

/** `4:07`, the way a track length is always written. */
function trackLength(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cover: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 168,
    height: 168,
    borderRadius: Radius.Thumb,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Hairline,
  },
  quarter: {
    width: '50%',
    height: '50%',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  play: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.Pill,
    backgroundColor: Amber,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  shuffle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.Pill,
    borderWidth: 1,
    borderColor: withAlpha(OnInk, 0.18),
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Space.Screen,
    paddingVertical: 11,
  },
});
