import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { FixMatchScreen } from '@/ui/screens/fixmatch/FixMatchScreen';

export default function FixMatchesRoute() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top']}>
      <FixMatchScreen onBack={() => router.back()} />
    </SafeAreaView>
  );
}
