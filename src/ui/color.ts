import { HomeVideoGradients, PosterGradients } from '@/theme';

/**
 * Compose's `Color.copy(alpha = …)`, which the design leans on heavily —
 * `OnInk.copy(alpha = 0.4f)` for an unselected tab, and so on.
 *
 * Takes `#RGB`, `#RRGGBB` or `#RRGGBBAA` and always returns `#RRGGBBAA`. The
 * alpha given *replaces* any the colour already carried rather than multiplying
 * with it, matching Compose.
 */
export function withAlpha(color: string, alpha: number): string {
  const clamped = Math.min(1, Math.max(0, alpha));
  const hex = normalizeHex(color);
  const byte = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${hex}${byte}`;
}

/** Returns the six-digit RRGGBB body of a hex colour, dropping any alpha. */
function normalizeHex(color: string): string {
  let hex = color.startsWith('#') ? color.slice(1) : color;
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return hex.slice(0, 6).toUpperCase();
}

/**
 * Picks a stable gradient for a title, so a given name always looks the same.
 *
 * The hash is the Kotlin one, kept character-for-character: a title must land on
 * the same gradient here as it does on Android, or the two apps disagree about
 * what a poster with no artwork looks like.
 */
export function gradientFor(
  seed: string,
  palette: readonly (readonly [string, string])[] = PosterGradients,
): readonly [string, string] {
  if (palette.length === 0) return ['#333333', '#000000'];
  let hash = 7;
  for (let i = 0; i < seed.length; i++) {
    // `& 0x7FFFFFFF` after each step, exactly as the Kotlin does, so the two
    // stay in step. Bitwise ops in JS are 32-bit, which is what we want here.
    hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) & 0x7fffffff;
  }
  return palette[hash % palette.length];
}

/** Home-video tiles lean blue/green — "made by you", not "made for you". */
export function gradientForKind(
  seed: string,
  isHomeVideo: boolean,
): readonly [string, string] {
  return gradientFor(seed, isHomeVideo ? HomeVideoGradients : PosterGradients);
}
