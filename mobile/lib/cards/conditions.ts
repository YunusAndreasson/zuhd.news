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
 * up — each of those is an event, and on the day it lands the card leads
 * `commodities`. On every other day the column is the instruments, which do move.
 *
 * Every card here therefore carries `lead: true`, which is not a position but
 * a claim: `CardFrame` prints `today ·` before the kicker, and the reader can
 * tell a famine analysis published this quarter from the gold-to-silver ratio
 * without having to already know which of the two the app gates.
 *
 * `commodities` is where they land because there is no general column any more —
 * the axis is cut by reader question now, and famine is food and a hazard is
 * what closes a harvest or a strait. A genocide determination strains that
 * seam and is the one to watch: if it starts reading wrong at the head of a
 * column about what things cost, the answer is a gated column of its own, not
 * a looser gate here.
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
 * How many people are in acute food insecurity right now, and where.
 *
 * `p3plus` is the number that describes a crisis — phase 3 is the threshold at
 * which the classification calls for urgent action — and `p4`/`p5` are tails
 * *inside* it, never additions to it. Getting that wrong double-counts several
 * million people, which is why the shape is documented on the type.
 */
function famineCard(ipc: IpcSnapshot | null, now: Date): ConditionCard | null {
  if (!ipc || ipc.areas.length === 0) return null;

  // Gate on the newest analysis in the file, not on when the file was built.
  // The build runs five times a day; the analyses behind it run quarterly, and
  // it is the analysis that has to be new for this to be news.
  const newest = ipc.areas.reduce(
    (min, a) => Math.min(min, daysSince(a.from, now)),
    Number.POSITIVE_INFINITY,
  );
  if (newest > FRESH_DAYS.famine) return null;

  let p3plus = 0;
  let p4 = 0;
  let p5 = 0;
  // Keyed by ISO-2 rather than the record's ISO-3, because the shared
  // country table is ISO-2 and a card that says "SDN" has failed at the one
  // thing it exists to do.
  const byCountry = new Map<string, number>();
  for (const area of ipc.areas) {
    p3plus += area.pop.p3plus;
    p4 += area.pop.p4;
    p5 += area.pop.p5;
    byCountry.set(area.iso2, (byCountry.get(area.iso2) ?? 0) + area.pop.p3plus);
  }
  if (p3plus <= 0) return null;

  const ranked = [...byCountry.entries()].sort((a, b) => b[1] - a[1]);
  const worst = ranked[0];

  // Phase 5 is rare enough that naming where it is happening is the single
  // most useful sentence on the card.
  const p5Countries = [
    ...new Set(ipc.areas.filter((a) => a.pop.p5 > 0).map((a) => displayNameFromCode(a.iso2))),
  ];

  // The phase-3 total is the reading; repeating it as the first row would be
  // the same fact twice on one screen. The rows are the tails *inside* it,
  // which is the part the reading cannot say.
  const figures: CardFigure[] = [
    { label: 'phase 4 · emergency', value: formatCount(p4), note: 'of them' },
  ];
  if (p5 > 0) {
    figures.push({
      label: 'phase 5 · catastrophe',
      value: formatCount(p5),
      note: p5Countries.length === 1 ? `all in ${p5Countries[0]}` : 'of them',
    });
  }

  const changed =
    worst && ranked.length > 1
      ? `Across ${ipc.areas.length} analysed areas in ${ipc.countries.length} countries. ${displayNameFromCode(worst[0])} alone accounts for ${Math.round((worst[1] / p3plus) * 100)}% of them.`
      : `Across ${ipc.areas.length} analysed areas.`;

  return {
    id: 'famine',
    kind: 'condition',
    lead: true,
    kicker: 'hunger',
    title: 'Acute food insecurity',
    reading: formatCount(p3plus),
    readingNote: 'people, phase 3 or worse',
    whatItIs:
      'The IPC classifies districts, not countries, on a five-step scale of how badly households are eating. Phase 3 is where the scale starts calling for urgent action.',
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
    lead: true,
    kicker: 'conflict',
    title: 'One week of recorded violence',
    reading: formatCount(fatalities),
    readingNote: `people killed in ${conflict.events.length} events`,
    whatItIs:
      'Every event here was reported by at least one source and coded by hand — the date, the place, the actors and the death toll checked one at a time.',
    // The lag sentence has to match the actual lag. This card only ships when
    // upstream has caught up, so "months old" — true when the window was 145
    // days behind — would now be a card contradicting its own date line.
    changed: `${formatDateRange(conflict.windowStart, conflict.windowEnd)}, published ${Math.round(daysSince(conflict.windowEnd, now))} days after it closed. Nothing here is live: every event was coded by hand first.`,
    why: 'Counting the dead is contested work. A number that arrives fast is usually a claim by one side; a number that arrives slowly has been checked against several. The lag is the method, not a fault in it.',
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

const ALERT_GLOSS: Record<string, string> = {
  Green: 'local response expected to be sufficient',
  Orange: 'regional or national response likely needed',
  Red: 'international assistance likely needed',
};

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
      note: ALERT_GLOSS[level],
    }));

  return {
    id: 'disasters',
    kind: 'condition',
    lead: true,
    kicker: 'hazard',
    title: 'What is being watched',
    reading: formatCount(total),
    readingNote: 'active hazard alerts',
    whatItIs:
      'GDACS models the likely humanitarian impact of an earthquake, storm, flood, wildfire, drought or eruption within hours of it happening, and grades the response it would take.',
    changed:
      escalated === 0
        ? `Every one of them is Green — modelled to need no help from outside the country it is in.`
        : `${escalated} of ${total} ${escalated === 1 ? 'is' : 'are'} above Green. The other ${total - escalated} are modelled to need no help from outside the country they are in.`,
    why: 'The grade is a forecast of consequence, not of size. A large earthquake under empty desert stays Green; a moderate one under a dense city does not. What is being predicted is how many people it reaches, which is the only thing a response can be planned against.',
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
