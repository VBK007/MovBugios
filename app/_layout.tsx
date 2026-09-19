import { ClientCapabilities } from '@/domain/model/player';
import { ServiceLocator } from '@/di/serviceLocator';
import { MusicPlayback } from '@/player/musicPlayback';
import { MusicQueue } from '@/player/musicQueue';
import { Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Ink, TowerTheme, useTowerFonts } from '@/theme';
import { showTechnicalBadgesFlow } from '@/data/uiSettings';
import { useFlow } from '@/ui/hooks';
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

/**
 * What this device can play, for a track the queue reaches on its own.
 *
 * A fixed set rather than the player screen's, which reads a quality cap the
 * user chose for video. A song has no resolution to cap, and the screen that
 * holds that preference is not on screen when this runs.
 */
const MUSIC_CAPABILITIES: ClientCapabilities = {
  deviceName: 'iPhone',
  videoCodecs: ['h264', 'hevc'],
  // No Dolby Digital here either, and for the same reason — see the player's
  // own capabilities for the whole of it.
  audioCodecs: ['aac', 'mp3', 'alac', 'flac'],
  containers: ['mp4', 'mov', 'm4v', 'mp3', 'flac', 'm4a'],
  maxHeight: null,
  supportsHls: true,
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useTowerFonts();
  // Read here, at the root, because it governs every mono label in the app.
  const showTechnicalBadges = useFlow(showTechnicalBadgesFlow);

  /*
   * The two things music needs that no screen can own.
   *
   * Installed here because both have to keep working with the player screen
   * gone: a resume position that stops being recorded the moment somebody
   * swipes down would be confidently wrong rather than merely absent, and a
   * track ending in a pocket has no screen alive to start the next one.
   */
  useEffect(() => {
    MusicPlayback.onProgress = (titleId, positionSeconds) => {
      void ServiceLocator.repository.recordProgress(titleId, positionSeconds);
    };
    MusicQueue.install(async (track) => {
      const repository = ServiceLocator.repository;
      const decided = await repository.playbackDecision(track.id, MUSIC_CAPABILITIES, 0);
      return {
        titleId: track.id,
        name: track.name,
        artist: track.artist ?? null,
        artworkUrl: track.posterUrl ?? null,
        url: decided.url,
        headers: decided.headers,
      };
    });
  }, []);

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
      <TowerTheme showTechnicalBadges={showTechnicalBadges}>
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
