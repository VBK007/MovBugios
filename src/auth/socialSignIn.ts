/**
 * Signing in with Google, and nothing else.
 *
 * The only thing the app needs back is a Firebase **ID token**, which it hands
 * to Tower's own server in exchange for the JWT every other request already
 * uses. That keeps the identity provider at the edge of the app: no screen, no
 * hook and no repository knows Firebase exists.
 *
 * Ported from auth/SocialSignIn.kt.
 */

export type SignInOutcome =
  | { type: 'SUCCESS'; idToken: string }
  /** The user dismissed the sheet, which is ordinary and not an error to show. */
  | { type: 'CANCELLED' }
  | { type: 'FAILED'; message: string };

export interface SocialSignIn {
  /** False when the app was built without a Firebase configuration. */
  readonly isAvailable: boolean;

  /** Shows the account picker and returns a Firebase ID token. */
  signInWithGoogle(): Promise<SignInOutcome>;

  /** Clears the Firebase session. Tower's own token is cleared separately. */
  signOut(): Promise<void>;
}

/**
 * Used on any build without a Firebase config, where the button is hidden rather
 * than shown broken.
 */
export const UnavailableSocialSignIn: SocialSignIn = {
  isAvailable: false,
  async signInWithGoogle() {
    return { type: 'FAILED', message: 'This build has no Google sign-in configured.' };
  },
  async signOut() {},
};

/** Set once at startup by the platform entry point. */
let current: SocialSignIn = UnavailableSocialSignIn;

export const SocialSignInProvider = {
  get current(): SocialSignIn {
    return current;
  },
  install(signIn: SocialSignIn): void {
    current = signIn;
  },
};
