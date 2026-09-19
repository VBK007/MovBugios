/**
 * What the household told us on first run.
 *
 * Three answers, each of which changes something the app actually does rather
 * than sitting in a settings screen being admired: the language picks a default
 * audio and subtitle track, the genres order what Home leads with, and the
 * quality cap is what a playback decision asks the server for when there is no
 * Wi-Fi.
 *
 * Ported from domain/model/Preferences.kt.
 */
export interface Preferences {
  /** ISO-639-1, lower case. Null until asked. */
  language: string | null;
  /** Chosen from the library's own genres, so the list is never fictional. */
  genres: string[];
  /** The ceiling asked for away from home. */
  mobileQuality: QualityCap;
  /**
   * When false, every mono spec, path, bitrate and codec string is hidden
   * app-wide and the human-written copy is left intact.
   *
   * Owned by the profile rather than the device in the server's model, but read
   * locally so the whole app does not wait on a request to know how to draw
   * itself.
   */
  showTechnicalBadges: boolean;
  /** False until the questions have been answered or skipped. */
  completed: boolean;
}

export const DefaultPreferences: Preferences = {
  language: null,
  genres: [],
  mobileQuality: 'MEDIUM',
  showTechnicalBadges: true,
  completed: false,
};

export type QualityCap = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * How much to ask for on a connection that is paying by the megabyte.
 *
 * Heights rather than bitrates because that is what the playback decision takes
 * and what a person recognises. The labels carry the consequence, since "720p"
 * means nothing to most people and "about 3 Mbps" means less.
 *
 * `maxHeight` is always a number, never null: the server's `awayMaxHeight`
 * treats an absent field as "leave it as it was", so there is no way to say "no
 * ceiling" — and 2160 is not a compromise anyway, since nothing in a home
 * library goes above 4K.
 */
export const QualityCaps: Record<
  QualityCap,
  { label: string; detail: string; maxHeight: number }
> = {
  LOW: { label: 'Data saver', detail: '480p · kindest to a data plan', maxHeight: 480 },
  MEDIUM: { label: 'Balanced', detail: '720p · what most phones show', maxHeight: 720 },
  HIGH: { label: 'Best available', detail: 'up to 4K · needs a good connection', maxHeight: 2160 },
};

/**
 * The languages worth offering first.
 *
 * A fixed list rather than every ISO code: this is a first-run question, and
 * three hundred options is not a question, it is a form.
 *
 * Named in English rather than in each script. The endonyms are the friendlier
 * choice and were the first attempt, but Archivo carries no Tamil, Devanagari or
 * Bengali glyphs and the fallback on an older phone does not either: half the
 * list rendered as empty boxes. A name someone can read beats a name in their
 * own alphabet that their phone cannot draw.
 */
export const OfferedLanguages: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'ta', name: 'Tamil' },
  { code: 'hi', name: 'Hindi' },
  { code: 'te', name: 'Telugu' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'kn', name: 'Kannada' },
  { code: 'bn', name: 'Bengali' },
  { code: 'mr', name: 'Marathi' },
];

/** What to offer when the library has not been scanned, or has no genres yet. */
export const FallbackGenres: string[] = [
  'Action',
  'Comedy',
  'Drama',
  'Thriller',
  'Romance',
  'Sci-Fi',
  'Horror',
  'Documentary',
  'Animation',
  'Family',
];

/** One language the library holds, by ISO 639-1 code and its English name.
 *
 * The name comes from the server rather than a table in here: it resolves the
 * code once and every client draws the same chip, instead of each carrying its
 * own copy of the ISO list and disagreeing at the edges.
 */
export interface Language { code: string; name: string }
