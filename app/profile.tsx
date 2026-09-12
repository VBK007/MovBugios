import { useRouter } from 'expo-router';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { ServiceLocator } from '@/di/serviceLocator';
import { RemoteTowerRepository } from '@/data/remote/remoteTowerRepository';
import { AccountScreen } from '@/ui/screens/account/AccountScreen';

export default function ProfileRoute() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top', 'bottom']}>
      <AccountScreen
        onBack={() => router.back()}
        onOpenAdmin={() => router.push('/admin')}
        onOpenGenres={() => router.push('/genres')}
        onJoinParty={() => router.push('/together')}
        onSignIn={() => router.push('/connect')}
        onSignOut={() => {
          /*
           * Clears the token but leaves the server address, so signing back in
           * is one password rather than finding the house again. Home has to be
           * rebuilt rather than returned to: its state captured the repository
           * it was built with, and that is now the sample one.
           */
          void (async () => {
            const repository = ServiceLocator.repository;
            if (repository instanceof RemoteTowerRepository) await repository.signOut();
            ServiceLocator.useSampleData();
            router.replace('/home');
          })();
        }}
      />
    </SafeAreaView>
  );
}
