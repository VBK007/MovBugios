import * as Brightness from 'expo-brightness';
import * as Orientation from 'expo-screen-orientation';
import { useCallback, useEffect, useRef } from 'react';

import type { ScreenOrientation } from '@/ui/screens/player/usePlayer';

/**
 * The screen itself, as far as the player needs it: how bright, and which way
 * round.
 *
 * Separate from the player because neither is a property of playback —
 * brightness belongs to the window and rotation to the app, and a player that
 * reached for either would be holding things it has no business holding.
 *
 * Ported from player/ScreenControls.kt and its iOS actual.
 */
export function useScreenControls() {
  /** What the device was set to before the player touched it. */
  const original = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = await Brightness.getBrightnessAsync();
        if (!cancelled) original.current = current;
      } catch {
        // No permission, or a simulator. The gesture then starts from wherever
        // the screen already is, which is harmless.
      }
    })();

    return () => {
      cancelled = true;
      /*
       * Hands the screen back on the way out — device brightness, and rotation
       * as the rest of the app uses it.
       *
       * Dimming for a film in bed should not leave the phone dark for
       * everything else afterwards, and a player left in landscape would hand
       * the next screen a sideways layout.
       */
      if (original.current != null) {
        Brightness.setBrightnessAsync(original.current).catch(() => {});
      } else {
        Brightness.restoreSystemBrightnessAsync().catch(() => {});
      }
      Orientation.lockAsync(Orientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  const setBrightness = useCallback((value: number) => {
    Brightness.setBrightnessAsync(Math.min(1, Math.max(0.01, value))).catch(() => {});
  }, []);

  const setOrientation = useCallback((orientation: ScreenOrientation) => {
    switch (orientation) {
      /*
       * Follow the sensor, *even when the system rotation lock is on*.
       *
       * Which is the point: someone who keeps rotation locked for their home
       * screen still wants a film to turn when they tip the phone. `unlockAsync`
       * is what ignores the system lock; leaving it to the setting would mean
       * the lock silently forbids landscape here.
       */
      case 'AUTO':
        Orientation.unlockAsync().catch(() => {});
        break;
      case 'LANDSCAPE':
        Orientation.lockAsync(Orientation.OrientationLock.LANDSCAPE).catch(() => {});
        break;
      case 'PORTRAIT':
        Orientation.lockAsync(Orientation.OrientationLock.PORTRAIT_UP).catch(() => {});
        break;
    }
  }, []);

  return { setBrightness, setOrientation };
}

/**
 * Asks for the permission iOS needs before brightness can be set.
 *
 * Requested when the player opens rather than at launch: it is the only screen
 * that wants it, and a permission prompt on first launch for something the user
 * has not tried to do yet is the kind that gets denied out of hand.
 */
export async function ensureBrightnessPermission(): Promise<boolean> {
  try {
    const { granted } = await Brightness.requestPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}
