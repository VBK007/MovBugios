import { PartyClock, PartyMember } from '@/domain/model/watchParty';

/**
 * What a follower's player should do to stay level with the party.
 *
 * Deliberately a value rather than a call onto the player: the decision is pure
 * arithmetic and is worth testing on its own, while acting on it is three lines
 * in the player screen.
 *
 * Ported from domain/party/PartyClockFollower.kt.
 */
export type ClockCorrection =
  /** Close enough. Leave the player alone. */
  | { type: 'NONE' }
  /** Too far out to fix gently — jump. */
  | { type: 'SEEK'; toSeconds: number }
  /**
   * Off by a little. Run slightly fast or slow until it closes.
   *
   * A seek every few seconds is visible and ugly; six percent for a couple of
   * seconds is not noticeable.
   */
  | { type: 'RATE'; speed: number };

const SEEK_THRESHOLD = 2.0;
const NUDGE_THRESHOLD = 0.35;
const SETTLED = 0.1;
const FAST = 1.06;
const SLOW = 0.94;
const NORMAL = 1.0;

/**
 * Keeps one device level with the party's shared playhead.
 *
 * The server's clock is an anchor, not a counter: `positionSeconds` was true at
 * `atEpochMillis` and nothing advances it, so a slow tick, a dropped tick and a
 * reconnect mid-film all compute the same answer.
 *
 * Every frame also carries the server's own "now", which is what lets a client
 * estimate the difference between the two clocks without a separate time-sync
 * round trip — and what stops a phone with a badly set clock from dragging the
 * party off, since both of the anchor's timestamps are the server's.
 */
export class PartyClockFollower {
  /** Running estimate of `serverNow - localNow`, in milliseconds. */
  offsetMillis = 0;

  private seenAFrame = false;

  /** True while a rate nudge is in progress, so it can be released cleanly. */
  private nudging = false;

  /**
   * Re-estimates the offset from a freshly arrived frame.
   *
   * Every frame re-estimates rather than averaging: the offset moves when the
   * network delay moves, and a mean over a session would lag a change instead of
   * tracking it. `localNowMillis` is passed in rather than read here so the whole
   * class stays testable.
   */
  onFrame(clock: PartyClock, localNowMillis: number): void {
    this.offsetMillis = clock.serverNowEpochMillis - localNowMillis;
    this.seenAFrame = true;
  }

  /**
   * Where this device should be, in seconds, right now.
   *
   * Null until a frame has arrived — before that there is no anchor and any
   * answer would be invented.
   */
  targetSeconds(clock: PartyClock, localNowMillis: number): number | null {
    if (!this.seenAFrame) return null;
    const elapsedMillis = localNowMillis + this.offsetMillis - clock.atEpochMillis;
    // Paused means the anchor is the position, full stop: time passing must not
    // advance it.
    if (clock.state === 'PAUSED') return clock.positionSeconds;
    return clock.positionSeconds + elapsedMillis / 1000;
  }

  /**
   * What to do about the gap between `myPositionSeconds` and the party.
   *
   * Only ever corrects while the party is playing. Chasing a paused party would
   * fight the host: they pause, seek about looking for a scene, and every
   * follower would jump with them.
   */
  correction(
    clock: PartyClock,
    myPositionSeconds: number,
    localNowMillis: number,
  ): ClockCorrection {
    const target = this.targetSeconds(clock, localNowMillis);
    if (target == null) return { type: 'NONE' };
    if (clock.state !== 'PLAYING') return this.releaseNudge();

    const drift = target - myPositionSeconds;
    const magnitude = Math.abs(drift);

    if (magnitude > SEEK_THRESHOLD) {
      this.nudging = false;
      return { type: 'SEEK', toSeconds: target };
    }

    if (magnitude >= NUDGE_THRESHOLD) {
      this.nudging = true;
      // Behind the party means drift is positive, so run fast.
      return { type: 'RATE', speed: drift > 0 ? FAST : SLOW };
    }

    // Hysteresis: once nudging, hold the rate until the gap is properly closed,
    // not merely back under the threshold that started it — otherwise it
    // oscillates in and out of the nudge band.
    if (this.nudging && magnitude > SETTLED) {
      return { type: 'RATE', speed: drift > 0 ? FAST : SLOW };
    }

    return this.releaseNudge();
  }

  private releaseNudge(): ClockCorrection {
    if (!this.nudging) return { type: 'NONE' };
    this.nudging = false;
    return { type: 'RATE', speed: NORMAL };
  }
}

/**
 * Who has just gone, worked out by comparing two member lists.
 *
 * The server says nothing about departures directly: when a socket drops it
 * rebuilds the member list and broadcasts that, with the person still in it and
 * `online` false. Which is enough — the difference between the list before and
 * the list after names them — and it means the host finds out without waiting
 * for a server change.
 *
 * Returns members, not names, so the caller can tell a guest from the host.
 *
 * Ported from domain/party/PartyDepartures.kt.
 */
export function departures(before: PartyMember[], after: PartyMember[]): PartyMember[] {
  if (before.length === 0) return [];
  const stillHere = new Set(after.filter((m) => m.online).map((m) => m.id));
  return before
    .filter((m) => m.online && !stillHere.has(m.id))
    // Reported as the *after* record where there is one, so a name changed in
    // the same breath is the new name, and the row carries its current role
    // rather than a stale one.
    .map((gone) => after.find((m) => m.id === gone.id) ?? gone);
}

/**
 * `Meera left`, `Meera and Arun left`, `3 people left`.
 *
 * Names while naming them is useful, a count once it stops being. Three people
 * dropping at once is a router going down rather than three decisions, and a
 * list of names would be reporting the same fact three times.
 */
export function departureNote(gone: PartyMember[]): string | null {
  if (gone.length === 0) return null;
  if (gone.length === 1) return `${gone[0].name} left`;
  if (gone.length === 2) return `${gone[0].name} and ${gone[1].name} left`;
  return `${gone.length} people left`;
}
