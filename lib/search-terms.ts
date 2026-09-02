/**
 * Turn a traveler's free-text query into match terms.
 *
 * The listings search used to be `title ILIKE '%<whole query>%'`, so
 * "sunset cruise" found nothing (no title contains that exact phrase),
 * "jerk chicken" found nothing (cuisine lives in typeData, not the title),
 * and "snorkelling" and "snorkeling" returned different sets.
 *
 * Rules:
 *  - split on whitespace/punctuation, drop stop words and 1–2 letter bits
 *  - every remaining term must match (AND) somewhere in the listing text
 *  - each term is matched by a STEM prefix so British/American spelling
 *    and plurals collapse: snorkelling/snorkeling → "snorkel",
 *    tours → "tour", cruises → "cruis" (matches cruise/cruises/cruising)
 *  - the whole query with spaces removed is offered too, because people
 *    type brand names without spaces ("beachhouse")
 */

const STOP = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for", "with",
  "near", "by", "from", "best", "top", "good", "great", "cheap", "my", "me", "us",
]);

export function stemTerm(raw: string): string {
  let t = raw.toLowerCase();
  // -lling/-ling → -l (snorkelling, travelling), -ing → "", -ies → -y, -es/-s → ""
  if (t.length >= 8 && t.endsWith("lling")) t = t.slice(0, -4);
  else if (t.length >= 7 && t.endsWith("ling")) t = t.slice(0, -3);
  else if (t.length >= 6 && t.endsWith("ing")) t = t.slice(0, -3);
  else if (t.length >= 5 && t.endsWith("ies")) t = t.slice(0, -3) + "y";
  else if (t.length >= 5 && t.endsWith("es") && !t.endsWith("ses")) t = t.slice(0, -1); // cruises→cruise
  else if (t.length >= 4 && t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
  // a trailing "e" after stemming ("cruise" → "cruis") lets "cruising" match too
  if (t.length >= 6 && t.endsWith("e")) t = t.slice(0, -1);
  return t;
}

export type SearchTerms = {
  /** Stemmed terms; every one must match. Empty when the query was only noise. */
  terms: string[];
  /** Query with spaces removed (lower-case), or null if it had no spaces. */
  compact: string | null;
  /** Lower-cased, whitespace-collapsed original — for exact-phrase ranking. */
  phrase: string;
};

export function parseSearchQuery(q: string): SearchTerms {
  const phrase = q.toLowerCase().replace(/\s+/g, " ").trim();
  const words = phrase.split(/[^\p{L}\p{N}'&-]+/u).filter(Boolean);
  const kept = words.filter((w) => w.length >= 3 && !STOP.has(w));
  const terms = Array.from(new Set(kept.map(stemTerm))).filter((t) => t.length >= 3).slice(0, 8);
  const compact = phrase.includes(" ") ? phrase.replace(/\s+/g, "") : null;
  // A query that was ALL stop/short words ("a b") still has to match something.
  if (terms.length === 0 && phrase.length >= 2) return { terms: [phrase], compact: null, phrase };
  return { terms, compact, phrase };
}

/** Escape a term for use inside an ILIKE pattern. */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
