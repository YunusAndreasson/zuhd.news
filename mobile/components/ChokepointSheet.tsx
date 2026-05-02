import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { Article, Category, Chokepoint, CompareRow, VesselField } from '@shared/types';
import { memo, useMemo } from 'react';
import { Text as RNText, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, CATEGORIES, SPACING, staggerDelay } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import { ArticleRow } from './ArticleRow';
import { CompareBlock } from './blocks/CompareBlock';
import { SourceCaption } from './blocks/SourceCaption';
import { TrendBlock } from './blocks/TrendBlock';
import { Text } from './primitives';
import { SheetLayout } from './SheetLayout';

interface ChokepointSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  chokepoint: Chokepoint | null;
  articles: Article[];
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
  onArticlePress?: (slug: string, category: Category) => void;
}

const MAX_RELATED = 3;

const VESSEL_LABELS: { field: VesselField; label: string }[] = [
  { field: 'n_tanker', label: 'Tanker' },
  { field: 'n_container', label: 'Container' },
  { field: 'n_dry_bulk', label: 'Dry bulk' },
  { field: 'n_cargo', label: 'Cargo' },
  { field: 'n_general_cargo', label: 'General cargo' },
  { field: 'n_roro', label: 'Ro-Ro' },
];

function formatCount(n: number): string {
  return n < 10 ? n.toFixed(1) : Math.round(n).toString();
}

function formatDelta(delta: number): { text: string; tone: CompareRow['tone'] } {
  const pct = Math.round(delta * 100);
  if (pct === 0) return { text: 'steady', tone: 'neutral' };
  const sign = pct > 0 ? '+' : '';
  const tone: CompareRow['tone'] = Math.abs(pct) > 15 ? 'unfavorable' : 'neutral';
  return { text: `${sign}${pct}% vs 90d`, tone };
}

function findRelatedArticles(chokepoint: Chokepoint, articles: Article[]): Article[] {
  const tags = chokepoint.topicTags.map((t) => t.toLowerCase());
  const out: Article[] = [];
  for (const a of articles) {
    if (out.length >= MAX_RELATED) break;
    const haystack = [
      a.title.toLowerCase(),
      ...(a.concepts || []).map((c) => c.toLowerCase()),
      (a.threadLabel || '').toLowerCase(),
    ].join(' ');
    if (tags.some((tag) => haystack.includes(tag))) out.push(a);
  }
  return out;
}

function resolveCategory(article: Article): Category {
  return CATEGORIES.find((c) => (article.concepts || []).includes(c)) ?? 'politics';
}

export const ChokepointSheet = memo(function ChokepointSheet({
  sheetRef,
  chokepoint,
  articles,
  bottomInset,
  renderBackdrop,
  onDismiss,
  onArticlePress,
}: ChokepointSheetProps) {
  const { colors, font, sheetStyles } = useTheme();
  const snapProps = useSheetSnaps(false);

  const related = useMemo(
    () => (chokepoint ? findRelatedArticles(chokepoint, articles) : []),
    [chokepoint, articles],
  );

  const vesselRows = useMemo<CompareRow[]>(() => {
    if (!chokepoint) return [];
    return VESSEL_LABELS.flatMap((v) => {
      const current = chokepoint.last7Avg[v.field];
      const baseline = chokepoint.baseline90Avg[v.field];
      if (current == null || baseline == null) return [];
      if (baseline < 0.5 && current < 0.5) return [];
      const delta = chokepoint.delta7vs90[v.field] ?? 0;
      const { text: deltaText, tone } = formatDelta(delta);
      return [
        {
          label: v.label,
          value: `${formatCount(current)} / day \u00b7 ${deltaText}`,
          tone,
        },
      ];
    });
  }, [chokepoint]);

  let blockIndex = 0;
  const enter = () => FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(blockIndex++));

  const primary = chokepoint?.primaryField;
  const primaryLabel =
    (primary && VESSEL_LABELS.find((v) => v.field === primary)?.label.toLowerCase()) || 'transits';
  const current = (primary && chokepoint?.last7Avg[primary]) ?? 0;
  const delta = (primary && chokepoint?.delta7vs90[primary]) ?? 0;
  const { text: deltaText, tone } = formatDelta(delta);
  const deltaTone = tone === 'unfavorable' ? 'accent' : 'secondary';

  return (
    <SheetLayout
      sheetRef={sheetRef}
      {...snapProps}
      renderBackdrop={renderBackdrop}
      onDismiss={onDismiss}
      handleTitle={chokepoint?.name}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.lg }]}
      >
        {chokepoint && (
          <>
            <Animated.View entering={enter()}>
              <Text selectable variant="title" tone="emphasis" style={font.bold}>
                {formatCount(current)}{' '}
                <RNText style={{ ...font.regular, color: colors.textSecondary }}>
                  {primaryLabel}/day
                </RNText>
              </Text>
              <Text variant="captionEmphasis" tone={deltaTone} style={styles.delta}>
                {deltaText}
              </Text>
            </Animated.View>

            <Animated.View entering={enter()} style={styles.blurb}>
              <Text selectable variant="body">
                {chokepoint.blurb}
              </Text>
            </Animated.View>

            <Animated.View entering={enter()} style={styles.section}>
              <TrendBlock
                values={chokepoint.series.total}
                periods={chokepoint.series.periods}
                label="Total transits, last 90 days"
                unit="ships/day"
                highlight="last"
                variant="context"
              />
            </Animated.View>

            {vesselRows.length > 0 && (
              <Animated.View entering={enter()} style={styles.section}>
                <CompareBlock rows={vesselRows} label="By vessel class" variant="context" />
              </Animated.View>
            )}

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
              <SourceCaption label="IMF PortWatch" />
            </Animated.View>
          </>
        )}
      </BottomSheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  blurb: {
    marginTop: SPACING.md,
  },
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
