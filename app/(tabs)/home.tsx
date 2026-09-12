import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { HomeScreen } from '@/ui/screens/home/HomeScreen';

export default function HomeRoute() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top']}>
      <HomeScreen
        onOpenTitle={(titleId) => router.push(`/detail/${titleId}`)}
        onOpenProfile={() => router.push('/profile')}
      />
    </SafeAreaView>
  );
}
