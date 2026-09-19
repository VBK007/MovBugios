import { Title } from '@/domain/model/media';

/**
 * One shelf on the music screen: a way into the collection.
 *
 * Browse-by-facet rather than a ranking, which is the whole difference between
 * this screen and the film home. A few hundred songs on a disk carry no
 * meaningful play counts, so "best" is not a thing the server can honestly
 * claim — what it can offer is *mood*, *activity*, *era* and who scored them,
 * each derived from the audio itself rather than guessed from a filename.
 *
 * `key` is kept in its structured form — `mood:calm`, `era:1990`,
 * `director:Ilaiyaraaja` — rather than flattened to the heading. It is what a
 * row is identified by, and what opening the shelf is built from.
 */
export interface MusicRail {
  key: string;
  title: string;
  tracks: Title[];
}

/**
 * The music screen in one payload.
 *
 * Emptiness is a fact to say out loud: the alternative — an empty screen with
 * four headings over nothing — reads as the app failing rather than the disk
 * being quiet.
 */
export interface MusicHome {
  continueListening: Title[];
  rails: MusicRail[];
}

export const EmptyMusicHome: MusicHome = { continueListening: [], rails: [] };

export function musicHomeIsEmpty(home: MusicHome): boolean {
  return home.continueListening.length === 0 && home.rails.length === 0;
}

/**
 * `MOOD` over `Romantic`.
 *
 * The server splits every rail into an axis and a value — `mood:Romantic`,
 * `director:Ilaiyaraaja`, `era:2010` — and then sends a title that keeps only
 * the value. Putting the axis back above it costs nothing and is the house rule
 * in two lines: mono names the property the server measured, Archivo names the
 * thing a person would actually say out loud.
 *
 * Without it, eighteen rails arrive as eighteen bare nouns and nothing tells you
 * that "Romantic" and "Ilaiyaraaja" are shelves of completely different kinds.
 */
export function railKicker(key: string): string | null {
  switch (key.split(':')[0]) {
    case 'mood':
      return 'MOOD';
    case 'activity':
      return 'FOR';
    case 'era':
      return 'ERA';
    case 'director':
      return 'MUSIC DIRECTOR';
    /*
     * Three shelves of people answering three different questions — who wrote
     * it, who sang it, whose film it came from. One "ARTIST" over all of them
     * would be the app deciding which of those somebody is allowed to be
     * looking for.
     */
    case 'singer':
      return 'SINGER';
    case 'hero':
      return 'STARRING';
    default:
      return null;
  }
}
