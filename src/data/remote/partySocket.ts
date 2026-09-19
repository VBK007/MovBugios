import { TowerApi } from '@/data/remote/towerApi';
import {
  PartyMessage,
  PartyClock,
  PartyClockState,
  PartyMember,
  PartyRole,
  PendingGuest,
} from '@/domain/model/watchParty';

/**
 * One frame from the party socket, in the shapes the rest of the app uses.
 *
 * The wire flattens every frame into one record with a `type`; this is the
 * un-flattened version, so a caller switches on a union rather than re-checking
 * which fields a string implies are present.
 *
 * Ported from data/remote/PartySocket.kt.
 */
export type PartyEvent =
  /** The shared playhead moved, or the timer ticked. */
  | {
      type: 'CLOCK';
      clock: PartyClock;
      /**
       * Who caused it, or null for a routine tick. The payload of a pause is
       * identical to a tick — the distinction exists so the client can say
       * "Amma paused" rather than moving the bar silently.
       */
      by: string | null;
      kind: 'TICK' | 'PLAY' | 'PAUSE' | 'SEEK';
    }
  | { type: 'MEMBERS'; members: PartyMember[] }
  /** Someone is at the door. Sent to the host alone. */
  | { type: 'PENDING'; guest: PendingGuest }
  /** Final frame before the server closes the socket. */
  | { type: 'ENDED'; reason: string | null }
  /** Something this client sent was refused. The socket stays open. */
  | { type: 'REFUSED'; message: string | null }
  /**
   * The party has moved to a different thing entirely.
   *
   * Not a seek: the playhead did not move inside something, the something
   * changed, so this device has to open a new stream rather than jump.
   */
  | { type: 'ITEM_CHANGED'; mediaItemId: string; by: string | null }
  /** Somebody in the party said something. Includes this device's own messages. */
  | { type: 'CHAT'; message: PartyMessage }
  /** What was said before this device connected, oldest first. */
  | { type: 'CHAT_HISTORY'; messages: PartyMessage[] }
  /** The socket dropped. Not a server frame — raised locally. */
  | { type: 'DISCONNECTED'; cause: string | null };

interface PartyFrameDto {
  type?: string;
  clock?: {
    state?: string;
    positionSeconds?: number;
    atEpochMillis?: number;
    serverNowEpochMillis?: number;
  } | null;
  by?: string | null;
  members?: {
    id: string;
    name: string;
    role?: string;
    host?: boolean;
    online?: boolean;
    buffering?: boolean;
    driftSeconds?: number | null;
  }[];
  guest?: { requestId: string; name: string } | null;
  reason?: string | null;
  message?: string | null;
  /** On an `item` frame: the track the party has moved to. */
  mediaItemId?: string | null;
  /** On a `chat` frame: the one thing just said. */
  chatMessage?: PartyChatMessageDto | null;
  /** On a `chat-history` frame: what was said before this client connected. */
  messages?: PartyChatMessageDto[] | null;
}

/** One thing somebody said. Never stored anywhere, on either side. */
interface PartyChatMessageDto {
  id: string;
  from: string;
  text: string;
  atEpochMs: number;
}

/**
 * The watch party socket.
 *
 * Kept deliberately thin: it opens the connection, turns frames into
 * `PartyEvent`s and sends the four client frames. Reconnection, clock following
 * and any UI state belong to the caller — this class should be readable as "what
 * the wire says", nothing more.
 */
export class PartySocket {
  private socket: WebSocket | null = null;

  constructor(private readonly api: TowerApi) {}

  /**
   * Connects and calls `onEvent` until the socket closes.
   *
   * A dropped connection ends with `DISCONNECTED` rather than throwing: losing
   * the socket is ordinary — a tunnel, a locked phone — and the server treats a
   * host dropping as a pause, not an ending.
   *
   * Returns a function that closes it.
   */
  connect(code: string, token: string, onEvent: (event: PartyEvent) => void): () => void {
    const url = this.api.partySocketUrl(code, token);
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onmessage = (message) => {
      if (typeof message.data !== 'string') return;
      let frame: PartyFrameDto;
      try {
        frame = JSON.parse(message.data) as PartyFrameDto;
      } catch {
        return;
      }
      const event = toEvent(frame);
      if (event) onEvent(event);
    };

    socket.onerror = () => {
      // The close handler reports it; an error alone is not a separate event.
    };

    socket.onclose = (event) => {
      this.socket = null;
      onEvent({ type: 'DISCONNECTED', cause: event.reason || null });
    };

    return () => this.disconnect();
  }

  /** Host only — the server refuses these from anyone else with an error frame. */
  sendPlay(positionSeconds: number) {
    this.send('play', positionSeconds, null);
  }

  sendPause(positionSeconds: number) {
    this.send('pause', positionSeconds, null);
  }

  sendSeek(positionSeconds: number) {
    this.send('seek', positionSeconds, null);
  }

  /**
   * Everyone, every few seconds. From the host it re-anchors the party to their
   * real position; from anyone else it only records how far off they are, which
   * is what the member list's drift column shows.
   */
  sendReport(positionSeconds: number, buffering: boolean) {
    this.send('report', positionSeconds, buffering);
  }

  /**
   * Says something to the party. Everyone may, unlike the controls above.
   *
   * Nothing is shown until the server echoes it back. That costs a round trip on
   * a line already carrying the clock, and buys the one thing that matters in a
   * shared room: everybody sees the same conversation in the same order, rather
   * than each device seeing its own messages where it put them.
   */
  sendChat(text: string) {
    this.send('chat', null, null, text);
  }

  /**
   * Moves the party onto a different track. Host only; refused for anyone else.
   *
   * Sent when this device is already showing the new track, so the frame goes
   * out once the change is real rather than while it is being attempted.
   */
  sendItem(mediaItemId: string) {
    this.send('item', null, null, null, mediaItemId);
  }

  private send(
    type: string,
    positionSeconds: number | null,
    buffering: boolean | null,
    text: string | null = null,
    mediaItemId: string | null = null,
  ) {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    // Failing to send is not worth surfacing: the next report is a couple of
    // seconds away, and a dropped socket is already reported through `onclose`.
    try {
      socket.send(JSON.stringify({ type, positionSeconds, buffering, text, mediaItemId }));
    } catch {
      // As above.
    }
  }

  disconnect() {
    try {
      this.socket?.close();
    } catch {
      // Already gone.
    }
    this.socket = null;
  }
}

function toEvent(frame: PartyFrameDto): PartyEvent | null {
  switch (frame.type) {
    case 'tick':
      return clockEvent(frame, 'TICK');
    case 'play':
      return clockEvent(frame, 'PLAY');
    case 'pause':
      return clockEvent(frame, 'PAUSE');
    case 'seek':
      return clockEvent(frame, 'SEEK');
    case 'members':
      return {
        type: 'MEMBERS',
        members: (frame.members ?? []).map(
          (m): PartyMember => ({
            id: m.id,
            name: m.name,
            role: (m.role?.toUpperCase() as PartyRole) ?? 'MEMBER',
            isHost: m.host ?? false,
            online: m.online ?? false,
            buffering: m.buffering ?? false,
            driftSeconds: m.driftSeconds ?? null,
          }),
        ),
      };
    case 'pending':
      return frame.guest ? { type: 'PENDING', guest: frame.guest } : null;
    case 'item':
      return frame.mediaItemId
        ? { type: 'ITEM_CHANGED', mediaItemId: frame.mediaItemId, by: frame.by ?? null }
        : null;
    case 'chat':
      return frame.chatMessage ? { type: 'CHAT', message: frame.chatMessage } : null;
    case 'chat-history':
      return { type: 'CHAT_HISTORY', messages: frame.messages ?? [] };
    case 'ended':
      return { type: 'ENDED', reason: frame.reason ?? null };
    case 'error':
      return { type: 'REFUSED', message: frame.message ?? null };
    // An unknown type is a newer server, not a fault. Ignoring it is right:
    // every frame this client acts on is one it already understands.
    default:
      return null;
  }
}

function clockEvent(
  frame: PartyFrameDto,
  kind: 'TICK' | 'PLAY' | 'PAUSE' | 'SEEK',
): PartyEvent | null {
  const c = frame.clock;
  if (!c) return null;
  const clock: PartyClock = {
    state: (c.state?.toUpperCase() as PartyClockState) === 'PAUSED' ? 'PAUSED' : 'PLAYING',
    positionSeconds: c.positionSeconds ?? 0,
    atEpochMillis: c.atEpochMillis ?? 0,
    serverNowEpochMillis: c.serverNowEpochMillis ?? 0,
  };
  return { type: 'CLOCK', clock, by: frame.by ?? null, kind };
}
