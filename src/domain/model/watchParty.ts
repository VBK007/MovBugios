/** Ported from domain/model/WatchParty.kt. */

/** Whether the party's shared playhead is running. */
export type PartyClockState = 'PLAYING' | 'PAUSED';

/** Where a person stands in the party. */
export type PartyRole = 'HOST' | 'MEMBER' | 'GUEST';

/** Where a guest's request to be let in stands. */
export type GuestSeatStatus = 'PENDING' | 'ADMITTED' | 'DENIED';

/**
 * The party's playhead at one instant.
 *
 * An anchor, not a counter: `positionSeconds` was true at `atEpochMillis`, and
 * nothing on the client advances it. See `PartyClockFollower` for how a device
 * turns this into "where I should be".
 */
export interface PartyClock {
  state: PartyClockState;
  positionSeconds: number;
  atEpochMillis: number;
  /** The server's own "now", so a client can estimate the offset per frame. */
  serverNowEpochMillis: number;
}

/**
 * One admitted person, as the member list shows them.
 *
 * `online` is not the same as being in the party — someone in a tunnel keeps
 * their seat and their place in the list, they just stop receiving the clock.
 */
export interface PartyMember {
  id: string;
  name: string;
  role: PartyRole;
  isHost: boolean;
  online: boolean;
  buffering: boolean;
  /** How far off the shared clock they last reported. Null until they report. */
  driftSeconds?: number | null;
}

/** `BUFFERING`, `+1.4s`, `OFFLINE` — the mono note beside a name. */
export function memberStatusNote(member: PartyMember): string | null {
  if (!member.online) return 'OFFLINE';
  if (member.buffering) return 'BUFFERING';
  const drift = member.driftSeconds;
  if (drift == null) return null;
  // Under a third of a second is level, and printing "+0.0s" beside every name
  // would be noise rather than information.
  if (drift > -0.35 && drift < 0.35) return null;
  const rounded = Math.trunc((drift < 0 ? -drift : drift) * 10 + 0.5);
  const sign = drift > 0 ? '+' : '−';
  return `${sign}${Math.trunc(rounded / 10)}.${rounded % 10}s`;
}

/** A guest waiting on the host's decision. Only ever shown to the host. */
export interface PendingGuest {
  requestId: string;
  name: string;
}

/**
 * The whole party as one device sees it.
 *
 * `youAreHost` comes from the server rather than being derived by comparing ids,
 * so the client never has to work out which controls it may render.
 */
export interface WatchParty {
  partyId: string;
  /** Six characters, read across a room — see `normalisePartyCode`. */
  code: string;
  mediaItemId: string;
  itemTitle: string;
  live: boolean;
  maxMembers: number;
  youAreHost: boolean;
  members: PartyMember[];
  /** Empty for everyone but the host. */
  pending: PendingGuest[];
  /** Null until the host's player has reported a position. */
  clock?: PartyClock | null;
  /**
   * Set when the title has never direct-played, so every seat costs its own
   * ffmpeg process. Advisory — the party opens either way.
   */
  capacityWarning?: string | null;
}

export function seatsFree(party: WatchParty): number {
  return Math.max(0, party.maxMembers - party.members.length);
}

/** What a guest gets back when they ask for a seat, and on every poll after. */
export interface GuestSeat {
  status: GuestSeatStatus;
  requestId: string;
  /**
   * Proof that this is the device that asked. Returned once, on the first
   * response, so it must be kept — it is what lets an app that restarts collect
   * its token rather than making the host approve the same person twice.
   */
  pollToken?: string | null;
  /** The guest JWT. Null until the host says yes. */
  token?: string | null;
}

/**
 * Tidies a code a person typed or pasted.
 *
 * The server's alphabet has `0 O 1 I L` removed because the code gets read
 * across a room and retyped on a TV remote; it accepts lower case and pasted
 * spaces or hyphens, and this saves it the trouble.
 */
export function normalisePartyCode(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * One thing somebody in the party said.
 *
 * Never stored anywhere, on either side. They arrive on the socket, live for as
 * long as the party does, and go when it does — which is the same answer the
 * server gives, and the reason the two cannot drift into disagreeing about how
 * long a party's chat lasts.
 *
 * `from` is a display name rather than a profile id because a name is all a
 * reader needs, and an id would outlive the message it belonged to.
 */
export interface PartyMessage {
  id: string;
  from: string;
  text: string;
  atEpochMs: number;
}
