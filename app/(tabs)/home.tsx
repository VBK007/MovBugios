import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { HomeScreen } from '@/ui/screens/home/HomeScreen';
import { playMusicFrom } from '@/player/playMusic';
import { usePlayGate } from '@/ui/playGate';

export default function HomeRoute() {
  const router = useRouter();
  const gate = usePlayGate();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top']}>
      <HomeScreen
        onOpenTitle={(titleId) => router.push(`/detail/${titleId}`)}
        onOpenProfile={() => router.push('/profile')}
        onOpenSearch={() => router.push('/search')}
        // The same gate a film goes through. A track needs a stream, a stream
        // needs a token, and without one the queue started, reported itself as
        // playing, and produced silence.
        onPlayMusic={(tracks, index) =>
          gate.requireAccount(tracks[index]?.name, () =>
            playMusicFrom(tracks, index, (titleId) =>
              router.push({ pathname: '/player/[titleId]', params: { titleId } }),
            ),
          )
        }
      />
      {gate.sheet}
    </SafeAreaView>
  );
}
