import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { AdminScreen } from '@/ui/screens/admin/AdminScreen';

export default function AdminRoute() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top']}>
      <AdminScreen onBack={() => router.back()} onOpenFixMatches={() => router.push('/fix-matches')} />
    </SafeAreaView>
  );
}
