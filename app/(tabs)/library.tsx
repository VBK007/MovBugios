import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { LibraryScreen } from '@/ui/screens/library/LibraryScreen';

export default function LibraryRoute() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top']}>
      <LibraryScreen onOpenTitle={(titleId: string) => router.push(`/detail/${titleId}`)} />
    </SafeAreaView>
  );
}
