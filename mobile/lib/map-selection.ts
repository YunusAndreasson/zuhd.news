import { articleTime } from './article-utils';
import type { StoryRow } from './map-feed';
import type { TapResult } from './tap-result';

/** Match all labels, not just the first. Coordinates bind labels to the
 * coverage cell, so two places with the same headline cannot steal a tap. */
export function coverageStory(
  result: TapResult,
  rows: readonly StoryRow[],
  found: ReadonlySet<string>,
): string | null {
  const labels = new Set(result.hotspotLabels ?? []);
  const at = result.hotspotCoords;
  let newest: StoryRow | undefined;
  let unread: StoryRow | undefined;
  for (const row of rows) {
    if (!row.coords) continue;
    const nearby = at
      ? Math.abs(row.coords[0] - at[0]) <= 0.5 &&
        Math.abs(((row.coords[1] - at[1] + 540) % 360) - 180) <= 0.5
      : false;
    const thread = row.article.threadLabel;
    const label = thread?.split(':')[0]?.trim();
    const matches =
      labels.has(row.title) || !!(thread && labels.has(thread)) || !!(label && labels.has(label));
    // Labelled heatmap cells must match both place and subject. Article-based
    // fallback cells have no labels and select by the same half-degree cell.
    if (!(at ? nearby && (labels.size === 0 || matches) : matches)) continue;
    if (!newest || articleTime(row.article) > articleTime(newest.article)) newest = row;
    if (!found.has(row.slug) && (!unread || articleTime(row.article) > articleTime(unread.article)))
      unread = row;
  }
  return (unread ?? newest)?.slug ?? null;
}

export interface MapSelectionSources {
  stories: readonly { slug: string }[];
  markets: readonly { id: string }[];
  chokepoints: readonly { id: string }[];
  alerts: readonly { eventid: string }[];
  conflicts: readonly { id: string }[];
  famine: readonly { id: string }[];
  thermal: readonly { id: string }[];
  genocide: readonly { id: string }[];
}

/** Revalidate after a refresh, including a chooser row selected later. */
export function mapCandidates(
  candidates: readonly TapResult[],
  sources: MapSelectionSources,
): TapResult[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    let key: string;
    if (candidate.storySlug) {
      if (!sources.stories.some((s) => s.slug === candidate.storySlug)) return false;
      key = `story:${candidate.storySlug}`;
    } else if (candidate.marketSignalId) {
      if (!sources.markets.some((s) => s.id === candidate.marketSignalId)) return false;
      key = `market:${candidate.marketSignalId}`;
    } else if (candidate.chokepointId) {
      if (!sources.chokepoints.some((s) => s.id === candidate.chokepointId)) return false;
      key = `strait:${candidate.chokepointId}`;
    } else if (candidate.gdacsEventId) {
      if (!sources.alerts.some((s) => s.eventid === candidate.gdacsEventId)) return false;
      key = `alert:${candidate.gdacsEventId}`;
    } else if (candidate.conflictEventId) {
      if (!sources.conflicts.some((s) => s.id === candidate.conflictEventId)) return false;
      key = `conflict:${candidate.conflictEventId}`;
    } else if (candidate.famineAreaId) {
      if (!sources.famine.some((s) => s.id === candidate.famineAreaId)) return false;
      key = `famine:${candidate.famineAreaId}`;
    } else if (candidate.thermalEventId) {
      if (!sources.thermal.some((s) => s.id === candidate.thermalEventId)) return false;
      key = `thermal:${candidate.thermalEventId}`;
    } else if (candidate.genocideId) {
      if (!sources.genocide.some((s) => s.id === candidate.genocideId)) return false;
      key = `genocide:${candidate.genocideId}`;
    } else if (candidate.isHotspot) {
      key = `coverage:${candidate.countryName}:${candidate.hotspotCoords?.join(',') ?? candidate.hotspotLabels?.join('|')}`;
    } else if (candidate.countryName) {
      key = `country:${candidate.countryName}:${candidate.location ?? ''}`;
    } else return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
