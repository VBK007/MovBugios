import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { PreferencesStore } from '@/data/remote/preferencesStore';
import { RecentArt } from '@/data/remote/recentArt';
import { currentBaseUrl } from '@/data/remote/serverDirectory';
import { UiSettings } from '@/data/uiSettings';
import { DEFAULT_BASE_URL, ServiceLocator } from '@/di/serviceLocator';
import { OnboardingScreen } from '@/ui/screens/onboarding/OnboardingScreen';
import { SplashScreen } from '@/ui/screens/splash/SplashScreen';

/**
 * How long the splash is shown even when there is nothing to wait for.
 *
 * Long enough for the mark to arrive and settle. Below about half a second a
 * launch screen reads as a flicker, which is worse than not having one.
 */
const MINIMUM_SPLASH_MS = 1_400;

/** When a wait stops being a launch and starts being a problem worth naming. */
const SLOW_AFTER_MS = 4_000;

/** Where the app opens: unknown until the stored session has been checked. */
type Boot =
  | { type: 'CHECKING' }
  /** First run: three questions before the shelf. */
  | { type: 'ASKING' }
  | { type: 'READY' };

/**
 * The launch sequence, ported from App.kt.
 *
 * This used to redirect straight to Connect, which meant the saved session was
 * never restored and everyone signed in on every cold start.
 */
export default function Index() {
  const router = useRouter();
  const [boot, setBoot] = useState<Boot>({ type: 'CHECKING' });
  /** Set once the wait is long enough that the splash should admit to it. */
  const [slow, setSlow] = useState(false);
  /** Artwork from the last library load, for the splash to show. */
  const [art, setArt] = useState<string[]>([]);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    // Read first and on its own: it is a local store read, and the splash is
    // already on screen waiting for something to draw.
    void (async () => {
      const stored = await RecentArt.load();
      if (alive.current) setArt(stored);
    })();
  }, []);

  useEffect(() => {
    // Started before the work, not after: this is a floor on how long the splash
    // is shown, so a warm start does not flash it for 80ms — which reads as a
    // glitch rather than as a launch.
    const startedAt = Date.now();
    const patience = setTimeout(() => {
      if (alive.current) setSlow(true);
    }, SLOW_AFTER_MS);

    void (async () => {
      // Before anything is drawn: this decides whether half the labels in the
      // app exist at all, and flipping them a second in would read as a glitch.
      await UiSettings.load();

      let restored = false;
      try {
        restored = await ServiceLocator.remoteRepository().restoreSession();
      } catch {
        restored = false;
      }
      if (restored) {
        // Signed in: use the address and token `restoreSession` already put in
        // the session. It re-resolves through the directory by itself when the
        // address it had has stopped answering.
        ServiceLocator.useRemote();
      } else {
        /*
         * Not signed in — ask the directory where the server *currently* is,
         * rather than trusting whatever address is stored.
         *
         * The stored one is the likeliest thing to be dead: a free tunnel gets a
         * new hostname every time its container restarts. And a visitor has no
         * token, so `restoreSession` returns before it reaches its own "that
         * address stopped answering, ask where the server moved" branch — which
         * left a guest holding a rotated tunnel with nothing able to correct it.
         *
         * `currentBaseUrl` falls back to the last address this device saw, so a
         * launch with no network is not stranded either. The build's baked-in
         * default is below that, and the sample library below everything: the
         * one case where no address is known at all.
         */
        const address =
          (await currentBaseUrl()) ?? ServiceLocator.session.baseUrl.get() ?? DEFAULT_BASE_URL;
        if (address != null && address !== '') {
          ServiceLocator.session.setBaseUrl(address);
          ServiceLocator.useRemote();
        } else {
          ServiceLocator.useSampleData();
        }
      }

      let asked = true;
      try {
        asked = (await PreferencesStore.load()).completed;
      } catch {
        // A broken keychain must not trap anyone on a questionnaire.
        asked = true;
      }

      /*
       * Nothing on this device, but there may be answers on the profile from a
       * previous install or another handset. Adopting them locally means the
       * questions are asked once per person, not once per phone.
       *
       * Only when a session was restored: there is no profile to ask about
       * otherwise, and a signed-out visitor answering the questions is exactly
       * the case the local store is for.
       */
      if (!asked && restored) {
        try {
          const remote = await ServiceLocator.remoteRepository().remotePreferences();
          if (remote != null) {
            await PreferencesStore.save(remote);
            asked = true;
          }
        } catch {
          // Ask locally instead.
        }
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < MINIMUM_SPLASH_MS) {
        await new Promise((r) => setTimeout(r, MINIMUM_SPLASH_MS - elapsed));
      }
      clearTimeout(patience);
      if (!alive.current) return;

      /*
       * Home either way. A signed-out visitor lands on the real library and can
       * browse freely; signing in is asked for at the point it is actually
       * needed — pressing play — rather than as a toll gate before anyone has
       * seen what the app is.
       */
      setBoot(asked ? { type: 'READY' } : { type: 'ASKING' });
    })();

    return () => clearTimeout(patience);
  }, []);

  const openHome = useCallback(() => {
    // `replace`, so the splash is not somewhere "back" can return to.
    router.replace('/home');
  }, [router]);

  useEffect(() => {
    if (boot.type === 'READY') openHome();
  }, [boot, openHome]);

  if (boot.type === 'ASKING') return <OnboardingScreen onDone={openHome} />;
  // READY keeps the splash on screen for the frame it takes to replace the
  // route, which is smoother than flashing an empty view.
  return <SplashScreen slow={slow} art={art} />;
}
