import * as SecureStore from 'expo-secure-store';

/**
 * Where the token actually lives between launches — the Keychain on iOS.
 *
 * Every call is guarded. SecureStore throws on a simulator with no keychain
 * entitlement and on a device where the item was written under different
 * accessibility rules; neither is a reason to fail a launch, and the only cost
 * of a miss is signing in again.
 *
 * Ported from the `CredentialStore` interface in data/remote/TowerSession.kt and
 * its iOS actual.
 */
export const CredentialStore = {
  async read(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async write(key: string, value: string | null): Promise<void> {
    try {
      if (value == null) {
        await SecureStore.deleteItemAsync(key);
      } else {
        await SecureStore.setItemAsync(key, value);
      }
    } catch {
      // A session that survives only this run is worse than one that persists,
      // but far better than a crash on the sign-in path.
    }
  },
};
