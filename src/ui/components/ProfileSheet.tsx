import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Amber,
  DirectPlay,
  Hairline,
  OnInk,
  OnInkFaint,
  OnInkMuted,
  Radius,
  SheetSurface,
  Space,
  TowerType,
  UserBlue,
} from '@/theme';
import { Profile, isKid, profileInitial } from '@/domain/model/people';
import { withAlpha } from '@/ui/color';
import { CheckGlyph } from '@/ui/components/Glyphs';
import { Avatar, DataLabel, DataMeta, OutlineButton } from '@/ui/components/Primitives';

/**
 * Who is watching.
 *
 * The household shares one login, and the server keeps resume positions, likes
 * and comments per *profile* — every request already carries `X-Profile-Id`. So
 * without this the whole house shares one person's place in every film, which is
 * the thing the profile system exists to prevent.
 */
export function ProfileSheet({
  profiles,
  activeId,
  onSelect,
  onDismiss,
}: {
  profiles: Profile[];
  activeId: string | null;
  onSelect: (profile: Profile) => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Tapping the scrim dismisses; the sheet itself must not. */}
      <Pressable style={styles.scrim} onPress={onDismiss} accessible={false} />

      <View style={[styles.sheet, { paddingBottom: Space.Screen + insets.bottom }]}>
        <Text style={[TowerType.titleSection, { color: OnInk }]}>Who is watching?</Text>
        <Text style={[TowerType.bodyNote, { color: OnInkFaint, marginTop: 6 }]}>
          Everyone keeps their own place in a film, and their own likes.
        </Text>

        <View style={{ marginTop: 18 }}>
          {profiles.map((profile, index) => {
            const selected = profile.id === activeId;
            return (
              <Pressable
                key={profile.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={profile.name}
                onPress={() => onSelect(profile)}
                style={({ pressed }) => [
                  styles.row,
                  index !== profiles.length - 1 ? styles.divider : null,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Avatar
                  initial={profileInitial(profile)}
                  size={40}
                  // The tint the server stored for them, so a person looks the
                  // same on every device in the house.
                  tint={profile.avatarTint ?? UserBlue}
                  onTint={OnInk}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[TowerType.titleRow, { color: OnInk }]} numberOfLines={1}>
                    {profile.name}
                  </Text>
                  <View style={styles.tags}>
                    {profile.isOwner && (
                      <DataMeta text="OWNER" color={Amber} technical={false} />
                    )}
                    {isKid(profile) && (
                      <DataMeta text="KIDS" color={OnInkFaint} technical={false} />
                    )}
                  </View>
                </View>
                {selected && <CheckGlyph color={DirectPlay} size={16} />}
              </Pressable>
            );
          })}
        </View>

        {profiles.length === 0 && (
          <DataLabel
            text="THIS SERVER HAS NO PROFILES YET"
            technical={false}
            style={{ marginTop: 18 }}
          />
        )}

        <OutlineButton
          label="Close"
          onPress={onDismiss}
          fillWidth
          style={{ marginTop: 20 }}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Hairline,
  },
  tags: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 3,
  },
});
