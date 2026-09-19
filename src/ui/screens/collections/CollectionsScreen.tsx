import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { Ink, OnInk, OnInkFaint, OnInkMuted, Radius, Space, Surface1, TowerType } from '@/theme';
import {
  Collection,
  Collections,
  collectionCountLabel,
  collectionsAreEmpty,
} from '@/domain/model/collection';
import { Title } from '@/domain/model/media';
import { Loading, UiState, loadState } from '@/ui/uiState';
import { useActiveProfileId, useRepository } from '@/ui/hooks';
import { UiStateError } from '@/ui/components/ServerError';
import { ChevronGlyph } from '@/ui/components/Glyphs';
import { DataLabel, HairlineDivider } from '@/ui/components/Primitives';
import { PosterCard } from '@/ui/components/PosterCard';
import { PosterSkeleton, Skeleton } from '@/ui/components/Rails';

const ASLEEP = 'The disk is asleep. Wake Tower to see these.';

/** One row of the list: a heading, or a collection under it. */
type Row =
  | { kind: 'HEADING'; id: string; label: string }
  | { kind: 'COLLECTION'; id: string; collection: Collection };

/**
 * The three sections, flattened into the one list a `FlatList` renders.
 *
 * An empty section is not a section. A heading over nothing reads as a failure
 * to load rather than as a library that has none of that kind.
 */
function rowsFor(groups: Collections): Row[] {
  const sections: [string, Collection[]][] = [
    ['READY MADE', groups.builtin],
    ['SAVED HERE', groups.custom],
    ['FOUND IN YOUR LIBRARY', groups.discovered],
  ];
  return sections.flatMap(([label, items]) =>
    items.length === 0
      ? []
      : [
          { kind: 'HEADING' as const, id: `heading:${label}`, label },
          ...items.map((collection) => ({
            kind: 'COLLECTION' as const,
            id: collection.id,
            collection,
          })),
        ],
  );
}

/**
 * Saved searches, in three sections.
 *
 * A collection is a query with a name on it, so this is the library asked a
 * different way: not "show me everything, sorted" but "show me the ones nobody
 * has watched", "the ones in 4K", "the Tamil ones". The sections are kept apart
 * because the promise behind each is different — the server ships the first,
 * somebody here saved the second, and the third is what the library's own facets
 * imply, which means it appears and disappears as the disk changes.
 *
 * Read-only for now. Creating, renaming and pinning exist on the server and are
 * a separate screen; reading is the half that makes them worth having.
 *
 * Ported from ui/screens/collections/CollectionsScreen.kt.
 */
export function CollectionsScreen({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (collection: Collection) => void;
}) {
  const repository = useRepository();
  const profileId = useActiveProfileId();
  const [state, setState] = useState<UiState<Collections>>(Loading);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setState(Loading);
    const next = await loadState(() => repository.collections(), {
      emptyWhen: collectionsAreEmpty,
      emptyMessage: 'Nothing to collect yet. Scan the library and these fill in.',
    });
    if (alive.current) setState(next);
    // Discovered collections are tallied from what this person can see.
  }, [repository, profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: Ink }}>
      <Header title="Collections" onBack={onBack} />

      {state.type === 'LOADING' && <ListSkeleton />}
      <UiStateError state={state} onRetry={() => void load()} />
      {state.type === 'LOADED' && (
        <FlatList
          data={rowsFor(state.data)}
          keyExtractor={(row) => row.id}
          contentContainerStyle={{ paddingBottom: 28 }}
          renderItem={({ item }) =>
            item.kind === 'HEADING' ? (
              <DataLabel text={item.label} technical={false} style={styles.heading} />
            ) : (
              <CollectionRow
                collection={item.collection}
                onPress={() => onOpen(item.collection)}
              />
            )
          }
        />
      )}
    </View>
  );
}

function CollectionRow({
  collection,
  onPress,
}: {
  collection: Collection;
  onPress: () => void;
}) {
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${collection.name}, ${collectionCountLabel(collection.itemCount)}`}
        onPress={onPress}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
      >
        {/*
         * The server picks the emoji; drawing a glyph of our own beside it would
         * be two icons for one row. A collection without one gets the tile
         * anyway, so the text still starts on the same line.
         */}
        <View style={styles.tile}>
          <Text style={[TowerType.titleItem, { color: OnInkMuted }]}>
            {collection.icon ?? '•'}
          </Text>
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[TowerType.titleRow, { color: OnInk }]} numberOfLines={1}>
            {collection.name}
          </Text>
          <DataLabel
            text={collectionCountLabel(collection.itemCount)}
            technical={false}
            style={{ marginTop: 3 }}
          />
        </View>
        <ChevronGlyph color={OnInkFaint} size={14} />
      </Pressable>
      <HairlineDivider />
    </View>
  );
}

/**
 * One collection's titles, as the same grid the library uses.
 *
 * Deliberately the library's grid rather than a new layout: a collection is a
 * page of the library, and making it look like a different kind of thing would
 * suggest it behaves like one.
 */
export function CollectionItemsScreen({
  collectionId,
  /**
   * Passed in rather than fetched. The list screen already has it, and a second
   * round trip to learn a heading the previous screen was showing a moment ago
   * is a spinner nobody needs.
   */
  name,
  onBack,
  onOpenTitle,
}: {
  collectionId: string;
  name: string;
  onBack: () => void;
  onOpenTitle: (titleId: string) => void;
}) {
  const repository = useRepository();
  const profileId = useActiveProfileId();
  const { width } = useWindowDimensions();
  const [state, setState] = useState<UiState<Title[]>>(Loading);

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
      const next = await loadState(() => repository.collectionItems(collectionId), {
        emptyWhen: (list) => list.length === 0,
        // A live query with nothing in it is a fact about the library, not a
        // failure — and saying so beats an empty grid.
        emptyMessage: 'Nothing in the library matches this one right now.',
      });
      if (alive.current) setState(next);
    })();
  }, [repository, collectionId, profileId]);

  // Same arithmetic as the library grid, so a collection is laid out as a page
  // of it rather than as a different kind of screen.
  const columns = Math.max(3, Math.floor((width - Space.Screen * 2 + 12) / (108 + 12)));
  const data: (Title | null)[] =
    state.type === 'LOADED' ? state.data : state.type === 'LOADING' ? Array(9).fill(null) : [];

  return (
    <View style={{ flex: 1, backgroundColor: Ink }}>
      <Header title={name} onBack={onBack} />

      <UiStateError state={state} />
      {(state.type === 'LOADED' || state.type === 'LOADING') && (
        <FlatList
          key={columns}
          data={data}
          numColumns={columns}
          keyExtractor={(item, index) => item?.id ?? `skeleton-${index}`}
          columnWrapperStyle={columns > 1 ? styles.gridRow : undefined}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <View style={{ flex: 1 / columns }}>
              {item == null ? (
                <PosterSkeleton width={null} />
              ) : (
                <PosterCard title={item} width={null} onPress={() => onOpenTitle(item.id)} />
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={styles.back}
      >
        <ChevronGlyph rotation={180} color={OnInk} size={18} />
      </Pressable>
      <Text
        style={[TowerType.titleScreen, { color: OnInk, marginLeft: 4, flex: 1 }]}
        numberOfLines={1}
      >
        {title}
      </Text>
    </View>
  );
}

function ListSkeleton() {
  return (
    <View style={{ paddingHorizontal: Space.Screen, paddingVertical: 18, gap: 12 }}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} cornerRadius={10} style={{ width: '100%', height: 52 }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    paddingHorizontal: Space.Screen,
    paddingTop: 22,
    paddingBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    paddingHorizontal: Space.Screen,
    paddingVertical: 14,
  },
  tile: {
    width: 38,
    height: 38,
    borderRadius: Radius.Pill,
    backgroundColor: Surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    paddingHorizontal: Space.Screen,
    paddingTop: 8,
    paddingBottom: 28,
  },
  gridRow: {
    gap: 12,
    marginBottom: 18,
  },
});
