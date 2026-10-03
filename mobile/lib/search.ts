/**
 * Search over the stories the app holds, as arithmetic.
 *
 * It was `corpus.includes(query)` over each story's title, place, topics and
 * raw sentences, newest first, and four things were wrong with that
 * (2026-10-03, found typing `oil` on the emulator):
 *
 * - **A match anywhere in a word.** `oil` found `Turmoil`, and put it first.
 *   A term now has to start a word: `oil` finds `oil` and `oilfield`, the way
 *   a reader who has typed half a word expects, and not `turmoil`.
 * - **The whole query as one string.** `iran oil` found only stories with
 *   those two words side by side in that order. Each word is a term, and a
 *   story has to carry all of them, anywhere.
 * - **The markdown.** A sentence arrives as `[Iran](country:IR)`, so `country`
 *   found every story that names one — 33 of 48 that day. The index holds the
 *   words a reader sees (`plainText`).
 * - **No order but time.** A story about the thing sat under one that
 *   mentions it in passing. A story with every term in its title comes first,
 *   then one that has them in its title and place, then the rest — newest
 *   first within each.
 *
 * And a row could not say why it was there: a story found by a word in its
 * fourth sentence showed its title and nothing else. Such a hit carries an
 * excerpt around the word (`SearchNote`).
 */

/** Lowercase, accents off, quotes straightened: what a keyboard types. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase();
}

/** A sentence as it is read: link targets and emphasis marks removed. */
export function plainText(markdown: string): string {
  return markdown.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
}

function isWordChar(code: number): boolean {
  return (
    (code >= 97 && code <= 122) || // a–z
    (code >= 48 && code <= 57) || // 0–9
    code > 127
  );
}

/** Where `term` starts a word in `folded`, or -1. */
function wordStart(folded: string, term: string): number {
  let at = folded.indexOf(term);
  while (at !== -1) {
    if (at === 0 || !isWordChar(folded.charCodeAt(at - 1))) return at;
    at = folded.indexOf(term, at + 1);
  }
  return -1;
}

export interface SearchDoc<T> {
  item: T;
  /** Newest first within a rank. */
  time: number;
  title: string;
  place: string;
  topics: readonly string[];
  /** The story's sentences, as read (`plainText`). */
  body: readonly string[];
}

/**
 * Why a story is in the results when its title does not say: the words around
 * the match, with the match set apart so the row can weight it.
 */
export interface SearchNote {
  before: string;
  match: string;
  after: string;
}

export interface SearchHit<T> {
  item: T;
  note?: SearchNote;
}

interface Indexed<T> {
  doc: SearchDoc<T>;
  title: string;
  place: string;
  topics: string[];
  body: string[];
}

/** How much of a sentence a row shows either side of the match. */
const EXCERPT_REACH = 48;

/** The sentence around a match, cut at word breaks, the match set apart. */
function excerpt(sentence: string, at: number, length: number): SearchNote {
  let from = Math.max(0, at - EXCERPT_REACH);
  let to = Math.min(sentence.length, at + length + EXCERPT_REACH);
  if (from > 0) {
    const space = sentence.indexOf(' ', from);
    from = space !== -1 && space < at ? space + 1 : from;
  }
  if (to < sentence.length) {
    const space = sentence.lastIndexOf(' ', to);
    to = space > at + length ? space : to;
  }
  // The match runs to the end of its word: `oil` in `oilfield` is the word.
  let end = at + length;
  while (end < sentence.length && isWordChar(fold(sentence[end] ?? '').charCodeAt(0))) end++;
  return {
    before: `${from > 0 ? '…' : ''}${sentence.slice(from, at)}`,
    match: sentence.slice(at, end),
    after: `${sentence.slice(end, Math.max(end, to))}${to < sentence.length ? '…' : ''}`,
  };
}

export interface SearchIndex<T> {
  search: (query: string) => SearchHit<T>[];
}

export function buildSearchIndex<T>(docs: readonly SearchDoc<T>[]): SearchIndex<T> {
  const indexed: Indexed<T>[] = docs.map((doc) => ({
    doc,
    title: fold(doc.title),
    place: fold(doc.place),
    topics: doc.topics.map(fold),
    body: doc.body.map(fold),
  }));

  const search = (query: string): SearchHit<T>[] => {
    const terms = fold(query).split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    const ranked: { rank: number; time: number; hit: SearchHit<T> }[] = [];
    for (const entry of indexed) {
      let rank = 0;
      let note: SearchNote | undefined;
      let found = true;
      for (const term of terms) {
        if (wordStart(entry.title, term) !== -1) continue;
        if (wordStart(entry.place, term) !== -1) {
          // The row prints the place, so it needs no note.
          rank = Math.max(rank, 1);
          continue;
        }
        rank = 2;
        let inBody = false;
        for (let i = 0; i < entry.body.length; i++) {
          const at = wordStart(entry.body[i] ?? '', term);
          if (at === -1) continue;
          inBody = true;
          // Folding keeps every character's place in English text; where it
          // does not (a ligature, a decomposed letter), the excerpt is cut by
          // the folded string's offsets and may sit a character out.
          note ??= excerpt(entry.doc.body[i] ?? '', at, term.length);
          break;
        }
        if (inBody) continue;
        const topic = entry.topics.findIndex((t) => wordStart(t, term) !== -1);
        if (topic === -1) {
          found = false;
          break;
        }
        note ??= { before: 'topic · ', match: entry.doc.topics[topic] ?? '', after: '' };
      }
      if (found) ranked.push({ rank, time: entry.doc.time, hit: { item: entry.doc.item, note } });
    }
    ranked.sort((a, b) => a.rank - b.rank || b.time - a.time);
    return ranked.map((r) => r.hit);
  };

  return { search };
}
