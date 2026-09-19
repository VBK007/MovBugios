import React from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import {
  Amber,
  AmberInk,
  OnInk,
  OnInkFaint,
  Radius,
  Space,
  Surface2,
  TowerType,
} from '@/theme';
import { CloseGlyph } from '@/ui/components/Glyphs';
import { withAlpha } from '@/ui/color';

/** One filter, named by a measurement, so its label is mono. */
export interface FilterChipSpec {
  id: string;
  label: string;
  selected?: boolean;
  /** Appends a `⌄` and marks the chip as opening a menu rather than toggling. */
  isMenu?: boolean;
}

/**
 * The mono chip row under a screen title — `UNWATCHED`, `4K ONLY`, `A→Z ⌄`.
 *
 * These stay visible when technical badges are off: they are controls, not
 * badges, and hiding a filter would leave the grid silently filtered.
 *
 * Ported from ui/components/Chips.kt.
 */
export function FilterChipRow({
  chips,
  onToggle,
  contentPadding = true,
  style,
}: {
  chips: FilterChipSpec[];
  onToggle: (id: string) => void;
  contentPadding?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={{
        gap: 8,
        alignItems: 'center',
        paddingHorizontal: contentPadding ? Space.Screen : 0,
      }}
    >
      {chips.map((chip) => (
        <MonoChip key={chip.id} chip={chip} onPress={() => onToggle(chip.id)} />
      ))}
    </ScrollView>
  );
}

function MonoChip({ chip, onPress }: { chip: FilterChipSpec; onPress: () => void }) {
  const selected = chip.selected ?? false;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.monoChip,
        selected
          ? { backgroundColor: Amber }
          : { backgroundColor: Surface2, borderWidth: 1, borderColor: withAlpha('#FFFFFF', 0.1) },
        { opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Text
        style={[TowerType.dataLabel, { color: selected ? AmberInk : OnInkFaint }]}
        numberOfLines={1}
      >
        {chip.isMenu ? `${chip.label.toUpperCase()} ⌄` : chip.label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

/**
 * The category row — Films / Anime / Ours / Music. These are words a person
 * chose, so they are Archivo, not mono. That difference is the whole reason the
 * two rows sit next to each other and still read as different kinds of control.
 */
export function CategoryChipRow({
  labels,
  selectedIndex,
  onSelect,
  contentPadding = true,
  style,
}: {
  labels: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  contentPadding?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={{
        gap: 8,
        alignItems: 'center',
        paddingHorizontal: contentPadding ? Space.Screen : 0,
      }}
    >
      {labels.map((label, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(index)}
            style={({ pressed }) => [
              styles.categoryChip,
              isSelected
                ? { backgroundColor: Amber }
                : {
                    backgroundColor: Surface2,
                    borderWidth: 1,
                    borderColor: withAlpha('#FFFFFF', 0.1),
                  },
              { opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Text
              style={[
                TowerType.chipLabel,
                { color: isSelected ? AmberInk : withAlpha(OnInk, 0.72) },
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  monoChip: {
    minHeight: 32,
    borderRadius: Radius.Pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  categoryChip: {
    minHeight: 34,
    borderRadius: Radius.Pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
});

/** The category chips, in board order. `null` is "All". */
export const AllCategoriesLabel = 'All';

export function CategoryRowSpacer() {
  return <View style={{ height: 10 }} />;
}

/**
 * Something already applied, with the means to take it back off.
 *
 * Unlike `SelectableChip` this is not a choice being offered — it is a
 * statement of what is currently in force, which is why it is drawn filled and
 * quiet rather than amber. The cross is the only part that is an action.
 *
 * `onRemove` is nullable because not every applied thing can be un-applied;
 * when it is null the chip is a label and says so by having nothing to press.
 */
export function RemovableChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove?: (() => void) | null;
}) {
  const body = (
    <>
      <Text style={[TowerType.buttonLabel, { color: OnInk }]} numberOfLines={1}>
        {label}
      </Text>
      {onRemove != null && <CloseGlyph color={OnInkFaint} size={11} />}
    </>
  );

  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 7,
    borderRadius: Radius.Pill,
    backgroundColor: Surface2,
    paddingLeft: 12,
    paddingRight: onRemove != null ? 9 : 12,
    paddingVertical: 7,
  };

  if (onRemove == null) return <View style={style}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Remove ${label}`}
      onPress={onRemove}
      style={({ pressed }) => [style, { opacity: pressed ? 0.7 : 1 }]}
    >
      {body}
    </Pressable>
  );
}
