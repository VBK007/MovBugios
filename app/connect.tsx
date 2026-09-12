import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { ConnectScreen } from '@/ui/screens/connect/ConnectScreen';

export default function ConnectRoute() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top']}>
      <ConnectScreen
        onDone={() => {
          /*
           * `replace` rather than `push`, for the same reason Connect is kept
           * off the Android back stack: once you are in, going "back" to the
           * address field is a settings action, not a navigation one.
           */
          router.replace('/home');
        }}
      />
    </SafeAreaView>
  );
}
