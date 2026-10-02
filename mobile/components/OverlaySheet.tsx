import { topojsonNameFromCode } from '@shared/countries/iso';
import type { Category } from '@shared/types';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { articleTime, formatTimeAgo } from '../lib/article-utils';
import { formatCount, formatNumber } from '../lib/cards/format';
import { MONTH_ABBR } from '../lib/date-format';
import type { RiverArticle } from '../lib/news-order';
import { useOpenLink } from '../lib/open-link';
import { type OverlaySelection, thermalPlace } from '../lib/overlays';
import { makeStaggerEnter } from '../lib/stagger';
import { ArticleRow } from './ArticleRow';
import { Text } from './primitives';
import {
  countryFlags,
  SheetFlagRow,
  SheetHero,
  SheetScrollView,
  SheetSourceFooter,
} from './SheetContent';
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

export type { OverlaySelection };

interface OverlayBodyProps {
  overlay: OverlaySelection | null;
  /** The river, so a thermal anomaly can name the stories it was joined to. */
  articles: RiverArticle[];
  onArticlePress: (slug: string, category: Category) => void;
  onCountryPress?: (countryName: string) => void;
}

const IPC_URL = 'https://www.ipcinfo.org/ipc-country-analysis/en/';
const FIRMS_URL = 'https://firms.modaps.eosdis.nasa.gov/map/';

/** `2025-09-16` → `16 Sep 2025`; `2023-10` → `Oct 2023`. Anything else as given. */
function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const month = MONTH_ABBR[Number(m[2]) - 1];
  if (!month) return iso;
  return m[3] ? `${Number(m[3])} ${month} ${m[1]}` : `${month} ${m[1]}`;
}

/** The handle's title: what the layer is. */
export function overlayTitle(overlay: OverlaySelection | null): string {
  return overlay?.kind === 'famine'
    ? 'food insecurity'
    : overlay?.kind === 'thermal'
      ? 'thermal anomaly'
      : overlay?.kind === 'genocide'
        ? 'genocide'
        : '';
}

type OverlaySheetProps = BaseSheetProps & OverlayBodyProps;

export const OverlaySheet = memo(function OverlaySheet({
  sheetRef,
  bottomInset,
  onDismiss,
  ...body
}: OverlaySheetProps) {
  return (
    <SheetLayout sheetRef={sheetRef} onDismiss={onDismiss} handleTitle={overlayTitle(body.overlay)}>
      <SheetScrollView bottomInset={bottomInset}>
        <OverlayBody {...body} />
      </SheetScrollView>
    </SheetLayout>
  );
});

/** The sheet's content without the sheet: the menu shows it as a page of its
 *  own, so a reader who came from a list can go back to it. */
export const OverlayBody = memo(function OverlayBody({
  overlay,
  articles,
  onArticlePress,
  onCountryPress,
}: OverlayBodyProps) {
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

  // The country an area or a finding is in, for its flag row: a famine area by
  // its ISO code, a genocide situation by its profile.
  const flags = countryFlags([
    overlay?.kind === 'famine' && overlay.area.iso2
      ? topojsonNameFromCode(overlay.area.iso2)
      : overlay?.kind === 'genocide'
        ? overlay.situation.profile
        : undefined,
  ]);

  const enter = makeStaggerEnter();

  return (
    <>
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
                {`${formatNumber(overlay.area.pop.p3plus)} people in crisis or worse${
                  overlay.area.pop.total
                    ? `, of ${formatNumber(overlay.area.pop.total)} analysed`
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
          {flags.length > 0 && (
            <SheetFlagRow entering={enter()} flags={flags} onPress={onCountryPress} />
          )}
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
            focal={`${formatCount(overlay.event.frp)} MW`}
            tint={colors.markThermal}
            secondary={thermalPlace(overlay.event)}
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
              <Text
                variant="labelSm"
                tone="secondary"
                accessibilityRole="header"
                style={styles.heading}
              >
                {related.length === 1 ? 'in the news' : `${related.length} stories`}
              </Text>
              {/* The river's own row: a story looks the same in every list. */}
              {related.map((a) => (
                <ArticleRow
                  key={a.slug}
                  slug={a.slug}
                  title={a.title}
                  time={articleTime(a)}
                  category={a.category}
                  location={a.location}
                  onPress={onArticlePress}
                />
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
          {flags.length > 0 && (
            <SheetFlagRow entering={enter()} flags={flags} onPress={onCountryPress} />
          )}
          <SheetSourceFooter
            entering={enter()}
            source={overlay.situation.body}
            linkLabel="finding →"
            linkAccessibilityLabel="Open the finding"
            onLinkPress={genocideUrl ? handleSourcePress : undefined}
          />
        </>
      )}
    </>
  );
});

const styles = StyleSheet.create({
  block: { marginTop: SPACING.md },
  meta: { marginTop: SPACING.sm },
  heading: { marginBottom: SPACING.xs },
});
