import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { Article, Category, Entity, Indicator } from '@shared/types';
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, CATEGORIES, SPACING, staggerDelay } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import { ArticleRow } from './ArticleRow';
import { SourceCaption } from './blocks/SourceCaption';
import { TrendBlock } from './blocks/TrendBlock';
import { Text } from './primitives';
import { SheetLayout } from './SheetLayout';

interface EntitySheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  /** The user-tapped entity alongside the resolved indicator from the
   *  catalog. Null collapses the sheet body to nothing — the layout
   *  remains open while dismiss is animating. */
  entity: Entity | null;
  indicator: Indicator | null;
  /** Full feed for the "related stories" section — articles whose
   *  `entities[]` cite the same indicatorId. */
  articles: Article[];
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
  /** Asks the parent to scroll the feed to a specific article slug. */
  onArticlePress?: (slug: string, category: Category) => void;
}

const MAX_RELATED = 3;

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

function formatDelta(
  latest?: number | null,
  previous?: number | null,
): {
  text: string;
  tone: 'default' | 'secondary' | 'accent';
} {
  if (
    latest == null ||
    previous == null ||
    !Number.isFinite(latest) ||
    !Number.isFinite(previous)
  ) {
    return { text: '', tone: 'secondary' };
  }
  if (previous === 0) return { text: '', tone: 'secondary' };
  const delta = (latest - previous) / Math.abs(previous);
  const pct = Math.round(delta * 100);
  if (pct === 0) return { text: 'steady', tone: 'secondary' };
  const sign = pct > 0 ? '+' : '';
  // Accent (dome gold) draws attention on big moves; secondary for minor ones.
  const tone: 'secondary' | 'accent' = Math.abs(pct) >= 5 ? 'accent' : 'secondary';
  return { text: `${sign}${pct}% vs prev`, tone };
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

function resolveCategory(article: Article): Category {
  return CATEGORIES.find((c) => (article.concepts || []).includes(c)) ?? 'politics';
}

export const EntitySheet = memo(function EntitySheet({
  sheetRef,
  entity,
  indicator,
  articles,
  bottomInset,
  renderBackdrop,
  onDismiss,
  onArticlePress,
}: EntitySheetProps) {
  const { sheetStyles } = useTheme();
  const snapProps = useSheetSnaps(false);

  const related = useMemo(
    () => (indicator ? findRelatedArticles(indicator, articles) : []),
    [indicator, articles],
  );

  let blockIndex = 0;
  const enter = () => FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(blockIndex++));

  const latest = indicator?.latest ?? indicator?.values[indicator.values.length - 1];
  const previous = indicator?.previous ?? indicator?.values[indicator.values.length - 2];
  const delta = formatDelta(latest, previous);
  const handleTitle = indicator?.label ?? entity?.mention ?? '';

  return (
    <SheetLayout
      sheetRef={sheetRef}
      {...snapProps}
      renderBackdrop={renderBackdrop}
      onDismiss={onDismiss}
      handleTitle={handleTitle}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.lg }]}
      >
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
              <Animated.View entering={enter()} style={styles.section}>
                <Text variant="labelXs" style={styles.relatedHeading}>
                  related stories
                </Text>
                {related.map((a) => (
                  <ArticleRow
                    key={a.slug}
                    slug={a.slug}
                    title={a.title}
                    addedAt={a.addedAt}
                    category={resolveCategory(a)}
                    location={a.location}
                    onPress={onArticlePress}
                  />
                ))}
              </Animated.View>
            )}

            <Animated.View entering={enter()} style={styles.section}>
              <SourceCaption label={indicator.sourceLabel} />
            </Animated.View>
          </>
        )}
      </BottomSheetScrollView>
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
  relatedHeading: {
    marginBottom: SPACING.xs,
  },
});
