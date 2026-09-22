import { firebaseConfig } from '@/auth/firebaseConfig';
import { CredentialStore } from '@/data/remote/credentialStore';
import { CredentialKeys } from '@/data/remote/towerSession';

/**
 * Where Tower says it can be found today.
 *
 * A home server behind a tunnel does not keep its address. A free ngrok
 * endpoint is a new hostname every restart, and a paid one still moves when the
 * plan lapses — so an address baked into a build is right until the first time
 * it is not, and then every device in the house is stranded until somebody
 * types a new URL into each of them by hand.
 *
 * So the server publishes where it is and the app reads that when the address
 * it has stops answering. One Firestore document, one string, fetched over
 * plain HTTPS.
 *
 * **The REST API, deliberately, with no SDK.** The document is two fields and
 * is read perhaps once a week; a client library for that would be a dependency
 * and a build step for something a `fetch` already does. The API key is not a
 * secret — it names a project and authorises nothing by itself — and what it
 * may read is decided by that project's rules.
 *
 * The document this expects, at `config/server`:
 *
 * ```
 * { "baseUrl": "https://something.trycloudflare.com" }
 * ```
 *
 * Nothing here writes. A client that could rewrite the directory is a client
 * that can point every other device in the house at an address of its choosing;
 * publishing is the server's job.
 */

/**
 * The Firestore database holding it, which is not `(default)`.
 *
 * A project may have several, and this one was created with a name — so every
 * REST path has to say which, and asking for `(default)` gets a 404 saying that
 * database does not exist. That 404 is indistinguishable at a glance from "no
 * document yet", which is how it read as a missing setup step for most of a day
 * on the Android side.
 *
 * Must match `FIRESTORE_DATABASE` in the server's `tunnel-publisher`.
 */
const DATABASE_ID = 'codeplays-manage17498';

/** Collection and document. Every device has to look in the same place. */
const DOCUMENT_PATH = 'config/server';

/**
 * Long enough for a cold connection, short enough not to strand the splash.
 *
 * Four seconds was the first guess and it was wrong on the device it mattered
 * on: a first request to `firestore.googleapis.com` over mobile data has DNS, a
 * TLS handshake and a round trip to do, and it timed out every launch — which
 * read, before the failure was named, as simply being unable to reach Firestore.
 *
 * Only paid by a signed-out launch. A restored session never comes here.
 */
const LOOKUP_TIMEOUT_MS = 12_000;

/**
 * The address to connect to as a visitor: freshly looked up when reachable, the
 * last one this device saw when not, in that order.
 *
 * Fresh first, and that is the point rather than an inefficiency. A visitor has
 * no token, so `restoreSession` returns before it ever gets to the "that address
 * stopped answering, ask where the server moved" branch — which left a guest
 * holding whichever tunnel was stored, forever, with nothing able to correct it.
 * That address is precisely the one most likely to be dead: a free tunnel gets a
 * new hostname every time its container restarts.
 *
 * The cache matters more than it looks. A launch with no network, or one that
 * cannot reach Firestore, is exactly the launch where being stranded is least
 * recoverable — so the last known-good address is kept and used rather than
 * falling through to a build-time constant the tunnel has almost certainly
 * outlived.
 */
export async function currentBaseUrl(): Promise<string | null> {
  const looked = await withTimeout(lookupPublishedBaseUrl(), LOOKUP_TIMEOUT_MS);

  if (looked != null && looked.trim() !== '') {
    try {
      await CredentialStore.write(CredentialKeys.discoveredBaseUrl, looked);
      /*
       * And as *the* remembered address, not only as this lookup's cache.
       * Everything else that asks "where is the server" reads the main key —
       * `restoreSession` on the next launch, and the connect screen deciding
       * whether it still needs to ask. While this only wrote its own key, those
       * kept finding the tunnel that had rotated away, and pressing Sign in led
       * to the address step for a server the app was already browsing.
       */
      await CredentialStore.write(CredentialKeys.baseUrl, looked);
    } catch {
      // A store that will not take it does not make the address less true.
    }
    return looked;
  }

  try {
    const cached = await CredentialStore.read(CredentialKeys.discoveredBaseUrl);
    return cached != null && cached.trim() !== '' ? cached : null;
  } catch {
    return null;
  }
}

/** Resolves to null rather than hanging the splash on a request that never lands. */
function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    work.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * The published address, or null if there is not a usable one.
 *
 * Null rather than a throw for every way this can fail — no Firebase in this
 * build, no document, no network, a rule that refuses — because the caller's
 * next move is the same in all of them: carry on with the address it already
 * had. This is a hint, and a hint that cannot be fetched is simply absent.
 */
export async function lookupPublishedBaseUrl(): Promise<string | null> {
  const projectId = firebaseConfig?.projectId;
  const apiKey = firebaseConfig?.apiKey;
  if (!projectId || !apiKey) return null;

  const url =
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    `/databases/${DATABASE_ID}/documents/${DOCUMENT_PATH}?key=${apiKey}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return baseUrlFrom(await response.text());
  } catch {
    return null;
  }
}

/**
 * The address out of a Firestore document, or null if there is not a usable one.
 *
 * Separate from the fetch so the shape can be checked without a network: the
 * wrapping is the only fiddly part, and the scheme check is what stops a
 * half-filled document — someone typing the hostname without `https://` — from
 * being adopted as an address and stranding every device that took it.
 *
 * Firestore's REST shape wraps every value in its own type:
 * `{"fields":{"baseUrl":{"stringValue":"https://…"}}}`.
 */
export function baseUrlFrom(json: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  const value = (parsed as { fields?: { baseUrl?: { stringValue?: unknown } } })?.fields?.baseUrl
    ?.stringValue;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
  return trimmed;
}
