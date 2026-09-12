/**
 * `Good morning, Arun` — the line at the top of Home.
 *
 * The hour comes from the phone in its own zone, not from the server: the
 * greeting is about the person holding it, and a household streaming from abroad
 * should still be told good morning at breakfast.
 *
 * Ported from ui/format/Greeting.kt.
 */
export function greeting(name?: string | null, hour: number = localHour()): string {
  let part: string;
  if (hour >= 5 && hour <= 11) {
    part = 'Good morning';
  } else if (hour >= 12 && hour <= 16) {
    part = 'Good afternoon';
  } else {
    // Everything else — including the small hours — stays on "Good evening"
    // rather than switching to "Good night", which is a farewell and the wrong
    // thing to say to someone sitting down to a film at one in the morning.
    part = 'Good evening';
  }
  const trimmed = name?.trim();
  return trimmed ? `${part}, ${trimmed}` : part;
}

/** The hour of day, 0–23, on this device. */
export function localHour(now: Date = new Date()): number {
  return now.getHours();
}
