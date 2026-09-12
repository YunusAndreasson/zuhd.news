import { COUNTRY_DATA } from '@shared/countries/country-data';
import { topojsonNameFromCode } from '@shared/countries/iso';
import type { Category } from '@shared/types';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { articleTime, formatTimeAgo } from '../lib/article-utils';
import type { RiverArticle } from '../lib/news-order';
import { useOpenLink } from '../lib/open-link';
import type { FamineArea, GenocideSituation, ThermalEvent } from '../lib/overlays';
import { makeStaggerEnter } from '../lib/stagger';
import { Icon, Pressable, Text } from './primitives';
import { SheetFlagRow, SheetHero, SheetScrollView, SheetSourceFooter } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

/**
 * The sheet behind the three hazard marks the globe took from the web map:
 * an IPC famine classification, a FIRMS thermal anomaly, a UN genocide
 * determination.
 *
 * One sheet with three bodies rather than three sheets, because each is a few
 * lines of fact and a citation — the same hero, flags and source footer
 * `ConflictSheet` and `DisasterSheet` share, so the family still reads as one.
 * The hero is tinted in the mark's own hue: the reader just tapped a purple
 * column or a red ring, and the sheet it opens should visibly be about that.
 *
 * Every figure here is the source's own, never derived. A phase is IPC's
 * `overall_phase`; a genocide finding is quoted from the body that made it.
 */

export type OverlaySelection =
  | { kind: 'famine'; area: FamineArea }
  | { kind: 'thermal'; event: ThermalEvent }
  | { kind: 'genocide'; situation: GenocideSituation };

interface OverlaySheetProps extends BaseSheetProps {
  overlay: OverlaySelection | null;
  /** The river, so a thermal anomaly can name the stories it was joined to. */
  articles: RiverArticle[];
  onArticlePress: (slug: string, category: Category) => void;
  onCountryPress?: (countryName: string) => void;
}

const IPC_URL = 'https://www.ipcinfo.org/ipc-country-analysis/en/';
const FIRMS_URL = 'https://firms.modaps.eosdis.nasa.gov/map/';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2025-09-16` → `16 Sep 2025`; `2023-10` → `Oct 2023`. Anything else as given. */
function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return m[3] ? `${Number(m[3])} ${month} ${m[1]}` : `${month} ${m[1]}`;
}

function flagFor(name: string | undefined): { name: string; flag: string }[] {
  if (!name) return [];
  const data = COUNTRY_DATA[name];
  return data?.flag ? [{ name, flag: data.flag }] : [];
}

const RelatedRow = memo(function RelatedRow({
  article,
  onPress,
}: {
  article: RiverArticle;
  onPress: (slug: string, category: Category) => void;
}) {
  const { colors } = useTheme();
  const handlePress = useCallback(
    () => onPress(article.slug, article.category),
    [article.category, article.slug, onPress],
  );
  return (
    <Pressable
      haptic="tick"
      onPress={handlePress}
      style={[styles.relatedRow, { borderBottomColor: colors.rule }]}
      accessibilityRole="button"
      accessibilityLabel={article.title}
    >
      <View style={styles.relatedText}>
        <Text variant="bodyEmphasis" numberOfLines={2}>
          {article.title}
        </Text>
        <Text variant="labelXs" tone="secondary" numberOfLines={1}>
          {`${article.category} · ${formatTimeAgo(articleTime(article))}`}
        </Text>
      </View>
      <Icon name="chevron-forward" size="sm" tone="secondary" />
    </Pressable>
  );
});

export const OverlaySheet = memo(function OverlaySheet({
  sheetRef,
  overlay,
  articles,
  bottomInset,
  onDismiss,
  onArticlePress,
  onCountryPress,
}: OverlaySheetProps) {
  const { colors } = useTheme();
  const openLink = useOpenLink();

  const related = useMemo(() => {
    if (overlay?.kind !== 'thermal') return [];
    const slugs = new Set(overlay.event.relatedArticles ?? []);
    return articles.filter((a) => slugs.has(a.slug));
  }, [overlay, articles]);

  const genocideUrl = overlay?.kind === 'genocide' ? overlay.situation.url : undefined;
  const handleSourcePress = useCallback(() => {
    if (!overlay) return;
    if (overlay.kind === 'famine') openLink(IPC_URL);
    else if (overlay.kind === 'thermal') openLink(FIRMS_URL);
    else if (genocideUrl) openLink(genocideUrl);
  }, [overlay, genocideUrl, openLink]);

  const handleTitle =
    overlay?.kind === 'famine'
      ? 'food insecurity'
      : overlay?.kind === 'thermal'
        ? 'thermal anomaly'
        : overlay?.kind === 'genocide'
          ? 'genocide'
          : '';

  const enter = makeStaggerEnter();

  return (
    <SheetLayout sheetRef={sheetRef} onDismiss={onDismiss} handleTitle={handleTitle}>
      <SheetScrollView bottomInset={bottomInset}>
        {overlay?.kind === 'famine' && (
          <>
            <SheetHero
              entering={enter()}
              eyebrow={`IPC phase ${overlay.area.phase} of 5`}
              focal={overlay.area.phaseName}
              tint={colors.markFamine}
              secondary={overlay.area.area}
            />
            {overlay.area.pop?.p3plus ? (
              <Animated.View entering={enter()} style={styles.block}>
                <Text variant="body" selectable>
                  {`${overlay.area.pop.p3plus.toLocaleString('en-US')} people in crisis or worse${
                    overlay.area.pop.total
                      ? `, of ${overlay.area.pop.total.toLocaleString('en-US')} analysed`
                      : ''
                  }.`}
                </Text>
              </Animated.View>
            ) : null}
            <Animated.View entering={enter()} style={styles.meta}>
              <Text variant="labelXs" tone="secondary">
                {`analysis of ${overlay.area.vintage}`}
              </Text>
            </Animated.View>
            <SheetFlagRow
              entering={enter()}
              flags={flagFor(
                overlay.area.iso2 ? topojsonNameFromCode(overlay.area.iso2) : undefined,
              )}
              borderColor={colors.rule}
              onPress={onCountryPress}
            />
            <SheetSourceFooter
              entering={enter()}
              source="Integrated Food Security Phase Classification"
              linkLabel="IPC →"
              linkAccessibilityLabel="Open the IPC country analyses"
              onLinkPress={handleSourcePress}
            />
          </>
        )}

        {overlay?.kind === 'thermal' && (
          <>
            <SheetHero
              entering={enter()}
              eyebrow="fire radiative power"
              focal={`${Math.round(overlay.event.frp).toLocaleString('en-US')} MW`}
              tint={colors.markThermal}
              secondary={overlay.event.near}
            />
            <Animated.View entering={enter()} style={styles.meta}>
              <Text variant="labelXs" tone="secondary">
                {[
                  `${overlay.event.pixels} ${overlay.event.pixels === 1 ? 'detection' : 'detections'}`,
                  `${overlay.event.confidence} confidence`,
                  overlay.event.daynight === 'N' ? 'night pass' : 'day pass',
                  formatTimeAgo(overlay.event.t),
                ].join(' · ')}
              </Text>
            </Animated.View>
            {related.length > 0 && (
              <Animated.View entering={enter()} style={styles.block}>
                <Text variant="labelXs" tone="secondary" style={styles.heading}>
                  {related.length === 1 ? 'in the news' : `${related.length} stories`}
                </Text>
                {related.map((a) => (
                  <RelatedRow key={a.slug} article={a} onPress={onArticlePress} />
                ))}
              </Animated.View>
            )}
            <SheetSourceFooter
              entering={enter()}
              source="NASA FIRMS · VIIRS"
              linkLabel="FIRMS map →"
              linkAccessibilityLabel="Open the NASA FIRMS fire map"
              onLinkPress={handleSourcePress}
            />
          </>
        )}

        {overlay?.kind === 'genocide' && (
          <>
            <SheetHero
              entering={enter()}
              eyebrow="as determined by the UN"
              focal={overlay.situation.name}
              tint={colors.markGenocide}
              secondary={
                overlay.situation.since
                  ? `since ${formatIsoDate(overlay.situation.since)}`
                  : undefined
              }
            />
            <Animated.View entering={enter()} style={styles.block}>
              <Text variant="body" selectable>
                {overlay.situation.summary}
              </Text>
            </Animated.View>
            <Animated.View entering={enter()} style={styles.meta}>
              <Text variant="labelXs" tone="secondary">
                {`${overlay.situation.document} · ${formatIsoDate(overlay.situation.date)}`}
              </Text>
            </Animated.View>
            <SheetFlagRow
              entering={enter()}
              flags={flagFor(overlay.situation.profile)}
              borderColor={colors.rule}
              onPress={onCountryPress}
            />
            <SheetSourceFooter
              entering={enter()}
              source={overlay.situation.body}
              linkLabel="Finding →"
              linkAccessibilityLabel="Open the finding"
              onLinkPress={genocideUrl ? handleSourcePress : undefined}
            />
          </>
        )}
      </SheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  block: { marginTop: SPACING.md },
  meta: { marginTop: SPACING.sm },
  heading: { marginBottom: SPACING.xs },
  relatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.smPlus,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  relatedText: { flex: 1, gap: SPACING.xxs },
});
