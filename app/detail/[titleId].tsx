import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';

import { MovieDetailScreen } from '@/ui/screens/detail/MovieDetailScreen';

export default function DetailRoute() {
  const { titleId } = useLocalSearchParams<{ titleId: string }>();
  const router = useRouter();

  return (
    <MovieDetailScreen
      titleId={titleId ?? ''}
      onBack={() => router.back()}
      // `push` rather than `replace`: walking from one title to another through
      // "Also on the disk" is a trail worth being able to walk back up.
      onOpenTitle={(next) => router.push(`/detail/${next}`)}
      onOpenTeasers={() => router.push(`/shorts/${titleId}`)}
      onOpenPlayer={(id) => router.push({ pathname: '/player/[titleId]', params: { titleId: id } })}
    />
  );
}
