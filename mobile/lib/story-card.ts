import type { Article } from '@shared/types';

/**
 * What a story card says, before anything is laid out.
 *
 * Every article is four one-sentence blocks — hook, why it matters, context,
 * what's next (`scripts/write-prompt.md`). The first two are what earns the
 * next ten seconds, and they are what the web map's preview card leads with
 * too: a three-to-five-word headline on its own ("Drone Boat Kills Drone
 * Boat") does not say why anyone should open it. So a card at rest carries
 * the lead and the rest waits under the fold, already rendered, for the card
 * to grow.
 */

/** The hook and the why-it-matters sentence. */
const LEAD_SENTENCES = 2;

/** Generic so a card can split its rendered sentences, not only the strings. */
export function leadOf<T>(sentences: readonly T[]): T[] {
  return sentences.slice(0, LEAD_SENTENCES);
}

export function restOf<T>(sentences: readonly T[]): T[] {
  return sentences.slice(LEAD_SENTENCES);
}

/**
 * The desk, and — only when the ledger actually holds more than one report on
 * the same story — how long that story has been running.
 *
 * The guard is the whole point. Every article carries `threadDay` and
 * `threadArc`, and nearly all of them carry an article count of one, where
 * "developing, day 13" would be a claim the data does not support. A thread is
 * worth mentioning when there is a thread.
 */
export function articleKicker(
  article: Pick<Article, 'threadArticleCount' | 'threadArc' | 'threadDay'> & { category: string },
): string {
  const count = article.threadArticleCount ?? 0;
  if (count < 2) return article.category;
  const arc = article.threadArc ?? 'developing';
  const day = article.threadDay;
  const run = day && day > 1 ? `${arc}, day ${day}` : arc;
  return `${article.category} · ${run} · ${count} reports`;
}
