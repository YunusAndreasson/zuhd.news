/**
 * What a menu row prints under its title when the row opens a list: the first
 * few things in that list, by name. A caption that only describes the list
 * (`Areas in crisis or worse`) says the same thing on every visit; the names
 * say what is in it today.
 */

export const LEADERS_SEPARATOR = ' · ';

/** About one line of `caption` beside a chevron on a phone, at the default
 *  type size. */
export const LEADERS_LINE = 40;

const LEADERS_MAX = 3;

/**
 * Up to three of `names`, in their order, and fewer where the next would run
 * past one line. Whole names only — a name is never cut — so the first is
 * kept whatever its length. Repeats and blanks are skipped.
 */
export function leadNames(
  names: Iterable<string | null | undefined>,
  budget: number = LEADERS_LINE,
): string[] {
  const kept: string[] = [];
  let length = 0;
  for (const name of names) {
    if (!name || kept.includes(name)) continue;
    const next = length + (kept.length > 0 ? LEADERS_SEPARATOR.length : 0) + name.length;
    if (kept.length > 0 && next > budget) break;
    kept.push(name);
    length = next;
    if (kept.length === LEADERS_MAX) break;
  }
  return kept;
}
