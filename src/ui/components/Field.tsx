import React from 'react';
import { KeyboardTypeOptions, StyleProp, StyleSheet, TextInput, ViewStyle } from 'react-native';

import { Amber, AmberBorderSoft, OnInk, OnInkFaint, Radius, Surface2, TowerType } from '@/theme';

/**
 * The single-line input used across Connect and the admin key prompt.
 *
 * Ported from the private `Field` in ui/screens/connect/ConnectScreen.kt, which
 * every form in the app reaches for.
 */
export function Field({
  value,
  onChange,
  placeholder,
  isPassword = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  onSubmitEditing,
  style,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  isPassword?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  onSubmitEditing?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={OnInkFaint}
      secureTextEntry={isPassword}
      keyboardType={isPassword ? 'default' : keyboardType}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      // `singleLine` in Compose; here it also stops the return key inserting a
      // newline into an address that is about to be parsed as a URL.
      multiline={false}
      returnKeyType="go"
      onSubmitEditing={onSubmitEditing}
      selectionColor={Amber}
      cursorColor={Amber}
      style={[styles.field, style as never]}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    width: '100%',
    height: 50,
    borderRadius: Radius.Default,
    backgroundColor: Surface2,
    borderWidth: 1,
    borderColor: AmberBorderSoft,
    paddingHorizontal: 14,
    ...TowerType.bodyProse,
    color: OnInk,
  },
});
