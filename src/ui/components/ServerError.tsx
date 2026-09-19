import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import {
  Amber,
  Ink,
  Motion,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Space,
  TowerReadingMaxWidth,
  TowerType,
} from '@/theme';
import { withAlpha } from '@/ui/color';
import { UiState } from '@/ui/uiState';
import { DiskGlyph, MoonGlyph, SearchGlyph } from '@/ui/components/Glyphs';
import { AmberButton, DataMeta } from '@/ui/components/Primitives';

/**
 * Which kind of nothing this is.
 *
 * Kept apart because they mean different things and have different remedies —
 * one has a button, one has a button that does something else, and two have
 * none. Collapsing them into "error" would be the app telling somebody their
 * server is broken when it is merely asleep.
 */
export type ServerErrorKind =
  /** The disk is spun down. Recoverable, and the one state worth waiting in. */
  | 'ASLEEP'
  /** We cannot reach the server at all. */
  | 'OFFLINE'
  /** The request succeeded and there is genuinely nothing to show. */
  | 'EMPTY'
  /** This server has no handler for it — almost always a build that predates it. */
  | 'UNSUPPORTED';

const HEADINGS: Record<ServerErrorKind, string> = {
  ASLEEP: 'The disk is asleep',
  OFFLINE: 'Cannot reach Tower',
  EMPTY: 'Nothing here',
  UNSUPPORTED: 'This server is older than the app',
};

/**
 * What a screen shows instead of content, whatever went wrong.
 *
 * Every screen used to carry its own near-identical version of this — thirteen
 * of them, drifting apart a heading at a time. One component means a failure
 * looks the same wherever it happens, which is most of what makes a degraded
 * state feel designed rather than forgotten.
 *
 * The two-typeface rule decides what goes where. The heading and the sentence
 * are Archivo, because they are what a person would say. The status line is
 * mono and sits behind the technical-badges switch, because `HTTP 503` is
 * something the server measured — and somebody who has turned badges off has
 * said they do not want to be handed status codes.
 *
 * Amber appears only on the button. It is this app's accent for actions, and an
 * error is not an action; painting the whole panel amber would make every
 * hiccup look like an alarm.
 *
 * Only `ASLEEP` animates on a loop. A sleeping disk is a state somebody is
 * waiting *in*, and a slow breath says the app is still there waiting with them.
 * Everything else settles once and holds still — a looping animation on a
 * failure is a thing nagging at the corner of the eye with nothing to add.
 */
export function ServerError({
  kind,
  message,
  /** `HTTP 503`, and the server's own words for it. Mono, and badge-gated. */
  detail,
  onRetry,
  retryLabel,
  compact = false,
}: {
  kind: ServerErrorKind;
  message?: string | null;
  detail?: string | null;
  onRetry?: (() => void) | null;
  retryLabel?: string;
  compact?: boolean;
}) {
  const enter = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: Motion.Normal,
      easing: Motion.Enter,
      useNativeDriver: true,
    }).start();
  }, [enter]);

  useEffect(() => {
    if (kind !== 'ASLEEP') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: Motion.Ambient,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: Motion.Ambient,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [kind, breath]);

  const markOpacity = kind === 'ASLEEP'
    ? breath.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] })
    : 1;

  return (
    <Animated.View
      // Announced as one thing. A heading, a sentence and a status line read out
      // as three separate items is three interruptions for one piece of news.
      accessibilityRole="alert"
      accessibilityLabel={[HEADINGS[kind], message, detail].filter(Boolean).join('. ')}
      style={[
        styles.root,
        compact && styles.compact,
        {
          opacity: enter,
          transform: [
            // Rises as it fades in. Ten points is enough to read as arriving and
            // little enough that it never looks like a panel sliding in.
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          ],
        },
      ]}
    >
      <Animated.View style={[styles.mark, { opacity: markOpacity }]}>
        <Mark kind={kind} />
      </Animated.View>

      <Text style={[TowerType.titleSection, { color: OnInk, marginTop: 16 }]}>
        {HEADINGS[kind]}
      </Text>

      {message != null && message.trim() !== '' && (
        <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 8 }]}>{message}</Text>
      )}

      {detail != null && detail.trim() !== '' && (
        <DataMeta text={detail} color={OnInkFaint} style={{ marginTop: 12 }} />
      )}

      {onRetry != null && (
        <AmberButton
          label={retryLabel ?? (kind === 'ASLEEP' ? 'Wake Tower' : 'Try again')}
          onPress={onRetry}
          style={{ marginTop: 20, alignSelf: 'flex-start' }}
        />
      )}
    </Animated.View>
  );
}

/**
 * A mark per kind, inside a ring.
 *
 * The ring is the constant: it makes four different shapes sit in the same
 * place at the same weight, so moving between failures does not move the page.
 */
function Mark({ kind }: { kind: ServerErrorKind }) {
  switch (kind) {
    case 'ASLEEP':
      return <MoonGlyph color={Amber} size={22} />;
    case 'EMPTY':
      return <SearchGlyph color={OnInkMuted} size={22} />;
    default:
      // A disk for both: unreachable and too-old are each a fact about the
      // machine rather than about the network or the request.
      return <DiskGlyph color={OnInkMuted} size={24} />;
  }
}

/**
 * The same panel, driven straight off a screen's state.
 *
 * Saves every caller writing the same four-branch switch, and means a screen
 * cannot accidentally show the offline panel for a sleeping disk.
 */
export function UiStateError<T>({
  state,
  onRetry,
  retryLabel,
  emptyMessage,
  compact,
}: {
  state: UiState<T>;
  onRetry?: (() => void) | null;
  retryLabel?: string;
  emptyMessage?: string;
  compact?: boolean;
}) {
  if (state.type === 'LOADED' || state.type === 'LOADING') return null;

  if (state.type === 'ASLEEP') {
    return (
      <ServerError kind="ASLEEP" message={ASLEEP_BODY} onRetry={onRetry} compact={compact} />
    );
  }
  if (state.type === 'EMPTY') {
    return (
      <ServerError
        kind="EMPTY"
        message={emptyMessage ?? state.message}
        compact={compact}
      />
    );
  }
  return (
    <ServerError
      kind="OFFLINE"
      message={state.message}
      detail={state.detail}
      onRetry={onRetry}
      retryLabel={retryLabel}
      compact={compact}
    />
  );
}

const ASLEEP_BODY =
  'Tower spins its disk down when nobody is watching. Waking it takes a few seconds.';

const styles = StyleSheet.create({
  root: {
    width: '100%',
    // Reading width, so a sentence never runs the width of a tablet.
    maxWidth: TowerReadingMaxWidth,
    paddingHorizontal: Space.Screen,
    paddingTop: 28,
    paddingBottom: 24,
  },
  compact: {
    paddingTop: 16,
    paddingBottom: 12,
  },
  mark: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(OnInk, 0.05),
    borderWidth: 1,
    borderColor: withAlpha(OnInk, 0.1),
  },
});

/** Kept so a screen can paint the panel's ground without importing the theme. */
export const ServerErrorBackground = Ink;
