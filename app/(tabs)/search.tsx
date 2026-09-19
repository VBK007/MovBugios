import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { SearchScreen } from '@/ui/screens/search/SearchScreen';

/**
 * Search is pushed from Home rather than switched to from the bar, so it gets a
 * back arrow. It lives under the tab group all the same, which is what keeps the
 * bottom bar visible under it.
 */
export default function SearchRoute() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top']}>
      <SearchScreen
        onOpenTitle={(titleId: string) => router.push(`/detail/${titleId}`)}
        onOpenAssistant={() => router.push('/assistant')}
        onBack={() => router.back()}
      />
    </SafeAreaView>
  );
}
