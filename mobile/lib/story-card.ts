import type { Article } from '@shared/types';

/**
 * What a story card says, before anything is laid out.
 *
 * Every article is four one-sentence blocks — hook, why it matters, context,
 * what's next (`scripts/write-prompt.md`). At rest a card carries only the
 * hook: a three-to-five-word headline on its own ("Drone Boat Kills Drone
 * Boat") does not say why anyone should open it, and the hook does, in one
 * line or two. The card used to rest on the hook *and* why it matters — half
 * of every article — and a reader went through forty of them reading each one
 * to get past it. The rest waits under the fold, already rendered, for the
 * card to open.
 */

/** The hook. */
const HOOK_SENTENCES = 1;

/** Generic so a card can split its rendered sentences, not only the strings. */
export function hookOf<T>(sentences: readonly T[]): T[] {
  return sentences.slice(0, HOOK_SENTENCES);
}

export function restOf<T>(sentences: readonly T[]): T[] {
  return sentences.slice(HOOK_SENTENCES);
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
/** Secondary thread context belongs beneath the article, away from its title. */
export function articleThreadContext(
  article: Pick<Article, 'threadArticleCount' | 'threadArc' | 'threadDay'>,
): string | null {
  const count = article.threadArticleCount ?? 0;
  if (count < 2) return null;
  const arc = article.threadArc ?? 'developing';
  const day = article.threadDay;
  const run = day && day > 1 ? `${arc}, day ${day}` : arc;
  return `${run} · ${count} reports`;
}
