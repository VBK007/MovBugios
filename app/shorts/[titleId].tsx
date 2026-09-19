import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShortsFeed } from '@/ui/screens/teasers/ShortsFeed';

/** One film's own clips, in the same feed the whole library uses. */
export default function TitleShortsRoute() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { titleId } = useLocalSearchParams<{ titleId: string }>();
  return (
    <ShortsFeed
      onlyFor={titleId}
      // No tab bar under this one, so the caption has to clear the home
      // indicator itself.
      bottomInset={insets.bottom}
      onBack={() => router.back()}
      onOpenTitle={(id) => router.push(`/detail/${id}`)}
    />
  );
}
