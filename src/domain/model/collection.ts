import { Title } from '@/domain/model/media';

/**
 * Where a collection came from, which is what decides what may be done to it.
 *
 * The client only reads them today, so this exists to *label* a section rather
 * than to gate an action — but the distinction is worth showing, because "the
 * server ships this", "somebody here made this" and "your own library implies
 * this" are three different promises about why a list exists.
 */
export type CollectionKind =
  /** Ships with the server: never-watched, under-two-hours, four-k and so on. */
  | 'BUILTIN'
  /** Saved by someone in the household. */
  | 'CUSTOM'
  /**
   * Found in the library's own facets — a genre, a language, an actor, a decade.
   *
   * Tallied on request rather than stored, so one appears when the library
   * grows enough to justify it and disappears when it does not. Nothing here
   * chose it, which is why it cannot be edited.
   */
  | 'DISCOVERED';

/**
 * A saved search with a name on it.
 *
 * `id` is addressable whichever kind it is — a uuid, `builtin:<key>` or
 * `discovered:<key>` — so a screen holds one string and never has to remember
 * which sort it is holding.
 *
 * `itemCount` is a live count, not a stored one: a collection is a query, and
 * what matches moves as the library does.
 */
export interface Collection {
  id: string;
  kind: CollectionKind;
  name: string;
  /** An emoji the owner chose, or null. Shown as-is; the server owns the glyph. */
  icon: string | null;
  pinned: boolean;
  itemCount: number;
}

/**
 * The three kinds, kept apart.
 *
 * The server splits them for us rather than sending one list with a kind on each
 * row, which is the right call: a screen wants three headed sections, and
 * grouping a flat list client-side would be doing work twice.
 */
export interface Collections {
  builtin: Collection[];
  custom: Collection[];
  discovered: Collection[];
}

export const EmptyCollections: Collections = { builtin: [], custom: [], discovered: [] };

export function collectionsAreEmpty(groups: Collections): boolean {
  return (
    groups.builtin.length === 0 &&
    groups.custom.length === 0 &&
    groups.discovered.length === 0
  );
}

/** `1 TITLE`, `14 TITLES`. Plural is worth the branch at the top of a list. */
export function collectionCountLabel(count: number): string {
  return count === 1 ? '1 TITLE' : `${count} TITLES`;
}

/**
 * One thing the server thinks this person should watch, and why.
 *
 * `reason` is the whole point. A rail of posters ordered by a hidden number is
 * indistinguishable from any other rail; "Because you watched Kaithi" is what
 * makes it a recommendation rather than a shelf, and what lets somebody see the
 * server is wrong about them.
 *
 * Null when there is nothing to name — a cold start has no evidence, and
 * inventing a sentence would be the recommender defending a guess.
 */
export interface Recommendation {
  title: Title;
  reason: string | null;
}

/**
 * One thing the server read out of a search phrase.
 *
 * Shown as a chip, because a search box that silently reinterprets what somebody
 * typed is one they can only rephrase at. Seeing "Tamil" and "Under 2 hours" as
 * separate things is what turns a wrong reading into something fixable.
 */
export interface SearchTerm {
  field: string;
  label: string;
  /** The words it was read from, so a chip can say where it came from. */
  matched: string | null;
}

function isLetterOrDigit(c: string | undefined): boolean {
  return c != null && /[\p{L}\p{N}]/u.test(c);
}

/**
 * The phrase with this term's words taken out.
 *
 * Dismissing a chip edits the sentence rather than keeping a second, structured
 * copy of the search beside it — there is one thing to be wrong, and what the
 * box says is always what ran.
 *
 * Only the first occurrence goes, and only on word boundaries: a term is one
 * span of the sentence, and removing `action` must not turn `reaction` into
 * `re`. A term with no `matched` cannot be located, so the phrase comes back
 * untouched and the caller should not have offered the cross.
 */
export function removedFrom(term: SearchTerm, query: string): string {
  const words = (term.matched ?? '').trim();
  if (words === '') return query;

  let kept = '';
  let i = 0;
  let dropped = false;
  while (i < query.length) {
    const isSpan =
      !dropped &&
      query.slice(i, i + words.length).toLowerCase() === words.toLowerCase() &&
      !isLetterOrDigit(query[i - 1]) &&
      !isLetterOrDigit(query[i + words.length]);
    if (isSpan) {
      i += words.length;
      dropped = true;
    } else {
      kept += query[i];
      i++;
    }
  }
  // Collapse the hole the removal left, so the box never shows a double space.
  return kept
    .split(' ')
    .filter((w) => w.trim() !== '')
    .join(' ');
}

/**
 * A phrase, what the server made of it, and what came back.
 *
 * `understoodNothing` is not an error: it means the server's own grammar read
 * nothing out of the phrase. Worth saying out loud, because "nothing matched
 * *Tamil films under 2 hours*" and "I searched for the literal words *Tamil
 * films under 2 hours*" look identical from an empty list.
 *
 * `readByModel` is the caveat on that. When the grammar reads nothing the
 * server may hand the phrase to a model, which answers with a whole query
 * rather than a word-by-word reading — so there are no `terms` to show, and
 * saying the sentence was taken literally would be wrong.
 */
export interface SearchResults {
  titles: Title[];
  terms: SearchTerm[];
  understoodNothing: boolean;
  readByModel: boolean;
}

export const EmptySearchResults: SearchResults = {
  titles: [],
  terms: [],
  understoodNothing: false,
  readByModel: false,
};
