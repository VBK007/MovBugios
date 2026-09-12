import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  Amber,
  AmberBorderSoft,
  AmberWash,
  Asleep,
  DirectPlay,
  Ink,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  Space,
  TowerReadingMaxWidth,
  TowerType,
} from '@/theme';
import { PartyMember, WatchParty, memberStatusNote, seatsFree } from '@/domain/model/watchParty';
import { dataOrNull } from '@/ui/uiState';
import { withAlpha } from '@/ui/color';
import { ChevronGlyph } from '@/ui/components/Glyphs';
import {
  AmberButton,
  Avatar,
  DataLabel,
  DataMeta,
  HairlineDivider,
  OutlineButton,
  StatePill,
  StatusDot,
  TowerCard,
} from '@/ui/components/Primitives';
import { Field } from '@/ui/components/Field';
import { Skeleton } from '@/ui/components/Rails';
import { useWatchTogether } from '@/ui/screens/together/useWatchTogether';

/**
 * The watch-party lobby.
 *
 * Hosting and joining land on the same screen because it *is* the same room —
 * only the first call differs. The code is set large and mono, because its whole
 * job is to be read out across a room.
 *
 * Ported from ui/screens/together/WatchTogetherScreen.kt.
 */
export function WatchTogetherScreen({
  mediaItemId,
  joinCode,
  onBack,
  onStartWatching,
}: {
  mediaItemId: string | null;
  joinCode: string | null;
  onBack: () => void;
  onStartWatching: (mediaItemId: string, code: string) => void;
}) {
  const p = useWatchTogether(mediaItemId, joinCode);
  const party = dataOrNull(p.party);

  /**
   * The host pressing play should start the film for everyone, not just tell
   * them it started.
   *
   * Without this a member sat in the lobby watching a member list while the host
   * watched the film — the two devices were in the same party and not on the
   * same picture.
   */
  const followed = useRef(false);
  useEffect(() => {
    if (!p.hostIsPlaying || party == null || party.youAreHost || followed.current) return;
    followed.current = true;
    onStartWatching(party.mediaItemId, party.code);
  }, [p.hostIsPlaying, party, onStartWatching]);

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
        <Text style={[TowerType.titleScreen, { color: OnInk, marginLeft: 4 }]}>
          Watch together
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {p.awaitingCode && <JoinByCode party={p} />}

          {!p.awaitingCode && p.party.type === 'LOADING' && (
            <View style={{ gap: 14 }}>
              <Skeleton cornerRadius={12} style={{ width: '100%', height: 120 }} />
              <Skeleton cornerRadius={12} style={{ width: '100%', height: 180 }} />
            </View>
          )}

          {p.party.type === 'OFFLINE' && (
            <Message heading="Cannot open a party" body={p.party.message} />
          )}

          {party != null && (
            <>
              <CodeCard party={party} connected={p.connected} />

              {p.ended != null && (
                <View style={styles.endedCard}>
                  <DataLabel text="PARTY ENDED" color={Amber} technical={false} />
                  <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 8 }]}>
                    {p.ended}
                  </Text>
                </View>
              )}

              {/* Only the host is ever sent these. */}
              {p.pending.length > 0 && (
                <View style={{ marginTop: 22 }}>
                  <DataLabel text="AT THE DOOR" />
                  {p.pending.map((guest) => (
                    <View key={guest.requestId} style={styles.pendingRow}>
                      <Text style={[TowerType.titleRow, { color: OnInk, flex: 1 }]}>
                        {guest.name}
                      </Text>
                      <OutlineButton
                        label="Not now"
                        onPress={() => p.admit(guest, false)}
                        height={38}
                      />
                      <AmberButton
                        label="Let in"
                        onPress={() => p.admit(guest, true)}
                        height={38}
                        style={{ width: 92 }}
                      />
                    </View>
                  ))}
                </View>
              )}

              <View style={{ marginTop: 22 }}>
                <View style={styles.membersHeading}>
                  <DataLabel text="IN THE ROOM" />
                  <DataMeta
                    text={`${seatsFree(party)} SEAT${seatsFree(party) === 1 ? '' : 'S'} FREE`}
                    color={OnInkFaint}
                  />
                </View>
                {party.members.map((member, index) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    showDivider={index !== party.members.length - 1}
                  />
                ))}
              </View>

              {party.capacityWarning != null && (
                <View style={styles.warning}>
                  <Text style={[TowerType.bodyNote, { color: OnInkMuted }]}>
                    {party.capacityWarning}
                  </Text>
                </View>
              )}

              {/*
               * The host starts it for everyone; a member is taken there
               * automatically once the clock runs, so this is their way back in
               * after wandering off.
               */}
              <AmberButton
                label={party.youAreHost ? 'Start watching' : 'Join the film'}
                onPress={() => onStartWatching(party.mediaItemId, party.code)}
                style={{ marginTop: 26 }}
              />
              <OutlineButton
                label={party.youAreHost ? 'End the party' : 'Leave'}
                onPress={() => p.leave(onBack)}
                fillWidth
                style={{ marginTop: 10, marginBottom: 30 }}
              />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * The code, set as large as it will go.
 *
 * Its entire job is to be read out across a room and typed into another phone,
 * so it is mono, spaced, and the biggest thing on the screen.
 */
function CodeCard({ party, connected }: { party: WatchParty; connected: boolean }) {
  return (
    <TowerCard padding={18}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <StatusDot color={connected ? DirectPlay : Asleep} pulsing={connected} />
        <DataLabel
          text={connected ? 'LIVE' : 'NOT CONNECTED'}
          color={connected ? DirectPlay : Asleep}
          technical={false}
        />
      </View>

      <Text style={styles.code}>{party.code.split('').join(' ')}</Text>

      <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 10 }]}>
        {party.youAreHost
          ? 'Read this out. Anyone in the house can type it in to watch along with you.'
          : `You are watching along with ${party.itemTitle || 'this title'}.`}
      </Text>

      {party.itemTitle !== '' && (
        <StatePill
          text={party.itemTitle}
          tint={Amber}
          technical={false}
          withDot={false}
          style={{ marginTop: 14, alignSelf: 'flex-start' }}
        />
      )}
    </TowerCard>
  );
}

function MemberRow({ member, showDivider }: { member: PartyMember; showDivider: boolean }) {
  const note = memberStatusNote(member);
  return (
    <View>
      <View style={styles.memberRow}>
        <Avatar initial={member.name.slice(0, 1).toUpperCase()} size={34} />
        <View style={{ flex: 1 }}>
          <Text style={[TowerType.titleRow, { color: OnInk }]} numberOfLines={1}>
            {member.name}
          </Text>
          {member.isHost && <DataMeta text="HOST" color={Amber} technical={false} />}
        </View>
        {note != null && (
          <DataMeta
            text={note}
            color={member.online ? OnInkFaint : Asleep}
            technical={false}
          />
        )}
      </View>
      {showDivider && <HairlineDivider />}
    </View>
  );
}

function JoinByCode({ party }: { party: ReturnType<typeof useWatchTogether> }) {
  return (
    <View>
      <Text style={[TowerType.titleSection, { color: OnInk }]}>Type the code</Text>
      <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 10 }]}>
        Six characters, read out by whoever is hosting. Case and spacing do not matter.
      </Text>
      <Field
        value={party.codeInput}
        onChange={party.onCodeChange}
        placeholder="A B C 2 3 4"
        autoCapitalize="characters"
        onSubmitEditing={party.joinTyped}
        style={{ marginTop: 20 }}
      />
      {party.codeError != null && (
        <DataLabel
          text={party.codeError}
          color={Amber}
          technical={false}
          style={{ marginTop: 10 }}
        />
      )}
      <AmberButton
        label={party.busy ? 'Joining…' : 'Join'}
        onPress={party.joinTyped}
        enabled={!party.busy}
        style={{ marginTop: 14 }}
      />
    </View>
  );
}

function Message({ heading, body }: { heading: string; body: string }) {
  return (
    <View>
      <Text style={[TowerType.titleSection, { color: OnInk }]}>{heading}</Text>
      <Text style={[TowerType.bodyProse, { color: OnInkMuted, marginTop: 8 }]}>{body}</Text>
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
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: TowerReadingMaxWidth,
    paddingHorizontal: Space.Screen,
  },
  code: {
    ...TowerType.dataDisplay,
    color: Amber,
    marginTop: 14,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  membersHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  warning: {
    marginTop: 18,
    borderRadius: Radius.Card,
    backgroundColor: AmberWash,
    borderWidth: 1,
    borderColor: AmberBorderSoft,
    padding: 14,
  },
  endedCard: {
    marginTop: 18,
    borderRadius: Radius.Card,
    borderWidth: 1,
    borderColor: withAlpha(Amber, 0.45),
    padding: 14,
  },
});
