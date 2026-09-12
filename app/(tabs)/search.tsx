import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { SearchScreen } from '@/ui/screens/search/SearchScreen';

export default function SearchRoute() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top']}>
      <SearchScreen onOpenTitle={(titleId: string) => router.push(`/detail/${titleId}`)} />
    </SafeAreaView>
  );
}
