import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Amber,
  AmberInk,
  Hairline,
  Ink,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  Space,
  TowerReadingMaxWidth,
  TowerType,
} from '@/theme';
import { PreferencesStore } from '@/data/remote/preferencesStore';
import { RemoteTowerRepository } from '@/data/remote/remoteTowerRepository';
import {
  DefaultPreferences,
  FallbackGenres,
  Language,
  OfferedLanguages,
  Preferences,
  QualityCap,
  QualityCaps,
} from '@/domain/model/preferences';
import { useRepository } from '@/ui/hooks';
import { CheckGlyph } from '@/ui/components/Glyphs';
import { AmberButton, DataLabel, OutlineButton } from '@/ui/components/Primitives';
import { ArtMontage } from '@/ui/components/ArtMontage';
import { RecentArt } from '@/data/remote/recentArt';

/** Past this the screen is a wall of chips rather than a question. */
const MAX_GENRES = 18;

/** The three questions, in order. */
const STEPS = ['LANGUAGE', 'GENRES', 'QUALITY'] as const;
type OnboardingStep = (typeof STEPS)[number];

const CAPS: QualityCap[] = ['LOW', 'MEDIUM', 'HIGH'];

/**
 * The three first-run questions.
 *
 * Each one changes something the app actually does rather than sitting in a
 * settings screen being admired: the language picks a default audio and subtitle
 * track, the genres order what Home leads with, and the quality cap is what a
 * playback decision asks for when there is no Wi-Fi.
 *
 * Skippable throughout — three questions before a shelf is a toll gate if they
 * cannot be waved past.
 *
 * Ported from ui/screens/onboarding/OnboardingScreen.kt and its ViewModel.
 */
export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const repository = useRepository();

  const [step, setStep] = useState<OnboardingStep>('LANGUAGE');
  const [preferences, setPreferences] = useState<Preferences>(DefaultPreferences);
  /**
   * The library's own genres where they are known.
   *
   * Asking someone to pick Westerns from a library with none in it wastes the
   * one question they will answer honestly.
   */
  const [genres, setGenres] = useState<string[]>(FallbackGenres);
  /**
   * The languages the library actually carries, where it can say.
   *
   * Same treatment as the genres above: asking someone to pick Malayalam from a
   * house that holds no Malayalam wastes the one question they will answer
   * honestly. `OfferedLanguages` is what a first run shows anyway, so the
   * server only ever narrows this.
   */
  const [languages, setLanguages] = useState<Language[]>(OfferedLanguages);
  const [saving, setSaving] = useState(false);
  /**
   * The same wall the splash opens on, so the questions feel like part of the
   * app rather than a form in front of it.
   */
  const [art, setArt] = useState<string[]>([]);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const stored = await RecentArt.load();
      if (alive.current) setArt(stored);
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      // Best effort, like the genres below. An unprobed or unreachable library
      // answers with nothing, and the standing list is already on screen.
      try {
        const offered = await repository.libraryLanguages();
        if (alive.current && offered.length > 0) setLanguages(offered);
      } catch {
        // The standing list is already on screen.
      }
    })();
  }, [repository]);

  useEffect(() => {
    void (async () => {
      // Best effort. A server that is asleep or unreachable should not stop
      // someone answering three questions, so the fallback list stands in
      // silently.
      try {
        const summary = await repository.librarySummary();
        const found = summary.genres.filter((g) => g.trim() !== '');
        if (alive.current && found.length > 0) setGenres(found.slice(0, MAX_GENRES));
      } catch {
        // The fallback list is already on screen.
      }
    })();
  }, [repository]);

  const stepIndex = STEPS.indexOf(step);
  const isLast = stepIndex === STEPS.length - 1;
  /** Language is the only answer with no sensible default. */
  const canAdvance = step !== 'LANGUAGE' || preferences.language != null;

  const finish = useCallback(
    async (answers: Preferences) => {
      setSaving(true);
      const completed: Preferences = { ...answers, completed: true };
      await PreferencesStore.save(completed);
      // The server's copy is what survives a reinstall; the phone's is what the
      // app reads. Best effort, because a sleeping disk must not trap anyone on
      // a questionnaire.
      if (repository instanceof RemoteTowerRepository) {
        try {
          await repository.savePreferences(completed);
        } catch {
          // As above.
        }
      }
      if (alive.current) setSaving(false);
      onDone();
    },
    [repository, onDone],
  );

  const next = useCallback(() => {
    if (!isLast) {
      setStep(STEPS[stepIndex + 1]);
      return;
    }
    void finish(preferences);
  }, [isLast, stepIndex, preferences, finish]);

  return (
    <View style={{ flex: 1, backgroundColor: Ink }}>
      {/* Held darker than the splash: text sits directly on top of it here. */}
      <ArtMontage art={art} fallbackSeed="onboarding" scrimStrength={1.05} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {/* Three dots rather than "1 of 3": the count is the point, not the arithmetic. */}
          <View style={styles.progress}>
            {STEPS.map((s, i) => (
              <View
                key={s}
                style={[
                  styles.dot,
                  { backgroundColor: i <= stepIndex ? Amber : Hairline, width: i === stepIndex ? 22 : 7 },
                ]}
              />
            ))}
          </View>

          <Text style={[TowerType.titleScreen, { color: OnInk, marginTop: 26 }]}>
            {step === 'LANGUAGE'
              ? 'What do you watch in?'
              : step === 'GENRES'
                ? 'What do you like?'
                : 'Away from home'}
          </Text>
          <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 10 }]}>
            {step === 'LANGUAGE'
              ? 'Picks the audio and subtitle track a film opens with. You can change it on any title.'
              : step === 'GENRES'
                ? 'Orders what Home leads with. Picked from what your library actually carries.'
                : 'What to ask the server for when you are not on home Wi-Fi, where streaming costs money.'}
          </Text>

          {step === 'LANGUAGE' && (
            <View style={styles.chips}>
              {languages.map((language) => (
                <Chip
                  key={language.code}
                  label={language.name}
                  selected={preferences.language === language.code}
                  onPress={() =>
                    setPreferences((p) => ({ ...p, language: language.code }))
                  }
                />
              ))}
            </View>
          )}

          {step === 'GENRES' && (
            <View style={styles.chips}>
              {genres.map((genre) => (
                <Chip
                  key={genre}
                  label={genre}
                  selected={preferences.genres.includes(genre)}
                  onPress={() =>
                    setPreferences((p) => ({
                      ...p,
                      genres: p.genres.includes(genre)
                        ? p.genres.filter((g) => g !== genre)
                        : [...p.genres, genre],
                    }))
                  }
                />
              ))}
            </View>
          )}

          {step === 'QUALITY' && (
            <View style={{ marginTop: 22 }}>
              {CAPS.map((cap) => {
                const selected = preferences.mobileQuality === cap;
                return (
                  <Pressable
                    key={cap}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setPreferences((p) => ({ ...p, mobileQuality: cap }))}
                    style={({ pressed }) => [
                      styles.qualityRow,
                      { borderColor: selected ? Amber : Hairline, opacity: pressed ? 0.8 : 1 },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[TowerType.titleRow, { color: OnInk }]}>
                        {QualityCaps[cap].label}
                      </Text>
                      <Text style={[TowerType.bodyNote, { color: OnInkFaint, marginTop: 3 }]}>
                        {QualityCaps[cap].detail}
                      </Text>
                    </View>
                    {selected && <CheckGlyph color={Amber} size={16} />}
                  </Pressable>
                );
              })}
            </View>
          )}

          <AmberButton
            label={isLast ? (saving ? 'Saving…' : 'Done') : 'Next'}
            onPress={next}
            enabled={canAdvance && !saving}
            style={{ marginTop: 28 }}
          />

          <View style={styles.footer}>
            {stepIndex > 0 ? (
              <OutlineButton label="Back" onPress={() => setStep(STEPS[stepIndex - 1])} />
            ) : (
              <View />
            )}
            {/*
             * Skippable at every step. Three questions before a shelf is a toll
             * gate if they cannot be waved past, and the defaults are sensible.
             */}
            <Pressable
              accessibilityRole="button"
              onPress={() => void finish(preferences)}
              hitSlop={10}
            >
              <DataLabel text="SKIP" color={OnInkFaint} technical={false} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Chip({
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
        selected ? { backgroundColor: Amber } : { borderWidth: 1, borderColor: Hairline },
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      {/*
       * The tick's space is held whether or not it is shown: revealing it on
       * selection widens the chip, which reflows every chip to its right — so
       * picking a second one from the same row misses, because the thing being
       * aimed at has moved out from under the finger.
       */}
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

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  column: {
    width: '100%',
    maxWidth: TowerReadingMaxWidth,
    padding: Space.Screen,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 7,
    borderRadius: 3.5,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 22,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: Radius.Pill,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: Radius.Card,
    borderWidth: 1,
    padding: 16,
    marginTop: 10,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
});
