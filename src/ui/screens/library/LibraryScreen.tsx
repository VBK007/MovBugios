import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

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
import { useRepository } from '@/ui/hooks';
import { CategoryChipRow, FilterChipRow } from '@/ui/components/Chips';
import { DataLabel } from '@/ui/components/Primitives';
import { PosterCard } from '@/ui/components/PosterCard';
import { PosterSkeleton } from '@/ui/components/Rails';

/** The category chips, in board order. `null` is "All". */
const LibraryCategories: (MediaKind | null)[] = [null, 'FILM', 'ANIME', 'HOME_VIDEO', 'MUSIC'];

/**
 * The shelf. A three-column grid of everything on the disk, filtered by chips.
 *
 * Two chip rows sit next to each other on purpose and are typeset differently:
 * categories are words a person chose (Archivo), filters name measured
 * properties (mono). That is the whole two-typeface rule in one screen.
 *
 * Ported from ui/screens/library/LibraryScreen.kt.
 */
export function LibraryScreen({ onOpenTitle }: { onOpenTitle: (titleId: string) => void }) {
  const repository = useRepository();
  const { width } = useWindowDimensions();

  const [titles, setTitles] = useState<UiState<Title[]>>(Loading);
  const [summary, setSummary] = useState<LibrarySummary>(EmptyLibrarySummary);
  const [filters, setFilters] = useState<LibraryFilters>(DefaultLibraryFilters);
  const [refreshing, setRefreshing] = useState(false);

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
    [repository],
  );

  useEffect(() => {
    void load(filters);
  }, [load, filters]);

  // Three columns at the board's 390dp, more on a tablet. A fixed three would
  // have grown the posters instead of the shelf, which is the wrong thing to
  // spend a wider screen on.
  const columns = Math.max(3, Math.floor((width - Space.Screen * 2 + 12) / (108 + 12)));

  const data: (Title | null)[] =
    titles.type === 'LOADED' ? titles.data : titles.type === 'LOADING' ? Array(9).fill(null) : [];

  return (
    <View style={{ flex: 1, backgroundColor: Ink }}>
      <FlatList
        key={columns}
        data={data}
        numColumns={columns}
        keyExtractor={(item, index) => item?.id ?? `skeleton-${index}`}
        // The screen inset lives on the rows, not the container: the chip rows
        // in the header scroll edge-to-edge, and a container padding would inset
        // them too and cut their overflow short.
        columnWrapperStyle={columns > 1 ? styles.row : undefined}
        contentContainerStyle={styles.grid}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(filters)}
            tintColor={OnInkFaint}
          />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <Text style={[TowerType.titleScreen, { color: OnInk }]}>Library</Text>
              <DataLabel text={summaryMonoLine(summary)} style={{ marginTop: 6 }} />
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
            {/* The gap the grid's first row sits below. */}
            <View style={{ height: 18 }} />
          </View>
        }
        ListEmptyComponent={
          titles.type === 'EMPTY' ? (
            <LibraryMessage heading="Nothing to show" body={titles.message} />
          ) : titles.type === 'ASLEEP' ? (
            <LibraryMessage
              heading="The disk is asleep"
              body="Wake Tower from the Home tab to browse the library. Saved copies still play."
            />
          ) : titles.type === 'OFFLINE' ? (
            <LibraryMessage heading="Cannot reach Tower" body={titles.message} />
          ) : null
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

function LibraryMessage({ heading, body }: { heading: string; body: string }) {
  return (
    <View style={{ paddingHorizontal: Space.Screen, paddingTop: 24 }}>
      <Text style={[TowerType.titleSection, { color: OnInk }]}>{heading}</Text>
      <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 8 }]}>{body}</Text>
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
  header: {
    paddingHorizontal: Space.Screen,
    paddingVertical: 18,
  },
  row: {
    gap: 12,
    paddingHorizontal: Space.Screen,
  },
  grid: {
    paddingBottom: 28,
    // Row rhythm. The header supplies its own leading space, so this must not
    // become a container paddingTop — that would push the screen title down too.
    gap: 16,
  },
});
