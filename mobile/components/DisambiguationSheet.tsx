import type { Chokepoint, ConflictEvent, GdacsAlert } from '@shared/types';
import { memo, useMemo } from 'react';
import Animated from 'react-native-reanimated';
import { ANIMATION } from '../constants/theme';
import { markMove } from '../lib/cards/format';
import type { SwipeCard } from '../lib/cards/rank';
import type { CardDelta } from '../lib/cards/types';
import { gaugeMove } from '../lib/cards/week-move';
import { chooserTitle } from '../lib/chooser-title';
import { conflictChooserDetails } from '../lib/conflict';
import { observationDate } from '../lib/data-freshness';
import type { FamineArea, GenocideSituation, ThermalEvent } from '../lib/overlays';
import { displayCountryName } from '../lib/place-names';
import { staggerEnter } from '../lib/stagger';
import { straitChange, straitStateFor } from '../lib/strait-map';
import type { TapResult } from '../lib/tap-result';
import {
  conflictMarkRow,
  famineMarkRow,
  gdacsMarkRow,
  genocideMarkRow,
  MarkRow,
  type MarkRowData,
  thermalMarkRow,
} from './MarkRow';
import { SheetScrollView } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

interface DisambiguationSheetProps extends BaseSheetProps {
  /** The overlapping candidates surfaced by MiniGlobe.hitTest. Length ≥ 2
   *  whenever the sheet is opened — single hits resolve directly, never
   *  through this chooser. */
  candidates: TapResult[];
  /** Resolution context: same data the parent already holds for opening
   *  individual sheets. Used here to derive readable labels per row. */
  chokepoints: Chokepoint[];
  /** Each strait's seven-day move, as the globe labels it (`straitMoves`), so
   *  a strait's row reads the number its mark under the finger does. */
  straitMoves: Readonly<Record<string, CardDelta>>;
  alerts: GdacsAlert[];
  conflictEvents: ConflictEvent[];
  /** The ranked instruments, so a flagged exchange's row can name its index
   *  and its exchange rather than its id. */
  instruments: SwipeCard[];
  famineAreas: FamineArea[];
  thermalEvents: ThermalEvent[];
  genocideSituations: GenocideSituation[];
  /** Fires when a row is tapped. Parent should dismiss this sheet and
   *  re-dispatch the candidate through its existing tap handler. */
  onSelect: (result: TapResult) => void;
}

function buildRow(
  result: TapResult,
  index: number,
  chokepointsById: Map<string, Chokepoint>,
  straitMoves: Readonly<Record<string, CardDelta>>,
  alertsById: Map<string, GdacsAlert>,
  conflictById: Map<string, ConflictEvent>,
  marketsById: Map<string, SwipeCard>,
  overlays: {
    famine: Map<string, FamineArea>;
    thermal: Map<string, ThermalEvent>;
    genocide: Map<string, GenocideSituation>;
  },
): MarkRowData | null {
  if (result.genocideId) {
    const g = overlays.genocide.get(result.genocideId);
    return g ? genocideMarkRow(g, result) : null;
  }
  if (result.famineAreaId) {
    const a = overlays.famine.get(result.famineAreaId);
    return a ? famineMarkRow(a, result) : null;
  }
  if (result.thermalEventId) {
    const e = overlays.thermal.get(result.thermalEventId);
    return e ? thermalMarkRow(e, result) : null;
  }
  if (result.gdacsEventId) {
    const alert = alertsById.get(result.gdacsEventId);
    return alert ? gdacsMarkRow(alert, result) : null;
  }
  if (result.conflictEventId) {
    const evt = conflictById.get(result.conflictEventId);
    return evt ? conflictMarkRow(evt, result) : null;
  }
  if (result.chokepointId) {
    const cp = chokepointsById.get(result.chokepointId);
    if (!cp) return null;
    return {
      key: `chokepoint-${cp.id}`,
      result,
      primary: cp.name,
      // The day as every card prints it (`Sep 27`): the rows printed the
      // payload's own `2026-09-27`.
      secondary: `all ships · ${straitChange(straitMoves[cp.id], cp.delta7vs90.n_total)?.label ?? 'comparison unavailable'} · ${observationDate(cp.asOf) || cp.asOf}`,
      kind: 'chokepoint',
      straitState: straitStateFor(cp.delta7vs90.n_total ?? 0),
    };
  }
  if (result.marketSignalId) {
    const card = marketsById.get(result.marketSignalId);
    if (!card) return null;
    // The week, as the mark under the finger and the strip print it, in the
    // mark's own grammar (`markMove`); where there is no week, the card's
    // move — with its window either way, so a session is never read as a week.
    const delta = gaugeMove(card)?.delta ?? card.delta;
    return {
      key: `market-${card.id}`,
      result,
      primary: card.title,
      secondary: [
        card.kicker,
        delta ? [markMove(delta), delta.window].filter(Boolean).join(' ') : null,
        observationDate(card.asOf) || card.asOf,
      ]
        .filter(Boolean)
        .join(' · '),
      kind: 'market',
      direction: delta?.direction,
    };
  }
  if (result.isHotspot) {
    const country = displayCountryName(result.countryName) ?? result.countryName;
    const stories = result.hotspotLabels ?? [];
    return {
      key: `hotspot-${result.countryName}-${index}`,
      result,
      primary: stories[0] ?? country ?? 'Hotspot',
      secondary: country ? `hotspot · ${country}` : 'hotspot',
      kind: 'hotspot',
    };
  }
  if (result.countryName) {
    const country = displayCountryName(result.countryName) ?? result.countryName;
    return {
      key: `article-${result.countryName}-${index}`,
      result,
      primary: result.location ?? country,
      secondary: result.location ? country : 'current story',
      kind: 'article',
    };
  }
  return null;
}

function CandidateRow({
  row,
  index,
  onPress,
}: {
  row: MarkRowData;
  index: number;
  onPress: (result: TapResult) => void;
}) {
  return (
    <Animated.View entering={staggerEnter(index, ANIMATION.fast)}>
      <MarkRow row={row} onPress={onPress} />
    </Animated.View>
  );
}

export const DisambiguationSheet = memo(function DisambiguationSheet({
  sheetRef,
  candidates,
  chokepoints,
  straitMoves,
  alerts,
  conflictEvents,
  instruments,
  famineAreas,
  thermalEvents,
  genocideSituations,
  bottomInset,
  onDismiss,
  onSelect,
}: DisambiguationSheetProps) {
  const rows = useMemo<MarkRowData[]>(() => {
    const cpById = new Map(chokepoints.map((c) => [c.id, c]));
    const alertById = new Map(alerts.map((a) => [a.eventid, a]));
    const conflictById = new Map(conflictEvents.map((e) => [e.id, e]));
    const marketById = new Map(instruments.map((c) => [c.id, c]));
    const overlays = {
      famine: new Map(famineAreas.map((a) => [a.id, a])),
      thermal: new Map(thermalEvents.map((e) => [e.id, e])),
      genocide: new Map(genocideSituations.map((g) => [g.id, g])),
    };
    const out: MarkRowData[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const row = buildRow(
        candidates[i] as TapResult,
        i,
        cpById,
        straitMoves,
        alertById,
        conflictById,
        marketById,
        overlays,
      );
      if (row) out.push(row);
    }
    const conflictDetails = conflictChooserDetails(
      out.flatMap((row) => {
        const event = row.result.conflictEventId
          ? conflictById.get(row.result.conflictEventId)
          : null;
        return event ? [event] : [];
      }),
    );
    for (const row of out) {
      if (row.result.conflictEventId)
        row.secondary = conflictDetails.get(row.result.conflictEventId) ?? row.secondary;
    }
    return out;
  }, [
    candidates,
    chokepoints,
    straitMoves,
    alerts,
    conflictEvents,
    instruments,
    famineAreas,
    thermalEvents,
    genocideSituations,
  ]);

  return (
    <SheetLayout
      sheetRef={sheetRef}
      onDismiss={onDismiss}
      handleTitle={chooserTitle(rows.map((row) => row.kind))}
    >
      <SheetScrollView bottomInset={bottomInset}>
        {rows.map((row, i) => (
          <CandidateRow key={row.key} row={row} index={i} onPress={onSelect} />
        ))}
      </SheetScrollView>
    </SheetLayout>
  );
});
