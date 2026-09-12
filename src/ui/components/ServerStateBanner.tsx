import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import {
  Amber,
  AmberBorderSoft,
  AmberWash,
  Asleep,
  DirectPlay,
  Hairline,
  OnInkMuted,
  Radius,
  Surface1,
  TowerType,
} from '@/theme';
import { ServerState, statusLine } from '@/domain/model/server';
import { AmberButton, DataLabel, OutlineButton, StatusDot } from '@/ui/components/Primitives';

/**
 * The one-line server status that sits in the Home header — a dot and a mono
 * line, nothing more when everything is fine.
 *
 * Ported from ui/components/ServerStateBanner.kt.
 */
export function ServerStatusLine({
  state,
  style,
}: {
  state: ServerState;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.statusLine, style as never]}>
      <StatusDot
        color={dotColor(state)}
        pulsing={state.type === 'ONLINE' || state.type === 'WAKING'}
      />
      {/*
       * Not technical: this is the app telling you whether it can reach your
       * disk, which a non-technical family member needs as much as anyone.
       */}
      <DataLabel text={statusLine(state)} technical={false} />
    </View>
  );
}

/**
 * The fuller banner, for when the state is worth explaining rather than just
 * reporting. Renders nothing when the server is online — a healthy server does
 * not need a banner saying so.
 */
export function ServerStateBanner({
  state,
  onWake,
  onChooseSaved,
  style,
}: {
  state: ServerState;
  onWake?: () => void;
  onChooseSaved?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const copy = bannerCopy(state);
  if (!copy) return null;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: copy.urgent ? AmberWash : Surface1,
          borderColor: copy.urgent ? AmberBorderSoft : Hairline,
        },
        style as never,
      ]}
    >
      <View style={styles.bannerHead}>
        <StatusDot color={dotColor(state)} pulsing={state.type === 'WAKING'} />
        <DataLabel text={copy.headline} color={copy.urgent ? Amber : Asleep} technical={false} />
      </View>

      <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 9 }]}>{copy.body}</Text>

      {state.type === 'SLEEPING' && onWake && (
        <AmberButton label="Wake the server" onPress={onWake} style={{ marginTop: 13 }} />
      )}
      {state.type === 'AWAY_FROM_HOME' && onChooseSaved && (
        <OutlineButton
          label="Play saved copies only"
          onPress={onChooseSaved}
          fillWidth
          style={{ marginTop: 13 }}
        />
      )}
    </View>
  );
}

interface BannerCopy {
  headline: string;
  body: string;
  urgent: boolean;
}

/**
 * The copy is deliberately specific — "about eight seconds", "two hours idle" —
 * because a vague delay feels broken and a stated one feels like a machine doing
 * its job.
 */
function bannerCopy(state: ServerState): BannerCopy | null {
  switch (state.type) {
    case 'ONLINE':
      return null;
    case 'SLEEPING':
      return {
        headline: 'TOWER · SLEEPING',
        body:
          'The disk spins down after two hours idle to save power and wear. Waking it takes ' +
          'about eight seconds. Anything you have saved to this phone plays right now without ' +
          'waking anything.',
        urgent: false,
      };
    case 'WAKING':
      return {
        headline: 'TOWER · WAKING',
        body: 'Spinning the disk up. This usually takes about eight seconds.',
        urgent: false,
      };
    case 'AWAY_FROM_HOME':
      return {
        headline: state.onMobileData ? 'AWAY FROM HOME · MOBILE DATA' : 'AWAY FROM HOME',
        body:
          'You are not on home Wi-Fi. Streaming from Tower will use your data plan, and your ' +
          'home upload is capped at 3 Mbps, so anything above 720p will stall.',
        urgent: true,
      };
    case 'UNREACHABLE':
      return {
        headline: 'TOWER · NOT FOUND',
        body:
          'We cannot see the server on this network. Saved copies still play. If you are at ' +
          'home, check the server is switched on.',
        urgent: false,
      };
  }
}

function dotColor(state: ServerState): string {
  switch (state.type) {
    case 'ONLINE':
      return DirectPlay;
    case 'WAKING':
    case 'AWAY_FROM_HOME':
      return Amber;
    case 'SLEEPING':
    case 'UNREACHABLE':
      return Asleep;
  }
}

const styles = StyleSheet.create({
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  banner: {
    width: '100%',
    borderRadius: Radius.Card,
    borderWidth: 1,
    padding: 14,
  },
  bannerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
