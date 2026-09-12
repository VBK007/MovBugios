import { Easing, EasingFunction } from 'react-native';

/**
 * The app's motion vocabulary, alongside `Space` and `TowerType`.
 *
 * Tower's motion is meant to be felt rather than watched. Anything the user is
 * waiting on runs fast and eases out; anything decorative runs slowly enough
 * that it reads as atmosphere rather than as a thing demanding attention.
 *
 * Ported from ui/theme/Motion.kt.
 */
export const Motion = {
  /** A control acknowledging a tap. Long enough to see, short enough to ignore. */
  Fast: 140,

  /** A thing arriving or leaving: a sheet, a fade between states. */
  Normal: 260,

  /** The splash handing over to the app. */
  Slow: 420,

  /**
   * Atmosphere: a glow breathing, a shimmer crossing a placeholder. Slow on
   * purpose — at this length the eye reads it as light rather than as motion.
   */
  Ambient: 1_600,

  /**
   * Decelerate. Things entering the screen start quickly and settle.
   *
   * The standard "emphasized decelerate" curve: most of the distance is covered
   * early, so the element feels like it is arriving under its own momentum
   * rather than being dragged in at a constant speed.
   */
  Enter: Easing.bezier(0.05, 0.7, 0.1, 1) as EasingFunction,

  /** Accelerate. Things leaving should get out of the way, not linger. */
  Exit: Easing.bezier(0.3, 0, 0.8, 0.15) as EasingFunction,

  /** Symmetric, for anything that loops — a pulse has no beginning or end. */
  Breathe: Easing.bezier(0.4, 0, 0.6, 1) as EasingFunction,
} as const;
