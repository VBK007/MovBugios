/** Corner radii, straight off the design board. Ported from ui/theme/Shape.kt. */
export const Radius = {
  Default: 10, // cards, buttons, inputs
  Sheet: 16, // bottom sheets, kids-mode tiles
  Thumb: 8, // small poster thumbs
  Card: 12, // stat / session cards
  Pill: 999, // filter chips, avatars
} as const;

/** Screen padding and the vertical rhythm the whole app steps through. */
export const Space = {
  Screen: 20,
  XS: 8,
  S: 12,
  M: 14,
  L: 18,
  XL: 22,
} as const;

/**
 * The widest a column of prose or a sign-in form gets before it is capped.
 *
 * Only reading-width content uses this. Grids and rails deliberately do not —
 * they are where the extra width on a tablet earns its keep.
 */
export const TowerReadingMaxWidth = 460;

/** The board is drawn at this width — a phone. Used for tablet breakpoints. */
export const PhoneWidth = 390;
