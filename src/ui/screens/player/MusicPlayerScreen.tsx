import Animated from 'react-native-reanimated';
import { useKeyboardPanel } from '@/ui/keyboardPanel';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  Amber,
  AmberInk,
  Ink,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  Space,
  Surface1,
  TowerType,
} from '@/theme';
import { gradientFor, withAlpha } from '@/ui/color';
import { Title, effectiveDurationSeconds } from '@/domain/model/media';
import { formatClock } from '@/domain/model/people';
import { artSource } from '@/ui/imageSource';
import {
  ChevronGlyph,
  CommentGlyph,
  EyeGlyph,
  HeartGlyph,
  TogetherGlyph,
  PauseGlyph,
  PlayGlyph,
  QueueGlyph,
  SkipGlyph,
} from '@/ui/components/Glyphs';
import {
  DataLabel,
  DataMeta,
  HairlineDivider,
  OutlineButton,
  StatusDot,
} from '@/ui/components/Primitives';
import { Scrubber } from '@/ui/components/Scrubber';
import { MusicPlayback } from '@/player/musicPlayback';
import { MusicQueue } from '@/player/musicQueue';
import { PartyMessage } from '@/domain/model/watchParty';
import { PartyPlayback } from '@/ui/screens/player/usePlayer';
import { PartyEye, PartyMembersSheet } from '@/ui/components/PartyMembers';
import { useFlow } from '@/ui/hooks';

/** What a player driving this screen has to provide. */
type PlayerApi = {
  positionSeconds: number;
  durationSeconds: number;
  playing: boolean;
  scrubbing: boolean;
  scrubPreviewSeconds: number;
  togglePlayPause: () => void;
  skip: (seconds: number) => void;
  seekTo: (seconds: number) => void;
  onScrubbingChange: (scrubbing: boolean) => void;
  onScrubPreview: (seconds: number) => void;
  /**
   * The three the party needs, which this screen used to do without.
   *
   * It was deliberately a narrow view of the hook — this screen touches far less
   * of it than the film player does — but narrow to the point of cutting out
   * everything about the party, which is why a music party shared no clock in
   * either direction.
   */
  onPlayerProgress: (position: number, duration: number, playing: boolean) => void;
  party: PartyPlayback | null;
  seekRequest: { id: number; positionSeconds: number } | null;
};

/**
 * The player for a file with no picture in it.
 *
 * Playing an MP3 through the film player gives a black rectangle where the video
 * should be, a brightness slider that does nothing, and a rotate button for
 * content that has no orientation. Same bytes, same decoder, entirely the wrong
 * screen — so this is a different one over the same player, and nothing about
 * how playback works changes.
 *
 * What replaces the picture is the sleeve. It is the only image a music file
 * has, so it is given the room a film gives its video: a large square, centred,
 * with the same artwork blown up behind it as an ambient wash. Where there is no
 * sleeve — the common case for a loose MP3 — the poster gradient stands in,
 * which is the same answer the grids and rails already give and is a design
 * rather than a missing image.
 *
 * Controls stay on screen permanently. A film hides them because they sit over
 * the thing you are watching; here there is nothing to cover, and a player that
 * makes somebody tap once to find the pause button is worse for being
 * consistent.
 *
 * Ported from ui/screens/player/MusicPlayerScreen.kt.
 */
export function MusicPlayerScreen({
  track,
  player,
  upNext,
  queueOpen,
  onOpenQueue,
  onPlayTrack,
  onToggleLike,
  party,
  partyJoining,
  inParty,
  chatOpen,
  onOpenChat,
  onOpenMembers,
  onEndParty,
  onSendChat,
  onStartParty,
  onCollapse,
  onOpenComments,
}: {
  track: Title;
  player: PlayerApi;
  upNext: Title[];
  queueOpen: boolean;
  onOpenQueue: (open: boolean) => void;
  onPlayTrack: (titleId: string) => void;
  onToggleLike: () => void;
  /** Null when listening alone, which is what the icon says at a glance. */
  party: PartyPlayback | null;
  /**
   * A party was asked for and has not answered yet.
   *
   * Shown rather than hidden. A host who opened the player through a party and
   * sees no sign of one cannot tell whether it is still connecting or never
   * happened, and the difference is the whole of what they want to know.
   */
  partyJoining: boolean;
  /** In a party the transport goes through the party, which knows who may drive. */
  inParty: boolean;
  chatOpen: boolean;
  onOpenChat: (open: boolean) => void;
  onOpenMembers: (open: boolean) => void;
  onEndParty: () => void;
  onSendChat: (text: string) => void;
  onStartParty: () => void;
  onCollapse: () => void;
  onOpenComments: () => void;
}) {
  /*
   * Read from the app's player rather than the screen's state.
   *
   * The song was already playing before this screen opened and will still be
   * playing after it closes, so this is a view onto it — one state seen twice,
   * not two players kept in step.
   */
  const playing = useFlow(MusicPlayback.playing);
  const unavailable = useFlow(MusicPlayback.unavailable);
  const progress = useFlow(MusicPlayback.progress);
  const hasNext = useFlow(MusicQueue.hasNext);

  /*
   * Tell the hook what the music is doing.
   *
   * Without this the party never hears about music at all. A host announces
   * `playing` and `positionSeconds` out of the hook's own state, and for a song
   * nothing was writing them — so a host happily playing reported *paused at
   * zero*, every few seconds, for the life of the party. A member obeying that
   * clock sat silent at 0:00 while the host was half a minute in, which is
   * exactly how this was found.
   *
   * The film player has always reported; the music screen simply never did.
   */
  useEffect(() => {
    player.onPlayerProgress(
      progress.positionSeconds,
      progress.durationSeconds,
      playing,
    );
  }, [progress.positionSeconds, progress.durationSeconds, playing]);

  /*
   * And follow the party, when this device is not the one driving it.
   *
   * The other half of the same omission. The hook works the correction out on
   * every clock frame — a seek request, a play or pause, a rate — but it writes
   * them for the film player, which reads them. This screen reads MusicPlayback
   * and nothing else, so a member's instructions arrived and went nowhere.
   *
   * Only for members: the host *is* the clock, and seeking them to it would be
   * the party chasing its own tail.
   */
  const followingParty = player.party != null && !player.party.isHost;

  useEffect(() => {
    if (!followingParty || !player.seekRequest) return;
    MusicPlayback.seekTo(player.seekRequest.positionSeconds);
  }, [followingParty, player.seekRequest?.id]);

  useEffect(() => {
    // Keyed on what the player is doing as well as on what was asked, so the
    // two converge. Keyed only on the request, a frame that landed before the
    // track was ready would be applied to a player that could not act on it and
    // never mentioned again.
    if (!followingParty) return;
    if (player.playing !== playing) MusicPlayback.togglePlay();
  }, [followingParty, player.playing, playing]);

  const shown = player.scrubbing ? player.scrubPreviewSeconds : progress.positionSeconds;
  const remaining = Math.max(0, progress.durationSeconds - shown);

  return (
    <View style={{ flex: 1, backgroundColor: Ink }}>
      <Wash track={track} />

      <View style={{ flex: 1 }}>
        <Header
          album={track.album ?? null}
          party={party}
          onCollapse={onCollapse}
          onOpenChat={onOpenChat}
          onStartParty={onStartParty}
          onOpenComments={onOpenComments}
        />

        <View style={styles.body}>
          <View style={{ flex: 0.6 }} />

          <Sleeve track={track} />

          <View style={{ flex: 0.5 }} />

          <View style={styles.titleRow}>
            {/* Balances the heart, so the name stays on the centre axis the
                sleeve and the transport are already on. */}
            <View style={{ width: 48 }} />
            <View style={{ flex: 1 }}>
              <Text
                style={[TowerType.titleScreen, { color: OnInk, textAlign: 'center' }]}
                numberOfLines={2}
              >
                {track.name}
              </Text>
              <Text
                style={[
                  TowerType.bodyProse,
                  { color: OnInkMuted, textAlign: 'center', marginTop: 6 },
                ]}
                numberOfLines={1}
              >
                {/* The filename is the honest fallback: an untagged MP3 has no
                    artist, and "Unknown artist" is a fact the file never stated. */}
                {track.artist ?? (track.file.filename || 'No artist in the tags')}
              </Text>
            </View>
            {/* Beside the name rather than in the transport row: liking is about
                the song, not about playback, and it belongs next to the thing it
                is an opinion of. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={track.engagement.likedByMe ? 'Unlike' : 'Like'}
              onPress={onToggleLike}
              style={({ pressed }) => [styles.heart, { opacity: pressed ? 0.6 : 1 }]}
            >
              <HeartGlyph
                color={track.engagement.likedByMe ? Amber : OnInkMuted}
                size={22}
                filled={track.engagement.likedByMe}
              />
            </Pressable>
          </View>

          <View style={{ flex: 0.4 }} />

          <View style={{ width: '100%' }}>
            <Scrubber
              positionSeconds={shown}
              durationSeconds={progress.durationSeconds}
              onSeek={inParty ? player.seekTo : (seconds) => MusicPlayback.seekTo(seconds)}
              onScrubPreview={player.onScrubPreview}
              onScrubbingChange={player.onScrubbingChange}
              // Thicker than the film player's. There is no picture underneath
              // to keep clear of, and this is the main control on the screen
              // rather than a strip along the bottom of a film.
              trackHeight={4}
              thumbSize={19}
            />
            <View style={styles.clockRow}>
              <DataMeta text={formatClock(shown)} color={OnInkMuted} />
              {/* Remaining rather than total: the question at 2:40 of a song is
                  how much is left, and the total is already implied by the bar. */}
              <DataMeta text={`-${formatClock(remaining)}`} color={OnInkFaint} />
            </View>
          </View>

          <PartyEye
            party={party}
            joining={partyJoining}
            onPress={() => onOpenMembers(true)}
            style={{ alignSelf: 'center' }}
          />

          <Transport
            playing={playing}
            hasQueue={upNext.length > 0}
            hasNext={hasNext}
            onOpenQueue={() => onOpenQueue(true)}
            onTogglePlay={inParty ? player.togglePlayPause : () => MusicPlayback.togglePlay()}
            onPrevious={() => void MusicQueue.previous()}
            onNext={() => void MusicQueue.next()}
          />

          <View style={{ flex: 0.4 }} />

          {/*
           * Two things this build may not be able to do, said here rather than
           * left to be discovered. Background audio needs `audio` in the app's
           * own Info.plist, which arrives with the expo-video config plugin and
           * so only in a real build — in a host app without it the sound stops
           * at the moment the app leaves the screen, which without a word of
           * explanation reads as a bug rather than as a limit.
           */}
          {unavailable != null ? (
            <Text style={[TowerType.bodyNote, { color: Amber, textAlign: 'center', marginTop: 24 }]}>
              {unavailable}
            </Text>
          ) : (
            !MusicPlayback.backgroundCapable && (
              <Text
                style={[
                  TowerType.bodyNote,
                  { color: OnInkFaint, textAlign: 'center', marginTop: 24 },
                ]}
              >
                This build plays music only while the app is open. Background play
                needs an installed build rather than Expo Go.
              </Text>
            )
          )}

          {/* The same measured facts the plan card gives a film, in the same
              mono. On a music file these are the whole of what there is to know
              about it. */}
          <FileLine track={track} />
        </View>
      </View>

      {party != null && party.membersOpen && (
        <PartyMembersSheet
          party={party}
          verb="listening"
          onEnd={onEndParty}
          onClose={() => onOpenMembers(false)}
        />
      )}

      {party != null && chatOpen && (
        <PartyChat party={party} onSend={onSendChat} onClose={() => onOpenChat(false)} />
      )}

      {queueOpen && (
        <UpNext
          tracks={upNext}
          onPlay={(id) => {
            onOpenQueue(false);
            onPlayTrack(id);
          }}
          onClose={() => onOpenQueue(false)}
        />
      )}
    </View>
  );
}

/**
 * The sleeve again, vast and dimmed, behind everything.
 *
 * Not a blur: a real blur costs a filter pass on every frame of a screen
 * somebody leaves open for forty minutes, for an effect an over-scaled image
 * under a heavy scrim gives just as well. What is left is the sleeve's colour
 * rather than its content.
 */
function Wash({ track }: { track: Title }) {
  const [from] = gradientFor(track.name);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* The gradient is underneath rather than an alternative, so a slow or
          absent sleeve still leaves colour on the screen instead of black. */}
      <LinearGradient
        colors={[withAlpha(from, 0.34), Ink]}
        style={StyleSheet.absoluteFill}
      />
      {track.posterUrl != null && (
        <Image
          source={artSource(track.posterUrl)}
          style={[
            StyleSheet.absoluteFill,
            // Far enough out that no lettering on a sleeve stays readable. At
            // 2.2x an album title was still legible along the top of the screen,
            // which reads as a rendering fault rather than as atmosphere.
            { opacity: 0.22, transform: [{ scale: 4.5 }] },
          ]}
          contentFit="cover"
        />
      )}
      <LinearGradient
        colors={[withAlpha(Ink, 0.88), withAlpha(Ink, 0.92), Ink]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function Header({
  album,
  party,
  onCollapse,
  onOpenChat,
  onStartParty,
  onOpenComments,
}: {
  album: string | null;
  party: PartyPlayback | null;
  onCollapse: () => void;
  onOpenChat: (open: boolean) => void;
  onStartParty: () => void;
  onOpenComments: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onCollapse}
        style={styles.headerButton}
      >
        {/* Down rather than back: this is a thing that covers the app while it
            plays, and it is dismissed rather than navigated out of. */}
        <ChevronGlyph rotation={90} color={OnInk} size={18} />
      </Pressable>

      <View style={{ flex: 1, alignItems: 'center' }}>
        <DataLabel text="PLAYING FROM" technical={false} color={OnInkFaint} />
        <Text
          style={[TowerType.bodyNote, { color: OnInkMuted, marginTop: 2 }]}
          numberOfLines={1}
        >
          {album ?? 'Your library'}
        </Text>
      </View>

      {/*
       * One icon doing whichever of the two things is left. Outside a party it
       * starts one and hands over to the lobby, where the code to read out
       * lives. Inside a party the party is already running, so the same icon
       * opens the conversation.
       */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={party == null ? 'Listen together' : 'Party chat'}
        onPress={party == null ? onStartParty : () => onOpenChat(true)}
        style={styles.headerButton}
      >
        <TogetherGlyph
          // Amber once there is a party: this is the one control on the screen
          // whose state somebody needs to read at a glance, because it is the
          // difference between listening alone and with other people.
          color={party == null ? OnInk : Amber}
          size={18}
        />
        {party != null && party.unreadChat > 0 && <View style={styles.unread} />}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Comments"
        onPress={onOpenComments}
        style={styles.headerButton}
      >
        <CommentGlyph color={OnInk} size={17} />
      </Pressable>
    </View>
  );
}

/**
 * The sleeve, square and large, and still.
 *
 * It turned slowly at first, on the idea that a record spins. It does not work:
 * a *square* sleeve rotating reads as a picture knocked askew, not as motion,
 * and the corners of the frame show through as it goes. Spinning belongs to a
 * circular label, which is a different design and not this one.
 *
 * Still is also the right answer for the screen's job. This is the one screen in
 * the app somebody leaves open for forty minutes, and an animation running the
 * whole time costs battery for a flourish. The pause button and the moving
 * scrubber already say whether anything is playing.
 */
function Sleeve({ track }: { track: Title }) {
  const [from, to] = gradientFor(track.name);

  return (
    <View style={styles.sleeve}>
      <LinearGradient
        colors={[from, to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.33, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {track.posterUrl != null ? (
        <Image
          source={artSource(track.posterUrl)}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={160}
        />
      ) : (
        // No sleeve: the gradient is the design, and the initial sits on it the
        // way it does on a profile avatar.
        <Text style={[TowerType.dataDisplay, { color: withAlpha(OnInk, 0.55) }]}>
          {track.name.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

/**
 * Previous and next, which used to be fifteen-second skips.
 *
 * The comment that stood here was honest at the time: there was no queue, and a
 * pair of controls that looked like track changes and did nothing would have
 * been worse than a pair that seeked. There is a queue now — and seeking inside
 * a song is what the scrubber directly above these is for, where fifteen-second
 * jumps are a habit from film, in which there is nothing worth dragging in the
 * dark.
 */
function Transport({
  playing,
  hasQueue,
  hasNext,
  onOpenQueue,
  onTogglePlay,
  onPrevious,
  onNext,
}: {
  playing: boolean;
  hasQueue: boolean;
  hasNext: boolean;
  onOpenQueue: () => void;
  onTogglePlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <View style={styles.transport}>
      {/* An empty slot the width of the queue button on the right, so the play
          button stays on the centre axis everything else on this screen is on.
          Without it, adding one control to one end shifts the whole row. */}
      <View style={{ width: 56 }} />

      <StepButton forward={false} enabled onPress={onPrevious} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause' : 'Play'}
        onPress={onTogglePlay}
        style={({ pressed }) => [styles.playButton, { opacity: pressed ? 0.85 : 1 }]}
      >
        {playing ? (
          <PauseGlyph color={AmberInk} size={26} />
        ) : (
          // Nudged right: a triangle's visual centre is left of its box.
          <PlayGlyph color={AmberInk} size={26} />
        )}
      </Pressable>

      <StepButton forward enabled={hasNext} onPress={onNext} />

      {/* Beside the transport rather than up in the header: what plays next is a
          playback control, and it belongs with the other ones under the thumb
          rather than in the corner with the things that leave the screen. */}
      {hasQueue ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Up next"
          onPress={onOpenQueue}
          style={({ pressed }) => [styles.queueButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <QueueGlyph color={OnInk} size={18} />
        </Pressable>
      ) : (
        <View style={{ width: 56 }} />
      )}
    </View>
  );
}


/**
 * The party talking, over the sleeve.
 *
 * Only the people in the party can see this and only they can write to it: the
 * messages arrive on the party's own socket and go nowhere else. When the party
 * ends they are gone from this screen and from the server at the same moment,
 * because neither keeps a copy anywhere a party outlives.
 *
 * Said plainly at the foot of the sheet. A chat that quietly disappears is
 * alarming if nobody warned you and a relief if they did, and that is a promise
 * an app should make out loud rather than in a settings page.
 */
function PartyChat({
  party,
  onSend,
  onClose,
}: {
  party: PartyPlayback;
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const keyboard = useKeyboardPanel();
  const list = useRef<FlatList<PartyMessage>>(null);

  // A message arriving while the sheet is open should be visible without a
  // scroll, which is what a conversation does.
  useEffect(() => {
    if (party.chat.length > 0) list.current?.scrollToEnd({ animated: true });
  }, [party.chat.length]);

  const send = () => {
    onSend(draft);
    setDraft('');
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />

      <Animated.View style={[styles.chatSheet, keyboard]}>
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[TowerType.titleSection, { color: OnInk }]}>Party chat</Text>
            <DataMeta
              text={`CODE ${party.code}`}
              color={OnInkFaint}
              technical={false}
              style={{ marginTop: 3 }}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={styles.headerButton}
          >
            <ChevronGlyph rotation={90} color={OnInk} size={16} />
          </Pressable>
        </View>

        <HairlineDivider />

        {party.chat.length === 0 ? (
          <View style={{ flex: 1, paddingHorizontal: Space.Screen, paddingVertical: 24 }}>
            <Text style={[TowerType.bodyProse, { color: OnInkMuted }]}>
              Nobody has said anything yet.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={list}
            data={party.chat}
            keyExtractor={(message) => message.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: Space.Screen, paddingVertical: 12, gap: 10 }}
            renderItem={({ item, index }) => {
              // Grouped by speaker: three lines from one person is one person
              // talking, not three announcements.
              const sameSpeaker = index > 0 && party.chat[index - 1].from === item.from;
              return (
                <View>
                  {!sameSpeaker && (
                    <DataMeta
                      text={item.from.toUpperCase()}
                      color={OnInkFaint}
                      technical={false}
                      style={{ marginBottom: 3 }}
                    />
                  )}
                  <Text style={[TowerType.bodyProse, { color: OnInk }]}>{item.text}</Text>
                </View>
              );
            }}
          />
        )}

        <HairlineDivider />

        <View style={styles.chatField}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Say something"
            placeholderTextColor={OnInkFaint}
            selectionColor={Amber}
            cursorColor={Amber}
            returnKeyType="send"
            onSubmitEditing={send}
            style={styles.chatInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: draft.trim() === '' }}
            disabled={draft.trim() === ''}
            onPress={send}
            style={[
              styles.chatSend,
              { backgroundColor: draft.trim() === '' ? Surface1 : Amber },
            ]}
          >
            <Text
              style={[
                TowerType.buttonLabel,
                { color: draft.trim() === '' ? OnInkFaint : AmberInk },
              ]}
            >
              Send
            </Text>
          </Pressable>
        </View>

        <Text style={[TowerType.bodyNote, { color: OnInkFaint, padding: Space.Screen }]}>
          Only the people in this party can see this, and it is gone when the party ends.
          Nothing is kept here or on Tower.
        </Text>
      </Animated.View>
    </View>
  );
}

/**
 * What else is on the disk, as a sheet over the sleeve.
 *
 * "Up next" rather than a playlist, and the distinction is honest: nothing plays
 * automatically when this track ends. It is the music on the disk, newest first,
 * with this one taken out — a way to reach the next song without going back to
 * the library and finding it again, which was the whole of what was missing.
 *
 * Over the player rather than a screen of its own, so the track keeps playing and
 * the thing being left is visible behind the thing being chosen.
 */
function UpNext({
  tracks,
  onPlay,
  onClose,
}: {
  tracks: Title[];
  onPlay: (titleId: string) => void;
  onClose: () => void;
}) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Tap anywhere off the sheet to dismiss. No scrim colour: the sleeve
          behind is the thing being played and should stay visible. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />

      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[TowerType.titleSection, { color: OnInk }]}>Up next</Text>
            <DataMeta
              text={`${tracks.length} ON THE DISK`}
              color={OnInkFaint}
              style={{ marginTop: 3 }}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={styles.headerButton}
          >
            <ChevronGlyph rotation={270} color={OnInkMuted} size={16} />
          </Pressable>
        </View>
        <HairlineDivider />
        <FlatList
          data={tracks}
          keyExtractor={(track) => track.id}
          contentContainerStyle={{ paddingBottom: 18 }}
          renderItem={({ item }) => (
            <TrackRow track={item} onPress={() => onPlay(item.id)} />
          )}
        />
      </View>
    </View>
  );
}

function TrackRow({ track, onPress }: { track: Title; onPress: () => void }) {
  const [from, to] = gradientFor(track.name);
  const seconds = effectiveDurationSeconds(track);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${track.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.trackRow, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={styles.trackArt}>
        <LinearGradient
          colors={[from, to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.33, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {track.posterUrl != null && (
          <Image
            source={artSource(track.posterUrl)}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        )}
      </View>
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
      {seconds > 0 && <DataMeta text={formatClock(seconds)} color={OnInkFaint} />}
    </Pressable>
  );
}

/**
 * One track back or forward.
 *
 * Next dims at the end of the queue rather than vanishing: a control that moves
 * when it runs out shifts the play button off the centre axis the sleeve and
 * title sit on. Previous is always live, because with nothing before it it still
 * restarts the track.
 */
function StepButton({
  forward,
  enabled,
  onPress,
}: {
  forward: boolean;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={forward ? 'Next track' : 'Previous track'}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [styles.skip, { opacity: !enabled ? 0.3 : pressed ? 0.6 : 1 }]}
    >
      <SkipGlyph forward={forward} color={OnInk} size={22} />
    </Pressable>
  );
}

function FileLine({ track }: { track: Title }) {
  const facts: string[] = [];
  if (track.file.container) facts.push(track.file.container.toUpperCase());
  const bitrate = track.file.bitrateBitsPerSecond;
  if (bitrate != null && bitrate > 0) facts.push(`${Math.round(bitrate / 1000)} KBPS`);
  if (track.file.audioChannels != null) {
    facts.push(track.file.audioChannels >= 2 ? 'STEREO' : 'MONO');
  }
  if (facts.length === 0) return null;

  // Centred, unlike every other mono data line in the app, which sit hard left
  // under something they describe. Everything on this screen is on the centre
  // axis, and a lone left-aligned line at the bottom of it reads as a mistake
  // rather than as a convention being kept.
  return (
    <View style={{ alignItems: 'center', marginTop: 28 }}>
      <DataMeta text={facts.join(' · ')} color={OnInkFaint} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Space.Screen,
    paddingBottom: 18,
  },
  sleeve: {
    width: '78%',
    aspectRatio: 1,
    maxWidth: 420,
    borderRadius: Radius.Sheet,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  heart: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unread: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Amber,
  },
  watching: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  membersSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '62%',
    borderTopLeftRadius: Radius.Sheet,
    borderTopRightRadius: Radius.Sheet,
    backgroundColor: Surface1,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: Space.Screen,
    paddingVertical: 11,
  },
  chatSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '66%',
    borderTopLeftRadius: Radius.Sheet,
    borderTopRightRadius: Radius.Sheet,
    backgroundColor: Surface1,
    overflow: 'hidden',
  },
  chatField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Space.Screen,
    paddingVertical: 10,
  },
  chatInput: {
    flex: 1,
    paddingVertical: 10,
    color: OnInk,
    fontFamily: TowerType.bodyProse.fontFamily,
    fontSize: TowerType.bodyProse.fontSize,
  },
  chatSend: {
    borderRadius: Radius.Pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
    borderTopLeftRadius: Radius.Sheet,
    borderTopRightRadius: Radius.Sheet,
    backgroundColor: Surface1,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Space.Screen,
    paddingRight: 10,
    paddingTop: 16,
    paddingBottom: 10,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Space.Screen,
    paddingVertical: 11,
  },
  trackArt: {
    width: 44,
    height: 44,
    borderRadius: Radius.Thumb,
    overflow: 'hidden',
  },
  clockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 10,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 26,
  },
  playButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    marginHorizontal: 30,
    backgroundColor: Amber,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  skip: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
