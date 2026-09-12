import * as Crypto from 'expo-crypto';

import { CredentialStore } from '@/data/remote/credentialStore';

const KEY = 'tower.deviceId';

let cached: string | null = null;

/**
 * A stable id for this install, so the sign-in log can mark one row "this
 * device".
 *
 * Generated once and kept in the Keychain rather than derived from anything the
 * OS exposes: iOS's identifiers either change between installs or are off
 * limits, and the server only needs the value to be *consistent*, not to mean
 * anything. A reinstall legitimately looks like a new device.
 *
 * Ported from data/remote/DeviceIdentity.ios.kt.
 */
export async function deviceId(): Promise<string> {
  if (cached != null) return cached;
  const stored = await CredentialStore.read(KEY);
  if (stored) {
    cached = stored;
    return stored;
  }
  const fresh = Crypto.randomUUID();
  await CredentialStore.write(KEY, fresh);
  cached = fresh;
  return fresh;
}
