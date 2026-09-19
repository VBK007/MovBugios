import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { AssistantScreen } from '@/ui/screens/assistant/AssistantScreen';

export default function AssistantRoute() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top', 'bottom']}>
      <AssistantScreen onBack={() => router.back()} />
    </SafeAreaView>
  );
}
