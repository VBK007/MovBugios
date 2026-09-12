import React, { useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  UIManager,
  View,
  ViewStyle,
} from 'react-native';

import {
  Amber,
  AmberChipFill,
  Hairline,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  PosterGradients,
  Radius,
  Space,
  TowerType,
} from '@/theme';
import { withAlpha } from '@/ui/color';
import { StarGlyph } from '@/ui/components/Glyphs';
import { DataLabel } from '@/ui/components/Primitives';

/** Roughly four lines of `bodyProse` across a phone. */
const FOLD_AFTER_CHARS = 260;
const COLLAPSED_LINES = 4;
const MAX_CAST = 12;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * The score, as the one number anyone checks first.
 *
 * Ported from ui/components/TitleFacts.kt.
 */
export function RatingPill({ rating, style }: { rating: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.ratingPill, style as never]}>
      <StarGlyph color={Amber} size={11} />
      {/*
       * One decimal always, so 8 and 8.4 do not shift the pill's width as the
       * eye moves down a list of them.
       */}
      <Text style={[TowerType.dataValue, { color: Amber }]}>{formatRating(rating)}</Text>
    </View>
  );
}

/** `U/A 13+` — the age rating, verbatim from whoever wrote the metadata. */
export function CertificationPill({
  certification,
  style,
}: {
  certification: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.outlinePill, style as never]}>
      <Text style={[TowerType.dataMeta, { color: OnInkMuted }]}>{certification}</Text>
    </View>
  );
}

/** Evidence the title was matched: an IMDb id exists for it. */
export function ImdbMark({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.outlinePill, style as never]}>
      <Text style={[TowerType.dataMeta, { color: OnInkFaint }]}>IMDB</Text>
    </View>
  );
}

/**
 * `8.4`, `10`, `7` — trailing zeros dropped, one decimal kept.
 *
 * Rounded, not truncated. 7.1 is not exactly representable as a double, so
 * `7.1 * 10` is 70.99999999999999 and truncating it prints a 7.1 rating as "7".
 */
export function formatRating(rating: number): string {
  const tenths = Math.round(rating * 10);
  const whole = Math.trunc(tenths / 10);
  const remainder = tenths % 10;
  return remainder === 0 ? String(whole) : `${whole}.${remainder}`;
}

/**
 * The story, and the line the poster sold it with.
 *
 * Collapsed to four lines with a "Read more" underneath, because a plot summary
 * runs to a paragraph and the cast below it should not need scrolling past one.
 * Expanding animates the height rather than jumping — the text is what the eye
 * is tracking, and a jump loses its place.
 */
export function Storyline({
  synopsis,
  tagline,
  style,
}: {
  synopsis: string;
  tagline?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const [expanded, setExpanded] = useState(false);
  // Only worth an affordance if there is something behind it. Four lines of this
  // column is roughly this many characters, and offering "Read more" on a
  // summary that already fits is worse than not offering it.
  const longEnoughToFold = synopsis.length > FOLD_AFTER_CHARS;

  return (
    <View style={style}>
      <DataLabel text="THE STORY" technical={false} />

      {tagline != null && tagline.trim() !== '' && (
        <Text style={[TowerType.titleItem, { color: withAlpha(Amber, 0.85), marginTop: 10 }]}>
          {tagline}
        </Text>
      )}

      <Text
        style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 10 }]}
        numberOfLines={expanded || !longEnoughToFold ? undefined : COLLAPSED_LINES}
        ellipsizeMode="tail"
      >
        {synopsis}
      </Text>

      {longEnoughToFold && (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setExpanded((e) => !e);
          }}
        >
          <Text style={[TowerType.chipLabel, { color: Amber, marginTop: 8 }]}>
            {expanded ? 'Read less' : 'Read more'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Who made it and who is in it, as a row of faces that are not faces.
 *
 * The server stores cast as names in billing order and no portraits — there is
 * no person endpoint and no images to fetch — so each one gets a monogram in a
 * colour derived from the name. It is honest about having no photograph while
 * still giving the row something to scan, which a column of grey text does not.
 *
 * Directors lead, because "who made this" is the question a cast list cannot
 * answer and the one people ask of an unfamiliar film.
 */
export function CastRail({
  cast,
  directors,
  onPerson,
  style,
}: {
  cast: string[];
  directors: string[];
  onPerson?: (name: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const people: { name: string; role: string | null }[] = [
    ...directors.map((name) => ({ name, role: 'DIRECTOR' })),
    // Capped: the first dozen are the billed names anyone recognises, and a full
    // crew dump turns a rail into a scroll of strangers.
    ...cast.slice(0, MAX_CAST).map((name) => ({ name, role: null })),
  ];
  if (people.length === 0) return null;

  return (
    <View style={style}>
      <DataLabel
        text="CAST & CREW"
        technical={false}
        style={{ paddingHorizontal: Space.Screen }}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: Space.Screen,
          paddingTop: 12,
          gap: 14,
        }}
      >
        {people.map(({ name, role }) => (
          <PersonBubble
            key={`${role}/${name}`}
            name={name}
            role={role}
            onPress={onPerson ? () => onPerson(name) : undefined}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function PersonBubble({
  name,
  role,
  onPress,
}: {
  name: string;
  role: string | null;
  onPress?: () => void;
}) {
  const tint = PosterGradients[stableIndex(name, PosterGradients.length)][0];

  const body = (
    <>
      <View
        style={[
          styles.bubble,
          { backgroundColor: withAlpha(tint, 0.2), borderColor: withAlpha(tint, 0.35) },
        ]}
      >
        <Text style={[TowerType.titleItem, { color: tint }]}>{initialsOf(name)}</Text>
      </View>
      <Text
        style={[TowerType.bodyNote, { color: OnInk, textAlign: 'center', marginTop: 8 }]}
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {name}
      </Text>
      {role != null && (
        <DataLabel
          text={role}
          technical={false}
          color={OnInkFaint}
          style={{ marginTop: 3 }}
        />
      )}
    </>
  );

  if (!onPress) return <View style={styles.person}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.person, { opacity: pressed ? 0.7 : 1 }]}
    >
      {body}
    </Pressable>
  );
}

/**
 * `Vishnu Vishal` → `VV`, `Prabhu` → `P`.
 *
 * First and last rather than the first two words: a three-part name belongs to
 * one person, and `VVK` reads as an acronym rather than as initials.
 */
export function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/[ .]/)
    .filter((p) => p.trim() !== '');
  if (parts.length === 0) return '?';
  const first = parts[0][0].toUpperCase();
  if (parts.length === 1) return first;
  return first + parts[parts.length - 1][0].toUpperCase();
}

/** Kotlin's `hashCode().mod(n)` — always non-negative, unlike JS `%`. */
function stableIndex(seed: string, size: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
  }
  return ((hash % size) + size) % size;
}

/**
 * What the screen says when the catalogue has neither story nor cast.
 *
 * Said out loud rather than left as a gap. A blank where a summary should be
 * reads as the app failing; naming it as unmatched metadata puts the fault where
 * it belongs and points at the screen that fixes it.
 */
export function NoMetadataNote({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.noMetadata, style as never]}>
      <DataLabel text="NOTHING MATCHED" technical={false} />
      <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 8 }]}>
        Tower has the file but no story, cast or score for it — nobody wrote metadata beside it on
        the disk. Fix wrong matches, under the owner tools, can attach the right title.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: Radius.Pill,
    backgroundColor: AmberChipFill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  outlinePill: {
    borderRadius: Radius.Pill,
    borderWidth: 1,
    borderColor: Hairline,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  person: {
    width: 72,
    alignItems: 'center',
  },
  bubble: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noMetadata: {
    width: '100%',
    borderRadius: Radius.Card,
    borderWidth: 1,
    borderColor: Hairline,
    padding: 16,
  },
});
