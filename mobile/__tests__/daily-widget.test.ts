import type { WidgetCandidate } from '@shared/types';
import {
  closeMove,
  datedCard,
  widgetDate,
  widgetEdition,
  widgetFace,
  widgetRoute,
  widgetTap,
} from '../lib/daily-widget';
import { redirectSystemPath } from '../app/+native-intent';

const date = '2026-11-23',
  generated = `${date}T06:00:00Z`,
  revision = 'a'.repeat(64);
const now = Date.parse(`${date}T17:00:00Z`),
  day = 86400000;
const close: NonNullable<WidgetCandidate['close']> = {
  id: 'mkt:tadawul',
  label: 'PRIVATE STORY TITLE',
  completed: true,
  sessionDate: date,
  value: 9937.26,
  unit: 'index points',
  sourceRevision: 'b'.repeat(64),
  observations: [
    { date: '2026-11-16', value: 10219.89 },
    { date, value: 9937.26 },
  ],
};
const wire: WidgetCandidate = {
  version: 1,
  edition: date,
  sourceRevision: revision,
  close,
  audio: { status: 'available', date, generated, durationSeconds: 587 },
};
const edition = widgetEdition(wire, now)!;
const face = (time = now, offline = false, saved = false, completion: string | null = null) =>
  widgetFace(edition, time, now, offline, saved, completion);

it('joins an exchange-local close and recording to one UTC edition without copying publisher prose', () => {
  expect(face()).toMatchObject({
    subject: 'Saudi stock index',
    value: '9,937.26',
    minutes: '10 min',
    move: '−2.8% over 7 days',
    playable: true,
  });
  expect(JSON.stringify(edition)).not.toContain(close.label);
  expect(datedCard(edition.close!)).toMatchObject({
    asOf: date,
    series: { periods: ['2026-11-16', date] },
  });
  expect(widgetEdition({ ...wire, edition: '2026-02-30' }, now)).toBeUndefined();
  expect(widgetEdition({ ...wire, sourceRevision: 'bad' }, now)).toBeUndefined();
  expect(
    widgetEdition({ ...wire, close: { ...close, sessionDate: '2026-11-22' } }, now)?.close,
  ).toBeUndefined();
  expect(
    widgetEdition(
      { ...wire, audio: { status: 'available', date, generated: '2026-11-22T12:00:00Z' } },
      now,
    )?.audio,
  ).toBeUndefined();
});
it('omits a misleading week when observations are unordered, too short or missing the close', () => {
  for (const observations of [
    [
      { date: '2026-11-18', value: 100 },
      { date, value: close.value },
    ],
    [
      { date, value: close.value },
      { date: '2026-11-16', value: 100 },
    ],
    [
      { date: '2026-11-16', value: 100 },
      { date, value: 1 },
    ],
  ]) {
    const result = widgetEdition({ ...wire, close: { ...close, observations } }, now)!;
    expect(result.close?.observations).toBeUndefined();
    expect(closeMove(result.close!)).toBe('');
  }
});
it('keeps listening and file status off public accessibility labels', () => {
  expect(face(now, true)).toMatchObject({ action: 'Audio needs internet', playable: false });
  expect(face(now, true, true)).toMatchObject({ action: 'Audio saved', playable: true });
  expect(face(now, false, true, generated)).toMatchObject({
    action: 'Listened',
    publicAction: 'Daily briefing',
    playable: true,
  });
  expect(face(now, false, true, 'different').action).toBe('Daily briefing');
  expect(face(now, false, true, generated).publicLabel).not.toMatch(/listened|saved audio/i);
});
it('shows the original date across midnight, retains playable downloads and expires the face', () => {
  expect(face(Date.parse('2026-11-24T04:59Z'))).toMatchObject({
    action: 'Previous edition',
    playable: false,
  });
  expect(face(Date.parse('2026-11-24T05:00Z'), false, true)).toMatchObject({
    date: '23 Nov 2026',
    action: 'Saved edition',
    playable: true,
  });
  expect(face(Date.parse('2026-11-26T04:30Z')).action).toBe('Saved edition');
  expect(face(now - day)).toEqual({});
  expect(face(now + 7 * day)).toEqual({});
});
it('requires explicit pending state and never invents duration', () => {
  const pending = widgetEdition(
    { ...wire, audio: { status: 'generating' } as unknown as WidgetCandidate['audio'] },
    now,
  );
  expect(widgetFace(pending, now, now, false, false, null)).toMatchObject({
    action: 'Audio pending',
    playable: false,
  });
  expect(widgetFace(pending, now, now, false, false, null).minutes).toBeUndefined();
  const noAudio = widgetEdition({ ...wire, audio: { status: 'unavailable' } }, now);
  expect(widgetFace(noAudio, now, now, false, false, null).action).toBe('Audio unavailable');
  expect(
    widgetEdition({ ...wire, close: undefined, audio: { status: 'unavailable' } }, now),
  ).toBeUndefined();
});
it('resolves an exact generation again on tap, including cached old editions and same-date withdrawals', () => {
  const live = { date, available: true, generated };
  expect(widgetTap(edition, edition, live, false, false, now)).toBe('briefing');
  expect(widgetTap(edition, edition, live, true, false, now)).toBe('edition');
  expect(widgetTap(edition, edition, live, true, true, now + day)).toBe('briefing');
  expect(widgetTap(edition, edition, live, false, false, now + day)).toBe('edition');
  expect(
    widgetTap(edition, edition, { ...live, generated: `${date}T07:00:00Z` }, false, true, now),
  ).toBe('edition');
  expect(widgetTap(edition, { ...edition, audio: undefined }, live, false, true, now)).toBe(
    'edition',
  );
});
it('only accepts dated widget routes and distinguishes a menu preview from a real open', () => {
  const path = face().url!;
  expect(widgetRoute(path)).toEqual({ date, revision, target: 'briefing' });
  expect(redirectSystemPath({ path, initial: true })).toBe(`/?widget=${encodeURIComponent(path)}`);
  expect(redirectSystemPath({ path: `${path}?preview=1`, initial: false })).toBe(
    `/?widget=${encodeURIComponent(path)}&widgetPreview=1`,
  );
  expect(widgetRoute(path.replace(date, '2026-02-30'))).toBeNull();
  expect(widgetRoute(path.replace(revision, 'story-title'))).toBeNull();
});

// One formatter per shape is held for the session; each prints what
// `toLocaleDateString` printed when it built one per call.
it('prints a date as toLocaleDateString did, in every shape', () => {
  for (const day of ['2026-11-23', '2026-01-01', '2027-02-28']) {
    for (const year of [true, false]) {
      for (const spoken of [true, false]) {
        expect(widgetDate(day, year, spoken)).toBe(
          new Date(day).toLocaleDateString('en-GB', {
            timeZone: 'UTC',
            day: 'numeric',
            month: spoken ? 'long' : 'short',
            ...(year && { year: 'numeric' }),
          }),
        );
      }
    }
  }
  expect(widgetDate('never')).toBe(new Date('never').toLocaleDateString('en-GB'));
});
