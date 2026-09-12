/**
 * One sign-in, as the owner reads it in a list.
 *
 * Geo is usually absent: the server fills country and region from headers its
 * ingress proxy supplies, and a LAN server has no proxy to supply them. The
 * model treats that as normal rather than as missing data.
 *
 * Ported from domain/model/SignInRecord.kt.
 */
export interface SignInRecord {
  id: string;
  deviceId?: string | null;
  /** `iOS 18 · iPhone 15`, as the device reported itself. */
  device: string;
  appVersion?: string | null;
  ip?: string | null;
  /** `Karnataka, IN`, or null when the server could not tell. */
  place?: string | null;
  /** ISO-8601 instant from the server. */
  at?: string | null;
  /** True for the phone reading the list, so it can be labelled. */
  isThisDevice: boolean;
}

/** `192.168.29.81 · KARNATAKA, IN` — the mono line under the device name. */
export function signInMonoMeta(record: SignInRecord): string {
  return [
    record.ip,
    record.place?.toUpperCase(),
    record.appVersion ? `V${record.appVersion}` : null,
  ]
    .filter((p): p is string => p != null && p !== '')
    .join(' · ');
}
