import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Hairline, OnInk, OnInkFaint, Space, TowerType } from '@/theme';
import { HairlineDivider } from '@/ui/components/Primitives';

/**
 * A settings row: a subject, a quieter line under it, and a rule beneath.
 *
 * Cards are for objects; a list of destinations gets hairlines. Ported from
 * ui/components/HairlineListItem.kt.
 */
export function HairlineListItem({
  title,
  supporting,
  onPress,
  trailing,
  showDivider = true,
  style,
}: {
  title: string;
  supporting?: string | null;
  onPress?: () => void;
  trailing?: React.ReactNode;
  showDivider?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const body = (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[TowerType.titleItem, { color: OnInk }]}>{title}</Text>
        {supporting != null && supporting !== '' && (
          <Text style={[TowerType.bodyNote, { color: OnInkFaint, marginTop: 3 }]}>
            {supporting}
          </Text>
        )}
      </View>
      {trailing}
    </View>
  );

  return (
    <View style={style}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={title}
          onPress={onPress}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      {showDivider && <HairlineDivider color={Hairline} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    paddingVertical: 16,
  },
});
