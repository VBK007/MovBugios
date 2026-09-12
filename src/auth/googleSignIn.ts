import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signOut as firebaseSignOut,
  initializeAuth,
  getAuth,
  Auth,
} from 'firebase/auth';

import { firebaseConfig } from '@/auth/firebaseConfig';
import { SignInOutcome, SocialSignIn } from '@/auth/socialSignIn';

/**
 * Google's OAuth endpoints. Discovered rather than hardcoded in the Kotlin, but
 * they have been stable for a decade and a network round trip to learn them is a
 * second of latency on the one screen where the user is already waiting.
 */
const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

/**
 * Google sign-in via a browser-based OAuth flow rather than the GoogleSignIn
 * SDK — the same decision the Kotlin iOS target made, and for the same reason.
 *
 * `expo-auth-session` drives `ASWebAuthenticationSession` on iOS, which is the
 * exact API `IosGoogleSignIn` uses: the consent screen runs in Safari's shared
 * cookie store, so an account already signed in to Safari does not have to sign
 * in again, and nothing beyond a public OAuth client id is needed.
 *
 * The Google ID token that comes back is then exchanged for a **Firebase** ID
 * token, because that is what Tower's `/api/auth/firebase` verifies. The Firebase
 * **JS** SDK does this in pure JavaScript — no native module — which is what
 * keeps this buildable without ejecting.
 *
 * **This cannot work in Expo Go.** The redirect goes to the reversed client id
 * scheme, and Expo Go cannot register a custom URL scheme on another app's
 * behalf, so the browser has nowhere to hand control back to. `isAvailable`
 * accounts for that, and the button stays hidden until a development build
 * exists.
 */
export class GoogleSignIn implements SocialSignIn {
  private app: FirebaseApp | null = null;
  private auth: Auth | null = null;

  get isAvailable(): boolean {
    if (firebaseConfig == null) return false;
    // Expo Go cannot own the redirect scheme, so offering the button there would
    // be offering a flow that cannot complete.
    return Constants.appOwnership !== 'expo';
  }

  private firebaseAuth(): Auth {
    if (this.auth) return this.auth;
    if (firebaseConfig == null) throw new Error('No Firebase configuration.');

    this.app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    try {
      // Fresh app: pick the React Native persistence explicitly. Without this
      // the SDK falls back to in-memory, and the Firebase session is gone on
      // relaunch — which does not matter for us, since Tower's own refresh token
      // is what survives, but a warning on every launch does.
      this.auth = initializeAuth(this.app);
    } catch {
      // Already initialised — `initializeAuth` throws rather than returning the
      // existing instance, which is the documented way to find that out.
      this.auth = getAuth(this.app);
    }
    return this.auth;
  }

  async signInWithGoogle(): Promise<SignInOutcome> {
    if (firebaseConfig == null) {
      return { type: 'FAILED', message: 'This build has no Google sign-in configured.' };
    }

    try {
      // Google redirects to the reversed client id; the path after it is
      // arbitrary but must be present.
      const redirectUri = `${firebaseConfig.reversedClientId}:/oauth2redirect`;

      const request = new AuthSession.AuthRequest({
        clientId: firebaseConfig.oauthClientId,
        redirectUri,
        // `openid` and `email` are what Firebase needs to mint a credential;
        // `profile` is what gives the account a display name.
        scopes: ['openid', 'email', 'profile'],
        usePKCE: true,
        responseType: AuthSession.ResponseType.Code,
      });

      const result = await request.promptAsync(DISCOVERY);

      // Dismissing the sheet is an ordinary thing to do, and not an error worth
      // showing anyone.
      if (result.type === 'cancel' || result.type === 'dismiss') {
        return { type: 'CANCELLED' };
      }
      if (result.type !== 'success') {
        const message =
          result.type === 'error'
            ? (result.error?.message ?? 'Google sign-in did not complete.')
            : 'Google sign-in did not complete.';
        return { type: 'FAILED', message };
      }

      // The public-client half of PKCE: the verifier proves this is the same
      // app that started the flow, which is what removes the need for a secret.
      const tokens = await AuthSession.exchangeCodeAsync(
        {
          clientId: firebaseConfig.oauthClientId,
          redirectUri,
          code: result.params.code,
          extraParams: { code_verifier: request.codeVerifier ?? '' },
        },
        DISCOVERY,
      );

      const googleIdToken = tokens.idToken;
      if (!googleIdToken) {
        return { type: 'FAILED', message: 'Google signed in but issued no token.' };
      }

      // Google's token identifies the person to Google. Tower trusts Firebase,
      // not Google directly, so it is traded for a Firebase one here.
      const credential = GoogleAuthProvider.credential(googleIdToken, tokens.accessToken);
      const signedIn = await signInWithCredential(this.firebaseAuth(), credential);
      const firebaseIdToken = await signedIn.user.getIdToken(false);

      if (!firebaseIdToken) {
        return { type: 'FAILED', message: 'Google signed in but issued no token.' };
      }
      return { type: 'SUCCESS', idToken: firebaseIdToken };
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : 'Google sign-in did not complete.';
      return { type: 'FAILED', message };
    }
  }

  async signOut(): Promise<void> {
    try {
      if (this.auth) await firebaseSignOut(this.auth);
    } catch {
      // Tower's own token is cleared separately and is the one that matters.
    }
  }
}
