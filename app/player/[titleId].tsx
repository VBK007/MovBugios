import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';

import { PlayerScreen } from '@/ui/screens/player/PlayerScreen';

export default function PlayerRoute() {
  const { titleId, party } = useLocalSearchParams<{ titleId: string; party?: string }>();
  const router = useRouter();


  return (
    <>
      {/* The player draws under the status bar on purpose — video should reach
          the top of the glass. */}
      <StatusBar hidden />
      <PlayerScreen
        titleId={titleId ?? ''}
        // `party` is empty for ordinary playback, a code when watching together.
        partyCode={party && party !== '' ? party : null}
        onCollapse={() => router.back()}
      />
    </>
  );
}
