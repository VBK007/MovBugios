import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { Ink, OnInk, OnInkFaint, OnInkMuted, Space, TowerType } from '@/theme';
import {
  DefaultLibraryFilters,
  EmptyLibrarySummary,
  LibraryFilters,
  LibrarySortCycle,
  LibrarySortMeta,
  LibrarySummary,
  summaryMonoLine,
} from '@/domain/model/library';
import { MediaKind, MediaKindLabel, Title } from '@/domain/model/media';
import { Loading, UiState, loadState } from '@/ui/uiState';
import { useActiveProfileId, useRepository } from '@/ui/hooks';
import { UiStateError } from '@/ui/components/ServerError';
import { CategoryChipRow, FilterChipRow } from '@/ui/components/Chips';
import { DataLabel, OutlineButton } from '@/ui/components/Primitives';
import { SearchGlyph } from '@/ui/components/Glyphs';
import { MusicShelves } from '@/ui/screens/library/MusicShelves';
import { MusicHome, musicHomeIsEmpty } from '@/domain/model/musicHome';
import { playMusicFrom } from '@/player/playMusic';
import { PosterCard } from '@/ui/components/PosterCard';
import { PosterSkeleton } from '@/ui/components/Rails';

/**
 * The category chips, in board order. `null` is "All".
 *
 * `18+` sits last, after everything a household browses together. It is also
 * the only chip whose contents are not in "All" — the server leaves that type
 * out of an unnarrowed listing and out of every home rail, so this chip is the
 * only way to reach it. That is the point of the category rather than a side
 * effect: somewhere to put a thing, and somewhere it stays.
 */
const LibraryCategories: (MediaKind | null)[] = [
  null,
  'FILM',
  'ANIME',
  'HOME_VIDEO',
  'MUSIC',
  'ADULT',
];

/**
 * The shelf. A three-column grid of everything on the disk, filtered by chips.
 *
 * Two chip rows sit next to each other on purpose and are typeset differently:
 * categories are words a person chose (Archivo), filters name measured
 * properties (mono). That is the whole two-typeface rule in one screen.
 *
 * Ported from ui/screens/library/LibraryScreen.kt.
 */
export function LibraryScreen({
  onOpenTitle,
  onOpenCollections,
  onOpenSearch,
  onOpenRail,
  onOpenPlayer,
}: {
  onOpenTitle: (titleId: string) => void;
  onOpenCollections: () => void;
  onOpenSearch: () => void;
  onOpenRail: (key: string, title: string) => void;
  onOpenPlayer: (titleId: string) => void;
}) {
  const repository = useRepository();
  const profileId = useActiveProfileId();
  const { width } = useWindowDimensions();

  const [titles, setTitles] = useState<UiState<Title[]>>(Loading);
  /**
   * The music screen's own payload, fetched only when Music is picked.
   *
   * A different question from `browse`, so a different call: the grid is right
   * for films and wrong for three hundred tracks, which at tile size all look
   * the same.
   */
  const [music, setMusic] = useState<UiState<MusicHome>>(Loading);
  const [summary, setSummary] = useState<LibrarySummary>(EmptyLibrarySummary);
  const [filters, setFilters] = useState<LibraryFilters>(DefaultLibraryFilters);
  const [refreshing, setRefreshing] = useState(false);
  /** A page is in flight. Draws skeletons under the grid, not over it. */
  const [loadingMore, setLoadingMore] = useState(false);

  /** The highest page fetched for the current filters. Reset by a reload. */
  const page = useRef(0);
  /** There is no further page to ask for. Stops the grid asking again. */
  const exhausted = useRef(false);
  const loadingMoreRef = useRef(false);
  const grid = useRef<FlatList<Title | null>>(null);

  const alive = useRef(true);
  const sequence = useRef(0);
  const titlesRef = useRef(titles);
  titlesRef.current = titles;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (next: LibraryFilters) => {
      const run = ++sequence.current;
      // Back to the first page: a filter change or a pull makes every page
      // fetched so far a page of something else.
      page.current = 0;
      exhausted.current = false;
      loadingMoreRef.current = false;
      setLoadingMore(false);
      // Keep the grid on screen while re-reading; only the first load and a
      // filter change earn a skeleton.
      if (titlesRef.current.type === 'LOADED') {
        setRefreshing(true);
      } else {
        setTitles(Loading);
      }

      try {
        const fresh = await repository.librarySummary();
        if (alive.current && run === sequence.current) setSummary(fresh);
      } catch {
        // A summary that will not load is a missing mono line, not a broken
        // screen — the grid below is the point.
      }

      const loaded = await loadState(() => repository.browse(next), {
        emptyWhen: (list) => list.length === 0,
        emptyMessage: emptyMessageFor(next),
      });

      if (!alive.current || run !== sequence.current) return;
      setTitles(loaded);
      setRefreshing(false);
    },
    // The unwatched filter is per-person, so the grid is too.
    [repository, profileId],
  );

  const showingMusic = filters.category === 'MUSIC';

  useEffect(() => {
    if (!showingMusic) return;
    let live = true;
    void (async () => {
      setMusic(Loading);
      const next = await loadState(() => repository.musicHome(), {
        emptyWhen: musicHomeIsEmpty,
        emptyMessage: 'No music on the disk yet. Point Tower at a folder of it and rescan.',
      });
      if (live) setMusic(next);
    })();
    return () => {
      live = false;
    };
  }, [repository, showingMusic, profileId]);

  useEffect(() => {
    if (showingMusic) return;
    void load(filters);
    // Filters changed, so this is a different library: start at the top. Leaving
    // the grid where it was would drop somebody into the middle of something
    // they had not scrolled through.
    grid.current?.scrollToOffset({ offset: 0, animated: false });
  }, [load, filters, showingMusic]);

  /**
   * Fetches the next page and appends it.
   *
   * Called as the last rows come into view rather than from a button: a library
   * of a thousand titles is scrolled, and asking somebody to press "more" every
   * forty is asking them to stop.
   *
   * Two ways to conclude there is nothing left, and both are needed. An empty
   * page is the obvious one. A page that adds no *new* ids is the other, and it
   * is what stops a runaway: a repository that answers every page with the same
   * rows — the sample library does exactly this — would otherwise be asked for
   * page 300 while the grid sat still at the bottom.
   */
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || exhausted.current || refreshing) return;
    const current = titlesRef.current;
    if (current.type !== 'LOADED' || current.data.length === 0) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    const run = sequence.current;

    let next: Title[] = [];
    try {
      next = await repository.browse(filters, page.current + 1);
    } catch {
      next = [];
    }
    page.current += 1;

    loadingMoreRef.current = false;
    // A filter changed while this was in flight, so this page belongs to a list
    // nobody is looking at any more.
    if (!alive.current || run !== sequence.current) return;
    setLoadingMore(false);

    const existing = current.data;
    const fresh = next.filter((title) => !existing.some((e) => e.id === title.id));
    exhausted.current = fresh.length === 0;
    if (fresh.length > 0) setTitles({ type: 'LOADED', data: [...existing, ...fresh] });
  }, [repository, filters, refreshing]);

  // Three columns at the board's 390dp, more on a tablet. A fixed three would
  // have grown the posters instead of the shelf, which is the wrong thing to
  // spend a wider screen on.
  const columns = Math.max(3, Math.floor((width - Space.Screen * 2 + 12) / (108 + 12)));

  const data: (Title | null)[] =
    titles.type === 'LOADED' ? titles.data : titles.type === 'LOADING' ? Array(9).fill(null) : [];

  /*
   * One header over two different screens.
   *
   * The filter chips go with the grid rather than with the heading: "Unwatched"
   * and "4K only" are questions about video, and a sort order means nothing on a
   * screen of shelves. Leaving them on Music would have said the screen was
   * unfinished rather than different.
   */
  const header = (
    <View>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[TowerType.titleScreen, { color: OnInk }]}>Library</Text>
              <DataLabel text={summaryMonoLine(summary)} style={{ marginTop: 6 }} />
            </View>
            {/*
             * Beside the heading rather than among the filter chips: those
             * narrow this grid, and this leaves it for a different list
             * entirely. Putting it in the row would say it was one more filter.
             */}
            {/*
             * The same door as the one in the Home header, drawn the same way.
             *
             * Worth having twice. This is the screen somebody is on when
             * browsing stops working — twelve hundred titles, and the one they
             * want is not on this shelf — and the answer to that should not be
             * "go back to Home first". A second entrance to one search costs a
             * glyph; a second search would cost a second set of results free to
             * disagree with the first.
             */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search the disk"
              onPress={onOpenSearch}
              style={({ pressed }) => [styles.headerAction, { opacity: pressed ? 0.6 : 1 }]}
            >
              <SearchGlyph color={OnInk} size={19} />
            </Pressable>
            <OutlineButton label="Collections" onPress={onOpenCollections} />
          </View>

          <CategoryChipRow
            labels={LibraryCategories.map((k) => (k ? MediaKindLabel[k] : 'All'))}
            selectedIndex={Math.max(0, LibraryCategories.indexOf(filters.category))}
            onSelect={(index) =>
              setFilters((f) => ({ ...f, category: LibraryCategories[index] ?? null }))
            }
          />

          <FilterChipRow
            chips={[
              { id: 'unwatched', label: 'Unwatched', selected: filters.unwatchedOnly },
              { id: '4k', label: '4K only', selected: filters.fourKOnly },
              { id: 'sort', label: LibrarySortMeta[filters.sort].label, isMenu: true },
            ]}
            onToggle={(id) =>
              setFilters((f) => {
                if (id === 'unwatched') return { ...f, unwatchedOnly: !f.unwatchedOnly };
                if (id === '4k') return { ...f, fourKOnly: !f.fourKOnly };
                const next =
                  LibrarySortCycle[
                    (LibrarySortCycle.indexOf(f.sort) + 1) % LibrarySortCycle.length
                  ];
                return { ...f, sort: next };
              })
            }
            style={{ marginTop: 10, flexGrow: 0 }}
          />
    </View>
  );

  if (showingMusic) {
    return (
      <View style={{ flex: 1, backgroundColor: Ink }}>
        {header}
        <MusicShelves
          music={music}
          onPlay={(tracks, index) => playMusicFrom(tracks, index, onOpenPlayer)}
          onOpenRail={onOpenRail}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Ink }}>
      <FlatList
        ref={grid}
        key={columns}
        data={data}
        numColumns={columns}
        keyExtractor={(item, index) => item?.id ?? `skeleton-${index}`}
        // The screen inset lives on the rows, not the container: the chip rows
        // in the header scroll edge-to-edge, and a container padding would inset
        // them too and cut their overflow short.
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        contentContainerStyle={styles.grid}
        // Two rows from the bottom rather than at it, so a page is usually there
        // before the scroll arrives — close enough that a slow flick does not
        // fetch three pages nobody looks at.
        onEndReachedThreshold={0.5}
        onEndReached={() => void loadMore()}
        ListFooterComponent={
          loadingMore ? (
            // A row of skeletons under what is already there, rather than a
            // spinner over it. The grid keeps its place and simply grows, which
            // is what a page arriving actually is.
            <View style={styles.footer}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ flex: 1 }}>
                  <PosterSkeleton width={null} />
                </View>
              ))}
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(filters)}
            tintColor={OnInkFaint}
          />
        }
        ListHeaderComponent={
          <View>
            {header}
            {/* The gap the grid's first row sits below. */}
            <View style={{ height: 18 }} />
          </View>
        }
        ListEmptyComponent={
          <UiStateError state={titles} onRetry={() => void load(filters)} />
        }
        renderItem={({ item }) => (
          <View style={{ flex: 1 / columns }}>
            {item == null ? (
              <PosterSkeleton width={null} />
            ) : (
              // The grid sizes the cell; the card must not fight it.
              <PosterCard title={item} width={null} onPress={() => onOpenTitle(item.id)} />
            )}
          </View>
        )}
      />
    </View>
  );
}

function emptyMessageFor(filters: LibraryFilters): string {
  if (filters.unwatchedOnly && filters.fourKOnly) {
    return 'Nothing here is both unwatched and 4K. Try dropping one of the filters.';
  }
  if (filters.unwatchedOnly) return 'You have watched everything in this category.';
  if (filters.fourKOnly) return 'Nothing in this category is 4K.';
  if (filters.category != null) return 'Nothing in this category yet.';
  return 'The library is empty. Point Tower at a folder and rescan.';
}

const styles = StyleSheet.create({
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.Screen,
    paddingVertical: 18,
  },
  row: {
    gap: 12,
    paddingHorizontal: Space.Screen,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 18,
  },
  grid: {
    paddingBottom: 28,
    // Row rhythm. The header supplies its own leading space, so this must not
    // become a container paddingTop — that would push the screen title down too.
    gap: 16,
  },
});
