import { Tabs } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Amber, Ink, OnInk, TowerType } from '@/theme';
import { withAlpha } from '@/ui/color';
import { HairlineDivider } from '@/ui/components/Primitives';

/**
 * The four tabs. Admin is deliberately absent — it lives behind the profile
 * avatar on Home, because it belongs to one person in the house, not to the
 * app's main navigation.
 */
const TABS = [
  { name: 'home', label: 'Home' },
  { name: 'library', label: 'Library' },
  { name: 'search', label: 'Search' },
  { name: 'saved', label: 'Saved' },
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
 * There are deliberately **no icons**. Four destinations named in 9.5sp mono
 * read as a directory rather than a toolbar, which is the register the whole app
 * is in — and an icon for "Saved" that is not a floppy disk or a download arrow
 * would need a label underneath it anyway.
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

  return (
    <View style={{ backgroundColor: Ink }}>
      <HairlineDivider />
      <View style={[styles.row, { paddingBottom: insets.bottom }]}>
        {state.routes.map((route, index) => {
          const tab = TABS.find((t) => t.name === route.name);
          if (!tab) return null;
          const isSelected = state.index === index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              onPress={() => navigation.navigate(route.name)}
              style={styles.tab}
            >
              {/*
               * 9.5sp, no tracking. `dataLabel` carries 0.12em, which the board
               * does not, and at four items across it spread the labels into the
               * gutters.
               */}
              <Text
                style={[
                  TowerType.navLabel,
                  { color: isSelected ? Amber : withAlpha(OnInk, 0.4) },
                ]}
              >
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
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
