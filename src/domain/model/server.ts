/** Ported from domain/model/Server.kt. */

/**
 * How the app can reach the server right now.
 *
 * These are not error states — three of the four are ordinary, and the app is
 * expected to stay useful in all of them. Browsing continues while asleep, with
 * unavailable items greyed rather than hidden.
 */
export type ServerState =
  /** On the home LAN, disk spinning, everything works. */
  | { type: 'ONLINE'; uptimeDays?: number | null }
  /** The disk spun down after two hours idle. Waking takes about 8 seconds. */
  | { type: 'SLEEPING' }
  /** Reachable, but we are on mobile data and streaming costs money. */
  | { type: 'AWAY_FROM_HOME'; onMobileData: boolean }
  /** We cannot see it at all. Saved copies still play. */
  | { type: 'UNREACHABLE' }
  /** Mid-wake, after tapping "Wake the server". */
  | { type: 'WAKING' };

export const Sleeping: ServerState = { type: 'SLEEPING' };
export const Unreachable: ServerState = { type: 'UNREACHABLE' };
export const Waking: ServerState = { type: 'WAKING' };

export function online(uptimeDays?: number | null): ServerState {
  return { type: 'ONLINE', uptimeDays: uptimeDays ?? null };
}

export function awayFromHome(onMobileData = true): ServerState {
  return { type: 'AWAY_FROM_HOME', onMobileData };
}

/** The mono status line in the home header: `TOWER · ONLINE`. */
export function statusLine(state: ServerState): string {
  switch (state.type) {
    case 'ONLINE':
      return state.uptimeDays != null ? `TOWER · UP ${state.uptimeDays} DAYS` : 'TOWER · ONLINE';
    case 'SLEEPING':
      return 'TOWER · SLEEPING';
    case 'AWAY_FROM_HOME':
      return state.onMobileData ? 'AWAY FROM HOME · MOBILE DATA' : 'AWAY FROM HOME';
    case 'UNREACHABLE':
      return 'TOWER · NOT FOUND';
    case 'WAKING':
      return 'TOWER · WAKING';
  }
}

/** A server found by mDNS/SSDP on the local network, before pairing. */
export interface DiscoveredServer {
  id: string;
  name: string;
  address: string; // 192.168.1.14:8096
  fileCount?: number | null;
  totalBytes?: number | null;
  asleep: boolean;
  paired: boolean;
}

/** A server we have paired with, with credentials held in platform secure storage. */
export interface PairedServer {
  id: string;
  name: string;
  baseUrl: string;
  lastSeenIso?: string | null;
}

/** Progress of a disk rescan, polled while it runs. */
export interface ScanStatus {
  running: boolean;
  currentFile?: string | null;
  filesSeen: number;
  added: number;
  updated: number;
  markedMissing: number;
  failed: number;
  itemsInLibrary: number;
  error?: string | null;
}
