import type { ImageSource } from 'expo-image';

import { ServiceLocator, session } from '@/di/serviceLocator';

/**
 * Builds an image source for artwork, attaching auth when it points at the
 * paired server.
 *
 * Artwork is behind the API like everything else, so a bare URL comes back 401
 * and every poster silently falls through to its gradient — which looks exactly
 * like a library with no artwork, and is why this is easy to miss.
 *
 * Headers are read per call rather than captured, so re-signing-in or switching
 * profile is picked up without rebuilding whatever holds the source. Sample-data
 * artwork is on Lorem Picsum and must *not* be sent a bearer token, so the host
 * is checked first.
 */
export function artSource(url?: string | null): ImageSource | null {
  if (!url) return null;

  const base = session.baseUrl.get();
  if (base && url.startsWith(base)) {
    return { uri: url, headers: ServiceLocator.towerApi().imageHeaders() };
  }
  return { uri: url };
}
