import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { CollectionItemsScreen } from '@/ui/screens/collections/CollectionsScreen';

export default function CollectionRoute() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top']}>
      <CollectionItemsScreen
        collectionId={id}
        name={name ?? 'Collection'}
        onBack={() => router.back()}
        onOpenTitle={(titleId) => router.push(`/detail/${titleId}`)}
      />
    </SafeAreaView>
  );
}
