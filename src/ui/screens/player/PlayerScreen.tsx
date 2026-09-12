import { useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  GestureResponderEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ensureBrightnessPermission, useScreenControls } from '@/player/screenControls';

import {
  Amber,
  DirectPlay,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  SheetSurface,
  Space,
  TowerType,
} from '@/theme';
import { Title, audioShortLabel, subtitleDisplayName } from '@/domain/model/media';
import { formatClock, formatRemaining } from '@/domain/model/people';
import { playerStartSeconds } from '@/domain/model/player';
import { withAlpha } from '@/ui/color';
import {
  BrightnessGlyph,
  CastGlyph,
  ChevronGlyph,
  CommentGlyph,
  MoonGlyph,
  PauseGlyph,
  PlayGlyph,
  RotateGlyph,
  SkipGlyph,
  VolumeGlyph,
} from '@/ui/components/Glyphs';
import { DataLabel, StatePill } from '@/ui/components/Primitives';
import { Scrubber } from '@/ui/components/Scrubber';
import { ThumbnailPreview } from '@/ui/components/ThumbnailPreview';
import { CommentsOverlay } from '@/ui/comments/CommentsSheet';
import { useComments } from '@/ui/comments/useComments';
import { PlayerSheet, QualityOptions, usePlayer } from '@/ui/screens/player/usePlayer';

/**
 * A warm, low veil for night viewing.
 *
 * Amber rather than plain black: what keeps people awake is blue light, so the
 * filter takes that out. Dimming alone is a separate concern.
 */
const NIGHT_VEIL = '#FF8A1E33';

/** Where brightness starts before the user has touched it. */
const INITIAL_BRIGHTNESS = 0.6;

/** How long the read-out stays after the finger lifts. */
const HUD_LINGER_MS = 700;

/**
 * The player.
 *
 * Controls auto-hide after a few seconds and come back on a tap anywhere. While
 * the user is dragging the scrubber they stay put.
 *
 * Ported from ui/screens/player/PlayerScreen.kt.
 */
export function PlayerScreen({
  titleId,
  partyCode = null,
  onCollapse,
}: {
  titleId: string;
  partyCode?: string | null;
  onCollapse: () => void;
}) {
  const p = usePlayer(titleId, partyCode);
  const comments = useComments(titleId);
  const content = p.content.type === 'LOADED' ? p.content.data : null;

  /**
   * `playerStartSeconds`, not `startSeconds`: a transcode already begins at that
   * offset, so seeking to it inside the stream applies it twice.
   */
  const source = p.source;
  const player = useVideoPlayer(
    source ? { uri: source.url, headers: source.headers } : null,
    (instance) => {
      instance.timeUpdateEventInterval = 0.5;
      if (source) instance.currentTime = playerStartSeconds(source);
      // Autoplay is right for someone watching alone and wrong for a follower:
      // starting from their own resume position means the very first thing the
      // party clock has to do is drag them back, which reads as the film
      // stuttering the moment it opens.
      if (partyCode == null) instance.play();
    },
  );

  const [buffering, setBuffering] = useState(false);

  const screen = useScreenControls();
  const { width, height } = useWindowDimensions();

  /*
   * What a swipe is currently adjusting, and how far.
   *
   * Held here rather than in the hook: it is a property of a finger on the
   * glass, gone the moment the finger lifts, and routing it through state the
   * player shares with a rotation would make it survive things it should not.
   */
  const [adjusting, setAdjusting] = useState<{
    kind: 'BRIGHTNESS' | 'VOLUME';
    level: number;
  } | null>(null);
  const brightness = useRef(INITIAL_BRIGHTNESS);
  const volume = useRef(1);
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Asked for when the player opens, not at launch: this is the only screen that
  // wants it, and a prompt before the user has tried to dim anything is the kind
  // that gets denied out of hand.
  useEffect(() => {
    void ensureBrightnessPermission();
  }, []);

  // Applies the orientation the button asks for. Without this the rotate button
  // flipped a piece of state and nothing else — it looked broken because it was.
  useEffect(() => {
    screen.setOrientation(p.orientation);
  }, [p.orientation, screen]);

  /** Dismiss the read-out shortly after the finger lifts. */
  const showHud = useCallback((kind: 'BRIGHTNESS' | 'VOLUME', level: number) => {
    setAdjusting({ kind, level });
    if (hudTimer.current) clearTimeout(hudTimer.current);
    hudTimer.current = setTimeout(() => setAdjusting(null), HUD_LINGER_MS);
  }, []);

  const pan = useRef(
    PanResponder.create({
      // Only a deliberate vertical drag. Claiming every touch would swallow the
      // tap that shows the controls, and a horizontal one belongs to the scrubber.
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (e: GestureResponderEvent, g) => {
        // Left half dims, right half quietens — the arrangement every video
        // player has used for a decade, so nobody has to be taught it.
        const onLeft = e.nativeEvent.pageX < width / 2;
        // A full sweep of the screen is a full sweep of the range, so a small
        // adjustment stays small on a tall phone.
        const delta = -g.dy / height;
        if (onLeft) {
          brightness.current = Math.min(1, Math.max(0.02, brightness.current + delta));
          screen.setBrightness(brightness.current);
          showHud('BRIGHTNESS', brightness.current);
        } else {
          volume.current = Math.min(1, Math.max(0, volume.current + delta));
          // The *player's* volume, not the system's: iOS gives no API for the
          // ringer, and changing a device-wide setting from inside a film would
          // be the wrong thing to do even if it did.
          player.volume = volume.current;
          showHud('VOLUME', volume.current);
        }
        // Reset the travel each frame so the deltas accumulate rather than each
        // one measuring from where the finger first landed.
        g.dy = 0;
      },
    }),
  ).current;

  useEffect(() => {
    return () => {
      if (hudTimer.current) clearTimeout(hudTimer.current);
    };
  }, []);

  // The player owns the clock; the hook mirrors it so the scrubber, timecodes
  // and progress reporting all read from one source of truth.
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    p.onPlayerProgress(currentTime, player.duration ?? 0, player.playing);
  });

  useEventListener(player, 'statusChange', ({ status }) => {
    setBuffering(status === 'loading');
  });

  // Play/pause is expressed as intent in the hook and applied to the player
  // here, so the controls stay platform-agnostic.
  useEffect(() => {
    if (p.playing) player.play();
    else player.pause();
  }, [p.playing, player]);

  useEffect(() => {
    player.playbackRate = p.speed;
  }, [p.speed, player]);

  // Keyed on the request id, not the position: two seeks to the same
  // millisecond are two seeks, and the second must still happen.
  const lastSeekId = useRef(0);
  useEffect(() => {
    const request = p.seekRequest;
    if (request && request.id !== lastSeekId.current) {
      lastSeekId.current = request.id;
      player.currentTime = request.positionSeconds;
    }
  }, [p.seekRequest, player]);

  return (
    <View style={styles.root}>
      <Pressable
        {...pan.panHandlers}
        style={StyleSheet.absoluteFill}
        onPress={p.toggleControls}
        accessible={false}
      >
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
        />
      </Pressable>

      {p.nightMode && <View pointerEvents="none" style={styles.nightVeil} />}

      {p.content.type === 'LOADING' && <PlayerMessage heading="Opening…" />}
      {p.content.type === 'ASLEEP' && (
        <PlayerMessage
          heading="The disk is asleep"
          body="Tower has to spin up before this can play. Go back and wake it."
        />
      )}
      {p.content.type === 'OFFLINE' && (
        <PlayerMessage heading="Cannot reach Tower" body={p.content.message} />
      )}
      {p.content.type === 'EMPTY' && (
        <PlayerMessage heading="Not on the disk" body={p.content.message} />
      )}
      {p.sourceError != null && (
        <PlayerMessage heading="This will not play" body={p.sourceError} />
      )}

      {/*
       * Above the controls, because it is the answer to something the finger is
       * doing right now. Centred rather than beside the finger: a panel that
       * tracks the thumb is covered by the hand adjusting it, which is the one
       * place it cannot be read.
       */}
      {adjusting != null && <AdjustmentReadout kind={adjusting.kind} level={adjusting.level} />}

      {p.controlsVisible && content != null && (
        <Controls
          player={p}
          title={content.title}
          buffering={buffering}
          onCollapse={onCollapse}
          onOpenComments={comments.open}
        />
      )}

      {/*
       * Over the controls: it is a choice about the film, and the transport
       * underneath should not be reachable while it is open.
       */}
      {p.sheet != null && <PlayerOptionSheet player={p} title={content?.title} />}

      {comments.state.open && <CommentsOverlay controller={comments} />}
    </View>
  );
}

type PlayerApi = ReturnType<typeof usePlayer>;

/**
 * Overlaid rather than stacked in a column.
 *
 * As a column the transport row centred in the space *left over* between the top
 * bar and the bottom controls — and since the bottom controls are much taller,
 * the play button sat above the true centre and jumped whenever the scrub
 * preview appeared. Absolute positioning puts it at the centre of the picture
 * and keeps it still.
 */
function Controls({
  player,
  title,
  buffering,
  onCollapse,
  onOpenComments,
}: {
  player: PlayerApi;
  title: Title;
  buffering: boolean;
  onCollapse: () => void;
  onOpenComments: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={styles.controls}>
      <View pointerEvents="box-none" style={{ paddingTop: insets.top }}>
        <TopBar
          player={player}
          title={title}
          onCollapse={onCollapse}
          onOpenComments={onOpenComments}
        />
      </View>

      <View
        pointerEvents="box-none"
        style={[styles.transport, { opacity: player.party?.isHost === false ? 0.35 : 1 }]}
      >
        <TransportButton label="Back ten seconds" onPress={() => player.skip(-10)}>
          <SkipGlyph forward={false} color={OnInk} size={22} />
        </TransportButton>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={player.playing ? 'Pause' : 'Play'}
          onPress={player.togglePlayPause}
          style={styles.playButton}
        >
          {/*
           * A seek always buffers, and on a tunnelled connection that can take a
           * second or two. Showing the spinner in place of the glyph is what
           * makes "it is loading" visible rather than looking like a dead button.
           */}
          {buffering ? (
            <ActivityIndicator color={Amber} />
          ) : player.playing ? (
            <PauseGlyph color="#FFFFFF" size={26} />
          ) : (
            <PlayGlyph color="#FFFFFF" size={26} />
          )}
        </Pressable>

        <TransportButton label="Forward ten seconds" onPress={() => player.skip(10)}>
          <SkipGlyph forward color={OnInk} size={22} />
        </TransportButton>
      </View>

      <View pointerEvents="box-none" style={{ paddingBottom: insets.bottom }}>
        <BottomControls player={player} title={title} />
      </View>
    </View>
  );
}

function TopBar({
  player,
  title,
  onCollapse,
  onOpenComments,
}: {
  player: PlayerApi;
  title: Title;
  onCollapse: () => void;
  onOpenComments: () => void;
}) {
  const landscape = player.orientation === 'LANDSCAPE';
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TransportButton label="Collapse the player" onPress={onCollapse} size={40}>
          <ChevronGlyph rotation={90} color={OnInk} size={18} />
        </TransportButton>
        <View style={{ flex: 1, paddingHorizontal: 12 }}>
          <Text
            style={[TowerType.titleRow, { color: '#FFFFFF' }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title.name}
          </Text>
          <DataLabel text="TOWER · LAN" style={{ marginTop: 3 }} />
        </View>
        {/*
         * Before night view and rotation: it is the only one of the three that
         * is about the film rather than about the screen.
         */}
        <TransportButton label="Comments" onPress={onOpenComments} size={40}>
          <CommentGlyph color={OnInk} size={18} />
        </TransportButton>
        <TransportButton
          label={player.nightMode ? 'Night view, on' : 'Night view'}
          onPress={player.toggleNightMode}
          size={40}
        >
          <MoonGlyph color={player.nightMode ? Amber : OnInk} size={18} />
        </TransportButton>
        <TransportButton
          label={landscape ? 'Rotation locked to landscape' : 'Lock to landscape'}
          onPress={player.toggleOrientation}
          size={40}
        >
          <RotateGlyph color={landscape ? Amber : OnInk} size={18} />
        </TransportButton>
        <TransportButton label="Cast to a TV" onPress={() => {}} size={40}>
          <CastGlyph color={OnInk} size={18} />
        </TransportButton>
      </View>

      {player.party != null && (
        <StatePill
          text={
            player.party.note ??
            (player.party.isHost
              ? `You are hosting · ${player.party.code}`
              : `Watching together · ${player.party.code}`)
          }
          tint={player.party.connected ? Amber : OnInkFaint}
          technical={false}
          style={{ marginTop: 12, alignSelf: 'flex-start' }}
        />
      )}

      {player.planPillText != null && (
        <StatePill
          text={player.planPillText}
          tint={player.plan.type === 'TRANSCODE' ? Amber : DirectPlay}
          style={{ marginTop: 12, alignSelf: 'flex-start' }}
        />
      )}
    </View>
  );
}

function BottomControls({ player, title }: { player: PlayerApi; title: Title }) {
  const subtitles = title.subtitles;
  const audio = title.audioTracks;
  const shown = player.scrubbing ? player.scrubPreviewSeconds : player.positionSeconds;

  const subtitleLabel =
    player.subtitleTrack != null
      ? (subtitles.find((s) => s.index === player.subtitleTrack)
          ? subtitleDisplayName(subtitles.find((s) => s.index === player.subtitleTrack)!)
          : 'Subtitles')
      : 'Subtitles off';

  const audioLabel =
    player.audioTrack != null && audio.find((a) => a.index === player.audioTrack)
      ? audioShortLabel(audio.find((a) => a.index === player.audioTrack)!)
      : 'Audio';

  const qualityLabel =
    QualityOptions.find((q) => q.height === player.maxHeight)?.label.split(' · ')[0] ??
    'Quality';

  return (
    <View style={{ paddingHorizontal: Space.Screen, paddingVertical: 18 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {/*
         * The chip says what is on, not what it opens — a row of nouns makes you
         * open each one to find out what it is set to.
         */}
        <QuickChip label={subtitleLabel} onPress={() => player.setSheet('SUBTITLES')} />
        <QuickChip label={audioLabel} onPress={() => player.setSheet('AUDIO')} />
        <QuickChip label={qualityLabel} onPress={() => player.setSheet('QUALITY')} />
      </View>

      {/* The preview floats above the thumb rather than replacing the frame. */}
      {player.scrubbing && (
        <View style={{ width: '100%', alignItems: 'center', paddingTop: 16 }}>
          <ThumbnailPreview
            positionSeconds={player.scrubPreviewSeconds}
            trickplay={player.content.type === 'LOADED' ? player.content.data.trickplay : null}
            seedForArt={title.name}
            isLocal={player.plan.type === 'DIRECT_PLAY'}
          />
        </View>
      )}

      <Scrubber
        positionSeconds={player.positionSeconds}
        durationSeconds={player.durationSeconds}
        chapters={player.content.type === 'LOADED' ? player.content.data.chapters : []}
        onSeek={player.seekTo}
        onScrubPreview={player.onScrubPreview}
        onScrubbingChange={player.onScrubbingChange}
        style={{ marginTop: 6 }}
      />

      <View style={styles.timecodes}>
        <Text style={[TowerType.dataTimecode, { color: OnInkMuted }]}>{formatClock(shown)}</Text>
        <Text style={[TowerType.dataTimecode, { color: OnInkMuted }]}>
          {formatRemaining(shown, player.durationSeconds)}
        </Text>
      </View>
    </View>
  );
}

function PlayerOptionSheet({ player, title }: { player: PlayerApi; title?: Title }) {
  const sheet: PlayerSheet = player.sheet!;

  const rows: { key: string; label: string; selected: boolean; onPress: () => void }[] = (() => {
    if (sheet === 'SUBTITLES') {
      return [
        {
          key: 'off',
          label: 'Off',
          selected: player.subtitleTrack == null,
          onPress: () => player.setSubtitleTrack(null),
        },
        ...(title?.subtitles ?? []).map((t) => ({
          key: `s-${t.index}`,
          label: subtitleDisplayName(t),
          selected: player.subtitleTrack === t.index,
          onPress: () => player.setSubtitleTrack(t.index),
        })),
      ];
    }
    if (sheet === 'AUDIO') {
      return (title?.audioTracks ?? []).map((t) => ({
        key: `a-${t.index}`,
        label: audioShortLabel(t),
        selected: player.audioTrack === t.index,
        onPress: () => player.setAudioTrack(t.index),
      }));
    }
    return QualityOptions.map((q) => ({
      key: String(q.height ?? 'best'),
      label: q.label,
      selected: player.maxHeight === q.height,
      onPress: () => player.setMaxHeight(q.height),
    }));
  })();

  const heading =
    sheet === 'SUBTITLES' ? 'SUBTITLES' : sheet === 'AUDIO' ? 'AUDIO TRACK' : 'QUALITY';

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        onPress={() => player.setSheet(null)}
        accessible={false}
      />
      <View style={styles.optionSheet}>
        <DataLabel text={heading} />
        <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingTop: 10 }}>
          {rows.length === 0 ? (
            <Text style={[TowerType.bodyProse, { color: OnInkMuted, paddingVertical: 12 }]}>
              This file carries none.
            </Text>
          ) : (
            rows.map((row) => (
              <Pressable
                key={row.key}
                accessibilityRole="button"
                accessibilityState={{ selected: row.selected }}
                onPress={row.onPress}
                style={styles.optionRow}
              >
                <Text
                  style={[
                    TowerType.bodyProse,
                    { color: row.selected ? Amber : OnInk, flex: 1 },
                  ]}
                >
                  {row.label}
                </Text>
                {row.selected && <DataLabel text="ON" color={Amber} technical={false} />}
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function QuickChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quickChip, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={[TowerType.dataLabel, { color: OnInkFaint }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

function TransportButton({
  label,
  onPress,
  size = 54,
  children,
  style,
}: {
  label: string;
  onPress: () => void;
  size?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        { opacity: pressed ? 0.6 : 1 },
        style as never,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** The read-out under the finger: an icon, a bar, a number. */
function AdjustmentReadout({
  kind,
  level,
}: {
  kind: 'BRIGHTNESS' | 'VOLUME';
  level: number;
}) {
  const clamped = Math.min(1, Math.max(0, level));
  return (
    <View pointerEvents="none" style={styles.readoutWrap}>
      <View style={styles.readout}>
        {kind === 'BRIGHTNESS' ? (
          <BrightnessGlyph color={Amber} size={26} />
        ) : (
          <VolumeGlyph color={Amber} size={26} muted={clamped <= 0} />
        )}
        <View style={styles.readoutTrack}>
          <View style={[styles.readoutFill, { width: ((clamped * 100) + "%") as never }]} />
        </View>
        <DataLabel
          text={Math.round(clamped * 100) + "%"}
          color={OnInk}
          technical={false}
          style={{ marginTop: 10 }}
        />
      </View>
    </View>
  );
}

function PlayerMessage({ heading, body }: { heading: string; body?: string }) {
  return (
    <View pointerEvents="none" style={styles.message}>
      <Text style={[TowerType.titleSection, { color: OnInk, textAlign: 'center' }]}>
        {heading}
      </Text>
      {body != null && (
        <Text
          style={[TowerType.bodyProse, { color: OnInkMuted, textAlign: 'center', marginTop: 8 }]}
        >
          {body}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  nightVeil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: NIGHT_VEIL,
  },
  controls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.42)',
    justifyContent: 'space-between',
  },
  transport: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
  },
  playButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timecodes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  quickChip: {
    borderRadius: Radius.Pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  optionSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: SheetSurface,
    borderTopLeftRadius: Radius.Sheet,
    borderTopRightRadius: Radius.Sheet,
    padding: Space.Screen,
    paddingBottom: 34,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },
  readoutWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readout: {
    alignItems: 'center',
    borderRadius: Radius.Card,
    backgroundColor: 'rgba(0,0,0,0.62)',
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  readoutTrack: {
    width: 108,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: 14,
    overflow: 'hidden',
  },
  readoutFill: {
    height: '100%',
    backgroundColor: Amber,
    borderRadius: 2,
  },
  message: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.Screen,
  },
});
