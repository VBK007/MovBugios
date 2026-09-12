import { Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Ink, TowerTheme, useTowerFonts } from '@/theme';
import { GoogleSignIn } from '@/auth/googleSignIn';
import { SocialSignInProvider } from '@/auth/socialSignIn';

// The platform entry point installs the real implementation, exactly as
// MainViewController does on iOS. It reports itself unavailable when there is no
// Firebase config or when running in Expo Go, so the Google button hides itself
// rather than offering a flow that cannot complete.
SocialSignInProvider.install(new GoogleSignIn());

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden, or the module is unavailable in this context. Not worth
  // failing a launch over.
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useTowerFonts();

  /*
   * The app is portrait; the player is the one screen that rotates, and it
   * releases this itself.
   *
   * Done here rather than through app.json's `orientation`, because that writes
   * a portrait-only Info.plist and `ScreenOrientation` cannot unlock past what
   * the plist permits — the rotate button would have been dead in a real build
   * however it was wired.
   */
  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // Holding the splash rather than rendering: the two-typeface rule is load
  // bearing here, and a frame of system sans in a 9.5sp mono slot is worse than
  // a moment more of the launch screen. A font that fails outright still lets
  // the app through — the fallback is ugly, not broken.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <TowerTheme>
        {/* Tower is dark-only, so the bars are light on every screen. */}
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: Ink }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Ink },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="connect" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="detail/[titleId]" />
            {/*
             * Full-bleed: no animation that reveals a letterboxed frame mid-push.
             *
             * `gestureEnabled: false` because the scrubber spans the full width,
             * so a horizontal drag on it is indistinguishable from an edge swipe
             * and the screen was popping mid-seek. The player has its own back
             * button, which is the only way out it should have.
             */}
            <Stack.Screen
              name="player/[titleId]"
              options={{ animation: 'fade', gestureEnabled: false }}
            />
          </Stack>
        </View>
      </TowerTheme>
    </SafeAreaProvider>
  );
}
