import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { SavedScreen } from '@/ui/screens/saved/SavedScreen';
import { usePlayGate } from '@/ui/playGate';

export default function SavedRoute() {
  // A saved copy is already on the phone, so tapping one plays it rather than
  // opening its detail page — matching `onOpenTitle = { play(it) }` in the nav host.
  const gate = usePlayGate();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top']}>
      <SavedScreen onOpenTitle={(titleId: string) => gate.play(titleId)} />
      {gate.sheet}
    </SafeAreaView>
  );
}
