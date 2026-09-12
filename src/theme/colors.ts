/**
 * Tower palette. Dark only — there is no light variant and no dynamic color.
 *
 * Semantics, enforced everywhere:
 *   Amber  = the action, or the thing needing attention.
 *   Green  = direct play / healthy / ready.
 *   Amber on dark = transcoding or warning.
 *   Grey   = asleep, unmatched, unavailable.
 *
 * Green and blue are never a button fill, with one deliberate exception:
 * "Play saved copy" in the away-from-home sheet.
 *
 * Ported from ui/theme/Color.kt. Compose writes ARGB (0xAARRGGBB); React Native
 * takes CSS `#RRGGBBAA`, so the alpha moves from the front to the back.
 */

export const Ink = '#0A0A0C'; // app background
export const Surface1 = '#131317'; // cards
export const Surface2 = '#17171C'; // inputs, insets
export const SheetSurface = '#111116'; // bottom sheets

export const OnInk = '#F6F3EC'; // primary text
export const OnInkMuted = '#F6F3EC99'; // secondary text (60%)
export const OnInkFaint = '#F6F3EC73'; // mono labels (45%)

export const Hairline = '#FFFFFF14'; // 1px dividers / card borders (8%)

export const Amber = '#E8B34A'; // the only accent for actions
export const AmberInk = '#1A1204'; // text/icons on Amber

export const DirectPlay = '#7EE2A8'; // green: direct play / ready / OK
export const DirectPlayInk = '#08211A'; // text on the one green fill we allow

export const UserBlue = '#6A8FD4'; // profile + home-video category
export const KidsGreen = '#7EC9A0';
export const MediaPink = '#B06A8F'; // music + photos category

/** Grey status dot — server asleep, unmatched, unavailable. */
export const Asleep = '#8A8A8A';

// --- Tints -----------------------------------------------------------------
// Translucent washes used for "attention" cards and pills. Kept as named
// tokens so a card and its border never drift apart.

export const AmberWash = '#E8B34A12'; // ~7% amber fill
export const AmberBorder = '#E8B34A73'; // ~45% amber border
export const AmberBorderSoft = '#E8B34A47'; // ~28% amber border
export const AmberChipFill = '#E8B34A29'; // ~16% amber, for the Quality chip

export const DirectPlayWash = '#7EE2A812';
export const DirectPlayBorder = '#7EE2A866';

/** Scrim under hero titles. Titles sit *above* this in z-order. */
export const HeroScrim = '#0A0A0CF2';

// --- Kids mode -------------------------------------------------------------
// A different register: lighter ground, green accent, no mono type at all.

export const KidsInk = '#101418';
export const KidsSurface = '#181E24';

// --- Poster placeholders ---------------------------------------------------
// Posters are a 160° gradient from a dark-mid tone to near-black, per the
// design board. These are the pairs it uses; PosterCard picks one by hashing
// the title so a given title always looks the same.

export const PosterGradients: readonly (readonly [string, string])[] = [
  ['#3A4A5C', '#12171D'],
  ['#4A3A5C', '#171220'],
  ['#5B3350', '#1A0F18'],
  ['#2C4A45', '#101C1A'],
  ['#57402C', '#1D1610'],
  ['#432C44', '#181018'],
  ['#33557A', '#0F1A26'],
  ['#6B3A3A', '#1E1010'],
  ['#7A6BA8', '#1E1A2C'],
  ['#D4903F', '#3A2510'],
] as const;

/** Home-video tiles lean blue/green — "made by you", not "made for you". */
export const HomeVideoGradients: readonly (readonly [string, string])[] = [
  ['#6A8FD4', '#1C2740'],
  ['#4D7FB0', '#16202E'],
  ['#5A8F8A', '#131F1E'],
  ['#7EC9A0', '#1D3830'],
  ['#B0705A', '#2A1712'],
] as const;
