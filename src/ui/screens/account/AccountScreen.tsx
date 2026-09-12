import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DirectPlay, Ink, OnInk, OnInkFaint, OnInkMuted, Space, TowerType, UserBlue } from '@/theme';
import { RemoteTowerRepository } from '@/data/remote/remoteTowerRepository';
import { TowerHttpError } from '@/data/remote/errors';
import { SignInRecord, signInMonoMeta } from '@/domain/model/signInRecord';
import { profileInitial } from '@/domain/model/people';
import { Loading, ServerAsleepError, UiState, empty, loaded, offline } from '@/ui/uiState';
import { formatSignInTime } from '@/ui/format/signInTime';
import { useFlow, useRepository } from '@/ui/hooks';
import { ChevronGlyph } from '@/ui/components/Glyphs';
import {
  Avatar,
  DataLabel,
  DataMeta,
  HairlineDivider,
  OutlineButton,
  StatusDot,
} from '@/ui/components/Primitives';
import { HairlineListItem } from '@/ui/components/HairlineListItem';
import { Skeleton } from '@/ui/components/Rails';

const GUEST_MESSAGE = 'Sign in to see where your account has been used.';
const NONE_YET = 'No sign-ins recorded yet.';
const UNSUPPORTED =
  'This server does not keep a sign-in log yet. Update it to start recording them.';
const GENERIC_FAILURE = 'We cannot reach the server.';

/**
 * What the avatar on Home opens: who you are signed in as, where that account
 * has been used, and the way through to the owner panel.
 *
 * Sign-in history needs only a token, not the owner's admin key, so it lives
 * here rather than inside the panel — otherwise the one screen telling you
 * whether someone else has your password would be locked behind a key most
 * people in the house do not have.
 *
 * Ported from ui/screens/account/AccountScreen.kt.
 */
export function AccountScreen({
  onBack,
  onOpenAdmin,
  onOpenGenres,
  onJoinParty,
  onSignIn,
  onSignOut,
}: {
  onBack: () => void;
  onOpenAdmin: () => void;
  onOpenGenres: () => void;
  onJoinParty: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const repository = useRepository();
  const profile = useFlow(repository.activeProfile);
  /**
   * Sign-in history belongs to a real server, so it is only available on the
   * remote repository. In guest mode this is null and the screen says so instead
   * of reporting the absence as a failure.
   */
  const remote = repository instanceof RemoteTowerRepository ? repository : null;
  const signedOut = remote == null;

  const [history, setHistory] = useState<UiState<SignInRecord[]>>(Loading);
  const [refreshing, setRefreshing] = useState(false);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!remote) {
      setHistory(empty(GUEST_MESSAGE));
      setRefreshing(false);
      return;
    }
    try {
      const records = await remote.loginHistory();
      if (!alive.current) return;
      setHistory(records.length === 0 ? empty(NONE_YET) : loaded(records));
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof ServerAsleepError) {
        setHistory({ type: 'ASLEEP' });
      } else if (e instanceof TowerHttpError && e.missingEndpoint) {
        // Not a failure worth alarming anyone about: the server simply predates
        // the feature, and the remedy is on the server.
        setHistory(empty(UNSUPPORTED));
      } else {
        setHistory(offline(e instanceof Error ? e.message : GENERIC_FAILURE));
      }
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, [remote]);

  useEffect(() => {
    void load();
  }, [load]);

  const records = history.type === 'LOADED' ? history.data : [];

  return (
    <View style={{ flex: 1, backgroundColor: Ink }}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.back}
        >
          <ChevronGlyph rotation={180} color={OnInk} size={18} />
        </Pressable>
        <Text style={[TowerType.titleScreen, { color: OnInk, marginLeft: 4 }]}>Account</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: Space.Screen, paddingBottom: 28 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={OnInkFaint}
          />
        }
      >
        <View style={styles.identity}>
          <Avatar
            initial={profile ? profileInitial(profile) : '?'}
            size={52}
            tint={UserBlue}
            onTint={OnInk}
          />
          <View style={{ flex: 1 }}>
            <Text style={[TowerType.titleSection, { color: OnInk }]}>
              {profile?.name ?? (signedOut ? 'Guest' : 'Signed in')}
            </Text>
            <View style={styles.statusRow}>
              <StatusDot color={signedOut ? OnInkFaint : DirectPlay} pulsing={!signedOut} />
              <DataLabel
                text={signedOut ? 'SAMPLE LIBRARY' : 'SIGNED IN'}
                technical={false}
              />
            </View>
          </View>
          {signedOut && <OutlineButton label="Sign in" onPress={onSignIn} />}
        </View>

        <HairlineListItem
          title="Genres you like"
          supporting="What Home leads with"
          onPress={onOpenGenres}
          trailing={<ChevronGlyph color={OnInkFaint} size={14} />}
        />
        <HairlineListItem
          title="Join a watch party"
          supporting="Enter a code someone read out"
          onPress={onJoinParty}
          trailing={<ChevronGlyph color={OnInkFaint} size={14} />}
        />
        <HairlineListItem
          title="Owner panel"
          supporting="Health, people and disk"
          onPress={onOpenAdmin}
          trailing={<ChevronGlyph color={OnInkFaint} size={14} />}
        />

        <Text style={[TowerType.titleSection, { color: OnInk, marginTop: 24, marginBottom: 4 }]}>
          Sign-in activity
        </Text>

        {history.type === 'LOADING' && <HistorySkeleton />}
        {history.type === 'EMPTY' && <Note text={history.message} />}
        {history.type === 'OFFLINE' && <Note text={history.message} />}
        {history.type === 'ASLEEP' && <Note text="The server is asleep." />}
        {history.type === 'LOADED' &&
          records.map((record, index) => (
            <SignInRow
              key={record.id}
              record={record}
              showDivider={index !== records.length - 1}
            />
          ))}

        {!signedOut && (
          <OutlineButton
            label="Sign out"
            onPress={onSignOut}
            fillWidth
            style={{ marginTop: 28 }}
          />
        )}
      </ScrollView>
    </View>
  );
}

function SignInRow({ record, showDivider }: { record: SignInRecord; showDivider: boolean }) {
  const when = formatSignInTime(record.at);
  return (
    <View>
      <View style={styles.signInRow}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[TowerType.titleRow, { color: OnInk }]} numberOfLines={1}>
              {record.device}
            </Text>
            {/* The phone in your hand, so a strange row is obvious by contrast. */}
            {record.isThisDevice && (
              <DataMeta text="THIS DEVICE" color={DirectPlay} technical={false} />
            )}
          </View>
          <DataMeta text={signInMonoMeta(record)} style={{ marginTop: 4 }} />
        </View>
        {when != null && <DataMeta text={when} color={OnInkFaint} technical={false} />}
      </View>
      {showDivider && <HairlineDivider />}
    </View>
  );
}

function Note({ text }: { text: string }) {
  return (
    <Text style={[TowerType.bodyProse, { color: OnInkMuted, paddingVertical: 14 }]}>{text}</Text>
  );
}

function HistorySkeleton() {
  return (
    <View style={{ gap: 14, paddingVertical: 12 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ gap: 6 }}>
          <Skeleton cornerRadius={3} style={{ width: '50%', height: 12 }} />
          <Skeleton cornerRadius={3} style={{ width: '35%', height: 9 }} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    paddingVertical: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 5,
  },
  signInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
});
