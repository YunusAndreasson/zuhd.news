import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, MAX_FONT_SCALE, SPACING, staggerDelay } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { Article, Category, Chokepoint, CompareRow } from '../types';
import { ArticleRow } from './ArticleRow';
import { CompareBlock } from './blocks/CompareBlock';
import { SourceCaption } from './blocks/SourceCaption';
import { TrendBlock } from './blocks/TrendBlock';
import { SheetLayout } from './SheetLayout';
import { useMaxSheetHeight } from './SheetPrimitives';

interface ChokepointSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  chokepoint: Chokepoint | null;
  /** Flat feed across all categories — used to surface articles tagged to
   *  this chokepoint via `topicTags ∩ article.concepts/title` overlap. */
  articles: Article[];
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
  /** Tapping a related-article row asks the parent to scroll the feed to it. */
  onArticlePress?: (slug: string, category: Category) => void;
}

const VESSEL_LABELS: { field: string; label: string }[] = [
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
  // Deltas on shipping flow are most often "less is worse" (closure), but a
  // dip isn't universally bad (Panama drought == good news rationing). Treat
  // tone as magnitude-only so the sheet doesn't editorialise.
  const tone: CompareRow['tone'] = Math.abs(pct) > 15 ? 'unfavorable' : 'neutral';
  return { text: `${sign}${pct}% vs 90d`, tone };
}

function findRelatedArticles(chokepoint: Chokepoint, articles: Article[]): Article[] {
  const tags = new Set(chokepoint.topicTags.map((t) => t.toLowerCase()));
  const out: Article[] = [];
  for (const a of articles) {
    const haystack = [
      a.title.toLowerCase(),
      ...(a.concepts || []).map((c) => c.toLowerCase()),
      (a.threadLabel || '').toLowerCase(),
    ].join(' ');
    for (const tag of tags) {
      if (haystack.includes(tag)) {
        out.push(a);
        break;
      }
    }
    if (out.length >= 3) break;
  }
  return out;
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
  const { sheetStyles } = useTheme();
  const MAX_SHEET_HEIGHT = useMaxSheetHeight();

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
      if (baseline < 0.5 && current < 0.5) return []; // vessel class absent here
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

  return (
    <SheetLayout
      sheetRef={sheetRef}
      enableDynamicSizing
      maxDynamicContentSize={MAX_SHEET_HEIGHT}
      renderBackdrop={renderBackdrop}
      onDismiss={onDismiss}
      handleTitle={chokepoint?.name}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.xxl }]}
      >
        {chokepoint && (
          <ChokepointBody
            chokepoint={chokepoint}
            vesselRows={vesselRows}
            related={related}
            onArticlePress={onArticlePress}
          />
        )}
      </BottomSheetScrollView>
    </SheetLayout>
  );
});

interface ChokepointBodyProps {
  chokepoint: Chokepoint;
  vesselRows: CompareRow[];
  related: Article[];
  onArticlePress?: (slug: string, category: Category) => void;
}

function ChokepointBody({ chokepoint, vesselRows, related, onArticlePress }: ChokepointBodyProps) {
  const { colors, font, typography, textStyles } = useTheme();

  const primary = chokepoint.primaryField;
  const primaryLabel =
    VESSEL_LABELS.find((v) => v.field === primary)?.label.toLowerCase() ?? 'transits';
  const current = chokepoint.last7Avg[primary] ?? 0;
  const delta = chokepoint.delta7vs90[primary] ?? 0;
  const { text: deltaText, tone } = formatDelta(delta);
  const deltaColor = tone === 'unfavorable' ? colors.accent : colors.textSecondary;

  let blockIndex = 0;
  const enter = () => FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(blockIndex++));

  return (
    <>
      {/* Headline stat — the one-line why-you-care */}
      <Animated.View entering={enter()}>
        <Text
          selectable
          style={{
            ...font.bold,
            fontSize: typography.sizeLg,
            lineHeight: typography.sizeLg * typography.leadingHeading,
            color: colors.textEmphasis,
          }}
          maxFontSizeMultiplier={MAX_FONT_SCALE.heading}
        >
          {formatCount(current)}{' '}
          <Text style={{ ...font.regular, color: colors.textSecondary }}>{primaryLabel}/day</Text>
        </Text>
        <Text
          style={{
            ...font.semiBold,
            fontSize: typography.sizeSm,
            color: deltaColor,
            marginTop: SPACING.xxs,
          }}
        >
          {deltaText}
        </Text>
      </Animated.View>

      {/* Educational blurb */}
      <Animated.View entering={enter()} style={styles.blurb}>
        <Text
          selectable
          style={{
            ...font.regular,
            fontSize: typography.sizeBase,
            lineHeight: typography.sizeBase * typography.leadingBody,
            color: colors.text,
          }}
        >
          {chokepoint.blurb}
        </Text>
      </Animated.View>

      {/* Sparkline — full 90d of total transits */}
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

      {/* Vessel-class breakdown */}
      {vesselRows.length > 0 && (
        <Animated.View entering={enter()} style={styles.section}>
          <CompareBlock rows={vesselRows} label="By vessel class" variant="context" />
        </Animated.View>
      )}

      {/* Related articles — present only when the current feed has matches */}
      {related.length > 0 && onArticlePress && (
        <Animated.View entering={enter()} style={styles.section}>
          <Text
            style={[
              textStyles.smallCapsXs,
              { color: colors.textSecondary, marginBottom: SPACING.xs },
            ]}
          >
            related stories
          </Text>
          {related.map((a) => {
            const category: Category =
              (['politics', 'economy', 'science', 'tech'] as Category[]).find((c) =>
                (a.concepts || []).includes(c),
              ) ?? 'politics';
            return (
              <ArticleRow
                key={a.slug}
                slug={a.slug}
                title={a.title}
                addedAt={a.addedAt}
                category={category}
                location={a.location}
                onPress={onArticlePress}
              />
            );
          })}
        </Animated.View>
      )}

      {/* Source caption — anchor provenance */}
      <Animated.View entering={enter()} style={styles.section}>
        <SourceCaption label="IMF PortWatch" />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  blurb: {
    marginTop: SPACING.md,
  },
  section: {
    marginTop: SPACING.lg,
  },
});
