import type { Article, Category, Entity, Indicator } from '@shared/types';
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SPACING } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { observationLabel } from '../lib/data-freshness';
import { makeStaggerEnter } from '../lib/stagger';
import { riseMeansFor, type Valence, valenceOfChange } from '../lib/valence';
import { SourceCaption } from './blocks/SourceCaption';
import { TrendBlock } from './blocks/TrendBlock';
import { Text } from './primitives';
import { MAX_RELATED, RelatedStories } from './RelatedStories';
import { SheetScrollView } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

interface EntitySheetProps extends BaseSheetProps {
  /** The user-tapped entity alongside the resolved indicator from the
   *  catalog. Null collapses the sheet body to nothing — the layout
   *  remains open while dismiss is animating. */
  entity: Entity | null;
  indicator: Indicator | null;
  /** Full feed for the "related stories" section — articles whose
   *  `entities[]` cite the same indicatorId. */
  articles: Article[];
  /** Asks the parent to scroll the feed to a specific article slug. */
  onArticlePress?: (slug: string, category: Category) => void;
}

/** Format indicator `latest` for the headline readout. Large integers (indices,
 *  view counts) are space-separated; sub-10 floats get a decimal; everything
 *  else rounds to integer. Unitless — caller appends `indicator.unit`. */
function formatLatest(value: number, unit?: string): string {
  if (!Number.isFinite(value)) return '—';
  // Percentages / small numbers keep decimals; BTC/$ stay integer-rounded.
  if (unit === '%' || Math.abs(value) < 10) return value.toFixed(2);
  // Large integer values get thin-space separators (e.g. 76 238)
  const rounded = Math.round(value);
  return rounded.toLocaleString('en-US');
}

/**
 * The indicator's last move, in the app's one colour channel.
 *
 * This used to tint on *magnitude*: dome gold at five per cent or more, grey
 * below it. Two things were wrong with that. Gold is the globe's hue and
 * spending it here made a routine tick look like a finding; and a reader who
 * had just seen brent's card chip in rose met the same indicator in this sheet
 * in gold, which is the app saying two different things about one number.
 * `riseMeansFor` is the same lookup the card uses, so it now cannot.
 */
function formatDelta(
  indicator: Indicator,
  latest?: number | null,
  previous?: number | null,
): {
  text: string;
  tone: Valence;
} {
  if (
    latest == null ||
    previous == null ||
    !Number.isFinite(latest) ||
    !Number.isFinite(previous)
  ) {
    return { text: '', tone: 'neutral' };
  }
  if (previous === 0) return { text: '', tone: 'neutral' };
  const delta = (latest - previous) / Math.abs(previous);
  const pct = Math.round(delta * 100);
  if (pct === 0) return { text: 'steady', tone: 'neutral' };
  const sign = pct > 0 ? '+' : '';
  return { text: `${sign}${pct}% vs prev`, tone: valenceOfChange(pct, riseMeansFor(indicator)) };
}

function findRelatedArticles(indicator: Indicator, articles: Article[]): Article[] {
  const out: Article[] = [];
  for (const a of articles) {
    if (out.length >= MAX_RELATED) break;
    if ((a.entities ?? []).some((e) => e.indicatorId === indicator.id)) {
      out.push(a);
    }
  }
  return out;
}

export const EntitySheet = memo(function EntitySheet({
  sheetRef,
  entity,
  indicator,
  articles,
  bottomInset,
  onDismiss,
  onArticlePress,
}: EntitySheetProps) {
  const snapProps = useSheetSnaps(false);

  const related = useMemo(
    () => (indicator ? findRelatedArticles(indicator, articles) : []),
    [indicator, articles],
  );

  const enter = makeStaggerEnter();

  const latest = indicator?.latest ?? indicator?.values[indicator.values.length - 1];
  const previous = indicator?.previous ?? indicator?.values[indicator.values.length - 2];
  const delta = indicator
    ? formatDelta(indicator, latest, previous)
    : { text: '', tone: 'neutral' as const };
  const handleTitle = indicator?.label ?? entity?.mention ?? '';

  return (
    <SheetLayout sheetRef={sheetRef} {...snapProps} onDismiss={onDismiss} handleTitle={handleTitle}>
      <SheetScrollView bottomInset={bottomInset}>
        {indicator && (
          <>
            {latest != null && (
              <Animated.View entering={enter()}>
                <Text selectable variant="title" tone="emphasis">
                  {formatLatest(latest, indicator.unit)}
                  {indicator.unit ? ` ${indicator.unit}` : ''}
                </Text>
                {delta.text ? (
                  <Text variant="captionEmphasis" tone={delta.tone} style={styles.delta}>
                    {delta.text}
                  </Text>
                ) : null}
              </Animated.View>
            )}

            <Animated.View entering={enter()} style={styles.section}>
              <TrendBlock
                values={indicator.values}
                periods={indicator.periods}
                label={indicator.label}
                unit={indicator.unit}
                highlight={indicator.defaultHighlight ?? 'last'}
                variant="context"
              />
            </Animated.View>

            {related.length > 0 && onArticlePress && (
              <RelatedStories
                articles={related}
                onArticlePress={onArticlePress}
                entering={enter()}
              />
            )}

            <Animated.View entering={enter()} style={styles.section}>
              <SourceCaption
                label={[indicator.sourceLabel, observationLabel(indicator.asOf)]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </Animated.View>
          </>
        )}
      </SheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  section: {
    marginTop: SPACING.lg,
  },
  delta: {
    marginTop: SPACING.xxs,
  },
});
