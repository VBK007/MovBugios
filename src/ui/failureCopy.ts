import { TowerAuthError, TowerHttpError, TowerNotPairedError } from '@/data/remote/errors';

/**
 * What to say when something fails, in this app's words rather than the
 * server's.
 *
 * A server's error text is written for whoever is reading its logs. It names
 * handlers, it says "no static resource", it quotes Java types, and it arrives
 * in sentence fragments that were never meant to be read by somebody halfway
 * through a film. Putting it on screen made every failure look like a stack
 * trace with a border round it, and told people nothing they could act on.
 *
 * So the app says the few things that are actually true and useful, chosen by
 * what *kind* of failure it was rather than by what the server wrote about it.
 * The status code survives separately as a technical badge, because a number is
 * a measurement rather than prose, and it is the one part worth quoting.
 */
export function failureCopy(error: unknown): string {
  if (error instanceof TowerNotPairedError) {
    return 'No server is paired with this phone yet.';
  }

  if (error instanceof TowerAuthError) {
    return 'This phone is no longer signed in. Sign in again to carry on.';
  }

  if (error instanceof TowerHttpError) {
    if (error.missingEndpoint) {
      return 'This server does not have that yet. Updating Tower will add it.';
    }
    if (error.code === 404) return 'Tower does not have that any more.';
    if (error.code === 403) return 'This profile is not allowed to do that.';
    if (error.code >= 500) {
      return 'Tower had a problem with that. It is a fault on the server rather than here.';
    }
    return 'Tower would not do that.';
  }

  /*
   * Everything else is the network, in practice: a dropped tunnel, a sleeping
   * router, a phone that moved between two Wi-Fi points. None of it is worth
   * distinguishing on screen, because the answer to all of them is the same.
   */
  return 'We cannot reach Tower. Check it is awake and on the same network.';
}
