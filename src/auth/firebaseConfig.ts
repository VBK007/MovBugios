import Constants from 'expo-constants';

/**
 * What `app.config.js` read out of `GoogleService-Info.plist` at build time.
 *
 * Null when the plist was absent, which is the whole availability gate: the
 * Google button hides itself rather than appearing and failing, exactly as the
 * Kotlin app does when `local.properties` carries no Firebase block.
 */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  /** The iOS OAuth client — public, no secret, safe with PKCE. */
  oauthClientId: string;
  /** The custom URL scheme Google redirects back to after consent. */
  reversedClientId: string;
}

function read(): FirebaseConfig | null {
  const raw = Constants.expoConfig?.extra?.firebase as Partial<FirebaseConfig> | null | undefined;
  if (!raw) return null;
  // A half-filled config is worse than none: it shows the button and then fails
  // somewhere further in, where the message is about OAuth rather than setup.
  const required: (keyof FirebaseConfig)[] = [
    'apiKey',
    'authDomain',
    'projectId',
    'appId',
    'oauthClientId',
    'reversedClientId',
  ];
  if (required.some((key) => !raw[key])) return null;
  return raw as FirebaseConfig;
}

export const firebaseConfig: FirebaseConfig | null = read();

export const isFirebaseConfigured = firebaseConfig != null;
