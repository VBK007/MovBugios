import { useCallback, useEffect, useRef, useState } from 'react';

import {
  Chapter,
  Engagement,
  PlaybackPlan,
  Title,
  effectiveDurationSeconds,
} from '@/domain/model/media';
import { DefaultLibraryFilters } from '@/domain/model/library';
import {
  ClientCapabilities,
  PlaybackSource,
  Trickplay,
  originSeconds,
} from '@/domain/model/player';
import { Loading, UiState, dataOrNull, loadState } from '@/ui/uiState';
import { useRepository } from '@/ui/hooks';
import { PreferencesStore } from '@/data/remote/preferencesStore';
import { QualityCaps } from '@/domain/model/preferences';
import { RemoteTowerRepository } from '@/data/remote/remoteTowerRepository';
import { PartyEvent, PartySocket } from '@/data/remote/partySocket';
import { PartyMessage } from '@/domain/model/watchParty';
import { PartyClockFollower, departureNote, departures } from '@/domain/party/partyClockFollower';
import { PartyClock, PartyMember } from '@/domain/model/watchParty';

/**
 * How close the player has to get before a seek counts as landed.
 *
 * Generous because a transcode starts on a keyframe, not on the requested
 * millisecond, so the first frame of a new stream can be a second or two either
 * side of what was asked for.
 */
const SEEK_SETTLED_SECONDS = 2.5;

/**
 * The same idea for a seek the *party* asked for, and deliberately tighter.
 *
 * It has to be tighter than the follower's own seek threshold (2.0s) or the two
 * fight: a seek declared "arrived" while still 2.4s out is immediately over the
 * threshold that triggers a seek, so every landing starts another one. That is a
 * ping-pong no amount of guarding elsewhere can settle.
 */
const PARTY_SEEK_SETTLED_SECONDS = 0.6;

/**
 * How far ahead of the party a corrective seek aims, to start with.
 *
 * A seek is not instant, and the party does not wait for it: aiming at where
 * the party is *now* lands you exactly as far behind as the seek took, which is
 * over the threshold again, so you seek again — and on a slow connection that
 * never converges. Aiming at where the party *will be* is the only thing that
 * settles it. The figure is then measured rather than assumed; see `seekLeadMs`.
 */
const INITIAL_SEEK_LEAD_MS = 1_000;

/** Ceiling on the measured lead, so one pathological seek cannot skew it. */
const MAX_SEEK_LEAD_MS = 6_000;

/**
 * How long to keep waiting for one.
 *
 * A transcode over a tunnel is the slow case — ffmpeg has to start before a
 * frame exists. Past this the scrubber follows the player again whatever it
 * says, because a bar frozen on a seek that failed is worse than a bar showing
 * an unwelcome truth.
 */
const SEEK_TIMEOUT_MS = 20_000;

const HIDE_CONTROLS_MS = 3_500;

/** How often every device tells the party where it is. */
const REPORT_INTERVAL_MS = 3_000;

/** How long a piece of party news stays over the picture. */
const PARTY_NOTE_MS = 5_000;

/**
 * What this device needs to know about the party it is watching with.
 *
 * `isHost` decides whether the transport controls drive the party or are
 * refused: the host's player *is* the clock, and a member sending a control gets
 * an error frame back rather than moving anyone.
 */
export interface PartyPlayback {
  code: string;
  isHost: boolean;
  connected: boolean;
  /** "Amma paused" — shown briefly so the picture does not change silently. */
  note: string | null;
  /**
   * What the party has said, oldest first.
   *
   * Lives here and nowhere else: the messages arrive on the party's own socket,
   * and when the party ends they are gone from this device and from the server
   * at the same moment, because neither keeps a copy anywhere a party outlives.
   */
  chat: PartyMessage[];
  /** How many have arrived since the sheet was last open. */
  unreadChat: number;
  /**
   * Who is in the party, as the socket last reported them.
   *
   * Held here rather than left to the lobby because the host is in the player,
   * not the lobby — "is anyone actually still with me" is asked while the thing
   * is playing, and the answer was two screens away.
   */
  members: PartyMember[];
  membersOpen: boolean;
}

/** Connected right now, which is what "listening" means on this screen. */
export function partyWatching(party: PartyPlayback): number {
  return party.members.filter((member) => member.online).length;
}

/** Which of the quick chips has a picker open. */
export type PlayerSheet = 'SUBTITLES' | 'AUDIO' | 'QUALITY';

export type ScreenOrientation = 'AUTO' | 'PORTRAIT' | 'LANDSCAPE';

/**
 * The heights worth offering, with what each one costs.
 *
 * Not every rendition a server could make — a list of six numbers is a menu, and
 * this is a decision someone takes mid-film with one thumb. The Mbps figures are
 * rough and say so, because the exact number depends on the file and nobody is
 * choosing between 4.8 and 5.2.
 */
export const QualityOptions: { height: number | null; label: string }[] = [
  { height: null, label: 'Best available' },
  { height: 1080, label: '1080p · about 5 Mbps' },
  { height: 720, label: '720p · about 3 Mbps' },
  { height: 480, label: '480p · about 1.5 Mbps' },
  { height: 360, label: '360p · lightest' },
];

export interface PlayerContent {
  title: Title;
  chapters: Chapter[];
  trickplay?: Trickplay | null;
}

/** One seek, identified so repeats to the same position still fire. */
export interface SeekRequest {
  id: number;
  positionSeconds: number;
}

/**
 * The player's state, ported from ui/screens/player/PlayerViewModel.kt.
 *
 * The subtle part is that **everything the user sees is in the film's timeline**,
 * while the video element only knows the stream it was handed — and a transcode's
 * stream begins partway into the film. `originSeconds` is what reconciles them,
 * and getting it wrong is what made a seek to 1:56 land at 3:52.
 */
export function usePlayer(titleId: string, partyCode: string | null = null) {
  const repository = useRepository();
  const remote = repository instanceof RemoteTowerRepository ? repository : null;

  const [content, setContent] = useState<UiState<PlayerContent>>(Loading);
  /**
   * The library's music, in order, including whatever is playing.
   *
   * Held in full rather than as "everything except this one" because the order
   * is the queue: what follows a track is the row after it, and a list with the
   * current one already removed cannot say which that is. The first attempt did
   * exactly that and two tracks played each other forever.
   */
  const [musicTracks, setMusicTracks] = useState<Title[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const contentRef = useRef(content);
  contentRef.current = content;
  const [source, setSource] = useState<PlaybackSource | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [positionSeconds, setPositionSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  /** What the user asked for. Drives the player and the button's icon. */
  const [playing, setPlaying] = useState(false);
  /** What the player is doing. False while buffering, even mid-playback. */
  const [actuallyPlaying, setActuallyPlaying] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubPreviewSeconds, setScrubPreviewSeconds] = useState(0);
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(null);
  const [nightMode, setNightMode] = useState(false);
  const [sheet, setSheet] = useState<PlayerSheet | null>(null);
  const [maxHeight, setMaxHeightState] = useState<number | null>(1080);
  const [subtitleTrack, setSubtitleTrackState] = useState<number | null>(null);
  const [audioTrack, setAudioTrackState] = useState<number | null>(null);
  const [orientation, setOrientation] = useState<ScreenOrientation>('AUTO');

  /** Non-null when this playback is tied to a watch party. */
  const [party, setParty] = useState<PartyPlayback | null>(null);
  /**
   * Whether the chat sheet is open, which is also what marks it read.
   *
   * Held next to the party rather than in the screen: a message arriving while
   * the sheet is open is already read, and a screen that owned this would have
   * to tell the hook so.
   */
  const [chatOpen, setChatOpen] = useState(false);
  /**
   * The track the host has just moved the party to, for a member to follow.
   *
   * State rather than a callback for the same reason a seek request is: this
   * hook holds no navigator, so it records what needs to happen and the screen
   * performs it. Cleared once acted on.
   */
  const [partyMovedTo, setPartyMovedTo] = useState<string | null>(null);
  const partyRef = useRef(party);
  partyRef.current = party;
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;
  /**
   * Playback rate. 1.0 unless the party clock is nudging this device level — a
   * 6% change for a second or two, which nobody notices, instead of a seek,
   * which everybody does.
   */
  const [speed, setSpeed] = useState(1);

  /** Turns the party's anchor into "seek", "run 6% fast" or "do nothing". */
  const follower = useRef(new PartyClockFollower());
  const socket = useRef<PartySocket | null>(null);
  const closeSocket = useRef<(() => void) | null>(null);
  /** The party roster as last broadcast, so the next one can be compared to it. */
  const partyMembers = useRef<PartyMember[]>([]);
  /** What the party was last told about this host, so we only speak on a change. */
  const announcedPlaying = useRef<boolean | null>(null);
  /**
   * Whether this device has been put on the party's frame even once.
   *
   * The follower only corrects while the party is *playing*, which is right —
   * chasing a paused party would fight a host seeking about looking for a scene.
   * But it leaves someone joining a paused party sitting on frame one until
   * somebody presses play. The first frame lands unconditionally for that reason.
   */
  const hasLanded = useRef(false);
  /**
   * How long a corrective seek actually takes on this connection.
   *
   * Measured from the last one and smoothed, because it is the difference
   * between a direct play on the LAN (milliseconds) and a transcode over a
   * tunnel (seconds), and no fixed guess suits both.
   */
  const seekLeadMs = useRef(INITIAL_SEEK_LEAD_MS);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const alive = useRef(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekCounter = useRef(0);
  /** Where a seek is headed, and when to stop waiting for it. */
  const pendingSeek = useRef<{
    seconds: number;
    deadlineMs: number;
    toleranceSeconds: number;
    startedAtMs: number;
    /** Only a party correction feeds the lead estimate; a manual seek does not. */
    measuresLead: boolean;
  } | null>(null);
  const lastReportedSecond = useRef(0);
  const scrubbingRef = useRef(scrubbing);
  scrubbingRef.current = scrubbing;
/**
   * Codecs this device has *proved* it cannot show the picture of.
   *
   * There is no way to say this in advance. The capabilities carry codec names
   * and nothing else — no profile, no bit depth, nothing about how the stream is
   * tagged inside its container — so two HEVC files that behave completely
   * differently on this phone are the same word to the server, and it sends both
   * untouched. One of them plays its sound and none of its picture.
   *
   * So the claim is withdrawn after the fact. A named codec rather than a blanket
   * "convert everything", because `videoCodecs` minus one entry is an ordinary
   * sentence any server already understands, where an empty list is an edge case
   * each one may read differently. Dropping `hevc` leaves `h264`, which is the
   * thing every phone plays.
   *
   * Per playback, and per codec. The next file is asked for normally.
   */
  const [refusedVideoCodecs, setRefusedVideoCodecs] = useState<string[]>([]);
  const stateRef = useRef({
    source,
    maxHeight,
    subtitleTrack,
    audioTrack,
    durationSeconds,
    refusedVideoCodecs,
  });
  stateRef.current = {
    source,
    maxHeight,
    subtitleTrack,
    audioTrack,
    durationSeconds,
    refusedVideoCodecs,
  };
  /**
   * What the party callbacks read.
   *
   * A ref rather than dependencies: the position moves twice a second, and
   * rebuilding the socket handler that often would tear down the connection.
   */
  const partyStateRef = useRef({
    party,
    positionSeconds,
    playing,
    actuallyPlaying,
    plan: null as PlaybackPlan | null,
  });

  /** True when in a party but not running it. */
  const isFollower = useCallback(() => party != null && !party.isHost, [party]);

  /** Host-only; the server refuses these from anyone else. */
  const tellParty = useCallback((send: (live: PartySocket, at: number) => void) => {
    const current = partyStateRef.current;
    if (current.party == null || !current.party.isHost) return;
    const live = socket.current;
    if (!live) return;
    send(live, current.positionSeconds);
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const scheduleHideControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (alive.current && !scrubbingRef.current) setControlsVisible(false);
    }, HIDE_CONTROLS_MS);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHideControls();
  }, [scheduleHideControls]);

  /**
   * What this device can decode.
   *
   * Conservative on purpose: claiming a codec the device cannot handle costs the
   * viewer a black screen, whereas an unnecessary transcode only costs the
   * server some CPU. iOS decodes H.264 and HEVC in hardware but not in every
   * container, so the container list is the narrow one.
   */
  const deviceCapabilities = useCallback(
    (): ClientCapabilities => ({
      deviceName: 'iPhone',
      // Minus whatever this file has already failed to show a picture of.
      videoCodecs: ['h264', 'hevc'].filter(
        (codec) => !stateRef.current.refusedVideoCodecs.includes(codec),
      ),
      /*
       * No `ac3` or `eac3`, which is the whole of a bug worth remembering.
       *
       * This list began as the Android one and was trimmed for iOS — the
       * containers and video codecs were, and Dolby Digital was missed. The
       * server believes what a client claims, so every film with an AC-3 track
       * was handed over as a direct play, and AVPlayer on an iPhone cannot
       * decode it: the picture failed or arrived silent, on exactly the subset
       * of films that happen to carry that audio.
       *
       * Dropping it means the server transcodes those to AAC instead. That
       * costs it work it did not do before, on a minority of files, and buys
       * them playing at all — which is not a close trade.
       */
      audioCodecs: ['aac', 'mp3', 'alac', 'flac'],
      containers: ['mp4', 'mov', 'm4v'],
      // What the user asked for, not what the phone can manage. Lowering this is
      // the whole mechanism behind the quality picker: the server reads it and
      // either sends a smaller rendition or transcodes down to one.
      maxHeight: stateRef.current.maxHeight,
      supportsHls: true,
    }),
    [],
  );

  /**
   * Asks the server how to play this, which is what produces a URL.
   *
   * Deliberately after the title has been shown: the decision can start an
   * ffmpeg process for a transcode, so it happens once the user has actually
   * committed to playing rather than on every detail-screen visit.
   */
  const requestSource = useCallback(
    async (startSeconds: number) => {
      try {
        // Returns immediately once settled, which after the first decision
        // it always is.
        await qualityPreference.current;
        const decided = await repository.playbackDecision(
          titleId,
          deviceCapabilities(),
          startSeconds,
        );
        if (!alive.current) return;
        setSource(decided);
        setSourceError(null);
      } catch (e) {
        if (!alive.current) return;
        setSourceError(e instanceof Error ? e.message : 'The server could not start this file.');
      }
    },
    [repository, titleId, deviceCapabilities],
  );

  /**
   * Applies the ceiling chosen on first run, but only away from home.
   *
   * On home Wi-Fi the bytes are free and the best available is right. On a
   * data plan it is not, and asking someone a question and then ignoring the
   * answer is worse than never having asked — which is what was happening:
   * the preference was stored at onboarding and read by nobody.
   *
   * Resolved before the first playback decision so the server is never asked
   * for a rendition the user has already declined.
   */
  const qualityPreference = useRef<Promise<void> | null>(null);
  if (qualityPreference.current == null) {
    qualityPreference.current = (async () => {
      try {
        if (repository.serverState.get().type !== 'AWAY_FROM_HOME') return;
        const preferences = await PreferencesStore.load();
        if (!preferences.completed) return;
        const cap = QualityCaps[preferences.mobileQuality].maxHeight;
        stateRef.current.maxHeight = cap;
        if (alive.current) setMaxHeightState(cap);
      } catch {
        // No stored answer, or an unreadable store. The default ceiling
        // stands, which is the same as before the question existed.
      }
    })();
  }

  const load = useCallback(async () => {
    const loaded = await loadState(async () => {
      const title = await repository.detail(titleId);
      const playerState = await repository.playerState(titleId);
      return { title, playerState };
    });
    if (!alive.current) return;

    if (loaded.type !== 'LOADED') {
      setContent(loaded as UiState<PlayerContent>);
      return;
    }

    const { title, playerState } = loaded.data;
    setContent({
      type: 'LOADED',
      data: { title, chapters: playerState.chapters, trickplay: playerState.trickplay },
    });
    setPositionSeconds(playerState.positionSeconds);
    setDurationSeconds(playerState.durationSeconds ?? effectiveDurationSeconds(title));

    // Only for music, and only once the thing being played is on screen. A film
    // has nothing to queue behind it.
    if (title.kind === 'MUSIC') void loadUpNext(title);
    // The server remembers these per profile, so a film opens with the tracks it
    // was last watched with rather than making the same choice every time.
    setSubtitleTrackState(playerState.subtitleTrackIndex ?? null);
    setAudioTrackState(playerState.audioTrackIndex ?? null);
    /*
     * A device in a party must not start playing on its own: the party's clock
     * says where everyone is, and the first frame will set it.
     *
     * Keyed on `partyCode` rather than on whether the join has come back, because
     * the join and this request race — and if this one won, the follower started
     * from its own resume position and had to be dragged back.
     */
    setPlaying(partyCode == null);

    void requestSource(playerState.positionSeconds);
    scheduleHideControls();
  }, [repository, titleId, partyCode, requestSource, scheduleHideControls]);

  useEffect(() => {
    void load();
  }, [load]);

  /** The decision's plan wins: it is the one the server actually acted on. */
  const plan: PlaybackPlan =
    source?.plan ?? dataOrNull(content)?.title.plan ?? { type: 'UNKNOWN', reasons: [] };

  partyStateRef.current = { party, positionSeconds, playing, actuallyPlaying, plan };

  /**
   * Position reported by the real player, in seconds of *its own* stream.
   *
   * The player owns the clock now — an independent timer would drift away from
   * the picture within a minute, and the scrubber would lie.
   */
  const onPlayerProgress = useCallback(
    (streamPosition: number, streamDuration: number, isPlaying: boolean) => {
      if (scrubbingRef.current) return;

      const current = stateRef.current;
      const currentPlan = current.source?.plan;
      const transcoding = currentPlan?.type === 'TRANSCODE';
      // A transcode is generated *from* the requested offset, so the player's
      // timeline starts at zero there and its duration is only the remainder.
      // Everything the user sees is in the file's timeline, so the stream's
      // origin is added back and the server's duration is kept.
      const origin = current.source ? originSeconds(current.source) : 0;
      const absolute = origin + streamPosition;

      // A seek is never instant, and a transcode's is measured in seconds: the
      // server has to start ffmpeg at the new offset before a single frame
      // exists. Until then the *old* stream is still playing and still
      // reporting, and writing those reports back dragged the thumb straight
      // home again — so the bar read as ignoring the seek entirely, then jumping
      // much later.
      const pending = pendingSeek.current;
      if (pending) {
        const arrived = Math.abs(absolute - pending.seconds) < pending.toleranceSeconds;
        const gaveUp = Date.now() >= pending.deadlineMs;
        // Dropped rather than merely ignored on timeout: a seek that never lands
        // must not freeze the scrubber for the rest of the film.
        if (!arrived && !gaveUp) return;
        if (arrived && pending.measuresLead) {
          // Smoothed rather than replaced: one slow seek behind a cold ffmpeg
          // should move the estimate, not become it.
          const observed = Date.now() - pending.startedAtMs;
          seekLeadMs.current = Math.min(
            MAX_SEEK_LEAD_MS,
            Math.round(seekLeadMs.current * 0.5 + observed * 0.5),
          );
        }
        pendingSeek.current = null;
      }

      setPositionSeconds(absolute);
      if (!transcoding && streamDuration > 0) setDurationSeconds(streamDuration);
      // `playing` is deliberately NOT written back here. It represents the
      // user's intent, not the player's instantaneous state: a player reports
      // not-playing while it buffers, and a seek always buffers — so mirroring
      // it flipped intent to false and actively paused playback on every seek.
      setActuallyPlaying(isPlaying);

      // Reported roughly every few seconds rather than every tick: the server
      // upserts one row, so extra calls buy nothing.
      const whole = Math.trunc(absolute);
      if (whole > 0 && whole % 5 === 0 && whole !== lastReportedSecond.current) {
        lastReportedSecond.current = whole;
        const total = current.durationSeconds;
        // The file's timeline, not the transcode's — otherwise resuming a
        // transcoded title would jump back to near the start.
        void repository.recordProgress(titleId, absolute, total > 0 && absolute >= total - 5);
      }
    },
    [repository, titleId],
  );

  /**
   * A seek to `seconds` of the *film*, expressed in the stream's own clock.
   *
   * Everything above this works in film time; the player only knows the stream
   * it was handed, and a transcode's stream begins partway in. Skipping ten
   * seconds forward inside one was asking the player for a position that already
   * had the origin baked in, which sent it to the end of the file.
   */
  const requestSeek = useCallback((seconds: number): SeekRequest => {
    const origin = stateRef.current.source ? originSeconds(stateRef.current.source) : 0;
    return { id: ++seekCounter.current, positionSeconds: Math.max(0, seconds - origin) };
  }, []);

  /** Holds the scrubber at `seconds` until the player reports being there. */
  const expectSeek = useCallback(
    (seconds: number, toleranceSeconds = SEEK_SETTLED_SECONDS, measuresLead = false) => {
      pendingSeek.current = {
        seconds,
        deadlineMs: Date.now() + SEEK_TIMEOUT_MS,
        toleranceSeconds,
        startedAtMs: Date.now(),
        measuresLead,
      };
    },
    [],
  );

  const skip = useCallback(
    (seconds: number) => {
      if (isFollower()) {
        showControls();
        return;
      }
      const next = Math.min(Math.max(positionSeconds + seconds, 0), durationSeconds);
      setPositionSeconds(next);
      setSeekRequest(requestSeek(next));
      expectSeek(next);
      void repository.recordProgress(titleId, next);
      tellParty((live, at) => live.sendSeek(at));
      showControls();
    },
    [
      positionSeconds,
      durationSeconds,
      requestSeek,
      expectSeek,
      repository,
      titleId,
      showControls,
      isFollower,
      tellParty,
    ],
  );

  const seekTo = useCallback(
    (seconds: number) => {
      if (isFollower()) {
        // Put the thumb back where the party actually is, and say why it went.
        setScrubbing(false);
        showPartyNote('The host controls this party');
        showControls();
        return;
      }
      const clamped = Math.min(Math.max(seconds, 0), durationSeconds);
      const transcoding = plan.type === 'TRANSCODE';

      setPositionSeconds(clamped);
      setScrubbing(false);
      // Releasing the scrubber means "play from here". Without this a seek made
      // while paused left the picture frozen on the old frame with no indication
      // anything had happened.
      setPlaying(true);
      // A transcode only contains the part of the file after its start offset,
      // so seeking outside it cannot be done in the player — the server has to
      // encode from the new point. A direct play is the whole file and seeks
      // locally, which is instant.
      if (!transcoding) setSeekRequest(requestSeek(clamped));

      expectSeek(clamped);
      if (transcoding) void requestSource(clamped);

      void repository.recordProgress(titleId, clamped);
      tellParty((live, at) => live.sendSeek(at));
      scheduleHideControls();
    },
    [
      isFollower,
      showControls,
      tellParty,
      durationSeconds,
      plan.type,
      requestSeek,
      expectSeek,
      requestSource,
      repository,
      titleId,
      scheduleHideControls,
    ],
  );

  /**
   * Asks the server for a different ceiling, resuming where we are.
   *
   * A new decision means a new stream, so playback restarts at the current
   * position rather than from the beginning — which is what makes this a quality
   * change rather than a reload.
   */
  const setMaxHeight = useCallback(
    (height: number | null) => {
      if (stateRef.current.maxHeight === height) {
        setSheet(null);
        scheduleHideControls();
        return;
      }
      setMaxHeightState(height);
      setSheet(null);
      stateRef.current.maxHeight = height;
      void requestSource(positionSeconds);
      showControls();
    },
    [positionSeconds, requestSource, showControls, scheduleHideControls],
  );

  /**
   * Chooses a subtitle track, or turns them off with null.
   *
   * Told to the server as well as the player: the choice is remembered per
   * profile, so picking Tamil once means the next film opens in Tamil rather
   * than making the same choice again every time.
   */
  /** Same split as the audio above: the stream is remade, or the player is aimed. */
  const setSubtitleTrack = useCallback(
    (index: number | null) => {
      setSubtitleTrackState(index);
      setSheet(null);
      stateRef.current.subtitleTrack = index;
      void repository.setTracks(titleId, index, stateRef.current.audioTrack);
      if (stateRef.current.source?.plan.type === 'TRANSCODE') {
        void requestSource(positionSeconds);
      }
      showControls();
    },
    [repository, titleId, positionSeconds, requestSource, showControls],
  );

  /**
   * Picks the language, and makes it actually happen.
   *
   * Telling the server was all this used to do, and the server only remembers
   * the choice for the *next* time the file is opened — so on a dual-audio
   * release the menu ticked a different language and the sound carried on
   * exactly as it was. Nothing was broken; nothing was connected.
   *
   * Which half does the work depends on how the file is being sent:
   *
   * A **transcode** has one audio track encoded into it, chosen by the server
   * when it started. There is nothing in the stream to switch to, so the only
   * way to change language is to ask for a new stream — which is what the
   * quality picker above already does for the same reason, and the server now
   * knows the answer because it was told a line earlier.
   *
   * A **direct play** is the whole file, every track still in it, so the player
   * can simply be pointed at a different one. That is instant and costs no
   * re-buffer, which is the better experience and the reason not to re-request
   * both ways round. The screen does that part, because it holds the player.
   */
  const setAudioTrack = useCallback(
    (index: number | null) => {
      setAudioTrackState(index);
      setSheet(null);
      stateRef.current.audioTrack = index;
      void repository.setTracks(titleId, stateRef.current.subtitleTrack, index);
      if (stateRef.current.source?.plan.type === 'TRANSCODE') {
        void requestSource(positionSeconds);
      }
      showControls();
    },
    [repository, titleId, positionSeconds, requestSource, showControls],
  );

  // --- Watch party -------------------------------------------------------

  /**
   * Says something over the film, briefly.
   *
   * Cleared after a few seconds, unlike the notes that describe a state — "Meera
   * left" is news, and news that stays on screen for the rest of the film stops
   * being news and becomes furniture.
   */
  const showPartyNote = useCallback((note: string) => {
    setParty((current) => (current ? { ...current, note } : current));
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => {
      if (alive.current) setParty((current) => (current ? { ...current, note: null } : current));
    }, PARTY_NOTE_MS);
  }, []);

  /**
   * Brings this device level with the party.
   *
   * The host is skipped entirely: their player defines the clock, so correcting
   * them against their own anchor would be a feedback loop.
   */
  const applyPartyClock = useCallback(
    (clock: PartyClock) => {
      const current = partyStateRef.current;
      if (current.party == null || current.party.isHost) return;

      const shouldPlay = clock.state === 'PLAYING';
      setPlaying(shouldPlay);

      /*
       * Nothing while a seek is still travelling.
       *
       * This guard is the whole difference between a follower that settles and
       * one that stutters, and both ways of leaving it out fail:
       *
       *  - Without a pending-seek gate at all, a `timeUpdate` half a second
       *    later carries the *pre-seek* position and overwrites the optimistic
       *    one, so the next tick measures the same large drift and seeks again.
       *
       *  - With the gate only on the position (so reports are ignored), the
       *    position is instead frozen at the target while the party's target
       *    keeps advancing — and two seconds later the drift is over the seek
       *    threshold again, so it seeks again.
       *
       * Either way it is a seek per tick. Waiting for the one in flight to land
       * is what stops it: `onPlayerProgress` clears this once the player reports
       * arriving, or after the timeout if it never does.
       */
      if (pendingSeek.current != null) return;

      // The first frame lands wherever the party is, playing or paused.
      if (!hasLanded.current) {
        hasLanded.current = true;
        const target = follower.current.targetSeconds(clock, Date.now());
        if (target != null && Math.abs(target - current.positionSeconds) > 1) {
          // Paused parties do not advance, so no lead is needed for one.
          const aim = clock.state === 'PLAYING' ? target + seekLeadMs.current / 1000 : target;
          setPositionSeconds(aim);
          setSpeed(1);
          expectSeek(aim, PARTY_SEEK_SETTLED_SECONDS, true);
          if (current.plan?.type === 'TRANSCODE') void requestSource(aim);
          else setSeekRequest(requestSeek(aim));
          return;
        }
      }

      const correction = follower.current.correction(clock, current.positionSeconds, Date.now());

      if (correction.type === 'SEEK') {
        const aim = correction.toSeconds + seekLeadMs.current / 1000;
        setPositionSeconds(aim);
        setSpeed(1);
        expectSeek(aim, PARTY_SEEK_SETTLED_SECONDS, true);

        // A transcode holds only the part of the file after its start offset, so
        // a jump outside it has to be re-encoded from the new point rather than
        // seeked locally — and asking the current stream to seek as well would
        // move it somewhere meaningless before the new one replaces it.
        if (current.plan?.type === 'TRANSCODE') {
          void requestSource(aim);
        } else {
          setSeekRequest(requestSeek(aim));
        }
      } else if (correction.type === 'RATE') {
        setSpeed(correction.speed);
      }
    },
    [requestSeek, expectSeek, requestSource],
  );

  /**
   * Keeps the party's clock honest about what the host is doing.
   *
   * The play/pause button is not the only thing that starts a film — the player
   * autoplays as soon as the source arrives. Without this the host watched
   * happily while the party's clock stayed PAUSED, so every follower sat frozen
   * on the first frame.
   *
   * Keyed on intent rather than `actuallyPlaying`: buffering makes the latter
   * false several times a minute on a tunnelled connection, and announcing a
   * pause each time would yo-yo everybody else.
   */
  const announceHostPlayback = useCallback(() => {
    const current = partyStateRef.current;
    if (current.party == null || !current.party.isHost) return;
    if (announcedPlaying.current === current.playing) return;
    const live = socket.current;
    if (!live) return;
    announcedPlaying.current = current.playing;
    if (current.playing) live.sendPlay(current.positionSeconds);
    else live.sendPause(current.positionSeconds);
  }, []);

  const onPartyEvent = useCallback(
    (event: PartyEvent) => {
      switch (event.type) {
        case 'CLOCK': {
          follower.current.onFrame(event.clock, Date.now());
          setParty((current) => (current ? { ...current, connected: true } : current));
          // Only a follower is told who did it: "ME STARTED IT" over your own
          // film tells you something you already know.
          const current = partyStateRef.current;
          if (current.party?.isHost === false && event.by && event.kind !== 'TICK') {
            const verb =
              event.kind === 'PLAY' ? 'started it' : event.kind === 'PAUSE' ? 'paused' : 'skipped';
            showPartyNote(`${event.by} ${verb}`);
          }
          applyPartyClock(event.clock);
          break;
        }

        // Sent rather than closing the socket. A member's stray control is the
        // usual cause, and the party carries on.
        case 'ITEM_CHANGED': {
          /*
           * The host moved the party onto something else.
           *
           * Only members act. The host is already showing it — sending the
           * frame is what they did when they got here — and moving them again
           * would replace the screen they are standing on.
           */
          const current = partyRef.current;
          if (current != null && !current.isHost && event.mediaItemId !== titleId) {
            if (event.by != null) showPartyNote(`${event.by} changed the track`);
            setPartyMovedTo(event.mediaItemId);
          }
          break;
        }

        case 'CHAT':
          setParty((current) =>
            current == null
              ? current
              : {
                  ...current,
                  chat: [...current.chat, event.message],
                  // A message arriving while the sheet is open is already read.
                  unreadChat: chatOpenRef.current ? 0 : current.unreadChat + 1,
                },
          );
          break;

        case 'CHAT_HISTORY':
          // What was said before this device connected. Replaces rather than
          // appends: it is the whole conversation, not a continuation of one.
          setParty((current) =>
            current == null ? current : { ...current, chat: event.messages, unreadChat: 0 },
          );
          break;

        case 'REFUSED':
          if (event.message) showPartyNote(event.message);
          break;

        case 'ENDED':
          setPlaying(false);
          if (event.reason) showPartyNote(event.reason);
          closeSocket.current?.();
          break;

        case 'DISCONNECTED':
          setParty((current) => (current ? { ...current, connected: false } : current));
          break;

        // The list itself belongs to the lobby. Who just left does not: the host
        // is in here watching, and somebody slipping out silently is the one
        // thing about a party you cannot see from the picture.
        case 'MEMBERS': {
          // Kept on the state now as well as compared: the eye beside the
          // transport reads it, so the host can ask "is anyone still here"
          // without leaving what they are playing.
          setParty((live) => (live == null ? live : { ...live, members: event.members }));
          const gone = departures(partyMembers.current, event.members);
          partyMembers.current = event.members;
          const note = departureNote(gone);
          if (note) showPartyNote(note);
          break;
        }

        case 'PENDING':
          // The door is the lobby's business — only the host can answer it, and
          // they are watching a film.
          break;
      }
    },
    [applyPartyClock, showPartyNote],
  );

  useEffect(() => {
    if (partyCode == null || remote == null) return;
    let cancelled = false;

    void (async () => {
      let joined;
      try {
        joined = await remote.joinParty(partyCode);
      } catch {
        return;
      }
      if (cancelled || !alive.current) return;

      setParty({
        code: joined.code,
        isHost: joined.youAreHost,
        connected: false,
        note: null,
        chat: [],
        unreadChat: 0,
        members: joined.members,
        membersOpen: false,
      });
      partyMembers.current = joined.members;
      // A member must not start playing on its own: the party's clock says where
      // everyone is, and the first frame will set it.
      if (!joined.youAreHost) setPlaying(false);

      const token = remote.socketToken();
      if (!token) return;
      const live = remote.partySocket();
      socket.current = live;

      /*
       * The route carries the party through a track change, so a new join is
       * also how the host says "we are on this one now".
       *
       * Harmless on the first join: the server ignores a change to the item it
       * is already on. Host only — it refuses the frame from anyone else — and
       * sent from here, where the player is already showing the new track, so
       * it goes out once the change is real rather than while it is being
       * attempted.
       *
       * Without it a music party silently split: the host's queue moved on and
       * everybody else stayed on the song the party was created with.
       */
      if (joined.youAreHost) live.sendItem(titleId);
      closeSocket.current = live.connect(joined.code, token, onPartyEvent);
    })();

    return () => {
      cancelled = true;
      closeSocket.current?.();
      socket.current?.disconnect();
      socket.current = null;
      if (noteTimer.current) clearTimeout(noteTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyCode, remote]);

  /**
   * Everyone reports every few seconds. From the host it re-anchors the party to
   * their real position; from a member it only records how far off they are,
   * which is the drift the lobby's member list shows.
   */
  useEffect(() => {
    if (party == null) return;
    const timer = setInterval(() => {
      const current = partyStateRef.current;
      // Also the safety net for autoplay, which starts the film with no button
      // press to hang an announcement off.
      announceHostPlayback();
      socket.current?.sendReport(
        current.positionSeconds,
        current.playing && !current.actuallyPlaying,
      );
    }, REPORT_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [party, announceHostPlayback]);

  const togglePlayPause = useCallback(() => {
    /*
     * A member cannot drive the party. Refused here rather than sent and
     * refused, which keeps the picture from jumping and coming back.
     *
     * Said out loud, though. A control that does nothing at all reads as a
     * broken button, and somebody who cannot tell "this is the host's to do"
     * from "this app is stuck" reaches for the second explanation — which
     * usually means leaving the party.
     */
    if (isFollower()) {
      showPartyNote('The host controls this party');
      showControls();
      return;
    }
    setPlaying((p) => !p);
    showControls();
  }, [isFollower, showPartyNote, showControls]);

  // Announced from an effect rather than inside the toggle: `setPlaying` is
  // asynchronous, so reading the new value inside the handler would send the old
  // one and leave the party a beat behind.
  useEffect(() => {
    announceHostPlayback();
  }, [playing, announceHostPlayback]);

  const toggleNightMode = useCallback(() => {
    setNightMode((n) => !n);
    showControls();
  }, [showControls]);

  /**
   * Locks the picture to landscape, or back to portrait.
   *
   * The second state used to be AUTO — hand rotation back to the sensor — which
   * reads as a broken button. A phone flat on a table has no meaningful sensor
   * reading, so it simply stayed in landscape: press once, it turns; press
   * again, nothing happens. So the button is a lock with two definite ends.
   */
  const toggleOrientation = useCallback(() => {
    setOrientation((o) => (o === 'LANDSCAPE' ? 'PORTRAIT' : 'LANDSCAPE'));
    showControls();
  }, [showControls]);

  const toggleControls = useCallback(() => {
    if (controlsVisible) {
      setControlsVisible(false);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    } else {
      showControls();
    }
  }, [controlsVisible, showControls]);

  const onScrubbingChange = useCallback(
    (next: boolean) => {
      setScrubbing(next);
      // Controls must not vanish mid-drag.
      if (next) {
        if (hideTimer.current) clearTimeout(hideTimer.current);
      } else {
        scheduleHideControls();
      }
    },
    [scheduleHideControls],
  );

  const openSheet = useCallback(
    (next: PlayerSheet | null) => {
      setSheet(next);
      if (next == null) scheduleHideControls();
      else if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [scheduleHideControls],
  );

  /**
   * What else there is to play after this one.
   *
   * The library's music, newest first, with the current track taken out. Not an
   * album's track listing: an album needs a query the server has no endpoint
   * for, and most of what is on this disk is loose singles with an album tag
   * that names the film they came from rather than a record.
   *
   * Loaded once, silently. A failure leaves the list empty, which hides the
   * button — a queue that cannot be filled is better absent than present and
   * apologising.
   */
  async function loadUpNext(current: Title): Promise<void> {
    let tracks: Title[] = [];
    try {
      tracks = await repository.browse({ ...DefaultLibraryFilters, category: 'MUSIC' });
    } catch {
      tracks = [];
    }
    // Referenced so the loader keeps its parameter honest even when the list
    // comes back without the current track in it at all.
    void current;
    if (!alive.current) return;
    setMusicTracks(tracks);
  }

  /**
   * Toggles the like on what is playing, moving the heart before the server
   * answers.
   *
   * The same optimistic bookkeeping the detail screen does, for the same reason:
   * this is one tap on something already on screen, and a heart that waits a
   * tunnel's round trip to fill reads as a dead control. A refusal puts it back.
   */
  const toggleLike = useCallback(async () => {
    if (!remote) return;
    const current = contentRef.current;
    if (current.type !== 'LOADED') return;
    const title = current.data.title;
    const before = title.engagement;
    const wanted = !before.likedByMe;

    const setEngagement = (engagement: Engagement) =>
      setContent((state) =>
        state.type === 'LOADED'
          ? {
              ...state,
              data: { ...state.data, title: { ...state.data.title, engagement } },
            }
          : state,
      );

    setEngagement({
      ...before,
      likedByMe: wanted,
      likes: Math.max(0, before.likes + (wanted ? 1 : -1)),
    });

    try {
      const fresh = await remote.setLiked(title.id, wanted);
      if (alive.current) setEngagement(fresh);
    } catch {
      if (alive.current) setEngagement(before);
    }
  }, [remote]);

  const playingId = content.type === 'LOADED' ? content.data.title.id : null;
  /** What the sheet lists: everything else, in the library's own order. */
  const upNext = musicTracks.filter((track) => track.id !== playingId);
  /**
   * The row after this one, or null at the end.
   *
   * Deliberately does not wrap: a library that starts again from the top after
   * forty minutes is one nobody asked to keep going.
   */
  const playingIndex = musicTracks.findIndex((track) => track.id === playingId);
  const nextTrack = playingIndex >= 0 ? (musicTracks[playingIndex + 1] ?? null) : null;

  const sendChat = useCallback((text: string) => {
    const said = text.trim();
    if (said === '') return;
    // Nothing is shown until the server echoes it back. That costs a round trip
    // on a line already carrying the clock, and buys the one thing that matters
    // in a shared room: everybody sees the same conversation in the same order.
    socket.current?.sendChat(said);
  }, []);

  const openChat = useCallback((open: boolean) => {
    setChatOpen(open);
    if (open) setParty((current) => (current == null ? current : { ...current, unreadChat: 0 }));
  }, []);

  const setMembersOpen = useCallback((open: boolean) => {
    setParty((current) => (current == null ? current : { ...current, membersOpen: open }));
  }, []);

  /**
   * Ends the party from here, without stopping the music.
   *
   * The host ends it for everyone and a member only leaves — the same split the
   * lobby makes: a party is the host's, and a guest walking out is not
   * everybody else's evening over.
   *
   * Playback is deliberately untouched. Ending a party is a statement about who
   * else is listening, not about whether to carry on, and a control that
   * silently stopped the music would be one nobody dared press.
   */
  const endParty = useCallback(async () => {
    const live = partyRef.current;
    if (remote == null || live == null) return;
    try {
      await remote.leaveParty(live.code, live.isHost);
    } catch {
      // The socket is closed either way: a party this device cannot leave
      // cleanly is still one it has left.
    }
    socket.current?.disconnect();
    socket.current = null;
    // Dropped from the state as well as the wire, so the eye and the chat go
    // with it rather than lingering over a party that is over.
    if (alive.current) setParty(null);
  }, [remote]);

  /**
   * Asks for the same film again, without the codec that gave no picture.
   *
   * Done rather than offered. The first version put a button here, and that was
   * wrong: nothing about how a file is tagged inside its container is something
   * a person should have to know, and a button reading "Convert it" asks them to
   * diagnose a codec. It resumes where they were, so the cost is a few seconds
   * of buffering and a line saying what happened.
   *
   * Returns false when this codec has already been refused, which is what keeps
   * a file the server cannot fix from looping.
   */
  const refuseVideoCodec = useCallback(
    (codec: string): boolean => {
      const named = codec.trim().toLowerCase();
      if (named === '' || stateRef.current.refusedVideoCodecs.includes(named)) return false;
      const next = [...stateRef.current.refusedVideoCodecs, named];
      stateRef.current.refusedVideoCodecs = next;
      setRefusedVideoCodecs(next);
      void requestSource(positionSeconds);
      return true;
    },
    [positionSeconds, requestSource],
  );

  return {
    content,
    /**
     * The library's music in order, current track included.
     *
     * Distinct from `upNext`, and the distinction is load-bearing: the sheet
     * wants everything *except* what is playing, and the queue wants everything
     * *including* it, because "what follows this" can only be answered by a list
     * that contains this. Handing the queue the sheet's list left it unable to
     * find the current track at all, so it reported nothing before and nothing
     * after — a dead next button and no auto-advance.
     */
    musicTracks,
    refusedVideoCodecs,
    refuseVideoCodec,
    partyMovedTo,
    clearPartyMoved: () => setPartyMovedTo(null),
    setMembersOpen,
    endParty: () => void endParty(),
    chatOpen,
    openChat,
    sendChat,
    upNext,
    nextTrack,
    queueOpen,
    setQueueOpen,
    toggleLike: () => void toggleLike(),
    source,
    sourceError,
    positionSeconds,
    durationSeconds,
    playing,
    actuallyPlaying,
    controlsVisible,
    scrubbing,
    scrubPreviewSeconds,
    seekRequest,
    nightMode,
    sheet,
    maxHeight,
    subtitleTrack,
    audioTrack,
    orientation,
    party,
    speed,
    plan,
    planPillText: planPillText(plan),
    onPlayerProgress,
    skip,
    seekTo,
    setMaxHeight,
    setSubtitleTrack,
    setAudioTrack,
    togglePlayPause,
    toggleNightMode,
    toggleOrientation,
    toggleControls,
    onScrubbingChange,
    onScrubPreview: setScrubPreviewSeconds,
    setSheet: openSheet,
  };
}

/** `DIRECT PLAY · 1080p · 18.4 Mbps` */
export function planPillText(plan: PlaybackPlan): string | null {
  switch (plan.type) {
    case 'DIRECT_PLAY': {
      const parts = ['DIRECT PLAY'];
      if (plan.resolution) parts.push(plan.resolution);
      if (plan.bitrateMbps != null) parts.push(`${plan.bitrateMbps} Mbps`);
      return parts.join(' · ');
    }
    case 'TRANSCODE': {
      const parts = ['TRANSCODING'];
      if (plan.toResolution) parts.push(plan.toResolution);
      return parts.join(' · ');
    }
    case 'UNKNOWN':
      return null;
  }
}
