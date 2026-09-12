/**
 * Ported from ui/format/SignInTime.kt.
 *
 * kotlinx-datetime's `Instant.parse` becomes `Date.parse`, which accepts the
 * same ISO-8601 the server emits. An unparseable value is dropped rather than
 * shown raw — a half-formatted timestamp reads as a bug.
 */

/**
 * `Today · 18:12`, `Yesterday · 07:04`, `10 Sep · 18:12`.
 *
 * The server timestamps sign-ins in UTC, so this converts to the phone's own
 * zone first: a sign-in made at six in the evening should not read as half past
 * noon just because that is what the database stored. `Date` is already in local
 * time once parsed, so the conversion is implicit here.
 */
export function formatSignInTime(iso?: string | null, now: Date = new Date()): string | null {
  const at = parseInstant(iso);
  if (at == null) return null;

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  let day: string;
  if (sameDay(at, now)) {
    day = 'Today';
  } else if (sameDay(at, yesterday)) {
    day = 'Yesterday';
  } else {
    // The year only earns its space once it stops being the current one.
    day = `${at.getDate()} ${MONTHS[at.getMonth()]}`;
    if (at.getFullYear() !== now.getFullYear()) day += ` ${at.getFullYear()}`;
  }

  return `${day} · ${two(at.getHours())}:${two(at.getMinutes())}`;
}

/**
 * `just now`, `4m`, `3h`, `2d`, then a date.
 *
 * For a conversation rather than a log. In a thread the interesting thing is how
 * long ago somebody said it, and "2m" carries that where "Today · 19:04" makes
 * the reader do the arithmetic. Past a week the exact age stops mattering and
 * the date is more use again.
 */
export function formatRelative(iso?: string | null, now: Date = new Date()): string | null {
  const at = parseInstant(iso);
  if (at == null) return null;

  const seconds = Math.trunc((now.getTime() - at.getTime()) / 1000);
  // A clock a little ahead of the server should read as "now", not "-3s ago".
  if (seconds < 45) return 'just now';
  const minutes = Math.trunc(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.trunc(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.trunc(hours / 24);
  if (days < 7) return `${days}d`;
  return formatSignInTime(iso, now);
}

function parseInstant(iso?: string | null): Date | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms);
}

function two(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * Spelled out rather than taken from a locale formatter: three-letter English is
 * what the rest of the app's chrome already uses, and a device locale would make
 * this line disagree with the mono labels beside it.
 */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
