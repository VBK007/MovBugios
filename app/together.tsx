import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { WatchTogetherScreen } from '@/ui/screens/together/WatchTogetherScreen';

/**
 * Hosting takes a title; joining takes a code. One route with two optional
 * parameters rather than two routes, because the screen is the same lobby either
 * way — only the first call it makes differs.
 */
export default function TogetherRoute() {
  const { item, code } = useLocalSearchParams<{ item?: string; code?: string }>();
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top']}>
      <WatchTogetherScreen
        mediaItemId={item && item !== '' ? item : null}
        joinCode={code && code !== '' ? code : null}
        onBack={() => router.back()}
        onStartWatching={(mediaItemId, partyCode) =>
          router.push(`/player/${mediaItemId}?party=${partyCode}` as never)
        }
      />
    </SafeAreaView>
  );
}
