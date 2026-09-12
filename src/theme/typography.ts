import { TextStyle } from 'react-native';

/**
 * The two-typeface rule, and it is a rule:
 *
 *   Archivo (Narrow for large headings) — anything a human wrote.
 *     Titles, prose, buttons, labels.
 *
 *   IBM Plex Mono — anything the server measured.
 *     Sizes, codecs, bitrates, timecodes, states, paths.
 *     Always uppercase, letter-spacing ~0.10em, 9.5–12sp.
 *
 * If you are about to render a number the server produced, it is mono.
 * If you are about to render a sentence a person wrote, it is Archivo.
 *
 * Ported from ui/theme/Type.kt. Two conversions matter:
 *   - Compose picks a weight out of a FontFamily; React Native has no such
 *     mapping for custom fonts, so each weight is its own family name and
 *     `fontWeight` is never set alongside one.
 *   - Compose letter-spacing is in `em`; RN's is in points. points = em * size.
 */

/** Family names — these are the keys passed to `useFonts`, so they are exact. */
export const Fonts = {
  archivoRegular: 'Archivo-Regular',
  archivoMedium: 'Archivo-Medium',
  archivoSemiBold: 'Archivo-SemiBold',
  archivoBold: 'Archivo-Bold',
  narrowSemiBold: 'ArchivoNarrow-SemiBold',
  narrowBold: 'ArchivoNarrow-Bold',
  monoRegular: 'IBMPlexMono-Regular',
  monoMedium: 'IBMPlexMono-Medium',
  monoSemiBold: 'IBMPlexMono-SemiBold',
} as const;

/**
 * Mono is uppercase by convention throughout Tower; callers should pass
 * already-uppercase copy. `tracking` is in em, as the board specifies it.
 */
function mono(
  fontFamily: string,
  fontSize: number,
  tracking = 0.1,
  lineHeightRatio = 1.4,
): TextStyle {
  return {
    fontFamily,
    fontSize,
    letterSpacing: fontSize * tracking,
    lineHeight: fontSize * lineHeightRatio,
  };
}

/**
 * Tower's named styles. Reach for these rather than building a TextStyle at the
 * call site — that is how the typeface rule stays enforced.
 */
export const TowerType = {
  // --- Human-written (Archivo) ---------------------------------------------

  /** 34sp Archivo Narrow. The one-per-screen hero title, e.g. a film's name. */
  titleDisplay: {
    fontFamily: Fonts.narrowBold,
    fontSize: 34,
    lineHeight: 34,
    letterSpacing: -0.34, // -0.01em
  } as TextStyle,

  /** 23sp Archivo Narrow. The screen's own name. */
  titleScreen: {
    fontFamily: Fonts.narrowBold,
    fontSize: 23,
    lineHeight: 27,
  } as TextStyle,

  /** 21sp Archivo Narrow. A section that speaks, e.g. "The disk spun down". */
  titleSection: {
    fontFamily: Fonts.narrowBold,
    fontSize: 21,
    lineHeight: 25,
  } as TextStyle,

  /** 30sp Archivo Narrow. Big stat numerals on the admin cards. */
  titleStat: {
    fontFamily: Fonts.narrowBold,
    fontSize: 30,
    lineHeight: 30,
  } as TextStyle,

  /** 15sp Archivo SemiBold. A row's or card's subject. */
  titleItem: {
    fontFamily: Fonts.archivoSemiBold,
    fontSize: 15,
    lineHeight: 19,
  } as TextStyle,

  /** 17sp Archivo Bold. The subject of the one hero card on a screen. */
  titleHero: {
    fontFamily: Fonts.archivoBold,
    fontSize: 17,
    lineHeight: 19.5,
  } as TextStyle,

  /** 13.5sp Archivo SemiBold. A list row's subject. */
  titleRow: {
    fontFamily: Fonts.archivoSemiBold,
    fontSize: 13.5,
    lineHeight: 17,
  } as TextStyle,

  /** 13.5sp Archivo, 1.6 line height. Explanatory prose. */
  bodyProse: {
    fontFamily: Fonts.archivoRegular,
    fontSize: 13.5,
    lineHeight: 21.6,
  } as TextStyle,

  /** 11.5sp Archivo, 1.55 line height. The quieter note under a card. */
  bodyNote: {
    fontFamily: Fonts.archivoRegular,
    fontSize: 11.5,
    lineHeight: 17.8,
  } as TextStyle,

  /** 14sp Archivo Bold. On an Amber fill. */
  buttonLabel: {
    fontFamily: Fonts.archivoBold,
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
  } as TextStyle,

  /** 11.5sp Archivo Medium. Chip text that is a word, not a measurement. */
  chipLabel: {
    fontFamily: Fonts.archivoMedium,
    fontSize: 11.5,
    lineHeight: 15,
  } as TextStyle,

  // --- Server-measured (IBM Plex Mono) -------------------------------------

  /** 10sp mono, 0.12em, uppercase. Status lines and small badges. */
  dataLabel: mono(Fonts.monoSemiBold, 10, 0.12),

  /**
   * 11sp mono SemiBold, 0.08em, uppercase. The heading above a rail or a
   * block — `RECENTLY ADDED`, `CONTINUE WATCHING`, `ALSO ON THE DISK`.
   *
   * Section headings are mono because they name a shelf the server assembled,
   * not a sentence a person wrote.
   */
  sectionLabel: mono(Fonts.monoSemiBold, 11, 0.08),

  /**
   * 9.5sp mono SemiBold, no tracking. The bottom-bar destinations only.
   *
   * Untracked on purpose: four labels across a phone are tight, and the
   * letter-spacing every other mono style carries pushes them into the gutters.
   */
  navLabel: mono(Fonts.monoSemiBold, 9.5, 0),

  /** 10.5sp mono Medium. A measured value sitting next to its label. */
  dataValue: mono(Fonts.monoMedium, 10.5),

  /** 9.5sp mono SemiBold. The smallest badge/meta text. Never over imagery. */
  dataMeta: mono(Fonts.monoSemiBold, 9.5),

  /** 34sp mono Bold. The subtitle sync offset, and nothing else. */
  dataDisplay: {
    fontFamily: Fonts.monoSemiBold,
    fontSize: 34,
    lineHeight: 34,
  } as TextStyle,

  /** 11.5sp mono Medium. Timecodes on the scrubber. */
  dataTimecode: mono(Fonts.monoMedium, 11.5, 0.04),
} as const;

export type TowerTextStyleName = keyof typeof TowerType;
