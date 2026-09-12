import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  Amber,
  AmberBorderSoft,
  Ink,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  Space,
  Surface2,
  TowerType,
} from '@/theme';
import { JumpTarget } from '@/domain/model/library';
import { Title, resolution } from '@/domain/model/media';
import { UiState, dataOrNull, loadState } from '@/ui/uiState';
import { useRepository } from '@/ui/hooks';
import { SearchGlyph } from '@/ui/components/Glyphs';
import { DataLabel, DataMeta, HairlineDivider } from '@/ui/components/Primitives';
import { PosterThumb } from '@/ui/components/PosterCard';
import { Skeleton } from '@/ui/components/Rails';

/**
 * Searches the disk, not the internet — and says so, because every other search
 * box on the phone does the opposite and the difference matters here.
 *
 * Ported from ui/screens/search/SearchScreen.kt.
 */
export function SearchScreen({ onOpenTitle }: { onOpenTitle: (titleId: string) => void }) {
  const repository = useRepository();

  const [query, setQuery] = useState('');
  /** Null means "nothing typed yet", which is a different screen from "no hits". */
  const [results, setResults] = useState<UiState<Title[]> | null>(null);
  const [jumpTargets, setJumpTargets] = useState<JumpTarget[]>([]);

  const alive = useRef(true);
  const sequence = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const onQueryChange = useCallback(
    (next: string) => {
      setQuery(next);
      const run = ++sequence.current;

      if (next.trim() === '') {
        setResults(null);
        setJumpTargets([]);
        return;
      }

      // The disk is local, so this is short — it is here to avoid a request per
      // keystroke, not to hide latency. A newer keystroke bumps the sequence,
      // which is what cancels this one.
      setTimeout(async () => {
        if (!alive.current || run !== sequence.current) return;
        setResults({ type: 'LOADING' });

        const loaded = await loadState(() => repository.search(next), {
          emptyWhen: (list) => list.length === 0,
          emptyMessage: `Nothing on the disk matches "${next}".`,
        });
        const targets = await repository.jumpTargets(next);

        if (!alive.current || run !== sequence.current) return;
        setResults(loaded);
        setJumpTargets(targets);
      }, 180);
    },
    [repository],
  );

  /** `6 RESULTS ON THE DISK` — the count line above the results. */
  const resultLine = (() => {
    const data = results ? dataOrNull(results) : null;
    if (!data) return null;
    return data.length === 1 ? '1 RESULT ON THE DISK' : `${data.length} RESULTS ON THE DISK`;
  })();

  return (
    <View style={{ flex: 1, backgroundColor: Ink }}>
      <View style={{ paddingHorizontal: Space.Screen, paddingVertical: 18 }}>
        <Text style={[TowerType.titleScreen, { color: OnInk }]}>Search</Text>
        <View style={styles.searchField}>
          <SearchGlyph color={Amber} size={16} />
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search the disk"
            placeholderTextColor={OnInkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            selectionColor={Amber}
            cursorColor={Amber}
            style={styles.searchInput}
          />
          {query !== '' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => {
                onQueryChange('');
                Keyboard.dismiss();
              }}
              hitSlop={10}
            >
              <Text style={[TowerType.dataLabel, { color: OnInkFaint }]}>CLEAR</Text>
            </Pressable>
          )}
        </View>
        {resultLine != null && <DataLabel text={resultLine} style={{ marginTop: 12 }} />}
      </View>

      {/*
       * Tapping the body dismisses the keyboard.
       *
       * With an empty query there is no list rendered at all — just a
       * paragraph — so nothing on screen could take the tap, and the keyboard
       * had no way down short of submitting. `accessible={false}` keeps this
       * from announcing itself as a button to VoiceOver; it is a dismiss
       * surface, not a control.
       */}
      <Pressable style={{ flex: 1 }} onPress={Keyboard.dismiss} accessible={false}>
        {results == null && <SearchIdle targets={jumpTargets} />}

        {results?.type === 'LOADING' && (
          <View style={{ paddingHorizontal: Space.Screen, gap: 14 }}>
            {[0, 1, 2, 3].map((i) => (
              <ResultSkeleton key={i} />
            ))}
          </View>
        )}

        {results?.type === 'EMPTY' && (
          <SearchMessage heading="Nothing found" body={results.message} />
        )}

        {results?.type === 'ASLEEP' && (
          <SearchMessage
            heading="The disk is asleep"
            body="Search needs the disk spinning. Wake Tower from the Home tab."
          />
        )}

        {results?.type === 'OFFLINE' && (
          <SearchMessage heading="Cannot reach Tower" body={results.message} />
        )}

        {results?.type === 'LOADED' && (
          <FlatList
            data={results.data}
            keyExtractor={(t) => t.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: 28 }}
            ListHeaderComponent={
              jumpTargets.length > 0 ? <JumpToRow targets={jumpTargets} /> : null
            }
            renderItem={({ item }) => (
              <ResultRow title={item} onPress={() => onOpenTitle(item.id)} />
            )}
          />
        )}
      </Pressable>

      {/* The promise, kept faint and at the bottom where a footnote belongs. */}
      <Text style={styles.footnote}>
        Tower searches the files on your own disk. Nothing is sent to the internet.
      </Text>
    </View>
  );
}

/** "Jump to" chips — folders the results live under, and people in them. */
function JumpToRow({ targets }: { targets: JumpTarget[] }) {
  return (
    <View style={{ paddingHorizontal: Space.Screen, paddingVertical: 8 }}>
      <DataLabel text="JUMP TO" />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        {targets.slice(0, 4).map((target) => (
          <View key={`${target.kind}-${target.label}`} style={styles.jumpChip}>
            <DataMeta
              text={target.label}
              color={OnInkMuted}
              // A folder path is technical; a person's name is not.
              technical={target.kind === 'FOLDER'}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

function ResultRow({ title, onPress }: { title: Title; onPress: () => void }) {
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${title.name}`}
        onPress={onPress}
        style={({ pressed }) => [styles.resultRow, { opacity: pressed ? 0.75 : 1 }]}
      >
        <PosterThumb seed={title.name} imageUrl={title.posterUrl} />
        <View style={{ flex: 1 }}>
          <Text
            style={[TowerType.titleRow, { color: OnInk }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title.name}
          </Text>
          <DataMeta text={resultMeta(title)} color={metaColor(title)} style={{ marginTop: 4 }} />
        </View>
      </Pressable>
      <HairlineDivider style={{ marginLeft: Space.Screen }} />
    </View>
  );
}

/**
 * The meta line states the thing the user is about to care about: whether it
 * will play cleanly, or whether they have already seen it.
 */
function resultMeta(title: Title): string {
  if (title.plan.type === 'TRANSCODE') return 'NEEDS TRANSCODE';
  switch (title.watchState) {
    case 'WATCHED':
      return 'WATCHED';
    case 'IN_PROGRESS':
      return 'PART-WATCHED';
    case 'UNWATCHED': {
      const bits: string[] = [];
      const res = resolution(title.file);
      if (res) bits.push(res);
      if (title.year != null) bits.push(String(title.year));
      return bits.join(' · ') || 'UNWATCHED';
    }
  }
}

function metaColor(title: Title): string {
  return title.plan.type === 'TRANSCODE' ? Amber : OnInkFaint;
}

function SearchIdle({ targets }: { targets: JumpTarget[] }) {
  return (
    <View style={{ paddingHorizontal: Space.Screen }}>
      <Text style={[TowerType.bodyProse, { color: OnInkMuted }]}>
        Type to search the files on your disk by name.
      </Text>
      {targets.length > 0 && <JumpToRow targets={targets} />}
    </View>
  );
}

function SearchMessage({ heading, body }: { heading: string; body: string }) {
  return (
    <View style={{ paddingHorizontal: Space.Screen }}>
      <Text style={[TowerType.titleSection, { color: OnInk }]}>{heading}</Text>
      <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 8 }]}>{body}</Text>
    </View>
  );
}

function ResultSkeleton() {
  return (
    <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
      <Skeleton style={{ height: 64, width: '12%' }} />
      <View style={{ flex: 1 }}>
        <Skeleton cornerRadius={3} style={{ width: '60%', height: 12 }} />
        <Skeleton cornerRadius={3} style={{ marginTop: 8, width: '30%', height: 8 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    height: 48,
    marginTop: 14,
    borderRadius: Radius.Default,
    backgroundColor: Surface2,
    borderWidth: 1,
    borderColor: AmberBorderSoft,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    ...TowerType.bodyProse,
    color: OnInk,
    // The field sets its own height; letting the input claim one too pushes the
    // glyph off centre on iOS.
    padding: 0,
  },
  jumpChip: {
    borderRadius: Radius.Pill,
    backgroundColor: Surface2,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    paddingHorizontal: Space.Screen,
    paddingVertical: 12,
  },
  footnote: {
    ...TowerType.bodyNote,
    color: OnInkFaint,
    paddingHorizontal: Space.Screen,
    paddingTop: 10,
    paddingBottom: 18,
  },
});
