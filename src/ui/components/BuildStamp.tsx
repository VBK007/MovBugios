import * as Updates from 'expo-updates';
import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';

import { DataMeta } from '@/ui/components/Primitives';

/**
 * Which JS bundle is actually running, in eight characters of mono.
 *
 * There is no dev server on this setup — the app is loaded from a published
 * update — so there is no console and no other way to tell a stale bundle from a
 * fresh one. Without this, a publish that has not yet been applied looks exactly
 * like a publish that did not work, which has already cost an hour once.
 *
 * `technical={false}` on purpose: this is a diagnostic, and hiding it when
 * somebody turns technical badges off would defeat the one job it has.
 */
export function BuildStamp({ style }: { style?: StyleProp<ViewStyle> }) {
  const id = Updates.updateId;
  const embedded = Updates.isEmbeddedLaunch;

  // No update id means this is the bundle that shipped inside the binary — in
  // Expo Go, that is the "we never reached EAS" case, which is worth saying
  // rather than showing a blank.
  const label = id
    ? `BUILD ${id.slice(0, 8).toUpperCase()}${embedded ? ' · EMBEDDED' : ''}`
    : 'BUILD · LOCAL';

  return <DataMeta text={label} technical={false} style={style} />;
}
