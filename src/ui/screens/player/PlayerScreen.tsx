import { useEventListener } from 'expo';
import { VideoAirPlayButton, VideoView, useVideoPlayer } from 'expo-video';
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
import { matchTrack } from '@/ui/screens/player/trackMatch';
import { withAlpha } from '@/ui/color';
import {
  BrightnessGlyph,
  ChevronGlyph,
  CommentGlyph,
  MoonGlyph,
  PauseGlyph,
  PlayGlyph,
  RotateGlyph,
  SkipGlyph,
  VolumeGlyph,
} from '@/ui/components/Glyphs';
import { AmberButton, DataLabel, DataMeta, StatePill } from '@/ui/components/Primitives';
import { Scrubber } from '@/ui/components/Scrubber';
import { ThumbnailPreview } from '@/ui/components/ThumbnailPreview';
import { CommentsOverlay } from '@/ui/comments/CommentsSheet';
import { MusicPlayerScreen } from '@/ui/screens/player/MusicPlayerScreen';
import { MusicPlayback, nowPlayingAsTitle } from '@/player/musicPlayback';
import { useFlow } from '@/ui/hooks';
import { MusicQueue } from '@/player/musicQueue';
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
  onPlayTrack = () => {},
  onStartParty = () => {},
}: {
  titleId: string;
  partyCode?: string | null;
  onCollapse: () => void;
  /**
   * Replaces this player on the stack rather than stacking a second one.
   *
   * Six songs in, Back should return to the library, not walk back through every
   * track played on the way there.
   */
  onPlayTrack?: (titleId: string) => void;
  /** Outside a party, the icon starts one and hands over to the lobby. */
  onStartParty?: () => void;
}) {
  const p = usePlayer(titleId, partyCode);
  const comments = useComments(titleId);
  const content = p.content.type === 'LOADED' ? p.content.data : null;

  /*
   * What to draw, which is not always what the hook has yet.
   *
   * A song still playing while the server has gone away is a player, not
   * "Cannot reach Tower" — the bytes are already on the device. And expanding
   * the bar arrives here with nothing loaded for a moment, which used to be a
   * full-screen "Opening…" over a song that was already playing.
   */
  const nowPlaying = useFlow(MusicPlayback.nowPlaying);
  const playingThis = nowPlaying?.titleId === titleId ? nowPlaying : null;
  const isMusic = content != null ? content.title.kind === 'MUSIC' : playingThis != null;
  const shown = content?.title ?? (playingThis != null ? nowPlayingAsTitle(playingThis) : null);

  /**
   * `playerStartSeconds`, not `startSeconds`: a transcode already begins at that
   * offset, so seeking to it inside the stream applies it twice.
   */
  const source = p.source;
  const player = useVideoPlayer(
    /*
     * Null for a song, always.
     *
     * The app's player is already holding this stream. Handing the same source
     * to this one as well would open a second connection to the same file and
     * play it a second time, half a second out of step with the first — two
     * copies of the track audible at once.
     */
    source && !isMusic ? { uri: source.url, headers: source.headers } : null,
    (instance) => {
      instance.timeUpdateEventInterval = 0.5;

      /*
       * The film should survive leaving the app.
       *
       * A home server is watched in the kitchen and on a commute, and losing the
       * audio because a message arrived is the kind of thing that makes people
       * stop using an app. The lock-screen controls come with it: without them
       * background audio is worse than none, because there is no way to pause.
       */
      instance.staysActiveInBackground = true;
      instance.showNowPlayingNotification = true;

      /*
       * AirPlay, which is the only casting this app can actually do.
       *
       * The Kotlin's cast button drove a DIAL/mDNS discovery that Expo has no
       * access to, so it was a button that could never work. This is the same
       * intent — put it on the television — served by something that does.
       */
      instance.allowsExternalPlayback = true;
      if (source) instance.currentTime = playerStartSeconds(source);
      // Autoplay is right for someone watching alone and wrong for a follower:
      // starting from their own resume position means the very first thing the
      // party clock has to do is drag them back, which reads as the film
      // stuttering the moment it opens.
      if (partyCode == null) instance.play();
    },
  );

  const [buffering, setBuffering] = useState(false);
  /** What the player refused, as opposed to what the request could not fetch. */
  const [playbackError, setPlaybackError] = useState<string | null>(null);

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
    // Video only. A music title leaves this player empty on purpose, so it never
    // ticks — the block below reports from the app's player instead.
    if (isMusic) return;
    p.onPlayerProgress(currentTime, player.duration ?? 0, player.playing);
  });

  useEventListener(player, 'statusChange', ({ status, error }) => {
    setBuffering(status === 'loading');
    /*
     * The error was being thrown away, which is why a stream that would not
     * play looked like a black rectangle and nothing else. A decode the phone
     * cannot do fails here rather than at the request — the bytes arrive fine,
     * and it is the file inside them the player refuses — so nothing upstream
     * has anything to report.
     */
    setPlaybackError(status === 'error' ? (error?.message ?? 'This file will not play.') : null);
  });

  // Play/pause is expressed as intent in the hook and applied to the player
  // here, so the controls stay platform-agnostic.
  useEffect(() => {
    if (isMusic) return;
    if (p.playing) player.play();
    else player.pause();
  }, [isMusic, p.playing, player]);

  useEffect(() => {
    if (isMusic) return;
    player.playbackRate = p.speed;
  }, [isMusic, p.speed, player]);

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

  /*
   * A song is started on the app's player, not on this screen's.
   *
   * This is the whole of what makes music survive leaving the screen: the
   * instance below belongs to a component and dies with it, where
   * `MusicPlayback` belongs to the process. The screen becomes a view onto
   * something already playing rather than the thing playing it.
   *
   * Keyed on the resolved source, so a transcode that starts at an offset is
   * handed over exactly once rather than on every render.
   */
  useEffect(() => {
    if (!isMusic || content == null || p.source == null) return;
    /*
     * Already the thing playing, so there is nothing to start.
     *
     * This screen is a view onto playback rather than the thing driving it —
     * shelves start music, and the queue continues it. Handing the song over
     * again on every open would be a second player for one track.
     */
    if (MusicPlayback.nowPlaying.get()?.titleId === content.title.id) return;
    MusicPlayback.play(
      {
        titleId: content.title.id,
        name: content.title.name,
        artist: content.title.artist ?? null,
        artworkUrl: content.title.posterUrl ?? null,
        url: p.source.url,
        headers: p.source.headers,
      },
      // Not `startSeconds`: a transcode already begins at that offset, so seeking
      // to it inside the stream would apply it twice.
      playerStartSeconds(p.source),
    );
  }, [isMusic, content, p.source]);

  /*
   * The queue follows the sheet, so what plays on its own is what somebody would
   * have picked by hand. Pushed to the process-scoped queue rather than kept
   * here, because the track after this one has to start with no screen alive.
   */
  useEffect(() => {
    // The whole list, not the sheet's: a queue that cannot find the track it is
    // on cannot say what comes after it.
    if (isMusic) MusicQueue.setTracks(p.musicTracks);
  }, [isMusic, p.musicTracks]);

  /*
   * A film and a song playing at once is two soundtracks, and nothing within one
   * app arbitrates that. Silenced rather than stopped: the bar stays, so going
   * back to what was playing is one tap.
   */
  useEffect(() => {
    if (!isMusic && p.playing) MusicPlayback.pause();
  }, [isMusic, p.playing]);

  /*
   * The party's clock, applied to the player that actually holds the song.
   *
   * Everything above drives this screen's `useVideoPlayer`, and for music that
   * one is deliberately empty — the audio lives in `MusicPlayback` so it can
   * outlive the screen. The clock machinery was therefore running correctly and
   * correcting nothing: a follower's seeks, its rate nudges and its reports all
   * went to a player with no source while the song played on untouched. That is
   * the whole of why a music party never lined up.
   *
   * Only inside a party. Outside one the bar and this screen drive the app's
   * player directly, and a second writer for the same intent would fight them.
   */
  const inParty = isMusic && p.party != null;
  const musicProgress = useFlow(MusicPlayback.progress);
  const musicPlaying = useFlow(MusicPlayback.playing);

  useEffect(() => {
    if (!inParty) return;
    // What this device tells the party about where it is.
    p.onPlayerProgress(
      musicProgress.positionSeconds,
      musicProgress.durationSeconds,
      musicPlaying,
    );
  }, [inParty, musicProgress, musicPlaying, p]);

  useEffect(() => {
    if (!inParty) return;
    MusicPlayback.setPlaying(p.playing);
  }, [inParty, p.playing]);

  useEffect(() => {
    if (!inParty) return;
    MusicPlayback.setRate(p.speed);
  }, [inParty, p.speed]);

  useEffect(() => {
    if (!inParty) return;
    const request = p.seekRequest;
    if (request != null) MusicPlayback.seekTo(request.positionSeconds);
  }, [inParty, p.seekRequest]);

  /**
   * Sound but no picture, which is its own failure and shows nothing today.
   *
   * A video codec this phone cannot decode does not raise an error. The item
   * loads, the audio plays, and the picture is simply absent — AVFoundation
   * reports a ready item with no video track rather than refusing it. Ten-bit
   * H.264 is the common case, and anime releases are full of it.
   *
   * Read once the item is ready: before that a missing track means "not loaded
   * yet" rather than "cannot be played", and reacting early would accuse every
   * film of it during its first second.
   */
  const videoMissing =
    !isMusic &&
    !buffering &&
    playbackError == null &&
    content != null &&
    player.status === 'readyToPlay' &&
    player.videoTrack == null;

  /*
   * No picture, so stop asking for that codec and ask again.
   *
   * Automatic rather than a button. How a stream is tagged inside its container
   * is not something anybody should have to know about, and a control reading
   * "Convert it" asks them to diagnose a codec before they can watch a film.
   *
   * Once per codec: `refuseVideoCodec` returns false for one already withdrawn,
   * which is what stops a file the server cannot fix from re-requesting forever.
   */
  const [converting, setConverting] = useState(false);
  useEffect(() => {
    if (!videoMissing || content == null) return;
    const codec = content.title.file.videoCodec;
    if (codec == null) return;
    setConverting(p.refuseVideoCodec(codec));
  }, [videoMissing, content, p]);

  /*
   * The chosen language, applied to the stream this device is holding.
   *
   * Only for a direct play: a transcode carries one track and the hook asks for
   * a new stream instead. Re-applied when the available tracks arrive as well as
   * when the choice changes, because a player that has not finished loading has
   * no tracks to be pointed at yet.
   */
  const chosenAudio = p.audioTrack;
  const availableAudio = player.availableAudioTracks;
  useEffect(() => {
    if (isMusic) return;
    if (p.source?.plan.type === 'TRANSCODE') return;
    if (availableAudio.length === 0) return;

    if (chosenAudio == null) {
      // Back to whatever the file itself calls default.
      player.audioTrack = availableAudio.find((track) => track.isDefault) ?? availableAudio[0];
      return;
    }

    const wanted = content?.title.audioTracks.find((track) => track.index === chosenAudio);
    const track = matchTrack(availableAudio, wanted?.language, chosenAudio);
    if (track != null) player.audioTrack = track;
  }, [isMusic, chosenAudio, availableAudio, content, p.source, player]);

  /*
   * The chosen subtitles, applied the same way and for the same reasons.
   *
   * Burned-in subtitles are the server's business on a transcode; a direct play
   * carries the tracks and the player can be pointed at one. Null means off,
   * which is a real choice rather than an absent one — so it is applied rather
   * than skipped.
   */
  const chosenSubtitle = p.subtitleTrack;
  const availableSubtitles = player.availableSubtitleTracks;
  useEffect(() => {
    if (isMusic) return;
    if (p.source?.plan.type === 'TRANSCODE') return;

    if (chosenSubtitle == null) {
      player.subtitleTrack = null;
      return;
    }
    if (availableSubtitles.length === 0) return;

    const wanted = content?.title.subtitles.find((track) => track.index === chosenSubtitle);
    const track = matchTrack(availableSubtitles, wanted?.language, chosenSubtitle);
    if (track != null) player.subtitleTrack = track;
  }, [isMusic, chosenSubtitle, availableSubtitles, content, p.source, player]);

  /*
   * The host moved the party onto another track, so this device follows.
   *
   * Performed here rather than in the hook, which holds no navigator: it
   * records where the party went and this opens it, carrying the code so the
   * next screen is in the same party rather than a new nothing.
   */
  useEffect(() => {
    if (p.partyMovedTo == null) return;
    const next = p.partyMovedTo;
    p.clearPartyMoved();
    onPlayTrack(next);
  }, [p.partyMovedTo, p, onPlayTrack]);

  /*
   * A file with no picture in it gets a different screen.
   *
   * Same route, same player, same playback decision — the only thing that
   * differs is what a person looks at while it plays, and a black rectangle with
   * a brightness slider over it is not that for an MP3.
   */
  if (isMusic && shown != null) {
    return (
      <View style={styles.root}>
        <MusicPlayerScreen
          track={shown}
          player={p}
          upNext={p.upNext}
          queueOpen={p.queueOpen}
          onOpenQueue={p.setQueueOpen}
          onPlayTrack={onPlayTrack}
          onToggleLike={p.toggleLike}
          party={p.party}
          partyJoining={partyCode != null && p.party == null}
          chatOpen={p.chatOpen}
          inParty={inParty}
          onOpenChat={p.openChat}
          onOpenMembers={p.setMembersOpen}
          onEndParty={p.endParty}
          onSendChat={p.sendChat}
          onStartParty={onStartParty}
          onCollapse={onCollapse}
          onOpenComments={comments.open}
        />
        {comments.state.open && <CommentsOverlay controller={comments} />}
      </View>
    );
  }

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
          // Keeps the picture in a corner when the app goes to the background,
          // rather than only the sound.
          allowsPictureInPicture
          startsPictureInPictureAutomatically
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
       * Sound with no picture, which the player does not call an error: the
       * item is ready, the audio runs, and the video track is simply absent.
       *
       * The plan is shown beside the file because the two together are the
       * whole diagnosis — a direct play means the server sent it untouched,
       * and a transcode that still has no picture means it rewrapped the
       * container and copied the video rather than encoding it.
       */}
      {videoMissing && content != null && (
        <PlayerMessage
          heading={converting ? 'Converting the picture' : 'Sound but no picture'}
          body={
            converting
              ? 'This phone could not show the video as it was sent, so Tower is converting ' +
                'it. Playback carries on from where you were.'
              : 'This phone cannot show the video in this file, and asking Tower to convert ' +
                'it did not help. The file may need re-encoding on the server.'
          }
          detail={[p.planPillText, fileLine(content.title)]
            .filter((part) => part != null && part !== '')
            .join('  —  ')}
          /*
           * What this device can actually see, which is the only thing that
           * settles it.
           *
           * Four guesses have been made about this file from its codec name
           * alone and all four were wrong, so the player reports its own state
           * instead: whether it found a video track, how many it was offered,
           * and what kind of stream it thinks it is reading. The last one
           * matters because an extensionless URL is treated as a progressive
           * download, and a server sending HLS at such a URL would look exactly
           * like this — sound, no picture, no error.
           *
           * The query string is dropped: it carries the session token.
           */
          diagnostic={[
            `TRACKS ${player.availableVideoTracks.length}`,
            `STATUS ${player.status.toUpperCase()}`,
            sourceKind(p.source?.url),
            p.refusedVideoCodecs.length > 0
              ? `REFUSED ${p.refusedVideoCodecs.join(',').toUpperCase()}`
              : null,
          ]
            .filter((part): part is string => part != null)
            .join(' · ')}
        />
      )}

      {p.sourceError == null && playbackError != null && (
        <PlayerMessage
          heading="This will not play here"
          body={playbackError}
          /*
           * What is actually in the file, beside the refusal.
           *
           * Almost every failure at this point is a codec this phone cannot
           * decode, and the container and codecs are the one line that says
           * which. Shown even with technical badges off: the switch is about
           * not cluttering a working screen with measurements, and this screen
           * is not working — here the measurement is the answer.
           */
          detail={content != null ? fileLine(content.title) : null}
        />
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
        {/*
         * Apple's own picker rather than a button of ours: it is the only thing
         * allowed to list AirPlay targets, and a custom sheet could not.
         */}
        <View style={styles.airplay}>
          <VideoAirPlayButton tint={OnInk} activeTint={Amber} />
        </View>
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

/** `MKV · HEVC · EAC3 · 5.1` — what the file is, for when it will not play. */
function fileLine(title: Title): string | null {
  const file = title.file;
  const parts = [
    file.container?.toUpperCase(),
    file.videoCodec?.toUpperCase(),
    file.audioCodecs?.toUpperCase(),
    file.audioChannels != null ? `${file.audioChannels}CH` : null,
  ].filter((part): part is string => part != null && part !== '');
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * The last path segment and nothing else, so a stream can be told apart.
 *
 * `.m3u8` is a playlist and anything without an extension is read as a plain
 * download, which is the distinction that decides whether this player will find
 * a video track at all. The query is dropped because it carries the token.
 */
function sourceKind(url: string | null | undefined): string | null {
  if (url == null || url === '') return null;
  const path = url.split('?')[0];
  const last = path.slice(path.lastIndexOf('/') + 1);
  return last === '' ? null : `SOURCE ${last.toUpperCase()}`;
}

function PlayerMessage({
  heading,
  body,
  detail,
  diagnostic,
  action,
}: {
  heading: string;
  body?: string;
  detail?: string | null;
  diagnostic?: string | null;
  action?: { label: string; onPress: () => void };
}) {
  return (
    // Only when there is something to press. The rest of these are statements,
    // and a transparent view over the picture that swallowed taps would stop the
    // controls working underneath them.
    <View pointerEvents={action == null ? 'none' : 'box-none'} style={styles.message}>
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
      {detail != null && detail !== '' && (
        <DataMeta
          text={detail}
          color={OnInkFaint}
          technical={false}
          style={{ marginTop: 12 }}
        />
      )}
      {diagnostic != null && diagnostic !== '' && (
        <DataMeta
          text={diagnostic}
          color={OnInkFaint}
          technical={false}
          maxLines={2}
          style={{ marginTop: 6 }}
        />
      )}
      {action != null && (
        <AmberButton
          label={action.label}
          onPress={action.onPress}
          style={{ marginTop: 20 }}
        />
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
  airplay: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
