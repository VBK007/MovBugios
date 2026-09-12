import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Ink } from '@/theme';
import { TimelineScreen } from '@/ui/screens/timeline/TimelineScreen';
import { usePlayGate } from '@/ui/playGate';

export default function TimelineRoute() {
  // A clip opens by playing it, as it does in the nav host.
  const gate = usePlayGate();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Ink }} edges={['top']}>
      <TimelineScreen onOpenTitle={(titleId) => gate.play(titleId)} />
      {gate.sheet}
    </SafeAreaView>
  );
}
