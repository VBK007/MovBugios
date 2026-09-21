import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';

import { ServiceLocator } from '@/di/serviceLocator';
import { SignInRequiredSheet } from '@/ui/components/SignInRequiredSheet';

/**
 * Browsing is open; playing is not.
 *
 * Every path into the player goes through here so the rule lives in one place
 * rather than being re-checked on each screen that happens to have a play
 * button. In the Kotlin this sits in `TowerNavHost`; expo-router has no single
 * host component, so it is a hook that a screen mounts alongside its content.
 */
export function usePlayGate() {
  const router = useRouter();
  /** The title's name while the sheet is up, or null when it is not. */
  const [promptFor, setPromptFor] = useState<string | null>(null);

  /**
   * Runs `action`, or asks for an account first.
   *
   * One gate rather than a check at each button, because they kept being
   * forgotten. Playing and hosting a party were guarded; downloading, liking,
   * commenting and casting were not — so a visitor could press those, and what
   * they got was a 403 swallowed somewhere with no visible effect at all. A
   * button that silently does nothing is worse than one that explains itself:
   * the first reads as the app being broken, the second as an account being
   * needed.
   *
   * The title's name rides along so the sheet can name what it is for — "Sign in
   * to save Amaran" says more than "sign in".
   */
  const requireAccount = useCallback((titleName: string | null | undefined, action: () => void) => {
    if (ServiceLocator.isGuest) setPromptFor(titleName ?? '');
    else action();
  }, []);

  const play = useCallback(
    (titleId: string, titleName?: string | null) => {
      requireAccount(titleName, () => {
        // Cast because typed routes are generated from the app directory and
        // this file is outside it; the route exists at app/player/[titleId].tsx.
        router.push(`/player/${titleId}` as never);
      });
    },
    [router, requireAccount],
  );

  /**
   * Opening a party needs an account too.
   *
   * Guests cannot host: the same gate that guards playing guards this, because a
   * party streams the same bytes to the same server's rules.
   */
  const host = useCallback(
    (titleId: string, titleName?: string | null) => {
      requireAccount(titleName, () => router.push(`/together?item=${titleId}` as never));
    },
    [router, requireAccount],
  );

  const sheet =
    promptFor == null ? null : (
      <SignInRequiredSheet
        title={promptFor === '' ? null : promptFor}
        onSignIn={() => {
          setPromptFor(null);
          router.push('/connect');
        }}
        onDismiss={() => setPromptFor(null)}
      />
    );

  return { play, host, requireAccount, sheet };
}
