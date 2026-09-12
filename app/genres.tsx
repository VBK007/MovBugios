import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { GenresScreen } from '@/ui/screens/preferences/GenresScreen';

export default function GenresRoute() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top']}>
      <GenresScreen onBack={() => router.back()} />
    </SafeAreaView>
  );
}
