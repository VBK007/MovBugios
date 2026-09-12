import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OnInk, OnInkMuted, Radius, SheetSurface, Space, TowerType } from '@/theme';
import { AmberButton, OutlineButton } from '@/ui/components/Primitives';

/**
 * Shown when a signed-out visitor tries to play something.
 *
 * Browsing is free; playing is not, because the bytes live on someone's private
 * disk and the server will not hand them over without a token. The copy says
 * that plainly rather than implying a paywall — there is nothing to buy here,
 * you just have to be someone the household recognises.
 *
 * Ported from ui/components/SignInRequiredSheet.kt.
 */
export function SignInRequiredSheet({
  title,
  onSignIn,
  onDismiss,
}: {
  title?: string | null;
  onSignIn: () => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Tapping the scrim dismisses; the sheet itself must not. */}
      <Pressable style={styles.scrim} onPress={onDismiss} accessible={false} />

      <View style={[styles.sheet, { paddingBottom: Space.Screen + insets.bottom }]}>
        <Text style={[TowerType.titleSection, { color: OnInk }]}>
          {title ? `Sign in to play "${title}"` : 'Sign in to play'}
        </Text>
        <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 10 }]}>
          You are looking at sample titles. Connect to your own Tower and sign in to watch what is
          actually on your disk.
        </Text>

        <AmberButton label="Connect and sign in" onPress={onSignIn} style={{ marginTop: 18 }} />
        <OutlineButton
          label="Keep looking around"
          onPress={onDismiss}
          fillWidth
          style={{ marginTop: 10, marginBottom: 8 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: SheetSurface,
    borderTopLeftRadius: Radius.Sheet,
    borderTopRightRadius: Radius.Sheet,
    padding: Space.Screen,
  },
});
