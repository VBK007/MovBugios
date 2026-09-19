import { useRouter } from 'expo-router';
import React from 'react';

import { ShortsFeed } from '@/ui/screens/teasers/ShortsFeed';

export default function ShortsRoute() {
  const router = useRouter();
  return (
    <ShortsFeed
      onlyFor={null}
      onBack={() => router.back()}
      onOpenTitle={(titleId) => router.push(`/detail/${titleId}`)}
    />
  );
}
