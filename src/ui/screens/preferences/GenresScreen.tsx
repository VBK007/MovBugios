import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Amber,
  AmberInk,
  DirectPlay,
  Hairline,
  Ink,
  OnInk,
  OnInkMuted,
  Radius,
  Space,
  TowerReadingMaxWidth,
  TowerType,
} from '@/theme';
import { PreferencesStore } from '@/data/remote/preferencesStore';
import { DefaultPreferences, FallbackGenres, Preferences } from '@/domain/model/preferences';
import { useRepository } from '@/ui/hooks';
import { CheckGlyph, ChevronGlyph } from '@/ui/components/Glyphs';
import { AmberButton, DataLabel, OutlineButton, StatusDot } from '@/ui/components/Primitives';

/** Past this the screen is a wall of chips rather than a question. */
const MAX_GENRES = 24;

/**
 * Editing the genre answer given on first run.
 *
 * Ported from ui/screens/preferences/GenresScreen.kt and its ViewModel.
 * Everything else about the stored answer — language, quality ceiling — is kept
 * so saving genres cannot quietly reset the other two.
 */
export function GenresScreen({ onBack }: { onBack: () => void }) {
  const repository = useRepository();

  /** What the library actually carries, or the fallback list until it answers. */
  const [offered, setOffered] = useState<string[]>(FallbackGenres);
  /** The answer as last saved. Compared against `chosen` to know if anything changed. */
  const [saved, setSaved] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /**
   * True once a save has been through. Clears the moment anything is tapped
   * again, so the confirmation always describes the current selection.
   */
  const [savedJustNow, setSavedJustNow] = useState(false);

  const stored = useRef<Preferences>(DefaultPreferences);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const preferences = await PreferencesStore.load();
      if (!alive.current) return;
      stored.current = preferences;
      setSaved(preferences.genres);
      setChosen(preferences.genres);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      // Best effort, exactly as on the first-run screen: a sleeping server must
      // not stop someone editing an answer that lives on the phone.
      let genres: string[] = [];
      try {
        genres = (await repository.librarySummary()).genres.filter((g) => g.trim() !== '');
      } catch {
        return;
      }
      if (!alive.current || genres.length === 0) return;
      setOffered((current) => {
        // Anything already chosen stays offered even if the library no longer
        // carries it — otherwise a genre would silently vanish from the screen
        // while still being stored.
        const merged = [...genres.slice(0, MAX_GENRES), ...chosen];
        return [...new Set(merged)];
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repository]);

  const changed = !sameSet(chosen, saved);

  const toggle = useCallback((genre: string) => {
    setChosen((current) =>
      current.includes(genre) ? current.filter((g) => g !== genre) : [...current, genre],
    );
    setSavedJustNow(false);
  }, []);

  const clearAll = useCallback(() => {
    setChosen([]);
    setSavedJustNow(false);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    const next: Preferences = { ...stored.current, genres: chosen };
    await PreferencesStore.save(next);
    // Best effort: the phone is the copy that matters, and the server's is the
    // one that survives a reinstall.
    try {
      await (repository as { savePreferences?: (p: Preferences) => Promise<void> })
        .savePreferences?.(next);
    } catch {
      // As above.
    }
    if (!alive.current) return;
    stored.current = next;
    setSaved(chosen);
    setSaving(false);
    // Stays put rather than popping: the confirmation is on this screen, and
    // being thrown back to Account is a worse answer to "did that work" than
    // being told.
    setSavedJustNow(true);
  }, [chosen, repository]);

  return (
    <View style={{ flex: 1, backgroundColor: Ink }}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.back}
        >
          <ChevronGlyph rotation={180} color={OnInk} size={18} />
        </Pressable>
        <Text style={[TowerType.titleScreen, { color: OnInk, marginLeft: 4 }]}>Genres</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.column}>
          <Text style={[TowerType.bodyProse, { color: OnInkMuted }]}>
            What Home leads with. Picked from what your library actually carries, so the list is
            never fictional.
          </Text>

          {!loading && (
            <View style={styles.chips}>
              {offered.map((genre) => (
                <SelectableChip
                  key={genre}
                  label={genre}
                  selected={chosen.includes(genre)}
                  onPress={() => toggle(genre)}
                />
              ))}
            </View>
          )}

          {savedJustNow && (
            <View style={styles.savedRow}>
              <StatusDot color={DirectPlay} pulsing={false} />
              <DataLabel text="SAVED" color={DirectPlay} technical={false} />
            </View>
          )}

          <AmberButton
            label={saving ? 'Saving…' : 'Save'}
            onPress={() => void save()}
            enabled={changed && !saving}
            style={{ marginTop: 22 }}
          />
          {chosen.length > 0 && (
            <OutlineButton
              label="Clear all"
              onPress={clearAll}
              fillWidth
              style={{ marginTop: 10 }}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * A word you pick, as opposed to a measurement you filter by.
 *
 * The tick's space is held whether or not it is shown. Showing it only when
 * selected made the chip wider on selection, which reflowed every chip to its
 * right — so picking a second genre from the same row missed, because the thing
 * being aimed at had moved out from under the finger. It reads exactly like
 * multiple selection not working.
 */
function SelectableChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: Amber }
          : { borderWidth: 1, borderColor: Hairline },
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={{ opacity: selected ? 1 : 0 }}>
        <CheckGlyph color={AmberInk} size={13} />
      </View>
      <Text
        style={[TowerType.buttonLabel, { color: selected ? AmberInk : OnInk }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((x) => set.has(x));
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
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: TowerReadingMaxWidth,
    paddingHorizontal: Space.Screen,
    paddingBottom: 40,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.Pill,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 20,
  },
});
