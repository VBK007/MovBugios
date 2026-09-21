import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Amber,
  DirectPlay,
  OnInk,
  OnInkFaint,
  Radius,
  Space,
  Surface1,
  TowerType,
} from '@/theme';
import { PartyPlayback, partyWatching } from '@/ui/screens/player/usePlayer';
import { ChevronGlyph, EyeGlyph } from '@/ui/components/Glyphs';
import {
  DataMeta,
  HairlineDivider,
  OutlineButton,
  StatusDot,
} from '@/ui/components/Primitives';

/**
 * The count, and the way into the list behind it.
 *
 * Shown while a party is still connecting as well as once it has: somebody who
 * opened a player through a party and sees no sign of one cannot tell whether it
 * is still joining or never happened, and that difference is the whole of what
 * they want to know.
 */
export function PartyEye({
  party,
  joining,
  onPress,
  style,
}: {
  party: PartyPlayback | null;
  joining: boolean;
  onPress: () => void;
  style?: object;
}) {
  if (party == null && !joining) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Who is here"
      disabled={party == null}
      onPress={onPress}
      style={({ pressed }) => [styles.eye, style, { opacity: pressed ? 0.7 : 1 }]}
    >
      <EyeGlyph color={party == null ? OnInkFaint : Amber} size={15} />
      <DataMeta
        text={party == null ? 'JOINING' : `${partyWatching(party)} HERE`}
        color={party == null ? OnInkFaint : Amber}
        technical={false}
      />
    </Pressable>
  );
}

/**
 * Who is actually still in the room.
 *
 * The host's question while something is playing is not "who could join" — it is
 * whether anybody is still there, and the answer used to be two screens away in
 * the lobby. So it lives here, behind the count.
 *
 * Ending the party sits at the foot of it, because this is the sheet about the
 * party rather than about what is playing. A host ends it for everyone; a member
 * only walks out — the same split the lobby makes, and the reason the label
 * differs. Saying "End" to a guest would promise something they cannot do and
 * threaten something they do not mean.
 *
 * Shared by both players. A film and a song are the same question here — who
 * else is in this — and two copies of it would drift a word at a time.
 */
export function PartyMembersSheet({
  party,
  /** "listening" for a song, "watching" for a film. The only word that differs. */
  verb,
  onEnd,
  onClose,
}: {
  party: PartyPlayback;
  verb: 'listening' | 'watching';
  onEnd: () => void;
  onClose: () => void;
}) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Tap anywhere off the sheet to dismiss. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />

      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[TowerType.titleSection, { color: OnInk }]}>
              {verb === 'listening' ? 'Listening together' : 'Watching together'}
            </Text>
            <DataMeta
              text={`CODE ${party.code}`}
              color={OnInkFaint}
              technical={false}
              style={{ marginTop: 3 }}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={styles.close}
          >
            <ChevronGlyph rotation={90} color={OnInk} size={16} />
          </Pressable>
        </View>

        <HairlineDivider />

        <FlatList
          data={party.members}
          keyExtractor={(member) => member.id}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingVertical: 6 }}
          ListEmptyComponent={
            <Text style={[TowerType.bodyProse, { color: OnInkFaint, padding: Space.Screen }]}>
              Nobody else has joined yet. Read out the code above.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <StatusDot color={item.online ? DirectPlay : OnInkFaint} pulsing={item.online} />
              <Text style={[TowerType.titleRow, { color: OnInk, flex: 1 }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.isHost && <DataMeta text="HOST" color={Amber} technical={false} />}
            </View>
          )}
        />

        <HairlineDivider />

        <View style={{ padding: Space.Screen }}>
          <OutlineButton
            label={party.isHost ? 'End the party' : 'Leave the party'}
            onPress={onEnd}
            fillWidth
          />
          {/*
           * Said outright, both ways round. A control that might silently stop
           * what is playing is one nobody dares press.
           */}
          <Text style={[TowerType.bodyNote, { color: OnInkFaint, marginTop: 10 }]}>
            {party.isHost
              ? `Everyone stops ${verb} together. It keeps playing here.`
              : `You stop ${verb} together. It keeps playing here.`}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eye: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '62%',
    borderTopLeftRadius: Radius.Sheet,
    borderTopRightRadius: Radius.Sheet,
    backgroundColor: Surface1,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Space.Screen,
    paddingRight: 10,
    paddingTop: 16,
    paddingBottom: 10,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: Space.Screen,
    paddingVertical: 11,
  },
});
