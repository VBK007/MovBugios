import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { ShelfScreen } from '@/ui/screens/library/ShelfScreen';

export default function ShelfRoute() {
  const router = useRouter();
  const { shelfKey, title } = useLocalSearchParams<{ shelfKey: string; title?: string }>();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top']}>
      <ShelfScreen
        shelfKey={shelfKey}
        title={title ?? 'Shelf'}
        onBack={() => router.back()}
        onOpenPlayer={(titleId) => router.push({ pathname: '/player/[titleId]', params: { titleId } })}
      />
    </SafeAreaView>
  );
}
