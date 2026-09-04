import type { Article, Category, Chokepoint, CompareRow, VesselField } from '@shared/types';
import { memo, useMemo } from 'react';
import { Text as RNText, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { observationLabel } from '../lib/data-freshness';
import { makeStaggerEnter } from '../lib/stagger';
import { chokepointValence, type Valence } from '../lib/valence';
import { CompareBlock } from './blocks/CompareBlock';
import { SourceCaption } from './blocks/SourceCaption';
import { TrendBlock } from './blocks/TrendBlock';
import { Text } from './primitives';
import { MAX_RELATED, RelatedStories } from './RelatedStories';
import { SheetScrollView } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

interface ChokepointSheetProps extends BaseSheetProps {
  chokepoint: Chokepoint | null;
  articles: Article[];
  onArticlePress?: (slug: string, category: Category) => void;
}

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

/** A vessel class against its own 90-day normal.
 *
 *  The tone comes from `chokepointValence` rather than from a threshold of its
 *  own. It used to hold one: 15% here against the card's 10%, so the same
 *  strait could read disrupted on the card and quiet in the sheet that card
 *  opens, and nothing in either file said the other existed. */
function formatDelta(delta: number): { text: string; tone: Valence } {
  const pct = Math.round(delta * 100);
  if (pct === 0) return { text: 'steady', tone: 'neutral' };
  const sign = pct > 0 ? '+' : '';
  return { text: `${sign}${pct}% vs 90d`, tone: chokepointValence(delta) };
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

export const ChokepointSheet = memo(function ChokepointSheet({
  sheetRef,
  chokepoint,
  articles,
  bottomInset,
  onDismiss,
  onArticlePress,
}: ChokepointSheetProps) {
  const { colors, font } = useTheme();
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

  const enter = makeStaggerEnter();

  const primary = chokepoint?.primaryField;
  const primaryLabel =
    (primary && VESSEL_LABELS.find((v) => v.field === primary)?.label.toLowerCase()) || 'transits';
  const current = (primary && chokepoint?.last7Avg[primary]) ?? 0;
  const delta = (primary && chokepoint?.delta7vs90[primary]) ?? 0;
  // The headline delta reads in the same channel as the rows below it and as
  // the card that opened this sheet. It used to resolve to dome gold on a big
  // move and grey on a small one — magnitude in a hue the app spends on the
  // globe, in place of the direction a reader came here for.
  const { text: deltaText, tone: deltaTone } = formatDelta(delta);

  return (
    <SheetLayout sheetRef={sheetRef} onDismiss={onDismiss} handleTitle={chokepoint?.name}>
      <SheetScrollView bottomInset={bottomInset}>
        {chokepoint && (
          <>
            <Animated.View entering={enter()}>
              {/* font.bold escape hatch: the focal throughput number wants
                  bolder-than-`title` (semibold) weight. Mirrors ContextSheet's
                  brief title; only these two sites bold a title, so no
                  dedicated bold-title variant yet (<3 call sites). */}
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

            {/* Marine-weather hint — server-side from open-meteo. Renders
                only when waves crossed the small-craft threshold (≥2.5 m
                peak in past 24h). Disambiguates transit drops: storm =
                weather explanation; calm + drop = real disruption.
                Critical-tier (`very_rough`) tints in the foreground rose
                token; the lower (`rough`) tier reads in `textEmphasis` so
                only the most consequential signal earns a hue — same rule
                as the GDACS Red-only tint in DisasterSheet. */}
            {chokepoint.weather?.alert && (
              <Animated.View entering={enter()} style={styles.weatherRow}>
                <Text
                  variant="captionEmphasis"
                  style={{
                    color:
                      chokepoint.weather.alert === 'very_rough'
                        ? colors.toneUnfavorableText
                        : colors.textEmphasis,
                  }}
                >
                  {chokepoint.weather.alert === 'very_rough' ? 'very rough seas' : 'rough seas'}
                </Text>
                <Text variant="caption" tone="secondary">
                  {' · '}
                  {chokepoint.weather.maxWave24hM.toFixed(1)} m peak (24h)
                </Text>
              </Animated.View>
            )}

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
              <RelatedStories
                articles={related}
                onArticlePress={onArticlePress}
                entering={enter()}
              />
            )}

            <Animated.View entering={enter()} style={styles.section}>
              <SourceCaption
                label={['IMF PortWatch', observationLabel(chokepoint.asOf)]
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
  blurb: {
    marginTop: SPACING.md,
  },
  section: {
    marginTop: SPACING.lg,
  },
  delta: {
    marginTop: SPACING.xxs,
  },
  weatherRow: {
    marginTop: SPACING.xs,
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
});
