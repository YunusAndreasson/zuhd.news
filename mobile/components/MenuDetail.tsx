import { COUNTRY_DATA } from '@shared/countries/country-data';
import { METRICS, type MetricKey } from '@shared/countries/country-ranking';
import type { Category, ConflictEvent, GdacsAlert, GdacsDetail } from '@shared/types';
import { memo, type ReactNode, useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import type { SwipeCard } from '../lib/cards/rank';
import { alertsInCountry, marksInCountry } from '../lib/country-hazards';
import type { RiverArticle } from '../lib/news-order';
import type { OverlaySelection } from '../lib/overlays';
import { displayCountryName } from '../lib/place-names';
import { ConflictBody, conflictTitle } from './ConflictSheet';
import { CountryRankingView } from './CountryRankingView';
import { CountryBody, type CountryHazard, CountryTitle } from './CountrySheet';
import { CardView } from './cards/CardView';
import { DisasterBody, disasterTitle } from './DisasterSheet';
import type { TapResult } from './globe/MiniGlobe';
import type { MenuHazards } from './MenuSheet';
import { OverlayBody, overlayTitle } from './OverlaySheet';
import { SheetScrollView } from './SheetContent';

/**
 * Whatever a row in the menu opens, as a page of the menu.
 *
 * Until 2026-09-26 a row handed off to another sheet: the menu closed, the
 * card or the disaster opened in its own sheet, and closing that dropped the
 * reader on the map, a list and three taps from where they had been (the
 * user's report: "i loose context"). Now it is a page pushed on the menu's
 * stack, and back is the list it came from. The content is each sheet's own
 * body (`CardView`, `DisasterBody`, …), so a disaster reads the same from a
 * list as from its mark; only the sheet around it differs.
 *
 * Links inside a page stay inside the menu — a country chip on a disaster is
 * the country's page, a ranking row a country — except a story, which is
 * what the menu is closed for.
 */
export type MenuDetail =
  | { kind: 'card'; card: SwipeCard }
  | { kind: 'alert'; alert: GdacsAlert }
  | { kind: 'conflict'; event: ConflictEvent }
  | { kind: 'overlay'; overlay: OverlaySelection }
  | { kind: 'country'; name: string }
  /** A metric's ranking; `country` is marked in it when one led here. */
  | { kind: 'ranking'; metric: MetricKey; country: string | null };

/** What the page is called when a screen reader announces it. A card's handle
 *  carries no title — the card prints its kicker under it, as in its sheet —
 *  so it is announced by its own. */
export function menuDetailLabel(detail: MenuDetail): string {
  switch (detail.kind) {
    case 'card':
      return detail.card.title;
    case 'alert':
      return disasterTitle(detail.alert);
    case 'conflict':
      return conflictTitle(detail.event);
    case 'overlay':
      return overlayTitle(detail.overlay);
    case 'country':
      return displayCountryName(detail.name) ?? detail.name;
    case 'ranking':
      return METRICS[detail.metric]?.label ?? 'ranking';
  }
}

const countryTap = (name: string): TapResult => ({
  countryName: name,
  location: null,
  localTime: null,
  data: COUNTRY_DATA[name] ?? null,
});

/** The handle's title for a page: a country's flag and name, as its sheet
 *  sets them; nothing for a card, which prints its kicker under the handle;
 *  the sheet's own title for the rest, as a string the handle sets in its
 *  type. */
export function menuDetailHandleTitle(detail: MenuDetail): ReactNode {
  if (detail.kind === 'country') return <CountryTitle country={countryTap(detail.name)} hasBack />;
  if (detail.kind === 'card') return undefined;
  return menuDetailLabel(detail);
}

export const MenuDetailPage = memo(function MenuDetailPage({
  detail,
  bottomInset,
  hazards,
  gdacsDetails,
  articles,
  onOpen,
  onStoryPress,
  onArticlePress,
  onRequestClose,
}: {
  detail: MenuDetail;
  bottomInset: number;
  hazards: MenuHazards;
  gdacsDetails: Record<string, GdacsDetail>;
  /** The river, for the stories a thermal anomaly was joined to. */
  articles: RiverArticle[];
  /** Push another page — a country from a disaster, a ranking from a country. */
  onOpen: (detail: MenuDetail) => void;
  /** A story a card cites: the menu closes and the story opens. */
  onStoryPress: (slug: string) => void;
  onArticlePress: (slug: string, category: Category) => void;
  onRequestClose: () => void;
}) {
  const openCountry = useCallback((name: string) => onOpen({ kind: 'country', name }), [onOpen]);

  switch (detail.kind) {
    case 'card':
      return (
        <SheetScrollView bottomInset={bottomInset} contentContainerStyle={styles.flush}>
          <CardView key={detail.card.id} card={detail.card} onStoryPress={onStoryPress} />
        </SheetScrollView>
      );
    case 'alert':
      return (
        <SheetScrollView bottomInset={bottomInset}>
          <DisasterBody alert={detail.alert} details={gdacsDetails} onCountryPress={openCountry} />
        </SheetScrollView>
      );
    case 'conflict':
      return (
        <SheetScrollView bottomInset={bottomInset}>
          <ConflictBody event={detail.event} onCountryPress={openCountry} />
        </SheetScrollView>
      );
    case 'overlay':
      return (
        <SheetScrollView bottomInset={bottomInset}>
          <OverlayBody
            overlay={detail.overlay}
            articles={articles}
            onArticlePress={onArticlePress}
            onCountryPress={openCountry}
          />
        </SheetScrollView>
      );
    case 'country':
      return (
        <CountryPage
          name={detail.name}
          bottomInset={bottomInset}
          hazards={hazards}
          onOpen={onOpen}
        />
      );
    case 'ranking':
      return (
        <CountryRankingView
          metric={detail.metric}
          // The metric's name is the page's, in the handle.
          titled={false}
          currentCountryName={detail.country}
          bottomInset={bottomInset}
          onRequestClose={onRequestClose}
          onSelectCountry={openCountry}
        />
      );
  }
});

/** A country as a page: its sheet's body, with every link a page too. */
function CountryPage({
  name,
  bottomInset,
  hazards,
  onOpen,
}: {
  name: string;
  bottomInset: number;
  hazards: MenuHazards;
  onOpen: (detail: MenuDetail) => void;
}) {
  const country = useMemo(() => countryTap(name), [name]);
  const alerts = useMemo(() => alertsInCountry(name, hazards.disasters), [name, hazards.disasters]);
  const marks = useMemo<CountryHazard[]>(
    () =>
      marksInCountry(name, hazards.genocide, hazards.famine).map(({ selection, ...mark }) => ({
        ...mark,
        onPress: () => onOpen({ kind: 'overlay', overlay: selection }),
      })),
    [name, hazards.genocide, hazards.famine, onOpen],
  );
  const openAlert = useCallback((alert: GdacsAlert) => onOpen({ kind: 'alert', alert }), [onOpen]);
  const openRanking = useCallback(
    (metric: MetricKey) => onOpen({ kind: 'ranking', metric, country: name }),
    [name, onOpen],
  );
  return (
    <SheetScrollView bottomInset={bottomInset}>
      <CountryBody
        country={country}
        activeAlerts={alerts}
        onAlertPress={openAlert}
        hazards={marks}
        onRankingPress={openRanking}
      />
    </SheetScrollView>
  );
}

const styles = StyleSheet.create({
  // `CardFrame` pads its own column, on the same vertical as the story card.
  flush: { paddingHorizontal: 0, paddingTop: 0 },
});
