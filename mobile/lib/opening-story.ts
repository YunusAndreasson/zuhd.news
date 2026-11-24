import type { Article, Category, FeedResponse } from '@shared/types';
import bundled from '../assets/opening/karachi.json';
import { articleTime, eventTime } from './article-utils';
import type { GraphCard } from './cards/types';
import { DAY_MS } from './time';

export type Starter = Article & { category: Category; starterEligible?: boolean };
export const archiveStory = { ...bundled, category: 'economy' } as Starter;

export function hasOpeningReading(card: GraphCard | undefined): boolean {
  const series = card?.series;
  return !!(
    card?.asOf &&
    Number.isFinite(Date.parse(card.asOf)) &&
    series &&
    series.values.length >= 2 &&
    series.values.every(Number.isFinite) &&
    series.periods.length === series.values.length &&
    /\d/.test(card.reading) &&
    (series.unit || card.readingNote || /[$€£%]/.test(card.reading))
  );
}

type SeriesAvailable = (story: Starter) => boolean;

function tier(story: Starter, available: SeriesAvailable): number {
  const subject =
    story.chart && story.entities?.some((e) => e.indicatorId === story.chart) && available(story);
  const measured = story.starterEvidence === 'measurement' || story.starterEvidence === 'both';
  const usableChart =
    subject && (story.starterEvidence === 'chart' || story.starterEvidence === 'both');
  return measured ? (usableChart ? 0 : 1) : usableChart ? 2 : 3;
}

function qualifies(story: Starter): boolean {
  return (
    story.starterEligible === true &&
    !!story.title.trim() &&
    !!story.sentences[0]?.trim() &&
    !!story.location?.trim() &&
    typeof story.lat === 'number' &&
    Math.abs(story.lat) <= 90 &&
    typeof story.lng === 'number' &&
    Math.abs(story.lng) <= 180 &&
    Number.isFinite(articleTime(story))
  );
}

/** A current revision supersedes the local one even if its approval was withdrawn. */
export function openingStory(
  categories: FeedResponse['categories'],
  previous: Starter | null,
  available: SeriesAvailable = () => true,
): Starter | null {
  const rows = Object.entries(categories).flatMap(([category, articles]) =>
    articles.map((article) => ({ ...article, category: category as Category }) as Starter),
  );
  const present = new Set(rows.map((article) => article.slug));
  if (previous && !present.has(previous.slug)) rows.push(previous);
  return (
    rows
      .filter(qualifies)
      .map((story) => ({ story, tier: tier(story, available) }))
      .filter((row) => row.tier < 3)
      .sort(
        ({ story: a, tier: at }, { story: b, tier: bt }) =>
          Math.floor(articleTime(b) / DAY_MS) - Math.floor(articleTime(a) / DAY_MS) ||
          at - bt ||
          articleTime(b) - articleTime(a) ||
          eventTime(b) - eventTime(a) ||
          a.slug.localeCompare(b.slug),
      )[0]?.story ?? null
  );
}

export interface StarterFallback {
  previous: Starter | null;
  archiveWithdrawn: boolean;
}

export function archiveWithdrawn(
  categories: FeedResponse['categories'],
  previous: boolean,
): boolean {
  for (const [category, rows] of Object.entries(categories)) {
    const row: (Article & { starterEligible?: boolean }) | undefined = rows.find(
      (a) => a.slug === archiveStory.slug,
    );
    if (!row) continue;
    if (
      row.starterEligible === false ||
      category !== archiveStory.category ||
      row.title !== archiveStory.title ||
      row.sentences.join('\n') !== archiveStory.sentences.join('\n')
    )
      return true;
    if (row.starterEligible === true) {
      // The bundled face uses its measured hook while offline. A new review
      // that approves only the chart withdraws that independent evidence.
      return (
        !qualifies({ ...row, category: category as Category }) ||
        (row.starterEvidence !== 'measurement' && row.starterEvidence !== 'both')
      );
    }
    return previous;
  }
  return previous;
}

/** Only the bundled, reviewed text is eligible on a pre-flag feed. */
export function selectStarter(
  categories: FeedResponse['categories'],
  fallback: StarterFallback,
  available?: SeriesAvailable,
) {
  const winner = openingStory(categories, fallback.previous, available);
  if (archiveWithdrawn(categories, fallback.archiveWithdrawn)) return winner;
  return winner && articleTime(winner) >= articleTime(archiveStory) ? winner : archiveStory;
}
