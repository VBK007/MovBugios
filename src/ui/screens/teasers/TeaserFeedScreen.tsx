import { VideoPlayerStatus, VideoView, useVideoPlayer } from 'expo-video';
import { useEventListener } from 'expo';
import { useIsFocused } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Amber,
  AmberInk,
  Ink,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  Space,
  TowerType,
} from '@/theme';
import { Motion } from '@/theme/motion';
import { withAlpha } from '@/ui/color';
import { Engagement, Title } from '@/domain/model/media';
import { Teaser, engagementCountLabel, teaserTimecode } from '@/domain/model/teaser';
import { Loading, UiState, loadState } from '@/ui/uiState';
import { useActiveProfileId, useRepository } from '@/ui/hooks';
import { RemoteTowerRepository } from '@/data/remote/remoteTowerRepository';
import { MusicPlayback } from '@/player/musicPlayback';
import { UiStateError } from '@/ui/components/ServerError';
import { ChevronGlyph, CommentGlyph, HeartGlyph, PlayGlyph } from '@/ui/components/Glyphs';
import { DataMeta } from '@/ui/components/Primitives';
import { RatingPill } from '@/ui/components/TitleFacts';

/**
 * How far either side of the settled page a clip gets a player at all.
 *
 * Three players exist at once: the settled page and its two neighbours, with only
 * the middle one playing. A neighbour is prepared and filling, so a swipe lands
 * on a clip that already has frames rather than on black.
 *
 * Anything further out has no player. A decoder per page for a feed of thirty-six
 * would be neither affordable nor useful — nobody swipes four ahead faster than
 * one clip can buffer.
 */
const PREPARE_WINDOW = 1;

/**
 * How a player set to a clip differs from one set to a film.
 *
 * `waitsToMinimizeStalling` is the one that matters. Left on, AVPlayer holds
 * back the first frame until it judges the whole thing can run without stalling
 * — sensible for a two-hour film, and on a 24-second clip it is a visible pause
 * on every single swipe. Off, it shows what it has and keeps fetching, which is
 * the right trade when the worst case is a hiccup in something that ends in half
 * a minute.
 *
 * The forward buffer is capped for the matching reason: there is no point
 * fetching twenty seconds ahead of a clip that is twenty-four seconds long, and
 * those bytes are better spent on the neighbours being prepared beside it.
 *
 * The Android build also keeps a disk cache of clip bytes and warms the three
 * pages beyond the players. Neither is portable here: AVPlayer will not read
 * from a cache somebody else filled, so the only way to do it would be to serve
 * every byte of playback ourselves, which is an HTTP range implementation rather
 * than a cache. What iOS loses is the head start on a clip more than one swipe
 * away, and instant replay of one already seen.
 */
/**
 * How long a single tap waits to find out it was not a double.
 *
 * The single tap is necessarily a little late, because nothing can know which
 * gesture it saw until this window has passed. That delay is the price of having
 * both, and every feed with this gesture pays the same one.
 */
const DOUBLE_TAP_MS = 260;

/** How long the heart left by a double tap stays on the picture. */
const BURST_MS = 420;

const CLIP_BUFFERING = {
  waitsToMinimizeStalling: false,
  preferredForwardBufferDuration: 2,
} as const;

/**
 * Shorts: short vertical clips cut from films on the disk, one per screen.
 *
 * Every clip is a real piece of a film somebody in this house already owns, so
 * the only thing this screen sells is the film itself — which is why the film's
 * name and a button into it sit on every page.
 *
 * Ported from ui/screens/teasers/TeaserFeedScreen.kt and its ViewModel.
 */
export function TeaserFeedScreen({
  /**
   * Null for the whole library; a film's id to show only its own clips.
   *
   * The same screen either way. A film's teasers are a feed of one or two rather
   * than a different kind of thing, and the only real difference is that a
   * scoped feed has no further pages to fetch.
   */
  onlyFor,
  /**
   * What sits between the bottom of this feed and the bottom of the phone.
   *
   * Zero under the tab bar, which already clears the home indicator — adding it
   * again there lifts the caption a thumb's width off where it belongs. The
   * inset itself where this feed is the whole screen. The caller knows which it
   * is; the feed cannot tell from inside.
   */
  bottomInset = 0,
  onBack,
  onOpenTitle,
  onOpenComments,
}: {
  onlyFor: string | null;
  bottomInset?: number;
  onBack: () => void;
  onOpenTitle: (titleId: string) => void;
  onOpenComments: (titleId: string) => void;
}) {
  const repository = useRepository();
  const profileId = useActiveProfileId();
  const { width } = useWindowDimensions();
  /**
   * Whether this feed is the screen being looked at.
   *
   * A player does not stop because its screen was navigated away from — the page
   * stays mounted under the one on top of it, so the settled clip carried on
   * playing while somebody read the library. Audio from a film nobody can see is
   * the worst version of this: there is nothing on screen to pause.
   */
  const focused = useIsFocused();
  /**
   * The height of the box this feed is in, not of the window.
   *
   * These differ wherever something else takes layout space — under the tab bar
   * they differ by its whole height — and a page sized to the window there is
   * taller than the viewport showing it, so the bottom of every page (the film's
   * name, the button into it, the like and the comment) falls below the fold.
   * The paging arithmetic goes with it, drifting further out of step the further
   * down the feed you get. Measured rather than derived: nothing here needs to
   * know what is below it, only how much room it was given.
   */
  const [height, setHeight] = useState(0);

  const [state, setState] = useState<UiState<Teaser[]>>(Loading);
  /** Which clip is on screen. Only this one plays; the rest are stopped. */
  const [current, setCurrent] = useState(0);
  /**
   * The films the visible clips were cut from, by id.
   *
   * A teaser carries no rating and no counts — it is a piece of a film, and all
   * of that belongs to the film. Fetched per clip as it comes into range and
   * kept, because a feed people swipe back and forth through would otherwise
   * refetch the same handful of films all afternoon.
   */
  const [films, setFilms] = useState<Record<string, Title>>({});

  const alive = useRef(true);
  const page = useRef(0);
  /** The last page came back short, so there is nothing further to ask for. */
  const exhausted = useRef(false);
  const loadingMore = useRef(false);
  const loadingFilms = useRef(new Set<string>());
  /**
   * The shuffle this scroll was dealt from, held for the life of the scroll.
   *
   * Null until the first page answers, and null again on a reload — one seed is
   * one permutation of the feed, so keeping it across a reload would hand back
   * the same reel every time somebody opened Shorts.
   */
  const seed = useRef<number | null>(null);
  const filmsRef = useRef(films);
  filmsRef.current = films;
  const teasersRef = useRef<Teaser[]>([]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadFilm = useCallback(
    (filmId: string) => {
      if (filmsRef.current[filmId] != null || loadingFilms.current.has(filmId)) return;
      loadingFilms.current.add(filmId);
      void (async () => {
        try {
          const film = await repository.detail(filmId);
          if (alive.current) setFilms((all) => ({ ...all, [filmId]: film }));
        } catch {
          // Dropped either way: a film that failed once should be retried on the
          // next swipe past it rather than never again.
        }
        loadingFilms.current.delete(filmId);
      })();
    },
    [repository],
  );

  useEffect(() => {
    page.current = 0;
    exhausted.current = false;
    // Dropped, so opening the feed asks for a fresh deal. Coming back to Shorts
    // and finding the same clip on top every time is exactly what the server's
    // shuffle exists to prevent.
    seed.current = null;
    void (async () => {
      setState(Loading);
      const next = await loadState(
        async () => {
          if (onlyFor != null) return repository.teasers(onlyFor);
          const first = await repository.teaserFeed(0);
          seed.current = first.seed;
          return first.teasers;
        },
        {
          emptyWhen: (list) => list.length === 0,
          // Nothing is cut yet, which is a fact about the library rather than a
          // failure — teasers are made deliberately, one at a time.
          emptyMessage:
            onlyFor == null
              ? 'No teasers have been cut from this library yet.'
              : 'No teaser has been cut from this one yet.',
        },
      );
      if (!alive.current) return;
      setState(next);
      setCurrent(0);
      const loaded = next.type === 'LOADED' ? next.data : [];
      teasersRef.current = loaded;
      // A film's clips arrive in one unpaged list, so there is never a second
      // page to ask for.
      exhausted.current = onlyFor != null || loaded.length === 0;
      // The first two films, for the same reason a page change fetches ahead:
      // the counts under the opening clip should not arrive after somebody has
      // already looked at them.
      loaded.slice(0, 2).forEach((teaser) => loadFilm(teaser.titleId));
    })();
  }, [repository, onlyFor, profileId, loadFilm]);

  const loadMore = useCallback(() => {
    if (loadingMore.current || exhausted.current) return;
    const existing = teasersRef.current;
    if (existing.length === 0) return;
    loadingMore.current = true;
    void (async () => {
      let next: Teaser[] = [];
      try {
        // The seed is what makes this the next page of the same deal rather than
        // page two of a different shuffle. Without it the server reshuffles per
        // request, so this page would repeat clips already scrolled past and skip
        // others for good.
        next = (await repository.teaserFeed(page.current + 1, seed.current)).teasers;
      } catch {
        next = [];
      }
      page.current += 1;
      loadingMore.current = false;
      if (!alive.current) return;
      // An empty page is the end. The duplicate filter below stays even with
      // the seed carried: membership can still shift under a live feed when a
      // clip is published mid-scroll, and a repeated id would otherwise appear
      // twice in the pager.
      exhausted.current = next.length === 0;
      const fresh = next.filter((teaser) => !existing.some((e) => e.id === teaser.id));
      if (fresh.length === 0) return;
      const merged = [...existing, ...fresh];
      teasersRef.current = merged;
      setState({ type: 'LOADED', data: merged });
    })();
  }, [repository]);

  const onPageChange = useCallback(
    (index: number) => {
      setCurrent(index);
      const loaded = teasersRef.current;
      // Two from the end, so the next page is there before the swipe that needs
      // it — a feed that pauses to fetch at the bottom of the stack reads as the
      // end of the feed.
      if (index >= loaded.length - 2) loadMore();

      // The same window the players use: this page and its neighbours. Their
      // counts should be there before the swipe, for the same reason their video
      // should be.
      for (let near = index - 1; near <= index + 1; near++) {
        const teaser = loaded[near];
        if (teaser) loadFilm(teaser.titleId);
      }
    },
    [loadMore, loadFilm],
  );

  /**
   * Toggles the like, moving the number before the server answers.
   *
   * Same bargain as the detail screen: this is one tap on something already on
   * screen, and waiting a tunnel's round trip to redraw a heart over a playing
   * clip reads as a dead control.
   */
  const toggleLike = useCallback(
    (filmId: string) => {
      const remote = repository instanceof RemoteTowerRepository ? repository : null;
      if (!remote) return;
      const film = filmsRef.current[filmId];
      if (!film) return;
      const before = film.engagement;
      const wanted = !before.likedByMe;

      const set = (engagement: Engagement) =>
        setFilms((all) => {
          const existing = all[filmId];
          if (!existing) return all;
          return { ...all, [filmId]: { ...existing, engagement } };
        });

      set({
        ...before,
        likedByMe: wanted,
        likes: Math.max(0, before.likes + (wanted ? 1 : -1)),
      });

      void (async () => {
        try {
          const fresh = await remote.setLiked(filmId, wanted);
          if (alive.current) set(fresh);
        } catch {
          if (alive.current) set(before);
        }
      })();
    },
    [repository],
  );

  const data = state.type === 'LOADED' ? state.data : [];

  return (
    <View
      style={{ flex: 1, backgroundColor: Ink }}
      onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
    >
      {state.type === 'LOADING' && <Message heading="Looking for teasers…" />}
      {(state.type === 'EMPTY' || state.type === 'ASLEEP' || state.type === 'OFFLINE') && (
        <View style={styles.centredPanel}>
          <UiStateError
            state={state}
            emptyMessage={
              state.type === 'EMPTY'
                ? `${state.message} They are made one at a time, from the server.`
                : undefined
            }
          />
        </View>
      )}

      {state.type === 'LOADED' && height > 0 && (
        <FlatList
          data={data}
          keyExtractor={(teaser) => teaser.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          // One page either side stays mounted, which is what lets its player
          // exist and fill its buffer before the swipe that reveals it.
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          // On settling rather than on every frame of the drag: reacting at the
          // halfway point would tear down the player of a clip somebody is still
          // deciding whether to swipe past.
          onMomentumScrollEnd={(event) => {
            const index = Math.round(event.nativeEvent.contentOffset.y / height);
            if (index !== current) onPageChange(index);
          }}
          renderItem={({ item, index }) => (
            <TeaserPage
              teaser={item}
              film={films[item.titleId]}
              height={height}
              width={width}
              bottomInset={bottomInset}
              focused={focused}
              // Playing is for the settled page alone; loading is for it and its
              // neighbours. Separating the two is the whole of the prebuffering.
              active={index === current}
              prepared={Math.abs(index - current) <= PREPARE_WINDOW}
              onOpenTitle={onOpenTitle}
              onToggleLike={toggleLike}
              onOpenComments={onOpenComments}
            />
          )}
        />
      )}

      {/* Over the video, not above it: the clip is the whole screen, and a bar
          across the top would crop the framing somebody chose by hand. */}
      <BackButton onPress={onBack} />
    </View>
  );
}

function TeaserPage({
  teaser,
  film,
  height,
  width,
  bottomInset,
  focused,
  active,
  prepared,
  onOpenTitle,
  onToggleLike,
  onOpenComments,
}: {
  teaser: Teaser;
  film?: Title;
  height: number;
  width: number;
  bottomInset: number;
  focused: boolean;
  active: boolean;
  prepared: boolean;
  onOpenTitle: (titleId: string) => void;
  onToggleLike: (titleId: string) => void;
  onOpenComments: (titleId: string) => void;
}) {
  const player = useVideoPlayer(
    // Null beyond the window: no connection is opened for a clip nobody is near.
    prepared ? { uri: teaser.url, headers: teaser.headers } : null,
    (instance) => {
      // Five to thirty seconds long: a clip that plays once and freezes on its
      // last frame reads as broken, and there is no next thing to advance to
      // because the feed advances by swipe.
      instance.loop = true;
      instance.muted = false;
      instance.bufferOptions = CLIP_BUFFERING;
    },
  );

  const [status, setStatus] = useState<VideoPlayerStatus>('idle');
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * Held by a tap, rather than by the swipe.
   *
   * Separate from `active`, which is about which page is settled: a clip can be
   * the settled one and still be stopped because somebody asked for it to be.
   * Reset when the page stops being active, so swiping away and back plays.
   */
  const [held, setHeld] = useState(false);
  /**
   * Counts double taps, so a repeat restarts the burst.
   *
   * A count rather than a flag because the same gesture repeated is still worth
   * acknowledging: a boolean already true cannot restart the animation, and the
   * second double tap would do nothing visible.
   */
  const [burst, setBurst] = useState(0);
  const lastTap = useRef(0);
  const pendingTap = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pendingTap.current != null) clearTimeout(pendingTap.current);
    };
  }, []);

  useEventListener(player, 'statusChange', ({ status: next, error }) => {
    setStatus(next);
    setFailure(error?.message ?? null);
  });

  // A neighbour prepares without playing, so it has frames waiting rather than a
  // socket to open when it is swiped to. This effect is what actually starts and
  // stops a page as it becomes the settled one and stops being it.
  useEffect(() => {
    if (!prepared) return;
    if (active && focused && !held) player.play();
    else player.pause();
  }, [active, prepared, focused, held, player]);

  useEffect(() => {
    if (!active) setHeld(false);
  }, [active]);

  /*
   * A clip has its own soundtrack, so the music is silenced rather than left to
   * talk over it. Here, where video actually starts, rather than keyed on the
   * route: the music player shares a route with the film player, and pausing on
   * that would silence the music screen itself.
   */
  useEffect(() => {
    if (active && focused && !held) MusicPlayback.pause();
  }, [active, focused, held]);

  return (
    <View style={{ width, height, backgroundColor: Ink }}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
      />

      {/* The clip is 9:16 and the phone is taller, so there are bands above and
          below. The scrim sits in them and under the caption either way. */}
      <LinearGradient
        colors={[
          withAlpha(Ink, 0.55),
          withAlpha(Ink, 0),
          withAlpha(Ink, 0),
          withAlpha(Ink, 0.88),
        ]}
        locations={[0, 0.25, 0.62, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/*
       * A clip swiped to before its buffer filled is a black rectangle with a
       * film's name under it, which reads as broken rather than as loading.
       */}
      {active && status === 'loading' && failure == null && (
        <View style={styles.centred} pointerEvents="none">
          <DataMeta text="LOADING" color={OnInkFaint} technical={false} />
        </View>
      )}

      {failure != null && (
        <View style={styles.centred} pointerEvents="none">
          <Text
            style={[TowerType.bodyProse, { color: OnInkMuted, textAlign: 'center' }]}
          >
            {failure}
          </Text>
        </View>
      )}

      {/*
       * One tap holds the clip, two like it.
       *
       * No ripple and no highlight: this is the video, not a button, and a grey
       * circle blooming out of the middle of a film is the wrong feedback — the
       * frame stopping is the feedback. Drawn before the caption and the rail so
       * their own taps still reach them.
       */}
      {active && focused && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={held ? 'Play' : 'Pause'}
          onPress={() => {
            const now = Date.now();
            if (now - lastTap.current < DOUBLE_TAP_MS) {
              // The second tap of a pair: cancel the hold the first one queued.
              if (pendingTap.current != null) {
                clearTimeout(pendingTap.current);
                pendingTap.current = null;
              }
              lastTap.current = 0;
              /*
               * Likes, never unlikes. Two taps is a gesture people make at
               * something they enjoyed, and taking a like away because they did
               * it twice to the same clip would be the opposite of what they
               * meant. The heart in the rail is how you take one back.
               */
              if (film?.engagement.likedByMe !== true) onToggleLike(teaser.titleId);
              setBurst((count) => count + 1);
              return;
            }
            lastTap.current = now;
            pendingTap.current = setTimeout(() => {
              pendingTap.current = null;
              setHeld((current) => !current);
            }, DOUBLE_TAP_MS);
          }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Shown whether or not the like changed. It acknowledges the gesture, not
          the state — a double tap on something already liked that produced
          nothing at all would read as the screen having missed it. */}
      <LikeBurst trigger={burst} />

      <PausedMark
        // Never over a clip that is loading or has failed: both already have
        // something to say in the same spot, and a play mark over either would
        // be a lie about what a tap would do.
        visible={active && focused && held && status !== 'loading' && failure == null}
      />

      <Caption
        teaser={teaser}
        film={film}
        bottomInset={bottomInset}
        onOpenTitle={() => onOpenTitle(teaser.titleId)}
      />

      {/* Down the right edge, clear of the caption. These belong to the film
          rather than the clip — a teaser has no rating and nobody comments on
          twenty-four seconds — so they are absent until the film arrives. */}
      {film && (
        <ActionRail
          engagement={film.engagement}
          bottomInset={bottomInset}
          onToggleLike={() => onToggleLike(teaser.titleId)}
          onOpenComments={() => onOpenComments(teaser.titleId)}
        />
      )}
    </View>
  );
}

/**
 * The heart that answers a double tap.
 *
 * Large, brief, and gone — it is a receipt for a gesture rather than a control,
 * so it is deliberately not something you can hit. It grows from nothing, holds
 * for a beat and fades while still growing, which is what makes it read as an
 * impression left on the picture rather than as a dialog that opened and shut.
 */
function LikeBurst({ trigger }: { trigger: number }) {
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (trigger === 0) return;
    scale.setValue(0.4);
    opacity.setValue(0);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.delay(BURST_MS - 120),
        Animated.timing(opacity, { toValue: 0, duration: 380, useNativeDriver: true }),
      ]),
      // Still growing as it fades, which is what makes it an impression left on
      // the picture rather than a thing that opened and shut.
      Animated.timing(scale, {
        toValue: 1.25,
        duration: BURST_MS + 380,
        easing: Motion.Enter,
        useNativeDriver: true,
      }),
    ]).start();
  }, [trigger, scale, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.burst, { opacity, transform: [{ scale }] }]}
    >
      <HeartGlyph color={Amber} size={120} filled />
    </Animated.View>
  );
}

/**
 * The mark that says a clip is being held, not broken.
 *
 * Shown only while paused, which makes it its own explanation: nothing sits over
 * a playing picture, and the thing on screen when playback stops is the way to
 * start it again. It fades rather than appears, and grows very slightly as it
 * goes, so pausing reads as the frame settling rather than as a dialog opening.
 *
 * Kept mounted at zero opacity while playing rather than removed: this sits in
 * the middle of a video redrawing sixty times a second, and adding and removing
 * a node there on every tap is work for no gain.
 */
function PausedMark({ visible }: { visible: boolean }) {
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: Motion.Fast,
      easing: Motion.Enter,
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pausedMark,
        {
          opacity: progress,
          transform: [
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
          ],
        },
      ]}
    >
      {/* Nudged right, because a triangle's visual centre is left of its box. */}
      <PlayGlyph color={OnInk} size={36} />
    </Animated.View>
  );
}

/**
 * Like and comment, stacked at the thumb's edge.
 *
 * A row under the title — which is how the detail screen does it — would fight
 * the "Watch the film" button for the one part of the picture the scrim already
 * covers. Vertical against the right edge is where a thumb rests on a feed, and
 * it leaves the frame itself uncovered.
 */
function ActionRail({
  engagement,
  bottomInset,
  onToggleLike,
  onOpenComments,
}: {
  engagement: Engagement;
  bottomInset: number;
  onToggleLike: () => void;
  onOpenComments: () => void;
}) {
  return (
    <View style={[styles.actionRail, { paddingBottom: 26 + bottomInset }]}>
      <Action
        label={engagementCountLabel(engagement.likes)}
        tint={engagement.likedByMe ? Amber : OnInk}
        clickLabel={engagement.likedByMe ? 'Unlike' : 'Like'}
        onPress={onToggleLike}
        glyph={(tint) => <HeartGlyph color={tint} size={25} filled={engagement.likedByMe} />}
      />
      <Action
        label={engagementCountLabel(engagement.comments)}
        tint={OnInk}
        clickLabel="Comments"
        onPress={onOpenComments}
        glyph={(tint) => <CommentGlyph color={tint} size={25} />}
      />
    </View>
  );
}

function Action({
  label,
  tint,
  clickLabel,
  onPress,
  glyph,
}: {
  label: string;
  tint: string;
  clickLabel: string;
  onPress: () => void;
  glyph: (tint: string) => React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={clickLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
    >
      {glyph(tint)}
      <Text style={[TowerType.navLabel, { color: tint }]}>{label}</Text>
    </Pressable>
  );
}

function Caption({
  teaser,
  film,
  bottomInset,
  onOpenTitle,
}: {
  teaser: Teaser;
  film?: Title;
  bottomInset: number;
  onOpenTitle: () => void;
}) {
  const timecode = teaserTimecode(teaser);
  const line = [teaser.label, timecode].filter((part) => part != null).join(' · ');

  return (
    <View style={[styles.caption, { paddingBottom: 26 + bottomInset }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text
          style={[TowerType.titleSection, { color: OnInk, flexShrink: 1 }]}
          numberOfLines={2}
        >
          {teaser.titleName}
        </Text>
        {/* Only where the film was matched. An unrated file showing "★ —" would
            be inventing a fact about it. */}
        {film?.rating != null && <RatingPill rating={film.rating} />}
      </View>

      {/* What the cut is of, and where in the film it came from — the second is
          the honest part: this is a piece of the film, not an advert made for it. */}
      {line !== '' && <DataMeta text={line} color={OnInkFaint} technical={false} />}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Watch ${teaser.titleName}`}
        onPress={onOpenTitle}
        style={({ pressed }) => [styles.watch, { opacity: pressed ? 0.85 : 1 }]}
      >
        <PlayGlyph color={AmberInk} size={13} />
        <Text style={[TowerType.buttonLabel, { color: AmberInk }]}>Watch the film</Text>
      </Pressable>
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      style={[styles.back, { top: insets.top + 8 }]}
    >
      <ChevronGlyph rotation={180} color={OnInk} size={18} />
    </Pressable>
  );
}

function Message({ heading, body }: { heading: string; body?: string }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: Space.Screen }}>
      <Text style={[TowerType.titleSection, { color: OnInk }]}>{heading}</Text>
      {body != null && (
        <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 8 }]}>{body}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centred: {
    position: 'absolute',
    left: Space.Screen,
    right: Space.Screen,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The feed is full-bleed, so its failure panel is centred in the frame
  // rather than sitting under a heading the way a list screen would.
  centredPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burst: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -60,
  },
  pausedMark: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -44,
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 5,
    // Dark rather than amber: amber is for things you are being asked to do, and
    // this is a statement about what the clip is doing.
    backgroundColor: withAlpha(Ink, 0.52),
  },
  back: {
    position: 'absolute',
    left: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(Ink, 0.5),
  },
  actionRail: {
    position: 'absolute',
    right: 10,
    bottom: 0,
    alignItems: 'center',
    gap: 18,
  },
  action: {
    alignItems: 'center',
    gap: 5,
    borderRadius: Radius.Default,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  caption: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    // Clear of the action rail down the right edge, so a long film name wraps
    // rather than running under the heart.
    width: '76%',
    paddingLeft: Space.Screen,
    gap: 10,
  },
  watch: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 9,
    borderRadius: Radius.Pill,
    backgroundColor: Amber,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
});
