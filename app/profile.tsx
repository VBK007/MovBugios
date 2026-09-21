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
           * is one password rather than finding the house again — and so the
           * catalogue stays browsable meanwhile, as a visitor's.
           *
           * The repository does not change any more: what changes is the guest
           * flag, which is what withholds playback and the personal rails. Home
           * is still rebuilt rather than returned to, because its rails were
           * loaded for an account that no longer exists here.
           */
          void (async () => {
            const repository = ServiceLocator.repository;
            if (repository instanceof RemoteTowerRepository) await repository.signOut();
            ServiceLocator.refreshGuest();
            router.replace('/home');
          })();
        }}
      />
    </SafeAreaView>
  );
}
