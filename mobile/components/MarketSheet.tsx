import { COUNTRY_DATA } from '@shared/countries/country-data';
import { topojsonNameFromCode } from '@shared/countries/iso';
import type { Article, Category, MarketExchange } from '@shared/types';
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SPACING } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import {
  formatAsOf,
  formatChangePct,
  formatLevel,
  marketDirection,
  sessionState,
} from '../lib/markets';
import { makeStaggerEnter } from '../lib/stagger';
import { SourceCaption } from './blocks/SourceCaption';
import { TrendBlock } from './blocks/TrendBlock';
import { MARKET_DIRECTION_LABEL } from './globe/disaster-glyphs';
import { Text } from './primitives';
import { MAX_RELATED, RelatedStories } from './RelatedStories';
import { SheetFlagRow, SheetScrollView } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

interface MarketSheetProps extends BaseSheetProps {
  exchange: MarketExchange | null;
  articles: Article[];
  onArticlePress?: (slug: string, category: Category) => void;
  /** Tap on the country chip — opens the CountrySheet for that country. */
  onCountryPress?: (countryName: string) => void;
}

const SESSION_LABEL = {
  open: 'Trading now',
  closed: 'Closed',
  unknown: '',
} as const;

/**
 * What a market mark on the globe means.
 *
 * ── Why there is no colour anywhere on this sheet ──────────────────────────
 *
 * The web map draws an exchange in sage or terracotta by direction. This app
 * does not, and the sheet has to be consistent with the glyph or the lesson it
 * teaches is false: the reader is being shown that a triangle carries the
 * direction, so a green number underneath would immediately tell them it does
 * not have to. The app's one chromatic licence is spent on the genocide ring
 * (`colors.determination`), and a rising index is not the second most
 * important thing in the world.
 *
 * `toneFavorable` / `toneUnfavorable` were available and were deliberately not
 * used. They are the sentiment palette and this is a legitimate use of them —
 * but the point of the exercise is that a market's direction is legible without
 * a hue at all, and half-taking that position would be worse than either.
 *
 * The sheet therefore carries the magnitude the glyph cannot: the signed
 * percentage, the index level, the close's own date, and whether the exchange
 * is trading right now.
 */
export const MarketSheet = memo(function MarketSheet({
  sheetRef,
  exchange,
  articles,
  bottomInset,
  renderBackdrop,
  onDismiss,
  onArticlePress,
  onCountryPress,
}: MarketSheetProps) {
  const { colors, font } = useTheme();
  const snapProps = useSheetSnaps(false);

  const direction = exchange ? marketDirection(exchange.changePct) : 'flat';
  const session = exchange ? sessionState(exchange) : 'unknown';

  // The payload carries ISO2; `COUNTRY_DATA` and the CountrySheet are both
  // keyed by the topojson long-form name, so the code has to be bridged. An
  // unmapped code (Hong Kong, Taiwan) simply yields no chip rather than a
  // broken one — the sheet reads fine without it.
  const flag = useMemo(() => {
    if (!exchange) return null;
    const name = topojsonNameFromCode(exchange.iso2);
    if (!name) return null;
    const data = COUNTRY_DATA[name];
    return data?.flag ? { name, flag: data.flag } : null;
  }, [exchange]);

  // Present only on the full endpoint. The lite payload the app normally reads
  // drops both, so every consumer of them is guarded — see `useMarkets`.
  const related = useMemo(() => {
    const hits = exchange?.relatedArticles;
    if (!hits || hits.length === 0) return [];
    const bySlug = new Map(articles.map((a) => [a.slug, a]));
    const out: Article[] = [];
    for (const h of hits) {
      const a = bySlug.get(h.slug);
      if (a) out.push(a);
      if (out.length >= MAX_RELATED) break;
    }
    return out;
  }, [exchange, articles]);

  const enter = makeStaggerEnter();

  return (
    <SheetLayout
      sheetRef={sheetRef}
      {...snapProps}
      renderBackdrop={renderBackdrop}
      onDismiss={onDismiss}
      handleTitle={exchange?.city}
    >
      <SheetScrollView bottomInset={bottomInset}>
        {exchange && (
          <>
            {/* The index level is the focal, and the change sits under it in
                words. Tabular figures because these are numbers to compare
                across sheets, not prose. */}
            <Animated.View entering={enter()}>
              <Text variant="labelXs" tone="secondary" style={styles.eyebrow}>
                {exchange.indexName}
              </Text>
              {/* font.bold escape hatch: the focal level wants bolder than
                  `title` (semibold), matching ChokepointSheet's throughput
                  number — the two are the same kind of readout. */}
              <Text selectable variant="title" tone="emphasis" style={[font.bold, styles.tabular]}>
                {formatLevel(exchange.level)}
              </Text>
              <Text variant="captionEmphasis" style={styles.change}>
                {MARKET_DIRECTION_LABEL[direction]} {formatChangePct(exchange.changePct)}
              </Text>
              <Text variant="caption" tone="secondary" style={styles.meta}>
                {exchange.name}
                {session !== 'unknown' ? ` · ${SESSION_LABEL[session]}` : ''}
              </Text>
            </Animated.View>

            {exchange.blurb ? (
              <Animated.View entering={enter()} style={styles.blurb}>
                <Text selectable variant="body">
                  {exchange.blurb}
                </Text>
              </Animated.View>
            ) : null}

            {/* The mark's vocabulary, stated once. This is the educational
                core: the reader has just tapped a shape they have not seen
                before, and the shape is doing work a colour usually does, so
                it has to be named. Kept to three lines — a legend, not an
                essay. */}
            <Animated.View entering={enter()} style={styles.section}>
              <Text variant="labelSm">Reading the mark</Text>
              <Text variant="body" style={styles.body} selectable>
                A triangle above the session line points the way the index moved: up if it rose,
                down if it fell. A second line in place of the triangle means it closed where it
                opened, near enough. Size and colour say nothing here — the number is on this sheet,
                and the app keeps its one colour for one thing.
              </Text>
            </Animated.View>

            {/* Trading hours, in the exchange's own week. Worth stating
                because the payload models it per-exchange for a reason a
                reader can check against their own assumptions. */}
            <Animated.View entering={enter()} style={styles.section}>
              <Text variant="labelSm">Trading hours</Text>
              <Text variant="body" style={styles.body} selectable>
                {exchange.sessionStart}–{exchange.sessionEnd} local time in {exchange.city}. Trading
                weeks differ by exchange, not by region: Riyadh runs Sunday to Thursday while Dubai
                moved to Monday to Friday in 2022.
              </Text>
              <Text variant="caption" tone="secondary" style={styles.meta} selectable>
                Quote from the close of {formatAsOf(exchange.asOf)} · {exchange.currency}
              </Text>
            </Animated.View>

            {exchange.series &&
            exchange.series.values.length > 1 &&
            exchange.series.values.length === exchange.series.periods.length ? (
              <Animated.View entering={enter()} style={styles.section}>
                <TrendBlock
                  values={exchange.series.values}
                  periods={exchange.series.periods}
                  label={`${exchange.indexName}, recent closes`}
                  highlight="last"
                  variant="context"
                />
              </Animated.View>
            ) : null}

            {/* Which exchanges are on the globe at all is an editorial claim,
                and the honest version of it names its own gap. This is the
                same argument the catalog makes upstream by keeping
                unavailable exchanges with a reason attached rather than
                deleting them. */}
            <Animated.View entering={enter()} style={styles.section}>
              <Text variant="labelSm">Which exchanges are shown</Text>
              <Text variant="body" style={styles.body} selectable>
                Riyadh, Istanbul, Dubai, Kuala Lumpur and Jakarta are on this globe alongside New
                York, London and Tokyo. Several are missing — Doha, Kuwait, Karachi, Dhaka,
                Casablanca, Cairo, Lagos and others — because no free daily series covers them, not
                because they matter less. The gap is the data commons', and it is recorded rather
                than hidden.
              </Text>
            </Animated.View>

            {related.length > 0 && onArticlePress && (
              <RelatedStories
                articles={related}
                onArticlePress={onArticlePress}
                entering={enter()}
              />
            )}

            {flag && (
              <SheetFlagRow
                entering={enter()}
                flags={[flag]}
                borderColor={colors.rule}
                onPress={onCountryPress}
              />
            )}

            <Animated.View entering={enter()} style={styles.section}>
              <SourceCaption label={exchange.sourceLabel} />
            </Animated.View>
          </>
        )}
      </SheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  eyebrow: {
    marginBottom: SPACING.xs,
  },
  // Orthogonal to size/weight, so allowed as a style override per DESIGN.md.
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  change: {
    marginTop: SPACING.xxs,
    fontVariant: ['tabular-nums'],
  },
  meta: {
    marginTop: SPACING.xxs,
  },
  blurb: {
    marginTop: SPACING.md,
  },
  body: {
    marginTop: SPACING.xs,
  },
  section: {
    marginTop: SPACING.lg,
  },
});
