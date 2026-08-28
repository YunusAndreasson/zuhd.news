import { displayNameFromCode } from '@shared/countries/iso';
import type { ConflictSnapshot, Determination, GdacsAlert, IpcSnapshot } from '@shared/types';
import { formatCount } from './format';
import type { Card, CardFigure, ConditionCard } from './types';

/**
 * Standing conditions — and the gate that keeps them out of a news app.
 *
 * These four started as their own section, and the section was wrong. This is
 * a news app: a screen earns its place by being worth opening *today*, and an
 * audit of what these payloads actually do settled it —
 *
 *   determinations   Gaza's finding is 341 days old, Rakhine's is 2,902.
 *                    Years, not days.
 *   conflict         the window ends 145 days ago; UCDP codes by hand and
 *                    publishes monthly.
 *   famine           the median analysed area is 7.3 months old; 56 of 101
 *                    areas date from one January analysis.
 *   hazards          not one of 100 alerts had started in the last week.
 *
 * A card showing the same figure every morning is furniture, and the reader
 * stops seeing it — which is worse than not shipping it, because it also
 * teaches them that this part of the app never has anything.
 *
 * So each card is gated on *its own data being new*. Nothing here appears
 * because it is important; it appears because it changed. A fresh IPC
 * analysis, a newly published determination, a conflict window that has caught
 * up — each of those is an event and belongs in `humanitarian`, not inside a
 * market category it does not describe.
 *
 * Event-dated cards carry `lead: true`, which makes `CardFrame` print
 * `current ·`. IPC does not publish a reliable release timestamp, only the
 * period an analysis covers, so its card deliberately makes no freshness
 * claim in the kicker.
 *
 * The thresholds below are per-source because the cadences are: a monthly
 * dataset that is three weeks old is current, and a determination that is
 * three weeks old is front-page.
 */

const DAY_MS = 86_400_000;

/** Days since an ISO date, against an injected clock. Returns Infinity for
 *  anything unparseable, so a malformed date fails the gate rather than
 *  passing it. */
function daysSince(iso: string | undefined, now: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - t) / DAY_MS;
}

/**
 * How new each source has to be to earn a screen.
 *
 * Read these as "how long is this still news", not "how long is this still
 * true". Gaza's determination is true indefinitely and news for a season.
 */
const FRESH_DAYS = {
  /** A named body publishing a genocide finding is news for a season. */
  determination: 120,
  /** UCDP publishes monthly and lags; 45 days means it has caught up. */
  conflict: 45,
  /** IPC analyses run on a quarterly-ish cycle per country. */
  famine: 75,
  /** A hazard alert above Green is news while it is being revised. */
  hazard: 10,
} as const;

// ---------------------------------------------------------------------------
// Famine
// ---------------------------------------------------------------------------

/** IPC phase names, in the source's own words. Rendered as a scale so the
 *  reader learns what "phase 4" means rather than being told a number they
 *  cannot place. */
const PHASE_SCALE: { phase: number; name: string; gloss: string }[] = [
  { phase: 1, name: 'Minimal', gloss: 'households can meet essential food needs' },
  { phase: 2, name: 'Stressed', gloss: 'food is adequate only by cutting other essentials' },
  { phase: 3, name: 'Crisis', gloss: 'food gaps, or coping by selling what they live on' },
  { phase: 4, name: 'Emergency', gloss: 'large food gaps, acute malnutrition, excess deaths' },
  { phase: 5, name: 'Catastrophe', gloss: 'starvation, destitution, death' },
];

/**
 * How many people are in Emergency or Catastrophe in the published areas.
 *
 * `/api/ipc.json` deliberately contains only areas whose overall
 * classification is phase 4 or 5. Its `p3plus` field is therefore not a full
 * phase-3 total for the named countries: phase-3 areas were removed upstream.
 * The card must headline the phase-4 and phase-5 populations the payload can
 * account for, rather than presenting a partial crisis total as complete.
 */
function famineCard(ipc: IpcSnapshot | null, now: Date): ConditionCard | null {
  if (!ipc || ipc.areas.length === 0) return null;

  // Gate on the end of the newest covered period, not its beginning and not
  // the time the JSON mirror was rebuilt. A quarterly analysis is still in
  // force near the end of its period; measuring age from `from` made it expire
  // precisely when it was most current.
  const newest = ipc.areas.reduce(
    (min, a) => Math.min(min, daysSince(a.to, now)),
    Number.POSITIVE_INFINITY,
  );
  if (newest > FRESH_DAYS.famine) return null;

  let p4 = 0;
  let p5 = 0;
  // Keyed by ISO-2 rather than the record's ISO-3, because the shared
  // country table is ISO-2 and a card that says "SDN" has failed at the one
  // thing it exists to do.
  const byCountry = new Map<string, number>();
  for (const area of ipc.areas) {
    p4 += area.pop.p4;
    p5 += area.pop.p5;
    byCountry.set(area.iso2, (byCountry.get(area.iso2) ?? 0) + area.pop.p4 + area.pop.p5);
  }
  const severe = p4 + p5;
  if (severe <= 0) return null;

  const ranked = [...byCountry.entries()].sort((a, b) => b[1] - a[1]);
  const worst = ranked[0];

  // Phase 5 is rare enough that naming where it is happening is the single
  // most useful sentence on the card.
  const p5Countries = [
    ...new Set(ipc.areas.filter((a) => a.pop.p5 > 0).map((a) => displayNameFromCode(a.iso2))),
  ];

  const figures: CardFigure[] = [
    { label: 'phase 4 · emergency', value: formatCount(p4), weight: p4 },
  ];
  if (p5 > 0) {
    figures.push({
      label: 'phase 5 · catastrophe',
      value: formatCount(p5),
      note: p5Countries.length === 1 ? `all in ${p5Countries[0]}` : undefined,
      weight: p5,
    });
  }

  const latestEnd = ipc.areas
    .map((area) => area.to)
    .sort()
    .at(-1);
  const period = latestEnd ? ` Latest covered period ended ${formatIsoDate(latestEnd)}.` : '';
  const changed =
    worst && ranked.length > 1
      ? `Across ${ipc.areas.length} areas classified Emergency or worse in ${ipc.countries.length} countries.${period} ${displayNameFromCode(worst[0])} accounts for ${Math.round((worst[1] / severe) * 100)}% of the people shown.`
      : `Across ${ipc.areas.length} areas classified Emergency or worse.${period}`;

  return {
    id: 'famine',
    kind: 'condition',
    visualStyle: 'distribution',
    kicker: 'latest analysis',
    title: 'Emergency food insecurity',
    reading: formatCount(severe),
    readingNote: 'people in phase 4 or 5',
    whatItIs:
      'The IPC classifies districts, not countries, on a five-step scale of how badly households are eating. This view includes only areas classified Emergency or Catastrophe.',
    changed,
    why: PHASE_SCALE.map((p) => `${p.phase} · ${p.name} — ${p.gloss}`).join('\n'),
    figures,
    sourceLabel: ipc.source,
  };
}

// ---------------------------------------------------------------------------
// The conflict window
// ---------------------------------------------------------------------------

/** Countries named on the card. Beyond five the list stops being read. */
const CONFLICT_COUNTRY_LIMIT = 5;

/**
 * One week of recorded armed violence.
 *
 * The window is months behind the news, and the card says so rather than
 * hiding it: academic conflict datasets are coded by hand from source
 * reporting, and the lag is the price of every event having been checked. That
 * is worth a sentence — a reader who thinks this is live data will misread
 * every number on the screen.
 */
function conflictCard(conflict: ConflictSnapshot | null, now: Date): ConditionCard | null {
  if (!conflict || conflict.events.length === 0) return null;
  if (daysSince(conflict.windowEnd, now) > FRESH_DAYS.conflict) return null;

  let fatalities = 0;
  const byCountry = new Map<string, number>();
  for (const e of conflict.events) {
    fatalities += e.fatalities ?? 0;
    byCountry.set(e.country, (byCountry.get(e.country) ?? 0) + 1);
  }
  const ranked = [...byCountry.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, CONFLICT_COUNTRY_LIMIT);

  return {
    id: 'conflict',
    kind: 'condition',
    visualStyle: 'distribution',
    lead: true,
    kicker: 'conflict',
    title: 'One week of recorded violence',
    reading: formatCount(fatalities),
    readingNote: `people killed in ${conflict.events.length} events`,
    whatItIs:
      'This is not a live count. UCDP researchers code each event from published reports, including its date, location, actors and reported deaths.',
    // The lag sentence has to match the actual lag. This card only ships when
    // upstream has caught up, so "months old" — true when the window was 145
    // days behind — would now be a card contradicting its own date line.
    changed: `${formatDateRange(conflict.windowStart, conflict.windowEnd)}, published ${Math.round(daysSince(conflict.windowEnd, now))} days after it closed.`,
    why: 'Fatality estimates can change as UCDP reviews additional reporting.',
    rows: ranked.map(([country, count]) => ({
      label: country,
      value: `${count} ${count === 1 ? 'event' : 'events'}`,
      weight: count,
    })),
    rowsLabel: 'most events',
    sourceLabel: 'UCDP Candidate Events (CC BY 4.0)',
  };
}

// ---------------------------------------------------------------------------
// Disaster alerts
// ---------------------------------------------------------------------------

/**
 * What a global disaster monitor is currently tracking.
 *
 * The card exists because of the ratio, not the total: almost everything the
 * system watches is Green. A reader who only meets this data through headlines
 * sees the Red events and concludes the world is on fire; the honest picture is
 * that a hundred things are being watched and nearly all of them are being
 * handled locally.
 */
function disasterCard(alerts: GdacsAlert[], now: Date): ConditionCard | null {
  if (alerts.length === 0) return null;

  // "99 of 100 are Green" is a true and genuinely surprising sentence — once.
  // Repeated every morning with the digits nudged it is wallpaper. The card
  // ships only when something is actually escalated and actively being
  // revised, which is when the ratio is worth reading again.
  const live = alerts.some(
    (a) => a.alertlevel !== 'Green' && daysSince(a.modifiedDate, now) <= FRESH_DAYS.hazard,
  );
  if (!live) return null;

  const counts = { Green: 0, Orange: 0, Red: 0 };
  const byType = new Map<string, number>();
  for (const a of alerts) {
    counts[a.alertlevel] += 1;
    byType.set(a.eventtype, (byType.get(a.eventtype) ?? 0) + 1);
  }
  const total = alerts.length;
  const escalated = counts.Orange + counts.Red;

  const figures: CardFigure[] = (['Red', 'Orange', 'Green'] as const)
    .filter((level) => counts[level] > 0)
    .map((level) => ({
      label: level.toLowerCase(),
      value: formatCount(counts[level]),
      weight: counts[level],
    }));

  return {
    id: 'disasters',
    kind: 'condition',
    visualStyle: 'distribution',
    lead: true,
    kicker: 'hazard',
    title: 'GDACS disaster alerts',
    reading: formatCount(total),
    readingNote: 'active worldwide',
    whatItIs:
      'GDACS estimates the humanitarian impact of earthquakes, storms, floods, wildfires, droughts and eruptions.',
    changed:
      escalated === 0
        ? `All ${total} alerts are Green.`
        : `${escalated} of ${total} ${escalated === 1 ? 'is' : 'are'} above Green; ${total - escalated} ${total - escalated === 1 ? 'is' : 'are'} Green.`,
    why: 'Green means local response capacity is expected to be sufficient. Orange signals a likely need for regional or national response; Red signals likely international assistance. Alert levels use exposure as well as the event’s physical size.',
    figures,
    sourceLabel: 'GDACS · European Commission JRC',
  };
}

// ---------------------------------------------------------------------------
// Determinations
// ---------------------------------------------------------------------------

/**
 * Situations where a named body has published a named document reaching a
 * genocide determination.
 *
 * The app is not making this finding. It is reporting one, and the citation is
 * the entire claim — which is why the body, the document and its date are all
 * on the card, and why the hook behind it refuses to render from disk. Nothing
 * appears here without a document behind it.
 */
function determinationCard(determinations: Determination[], now: Date): ConditionCard | null {
  if (determinations.length === 0) return null;
  const sorted = [...determinations].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0];
  if (!latest) return null;
  // The finding stands whether or not this card renders. What expires is its
  // claim on a screen in a news app — and Rakhine's finding is eight years
  // old. When a new one is published this card leads the column; until then
  // it is reference material, and the app is not a reference book.
  if (daysSince(latest.date, now) > FRESH_DAYS.determination) return null;

  return {
    id: 'determinations',
    kind: 'condition',
    visualStyle: 'timeline',
    lead: true,
    kicker: 'determination',
    title: sorted.length === 1 ? latest.name : 'Findings of genocide',
    reading: String(sorted.length),
    readingNote: sorted.length === 1 ? 'standing determination' : 'standing determinations',
    whatItIs:
      'A determination is a formal finding by an investigative body that the acts and the intent defined in the Genocide Convention are both present. It is a legal threshold, not a description of scale.',
    // Who found it. The figures below carry the date and the document symbol,
    // so repeating either here would print the same citation twice on one
    // screen — and the body is the half a reader is least likely to know.
    changed: sorted.map((d) => `${d.name}: ${d.body}.`).join('\n'),
    why: latest.summary,
    emphasis: 'determination',
    attribution: { body: latest.body, document: latest.document, date: latest.date },
    figures: sorted.map((d) => ({
      label: d.name,
      value: formatIsoDate(d.date),
      note: d.document,
      weight: Date.parse(d.date),
    })),
    link: latest.url,
    sourceLabel: latest.body,
  };
}

// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "16 September 2025" from an ISO date, without going through `Date` — the
 *  string is a calendar day with no timezone, and parsing it invents one. */
function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  const name = MONTH_NAMES[Number(month) - 1];
  if (!name || !day || !year) return iso;
  return `${Number(day)} ${name} ${year}`;
}

/** "25–31 March 2026", collapsing the month and year when both ends share it. */
function formatDateRange(startIso: string, endIso: string): string {
  const [sy, sm, sd] = startIso.split('-');
  const [ey, em, ed] = endIso.split('-');
  const endName = MONTH_NAMES[Number(em) - 1];
  if (!endName || !sd || !ed) return `${startIso} to ${endIso}`;
  if (sy === ey && sm === em) return `${Number(sd)}–${Number(ed)} ${endName} ${ey}`;
  const startName = MONTH_NAMES[Number(sm) - 1] ?? sm;
  if (sy === ey) return `${Number(sd)} ${startName} – ${Number(ed)} ${endName} ${ey}`;
  return `${Number(sd)} ${startName} ${sy} – ${Number(ed)} ${endName} ${ey}`;
}

export interface ConditionCardInputs {
  ipc: IpcSnapshot | null;
  conflict: ConflictSnapshot | null;
  gdacsAlerts: GdacsAlert[];
  determinations: Determination[];
  /** Injected so the freshness gates are testable without freezing the clock. */
  now?: Date;
}

/**
 * Whichever standing conditions changed recently enough to be news, worst
 * first. Usually none, and an empty array is the expected result rather than a
 * failure — these are events, and most days no event has happened.
 *
 * A card also returns null when its data is simply missing, so the
 * determination layer does not appear on a launch where the network never
 * answered, which is the arrangement `useDeterminations` exists to enforce.
 */
export function buildConditionCards({
  ipc,
  conflict,
  gdacsAlerts,
  determinations,
  now = new Date(),
}: ConditionCardInputs): Card[] {
  const cards: (Card | null)[] = [
    determinationCard(determinations, now),
    famineCard(ipc, now),
    conflictCard(conflict, now),
    disasterCard(gdacsAlerts, now),
  ];
  return cards.filter((c): c is Card => c !== null);
}
