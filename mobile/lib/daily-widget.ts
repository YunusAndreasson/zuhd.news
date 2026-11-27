import type { FeedResponse, WidgetCandidate } from '@shared/types';
import { formatAudioDurationMinutes } from './audio-duration';
import { formatNumber } from './cards/format';
import type { GraphCard } from './cards/types';

const DAY = 86400000;
const labels = {
  'mkt:tadawul': 'Saudi stock index',
  'mkt:bse': 'Indian stock index',
  'mkt:jse': 'South African stock index',
} as const;
type Close = NonNullable<WidgetCandidate['close']>;
type Audio = Extract<WidgetCandidate['audio'], { status: 'available' }>;
export interface Edition {
  edition: string;
  revision: string;
  close?: Close;
  audio?: Audio;
  pending: boolean;
}
const digest = (s: unknown): s is string => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
function day(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    /^\d{4}-\d\d-\d\d$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().startsWith(s)
  );
}
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

// Rebuild from an allowlist. No strings from the news desk reach a Home or Lock Screen.
export function widgetEdition(
  input: WidgetCandidate | undefined,
  verified: number,
): Edition | undefined {
  if (
    !Number.isFinite(verified) ||
    !input ||
    input.version !== 1 ||
    !day(input.edition) ||
    Date.parse(input.edition) > verified ||
    !digest(input.sourceRevision)
  )
    return;
  const result: Edition = {
    edition: input.edition,
    revision: input.sourceRevision,
    pending: false,
  };
  const c = input.close;
  if (
    c &&
    Object.hasOwn(labels, c.id) &&
    c.completed === true &&
    c.unit === 'index points' &&
    c.sessionDate === input.edition &&
    positive(c.value) &&
    digest(c.sourceRevision)
  ) {
    const close: Close = {
      id: c.id,
      label: labels[c.id],
      value: c.value,
      unit: 'index points',
      completed: true,
      sessionDate: c.sessionDate,
      sourceRevision: c.sourceRevision,
    };
    const obs = c.observations;
    if (
      Array.isArray(obs) &&
      obs.length >= 2 &&
      obs.length <= 11 &&
      obs.every(
        (p, i) => p && day(p.date) && positive(p.value) && (!i || p.date > obs[i - 1]!.date),
      ) &&
      obs.at(-1)?.date === c.sessionDate &&
      obs.at(-1)?.value === c.value
    ) {
      const span = (Date.parse(c.sessionDate) - Date.parse(obs[0]!.date)) / DAY;
      if (span >= 7 && span <= 10)
        close.observations = obs.map(({ date, value }) => ({ date, value }));
    }
    result.close = close;
  }
  const a = input.audio;
  if (
    a?.status === 'available' &&
    a.date === input.edition &&
    typeof a.generated === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(a.generated) &&
    a.generated.startsWith(a.date) &&
    Date.parse(a.generated) <= verified
  ) {
    result.audio = {
      status: 'available',
      date: a.date,
      generated: a.generated,
      ...(positive(a.durationSeconds) && { durationSeconds: a.durationSeconds }),
    };
  }
  // Today's publisher supports unavailable/available. Only an explicit generating
  // status from a compatible publisher can claim that a recording is pending.
  result.pending =
    (a as { status?: string } | undefined)?.status === 'generating' && !!result.close;
  return result.close || result.audio || result.pending ? result : undefined;
}

/** One formatter per shape of date, kept for the session: `toLocaleDateString`
 *  builds one on every call, and a redraw asks three times a face for up to
 *  six faces, each time the app comes to the front. */
const widgetDateFormats = new Map<string, Intl.DateTimeFormat>();
export function widgetDate(date: string, year = true, spoken = false) {
  const shape = `${year}${spoken}`;
  let format = widgetDateFormats.get(shape);
  if (!format) {
    format = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      day: 'numeric',
      month: spoken ? 'long' : 'short',
      ...(year && { year: 'numeric' }),
    });
    widgetDateFormats.set(shape, format);
  }
  const day = new Date(date);
  // `format` throws on a date that is none, where `toLocaleDateString` said so.
  return Number.isNaN(day.getTime()) ? 'Invalid Date' : format.format(day);
}
export function closeMove(c: Close) {
  const first = c.observations?.[0];
  if (!first) return '';
  const pct = (c.value / first.value - 1) * 100;
  const value = Number(pct.toFixed(1));
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}% over 7 days`;
}
export function datedCard(c: Close): GraphCard {
  const points = c.observations ?? [{ date: c.sessionDate, value: c.value }];
  return {
    id: c.id,
    kind: 'reading',
    title: labels[c.id],
    reading: formatNumber(c.value, 2, 2),
    asOf: c.sessionDate,
    readingNote: 'index points at close',
    changed: closeMove(c),
    series: {
      periods: points.map((p) => p.date),
      values: points.map((p) => p.value),
      unit: 'index points',
      label: labels[c.id],
    },
  };
}

export interface WidgetFace {
  /** Android stores the dated faces together for launcher-side selection. */
  timeline?: { timestamp: number; face: WidgetFace; offlineFace: WidgetFace }[];
  date?: string;
  shortDate?: string;
  subject?: string;
  value?: string;
  move?: string;
  minutes?: string;
  action?: string;
  publicAction?: string;
  privateLabel?: string;
  publicLabel?: string;
  closeLabel?: string;
  url?: string;
  playable?: boolean;
  cover?: string;
  chartLight?: string;
  chartDark?: string;
  chartMono?: string;
  example?: boolean;
  loading?: boolean;
  wallpaper?: boolean;
}
export function widgetFace(
  e: Edition | undefined,
  now: number,
  verified: number,
  offline: boolean,
  saved: boolean,
  completed: string | null,
): WidgetFace {
  if (!e) return {};
  const editionStart = Date.parse(e.edition);
  if (now < editionStart || now - verified >= 7 * DAY || now - editionStart >= 8 * DAY) return {};
  const today = new Date(now).toISOString().slice(0, 10);
  const stale = e.edition < today;
  const playable = !!e.audio && (saved || (!offline && !stale));
  const duration = e.audio && formatAudioDurationMinutes(e.audio.durationSeconds);
  let action: string;
  if (offline && e.audio) action = saved ? 'Audio saved' : 'Audio needs internet';
  else if (e.audio && completed === e.audio.generated && playable) action = 'Listened';
  else if (stale)
    action = now - editionStart < DAY + 5 * 3600000 ? 'Previous edition' : 'Saved edition';
  else if (e.audio) action = 'Daily briefing';
  else action = e.pending ? 'Audio pending' : 'Audio unavailable';
  const publicAction =
    action === 'Listened' || action === 'Audio saved'
      ? 'Daily briefing'
      : action === 'Audio needs internet'
        ? 'Open edition'
        : action;
  const url = `zuhd-news:///widget/${playable ? 'briefing' : 'edition'}/${e.edition}/${e.revision}`;
  const spokenDate = widgetDate(e.edition, true, true);
  const spoken = `Daily briefing, ${spokenDate}.${duration ? ` ${duration.replace(' min', ' minutes')}.` : ''}`;
  const target = playable ? 'Open and play.' : 'Open saved edition.';
  const c = e.close;
  return {
    date: widgetDate(e.edition),
    shortDate: widgetDate(e.edition, e.edition.slice(0, 4) !== today.slice(0, 4)),
    action,
    publicAction,
    url,
    playable,
    ...(duration && { minutes: duration }),
    publicLabel: `${spoken} ${target}`,
    privateLabel: `${spoken} ${action}. ${target}`,
    ...(c && {
      subject: labels[c.id],
      value: formatNumber(c.value, 2, 2),
      move: closeMove(c),
      closeLabel: `${labels[c.id]} closed at ${formatNumber(c.value, 2, 2)} index points on ${spokenDate}. ${closeMove(c)}`,
    }),
  };
}

export function widgetRoute(path: string) {
  const match =
    /^(?:zuhd-news:\/\/)?\/?widget\/(briefing|edition)\/(\d{4}-\d\d-\d\d)\/([a-f0-9]{64})$/.exec(
      path,
    );
  return match && day(match[2])
    ? { target: match[1] as 'briefing' | 'edition', date: match[2], revision: match[3]! }
    : null;
}

// Re-check the displayed recording at the time of the tap. A same-day
// re-recording or withdrawal invalidates even a downloaded former generation.
export function widgetTap(
  edition: Edition | undefined,
  current: Edition | undefined,
  briefing: FeedResponse['briefing'] | undefined,
  offline: boolean,
  saved: boolean,
  now: number,
) {
  const audio = edition?.audio;
  if (!audio) return 'edition';
  if (current?.edition === audio.date && current.audio?.generated !== audio.generated)
    return 'edition';
  if (
    briefing?.date === audio.date &&
    (!briefing.available || briefing.generated !== audio.generated)
  )
    return 'edition';
  const sameDay = new Date(now).toISOString().startsWith(audio.date);
  const verified =
    current?.audio?.generated === audio.generated &&
    briefing?.available &&
    briefing.generated === audio.generated;
  return saved || (sameDay && !offline && verified) ? 'briefing' : 'edition';
}
