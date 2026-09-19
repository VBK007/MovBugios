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
  Surface1,
  Surface2,
  TowerType,
} from '@/theme';
import { JumpTarget } from '@/domain/model/library';
import { Title, resolution } from '@/domain/model/media';
import { UiState, dataOrNull, loadState } from '@/ui/uiState';
import { useRepository } from '@/ui/hooks';
import { UiStateError } from '@/ui/components/ServerError';
import { ChevronGlyph, SearchGlyph } from '@/ui/components/Glyphs';
import { RemovableChip } from '@/ui/components/Chips';
import {
  EmptySearchResults,
  SearchResults,
  SearchTerm,
  removedFrom,
} from '@/domain/model/collection';
import { DataLabel, DataMeta, HairlineDivider } from '@/ui/components/Primitives';
import { PosterThumb } from '@/ui/components/PosterCard';
import { Skeleton } from '@/ui/components/Rails';

/**
 * Searches the disk, not the internet — and says so, because every other search
 * box on the phone does the opposite and the difference matters here.
 *
 * Ported from ui/screens/search/SearchScreen.kt.
 */
export function SearchScreen({
  onOpenTitle,
  onOpenAssistant,
  onBack,
}: {
  onOpenTitle: (titleId: string) => void;
  onOpenAssistant: () => void;
  /**
   * Search is reached from Home rather than from a tab, so it needs a way out.
   * Null where it is shown as a tab, since a back arrow there would be a control
   * that goes nowhere.
   */
  onBack?: (() => void) | null;
}) {
  const repository = useRepository();
  /**
   * Whether this server has an assistant at all.
   *
   * False until it answers — a button that appears late is better than one that
   * appears and then admits it does nothing.
   */
  const [canAsk, setCanAsk] = useState(false);

  const [query, setQuery] = useState('');
  /** Null means "nothing typed yet", which is a different screen from "no hits". */
  const [results, setResults] = useState<UiState<Title[]> | null>(null);
  /**
   * What the server read out of the phrase.
   *
   * Kept beside `results` rather than inside them on purpose: the reading is
   * most worth showing when nothing came back, and an empty `UiState` carries
   * no data to hang it off.
   */
  const [terms, setTerms] = useState<SearchTerm[]>([]);
  /** No rule matched — the phrase was searched as a title and nothing more. */
  const [understoodNothing, setUnderstoodNothing] = useState(false);
  /** A model wrote the query instead, so there is no reading to attribute to words. */
  const [readByModel, setReadByModel] = useState(false);
  const [jumpTargets, setJumpTargets] = useState<JumpTarget[]>([]);

  const alive = useRef(true);
  const sequence = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const available = await repository.assistantAvailable();
      if (alive.current) setCanAsk(available);
    })();
  }, [repository]);

  const onQueryChange = useCallback(
    (next: string) => {
      setQuery(next);
      const run = ++sequence.current;

      if (next.trim() === '') {
        setResults(null);
        setTerms([]);
        setUnderstoodNothing(false);
        setReadByModel(false);
        setJumpTargets([]);
        return;
      }

      // The disk is local, so this is short — it is here to avoid a request per
      // keystroke, not to hide latency. A newer keystroke bumps the sequence,
      // which is what cancels this one.
      setTimeout(async () => {
        if (!alive.current || run !== sequence.current) return;
        setResults({ type: 'LOADING' });

        let found: SearchResults = EmptySearchResults;
        const loaded = await loadState(
          async () => {
            found = await repository.search(next);
            return found.titles;
          },
          {
            emptyWhen: (list) => list.length === 0,
            emptyMessage: `Nothing on the disk matches "${next}".`,
          },
        );
        const targets = await repository.jumpTargets(next);

        if (!alive.current || run !== sequence.current) return;
        setResults(loaded);
        setTerms(found.terms);
        setUnderstoodNothing(found.understoodNothing);
        setReadByModel(found.readByModel);
        setJumpTargets(targets);
      }, 180);
    },
    [repository],
  );

  /**
   * Drops a chip by deleting the words it was read from, then searching again.
   *
   * The query text stays the source of truth — there is no second, structured
   * copy of the search for the box and the chips to disagree about. A term the
   * server did not say where it came from cannot be removed this way, so its
   * chip is drawn as a statement rather than something to press.
   */
  const removeTerm = useCallback(
    (term: SearchTerm) => {
      const remaining = removedFrom(term, query);
      if (remaining !== query) onQueryChange(remaining);
    },
    [query, onQueryChange],
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
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {onBack != null && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={onBack}
              style={styles.searchBack}
            >
              <ChevronGlyph rotation={180} color={OnInk} size={18} />
            </Pressable>
          )}
          <Text style={[TowerType.titleScreen, { color: OnInk }]}>Search</Text>
        </View>
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
        {terms.length > 0 ? (
          <Reading terms={terms} onRemove={removeTerm} />
        ) : readByModel ? (
          // The chips are the normal way to see the reading; when a model wrote
          // the query there are none, and silence would read as "it understood
          // nothing" — which is the opposite of what happened.
          <Text style={[TowerType.bodyNote, { color: OnInkFaint, marginTop: 12 }]}>
            Tower&apos;s own rules could not read that, so a model wrote the search. There
            is no word-by-word reading to show.
          </Text>
        ) : null}
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
        {results == null && (
          <SearchIdle targets={jumpTargets} canAsk={canAsk} onAsk={onOpenAssistant} />
        )}

        {results?.type === 'LOADING' && (
          <View style={{ paddingHorizontal: Space.Screen, gap: 14 }}>
            {[0, 1, 2, 3].map((i) => (
              <ResultSkeleton key={i} />
            ))}
          </View>
        )}

        {results?.type === 'EMPTY' && (
          <SearchMessage
            heading="Nothing found"
            body={results.message}
            // Only here. An empty list is the one moment where knowing the
            // phrase was taken literally changes what to do next — above a
            // screen of results it would be a lecture.
            note={
              understoodNothing && !readByModel
                ? 'Tower read that as a title and searched for those words. Try a genre, a year or a language.'
                : null
            }
          />
        )}

        {(results?.type === 'ASLEEP' || results?.type === 'OFFLINE') && (
          <UiStateError state={results} onRetry={() => onQueryChange(query)} />
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

/**
 * What Tower made of the phrase, as chips you can take back off.
 *
 * This is the feature, not a debug readout. A search box that quietly
 * reinterprets a sentence leaves you nothing to argue with when it is wrong —
 * all you can do is rephrase and hope. Drawn this way, a wrong reading is a
 * visible, single, removable thing.
 *
 * The words each chip was read from sit under it in mono, because "Tamil" is
 * only checkable against the sentence if you can see which part of the sentence
 * became it.
 */
function Reading({
  terms,
  onRemove,
}: {
  terms: SearchTerm[];
  onRemove: (term: SearchTerm) => void;
}) {
  return (
    <View style={{ marginTop: 14 }}>
      <DataLabel text="TOWER READ THIS AS" />
      <View style={styles.reading}>
        {terms.map((term) => (
          <View key={`${term.field}:${term.label}`} style={{ alignItems: 'center' }}>
            <RemovableChip
              label={term.label}
              // A term the server did not attribute to any words cannot be
              // removed by editing them, so it is stated rather than offered.
              onRemove={term.matched != null ? () => onRemove(term) : null}
            />
            {term.matched != null && (
              <DataMeta text={`"${term.matched}"`} color={OnInkFaint} style={{ marginTop: 4 }} />
            )}
          </View>
        ))}
      </View>
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

function SearchIdle({
  targets,
  canAsk,
  onAsk,
}: {
  targets: JumpTarget[];
  canAsk: boolean;
  onAsk: () => void;
}) {
  return (
    <View style={{ paddingHorizontal: Space.Screen }}>
      <Text style={[TowerType.bodyProse, { color: OnInkMuted }]}>
        Type to search the files on your disk by name, or describe what you are
        after — &quot;tamil films under two hours&quot;.
      </Text>

      {/*
       * Only when the server actually has one. Offered here rather than as a
       * mode of the field above, because the two take different input: that box
       * takes a description and narrows a list, the assistant takes a question
       * and answers it in a sentence.
       */}
      {canAsk && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ask Tower a question"
          onPress={onAsk}
          style={({ pressed }) => [styles.askCard, { opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[TowerType.titleRow, { color: OnInk }]}>Ask a question instead</Text>
            <Text style={[TowerType.bodyNote, { color: OnInkFaint, marginTop: 3 }]}>
              &quot;What can I finish tonight?&quot;
            </Text>
          </View>
          <ChevronGlyph color={OnInkFaint} size={14} />
        </Pressable>
      )}

      {targets.length > 0 && <JumpToRow targets={targets} />}
    </View>
  );
}

function SearchMessage({
  heading,
  body,
  note,
}: {
  heading: string;
  body: string;
  note?: string | null;
}) {
  return (
    <View style={{ paddingHorizontal: Space.Screen }}>
      <Text style={[TowerType.titleSection, { color: OnInk }]}>{heading}</Text>
      <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 8 }]}>{body}</Text>
      {note != null && (
        <Text style={[TowerType.bodyNote, { color: OnInkFaint, marginTop: 10 }]}>{note}</Text>
      )}
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
  searchBack: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  askCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
    borderRadius: Radius.Default,
    backgroundColor: Surface1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  reading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
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
