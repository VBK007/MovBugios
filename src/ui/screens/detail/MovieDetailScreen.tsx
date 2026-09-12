import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HeroScrim, Ink, OnInk, OnInkMuted, Space, TowerType } from '@/theme';
import { DefaultLibraryFilters } from '@/domain/model/library';
import {
  Title,
  audioShortLabel,
  heroFacts,
  lacksMetadata,
  subtitleDisplayName,
} from '@/domain/model/media';
import { formatClock } from '@/domain/model/people';
import { Loading, UiState, dataOrNull, loadState } from '@/ui/uiState';
import { gradientFor, withAlpha } from '@/ui/color';
import { useRepository } from '@/ui/hooks';
import { useComments } from '@/ui/comments/useComments';
import { CommentsSheet } from '@/ui/comments/CommentsSheet';
import { RemoteTowerRepository } from '@/data/remote/remoteTowerRepository';
import { usePlayGate } from '@/ui/playGate';
import { artSource } from '@/ui/imageSource';
import {
  CastGlyph,
  ChevronGlyph,
  DownloadGlyph,
  TogetherGlyph,
} from '@/ui/components/Glyphs';
import {
  AmberButton,
  DataLabel,
  DataValue,
  OutlineIconButton,
  WordChip,
} from '@/ui/components/Primitives';
import { EngagementRow } from '@/ui/components/Engagement';
import { PlaybackPlanCard } from '@/ui/components/PlaybackPlanCard';
import { PosterCard } from '@/ui/components/PosterCard';
import { Skeleton } from '@/ui/components/Rails';
import {
  CastRail,
  CertificationPill,
  ImdbMark,
  NoMetadataNote,
  RatingPill,
  Storyline,
} from '@/ui/components/TitleFacts';

/** Ported from ui/screens/detail/MovieDetailScreen.kt. */
export function MovieDetailScreen({
  titleId,
  onBack,
  onOpenTitle,
}: {
  titleId: string;
  onBack: () => void;
  onOpenTitle: (titleId: string) => void;
}) {
  const repository = useRepository();
  const [title, setTitle] = useState<UiState<Title>>(Loading);
  const [alsoOnDisk, setAlsoOnDisk] = useState<Title[]>([]);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * The count beside the poster would otherwise go stale the moment somebody
   * posts, and refetching the whole title to move a number by one is the thing
   * the server's own engagement payload exists to avoid.
   */
  const bumpCommentCount = useCallback((by: number) => {
    setTitle((current) =>
      current.type === 'LOADED'
        ? {
            ...current,
            data: {
              ...current.data,
              engagement: {
                ...current.data.engagement,
                comments: Math.max(0, current.data.engagement.comments + by),
              },
            },
          }
        : current,
    );
  }, []);

  const comments = useComments(titleId, bumpCommentCount);
  const gate = usePlayGate();

  /**
   * Optimistic: the heart fills under the thumb and the server's own count
   * replaces the guess a moment later. A like that waits for a round trip reads
   * as a tap that missed.
   */
  const toggleLike = useCallback(async () => {
    if (title.type !== 'LOADED') return;
    const current = title.data.engagement;
    const next = !current.likedByMe;
    setTitle((t) =>
      t.type === 'LOADED'
        ? {
            ...t,
            data: {
              ...t.data,
              engagement: {
                ...current,
                likedByMe: next,
                likes: Math.max(0, current.likes + (next ? 1 : -1)),
              },
            },
          }
        : t,
    );
    if (!(repository instanceof RemoteTowerRepository)) return;
    try {
      const fresh = await repository.setLiked(titleId, next);
      setTitle((t) =>
        t.type === 'LOADED'
          ? {
              ...t,
              data: {
                ...t.data,
                engagement: {
                  ...t.data.engagement,
                  likes: fresh.likes,
                  likedByMe: fresh.likedByMe,
                },
              },
            }
          : t,
      );
    } catch {
      // Put the guess back. Nothing else to say — the heart simply un-fills.
      setTitle((t) =>
        t.type === 'LOADED' ? { ...t, data: { ...t.data, engagement: current } } : t,
      );
    }
  }, [repository, titleId, title]);

  const load = useCallback(async () => {
    setTitle(Loading);
    const loaded = await loadState(() => repository.detail(titleId));
    if (!alive.current) return;
    setTitle(loaded);

    const data = dataOrNull(loaded);
    if (!data) return;
    try {
      const others = await repository.browse({ ...DefaultLibraryFilters, category: data.kind });
      if (alive.current) setAlsoOnDisk(others.filter((o) => o.id !== data.id));
    } catch {
      // "Also on the disk" is a rail, not the screen. Losing it is not an error
      // worth replacing the title with.
    }
  }, [repository, titleId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: Ink }}>
      <BackButton onPress={onBack} />

      {title.type === 'LOADING' && <DetailSkeleton />}
      {title.type === 'EMPTY' && <DetailMessage heading="Not on the disk" body={title.message} />}
      {title.type === 'ASLEEP' && (
        <DetailMessage
          heading="The disk is asleep"
          body="Wake Tower from the Home tab to see this title."
        />
      )}
      {title.type === 'OFFLINE' && (
        <DetailMessage heading="Cannot reach Tower" body={title.message} />
      )}

      {title.type === 'LOADED' && (
        <DetailContent
          title={title.data}
          alsoOnDisk={alsoOnDisk}
          onDownload={() => void repository.download(title.data.id)}
          onOpenTitle={onOpenTitle}
          onToggleLike={() => void toggleLike()}
          onOpenComments={comments.open}
          onPlay={() => gate.play(title.data.id, title.data.name)}
          onWatchTogether={() => gate.host(title.data.id, title.data.name)}
        />
      )}

      {gate.sheet}

      {/*
       * Explicitly stacked over the screen. Emitting the sheet as a sibling left
       * it composed — it even fetched the thread — but never drawn, because a
       * destination's content is not guaranteed to lay its children out on top
       * of each other.
       */}
      {comments.state.open && (
        <View style={StyleSheet.absoluteFill}>
          <CommentsSheet controller={comments} />
        </View>
      )}
    </View>
  );
}

function DetailContent({
  title,
  alsoOnDisk,
  onDownload,
  onOpenTitle,
  onToggleLike,
  onOpenComments,
  onPlay,
  onWatchTogether,
}: {
  title: Title;
  alsoOnDisk: Title[];
  onDownload: () => void;
  onOpenTitle: (titleId: string) => void;
  onToggleLike: () => void;
  onOpenComments: () => void;
  onPlay: () => void;
  onWatchTogether: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <Hero title={title} />

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <AmberButton label={resumeLabel(title)} onPress={onPlay} />
        </View>
        <OutlineIconButton accessibilityLabel="Save to this phone" onPress={onDownload}>
          <DownloadGlyph color={withAlpha(OnInk, 0.8)} />
        </OutlineIconButton>
        <OutlineIconButton accessibilityLabel="Cast to a TV" onPress={() => {}}>
          <CastGlyph color={withAlpha(OnInk, 0.8)} />
        </OutlineIconButton>
        <OutlineIconButton accessibilityLabel="Watch together" onPress={onWatchTogether}>
          <TogetherGlyph color={withAlpha(OnInk, 0.8)} />
        </OutlineIconButton>
      </View>

      <EngagementRow
        engagement={title.engagement}
        onToggleLike={onToggleLike}
        onOpenComments={onOpenComments}
        style={{ paddingHorizontal: Space.Screen, paddingBottom: 18 }}
      />

      {/* The heart of the screen: what happens when you press play. */}
      <PlaybackPlanCard
        plan={title.plan}
        file={title.file}
        style={{ marginHorizontal: Space.Screen }}
      />

      {title.synopsis != null && title.synopsis.trim() !== '' && (
        <Storyline
          synopsis={title.synopsis}
          tagline={title.tagline}
          style={{ paddingHorizontal: Space.Screen, marginTop: 26 }}
        />
      )}

      {/*
       * Only past one: the first genre is already in the hero line, so a lone
       * chip repeating it is decoration rather than information.
       */}
      {title.genres.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: Space.Screen }}
          style={{ marginTop: 16, flexGrow: 0 }}
        >
          {title.genres.map((genre) => (
            <WordChip key={genre} label={genre} />
          ))}
        </ScrollView>
      )}

      {/*
       * Cast and crew, which the API has always returned and the screen showed
       * as a grey comma-separated line nobody read.
       */}
      {(title.cast.length > 0 || title.directors.length > 0) && (
        <CastRail cast={title.cast} directors={title.directors} style={{ marginTop: 26 }} />
      )}

      {title.studio != null && title.studio.trim() !== '' && (
        <View style={styles.studioRow}>
          <DataLabel text="STUDIO" technical={false} />
          <DataValue text={title.studio} technical={false} />
        </View>
      )}

      {/*
       * Said out loud rather than left as a gap: three empty sections in a row
       * read as the app failing, where naming it puts the fault on the metadata
       * and points at what fixes it.
       */}
      {lacksMetadata(title) && (
        <NoMetadataNote style={{ marginHorizontal: Space.Screen, marginTop: 26 }} />
      )}

      {(title.audioTracks.length > 0 || title.subtitles.length > 0) && (
        <View style={{ paddingHorizontal: Space.Screen, marginTop: 22 }}>
          <DataLabel text="IN THIS FILE" />
          <View style={styles.fileChips}>
            {title.audioTracks.slice(0, 2).map((track) => (
              <WordChip key={`a-${track.index}`} label={audioShortLabel(track)} />
            ))}
            {title.subtitles.slice(0, 2).map((track) => (
              <WordChip key={`s-${track.index}`} label={subtitleDisplayName(track)} />
            ))}
          </View>
        </View>
      )}

      {alsoOnDisk.length > 0 && (
        <View style={{ marginTop: 26 }}>
          <Text style={styles.alsoHeading}>Also on the disk</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingLeft: Space.Screen, paddingRight: 6 }}
          >
            {alsoOnDisk.map((other) => (
              <PosterCard
                key={other.id}
                title={other}
                width={100}
                onPress={() => onOpenTitle(other.id)}
              />
            ))}
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}

/**
 * 330px of gradient with the title over a scrim.
 *
 * The title is drawn *after* the scrim so it sits above it in z-order — the one
 * ordering mistake that would make this screen unreadable.
 */
function Hero({ title }: { title: Title }) {
  const [from, to] = gradientFor(title.name);
  const facts = heroFacts(title);

  return (
    <View style={styles.hero}>
      <LinearGradient
        colors={[from, to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.33, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/*
       * Backdrop where the server has one, poster otherwise. The gradient stays
       * underneath so an unmatched title still gets the designed placeholder
       * rather than a blank rectangle.
       */}
      {artSource(title.backdropUrl ?? title.posterUrl) != null && (
        <Image
          source={artSource(title.backdropUrl ?? title.posterUrl)!}
          contentFit="cover"
          transition={200}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/*
       * Drawn after the artwork and before the title, so the title sits above
       * the scrim in z-order.
       */}
      <LinearGradient
        colors={['transparent', HeroScrim]}
        locations={[0.35, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.heroText}>
        <Text style={[TowerType.titleDisplay, { color: OnInk }]}>{title.name}</Text>

        {/* The name its audience knows it by, where the catalogue has both. */}
        {title.originalTitle != null && (
          <Text
            style={[TowerType.bodyNote, { color: OnInkMuted, marginTop: 4 }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title.originalTitle}
          </Text>
        )}

        {/*
         * The score sits here, over the artwork, because it is the first thing
         * anyone checks — and anywhere else means scrolling past a 330px image
         * to find one number.
         */}
        <View style={styles.heroFacts}>
          {title.rating != null && <RatingPill rating={title.rating} />}
          {title.certification != null && title.certification.trim() !== '' && (
            <CertificationPill certification={title.certification} />
          )}
          {title.imdbId != null && <ImdbMark />}
          {facts !== '' && (
            <Text style={[TowerType.bodyNote, { color: OnInkMuted }]}>{facts}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      style={({ pressed }) => [styles.back, { opacity: pressed ? 0.7 : 1 }]}
    >
      <ChevronGlyph rotation={180} color={OnInk} size={18} />
    </Pressable>
  );
}

/**
 * `Resume 1:16` an hour in, `Resume 4:38` four minutes in, `Play` from cold.
 *
 * Seconds are dropped only when there is an hour field to drop them for —
 * blindly trimming the last group turned 4:38 into a bare "4".
 */
function resumeLabel(title: Title): string {
  if (title.positionSeconds <= 0) return 'Play';
  const clock = formatClock(title.positionSeconds);
  const trimmed = title.positionSeconds >= 3600 ? clock.slice(0, clock.lastIndexOf(':')) : clock;
  return `Resume ${trimmed}`;
}

function DetailSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: Ink }}>
      <Skeleton cornerRadius={0} style={{ width: '100%', height: 330 }} />
      <View style={{ padding: Space.Screen }}>
        <Skeleton cornerRadius={10} style={{ width: '100%', height: 48 }} />
        <Skeleton cornerRadius={12} style={{ marginTop: 18, width: '100%', height: 120 }} />
      </View>
    </View>
  );
}

function DetailMessage({ heading, body }: { heading: string; body: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: Ink, padding: Space.Screen, paddingTop: 80 }}>
      <Text style={[TowerType.titleSection, { color: OnInk }]}>{heading}</Text>
      <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 8 }]}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: '100%',
    height: 330,
  },
  heroText: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Space.Screen,
  },
  heroFacts: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    paddingHorizontal: Space.Screen,
    paddingVertical: 18,
  },
  studioRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: Space.Screen,
    marginTop: 22,
  },
  fileChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  alsoHeading: {
    ...TowerType.titleItem,
    color: OnInk,
    paddingHorizontal: Space.Screen,
    paddingBottom: 12,
  },
  back: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(10,10,12,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
