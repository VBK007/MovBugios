import { failureCopy } from '@/ui/failureCopy';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PartyEvent, PartySocket } from '@/data/remote/partySocket';
import { RemoteTowerRepository } from '@/data/remote/remoteTowerRepository';
import { departureNote, departures } from '@/domain/party/partyClockFollower';
import {
  PartyClock,
  PendingGuest,
  WatchParty,
  normalisePartyCode,
} from '@/domain/model/watchParty';
import { Loading, UiState, dataOrNull, loaded, offline } from '@/ui/uiState';
import { useRepository } from '@/ui/hooks';

const CODE_LENGTH = 6;

/**
 * Hosting or sitting in a watch party.
 *
 * This is the lobby half: opening a party, letting people in, and keeping the
 * member list live. Following the shared clock is the player's job — see
 * `PartyClockFollower`.
 *
 * Ported from ui/screens/together/WatchTogetherViewModel.kt.
 */
export function useWatchTogether(mediaItemId: string | null, joinCode: string | null) {
  const repository = useRepository();
  const remote = repository instanceof RemoteTowerRepository ? repository : null;

  const [party, setParty] = useState<UiState<WatchParty>>(Loading);
  /** Live from the socket; falls back to the party's own clock. */
  const [clock, setClock] = useState<PartyClock | null>(null);
  /** Set when the socket is not carrying the party — polling still works. */
  const [connected, setConnected] = useState(false);
  /** "Amma paused" — cleared by the next control. */
  const [lastAction, setLastAction] = useState<string | null>(null);
  /** Guests at the door. Host only; the server sends these to nobody else. */
  const [pending, setPending] = useState<PendingGuest[]>([]);
  const [ended, setEnded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * True once the party's clock is running, so a member waiting in the lobby can
   * be taken to the film rather than left watching a member list.
   */
  const [hostIsPlaying, setHostIsPlaying] = useState(false);
  /**
   * True when the screen was opened with neither a title to host nor a code —
   * someone has been read a code across a room and needs somewhere to type it.
   */
  const [awaitingCode, setAwaitingCode] = useState(mediaItemId == null && joinCode == null);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const socket = useRef<PartySocket | null>(null);
  const closeSocket = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  /** The list as last seen, so a departure can be named by comparing. */
  const previousMembers = useRef<WatchParty['members']>([]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      closeSocket.current?.();
      socket.current?.disconnect();
    };
  }, []);

  const openSocket = useCallback(
    (code: string) => {
      if (!remote) return;
      const token = remote.socketToken();
      if (!token) return;

      closeSocket.current?.();
      const s = remote.partySocket();
      socket.current = s;
      closeSocket.current = s.connect(code, token, (event) => {
        if (!alive.current) return;
        onPartyEvent(event);
      });
      setConnected(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remote],
  );

  const onPartyEvent = useCallback((event: PartyEvent) => {
    switch (event.type) {
      case 'CLOCK':
        setClock(event.clock);
        setHostIsPlaying(event.clock.state === 'PLAYING');
        // The payload of a pause is identical to a tick, so the kind is the only
        // thing that makes "Amma paused" sayable rather than the bar moving
        // silently.
        if (event.kind !== 'TICK' && event.by) {
          const verb =
            event.kind === 'PLAY' ? 'started' : event.kind === 'PAUSE' ? 'paused' : 'skipped';
          setLastAction(`${event.by} ${verb}`);
        }
        break;

      case 'MEMBERS': {
        const gone = departures(previousMembers.current, event.members);
        previousMembers.current = event.members;
        const note = departureNote(gone);
        if (note) setLastAction(note);
        setParty((current) =>
          current.type === 'LOADED'
            ? loaded({ ...current.data, members: event.members })
            : current,
        );
        break;
      }

      case 'PENDING':
        setPending((current) =>
          current.some((g) => g.requestId === event.guest.requestId)
            ? current
            : [...current, event.guest],
        );
        break;

      case 'ENDED':
        setEnded(event.reason ?? 'The party has ended.');
        setConnected(false);
        break;

      case 'REFUSED':
        // The socket stays open; this is one frame being turned down, usually a
        // member trying to drive.
        setLastAction(event.message ?? null);
        break;

      case 'DISCONNECTED':
        setConnected(false);
        break;
    }
  }, []);

  const start = useCallback(
    async (code: string | null) => {
      if (!remote) {
        setParty(offline('Watch together needs a server. Sign in first.'));
        return;
      }
      setBusy(true);
      try {
        const joined = code
          ? await remote.joinParty(code)
          : await remote.hostParty(mediaItemId!);
        if (!alive.current) return;
        setParty(loaded(joined));
        setPending(joined.pending);
        setClock(joined.clock ?? null);
        previousMembers.current = joined.members;
        setAwaitingCode(false);
        openSocket(joined.code);
      } catch (e) {
        if (!alive.current) return;
        const message = failureCopy(e);
        if (code) setCodeError(message);
        else setParty(offline(message));
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [remote, mediaItemId, openSocket],
  );

  useEffect(() => {
    // Neither a title nor a code: this is someone about to type one in, not a
    // mistake. Asking is the whole screen until they do.
    if (mediaItemId == null && joinCode == null) return;
    void start(joinCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Joins with whatever has been typed, tidied. */
  const joinTyped = useCallback(() => {
    const code = normalisePartyCode(codeInput);
    if (code.length < CODE_LENGTH) {
      setCodeError('A code is six characters.');
      return;
    }
    void start(code);
  }, [codeInput, start]);

  const admit = useCallback(
    async (guest: PendingGuest, allow: boolean) => {
      const current = dataOrNull(party);
      if (!remote || !current) return;
      // Taken off the list first: the host has answered, and leaving the row
      // there until the server agrees reads as the tap not registering.
      setPending((list) => list.filter((g) => g.requestId !== guest.requestId));
      try {
        const updated = await remote.admitGuest(current.code, guest.requestId, allow);
        if (alive.current) setParty(loaded(updated));
      } catch {
        if (alive.current) setPending((list) => [...list, guest]);
      }
    },
    [remote, party],
  );

  const leave = useCallback(
    async (onDone: () => void) => {
      const current = dataOrNull(party);
      closeSocket.current?.();
      socket.current?.disconnect();
      if (remote && current) await remote.leaveParty(current.code, current.youAreHost);
      onDone();
    },
    [remote, party],
  );

  return {
    party,
    clock,
    connected,
    lastAction,
    pending,
    ended,
    busy,
    hostIsPlaying,
    awaitingCode,
    codeInput,
    codeError,
    onCodeChange: (value: string) => {
      setCodeInput(value);
      setCodeError(null);
    },
    joinTyped,
    admit: (guest: PendingGuest, allow: boolean) => void admit(guest, allow),
    leave: (onDone: () => void) => void leave(onDone),
  };
}
