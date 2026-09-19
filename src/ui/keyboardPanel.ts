import { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * A panel pinned to the bottom of the screen that rides the keyboard up.
 *
 * `KeyboardAvoidingView` is the obvious answer and is the wrong one here. It
 * works by padding or resizing *itself*, which needs the view to be part of the
 * normal layout flow — and these panels are absolutely positioned at the bottom
 * of the screen with a fixed height, so the padding it adds is applied inside a
 * box whose bottom edge stays under the keyboard. The composer went on being
 * covered by the thing it exists to be typed into.
 *
 * This moves the whole panel instead, by exactly the keyboard's height.
 *
 * `useAnimatedKeyboard` is what makes it worth doing this way rather than with
 * `keyboardWillShow` and a timing animation: the height is a shared value the UI
 * thread reads every frame, so the panel tracks the keyboard's own curve
 * precisely instead of running a separate animation next to it that is merely
 * about the same length. On an interactive dismiss — dragging the keyboard down
 * with a finger — a timed animation cannot follow at all, and this simply does.
 *
 * The bottom inset is given back as the keyboard takes its place. The home
 * indicator is behind the keyboard while it is up, so reserving room for it
 * there would leave a strip of dead space above the keys.
 */
export function useKeyboardPanel() {
  const keyboard = useAnimatedKeyboard();
  const insets = useSafeAreaInsets();

  return useAnimatedStyle(() => {
    const height = keyboard.height.value;
    return {
      transform: [{ translateY: -height }],
      paddingBottom: Math.max(0, insets.bottom - height),
    };
  });
}
