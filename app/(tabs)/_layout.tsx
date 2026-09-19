import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Amber, Ink, OnInk, TowerType } from '@/theme';
import { withAlpha } from '@/ui/color';
import { HairlineDivider } from '@/ui/components/Primitives';
import { MiniPlayer } from '@/ui/components/MiniPlayer';
import {
  DownloadGlyph,
  HomeGlyph,
  LibraryGlyph,
  ShortsGlyph,
} from '@/ui/components/Glyphs';

/**
 * The four tabs.
 *
 * Search used to be here and now sits beside the avatar on Home. It is a thing
 * you go and do and come back from, where a tab is a place you live in — and
 * Shorts, which you drop into and scroll, is much more the second than the
 * first. Admin is likewise absent, behind the profile avatar: it belongs to one
 * person in the house rather than to the app's main navigation.
 */
const TABS = [
  { name: 'home', label: 'Home', Glyph: HomeGlyph },
  { name: 'library', label: 'Library', Glyph: LibraryGlyph },
  { name: 'shorts', label: 'Shorts', Glyph: ShortsGlyph },
  { name: 'saved', label: 'Saved', Glyph: DownloadGlyph },
] as const;

export default function TabsLayout() {
  return (
    <Tabs
      // The stock tab bar is replaced wholesale rather than restyled: the board
      // asks for four mono labels over a hairline with no fill and no icons,
      // which is further from a platform tab bar than theming can take it.
      tabBar={(props) => <BottomBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: Ink },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}

/**
 * The bottom bar, matching the board exactly: four equal columns of uppercase
 * mono over a hairline, and nothing else.
 *
 * A mark over each word, both in the one colour. The mark is what the thumb
 * aims at and the eye finds at a glance; the word underneath is what makes it
 * unambiguous, which is why neither replaces the other. Selection stays the
 * amber rather than becoming a second weight — swapping outline for fill on
 * selection would make the row jump.
 *
 * The bar has no fill: it sits on the app background and is separated by the
 * same 1px hairline used everywhere else, so it reads as part of the page rather
 * than a tray docked over it.
 */
function BottomBar({
  state,
  navigation,
}: {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /*
   * Not over Shorts. That feed plays its own sound, so the bar there is always a
   * paused one, and it squeezes a full-bleed clip to say nothing.
   */
  const onShorts = state.routes[state.index]?.name === 'shorts';

  return (
    <View style={{ backgroundColor: Ink }}>
      {!onShorts && (
        <MiniPlayer
          onExpand={(titleId) =>
            router.push({ pathname: '/player/[titleId]', params: { titleId } })
          }
        />
      )}
      <HairlineDivider />
      <View style={[styles.row, { paddingBottom: insets.bottom }]}>
        {state.routes.map((route, index) => {
          const tab = TABS.find((t) => t.name === route.name);
          if (!tab) return null;
          const isSelected = state.index === index;
          const tint = isSelected ? Amber : withAlpha(OnInk, 0.4);
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              onPress={() => navigation.navigate(route.name)}
              style={styles.tab}
            >
              <tab.Glyph color={tint} size={19} />
              {/*
               * 9.5sp, no tracking. `dataLabel` carries 0.12em, which the board
               * does not, and at four items across it spread the labels into the
               * gutters.
               */}
              <Text style={[TowerType.navLabel, { color: tint, marginTop: 3 }]}>
                {tab.label.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
