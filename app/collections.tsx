import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { CollectionsScreen } from '@/ui/screens/collections/CollectionsScreen';

export default function CollectionsRoute() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top']}>
      <CollectionsScreen
        onBack={() => router.back()}
        onOpen={(collection) =>
          /*
           * Both as query parameters, not a path segment: a discovered
           * collection's id is `discovered:genre:action`, and colons in a path
           * are a fight with the router nobody needs to have. The name rides
           * along so the heading is right before the titles arrive.
           */
          router.push({
            pathname: '/collection',
            params: { id: collection.id, name: collection.name },
          })
        }
      />
    </SafeAreaView>
  );
}
