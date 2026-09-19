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
        // `replace`, not `push`: six songs in, Back should return to the
        // library rather than walking back through every track played.
        /*
         * The party code rides along.
         *
         * Without it the new route had no party: the socket went with the old
         * screen, and one track change quietly emptied the room — the party
         * looked closed from the host's own phone while the server kept it
         * alive until its reaper noticed nobody was there.
         */
        onPlayTrack={(next) =>
          router.replace({
            pathname: '/player/[titleId]',
            params: { titleId: next, ...(party ? { party } : {}) },
          })
        }
        // Outside a party the icon starts one and hands over to the lobby,
        // where the code to read out lives.
        onStartParty={() => router.push(`/together?item=${titleId}` as never)}
        onCollapse={() => router.back()}
      />
    </>
  );
}
