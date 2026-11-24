import { offerStage } from '../lib/publisher-offer';
import { publisherEnabled } from '../lib/publisher-state';

const refused = { shown: true, refusal: { day: '2026-11-22', edition: 'A', visit: 1 } };
it('shares one first invitation across the opened article, pause and finish', () => {
  for (const source of ['opened_report', 'paused_briefing', 'finished_briefing'] as const) {
    expect(offerStage({}, source, 'A', '2026-11-22', 1, false)).toBe('first');
    expect(offerStage({ shown: true }, source, 'A', '2026-11-22', 1, false)).toBeNull();
  }
});
it('permits one settings row only at a later visit and date after a different edition finishes', () => {
  expect(offerStage(refused, 'finished_briefing', 'B', '2026-11-23', 2, false)).toBe('later');
  for (const history of [
    { ...refused, laterShown: true },
    { ...refused, disabled: true },
    { shown: true },
  ]) {
    expect(offerStage(history, 'finished_briefing', 'B', '2026-11-23', 2, false)).toBeNull();
  }
  expect(offerStage(refused, 'paused_briefing', 'B', '2026-11-23', 2, false)).toBeNull();
  expect(offerStage(refused, 'finished_briefing', 'A', '2026-11-23', 2, false)).toBeNull();
  expect(offerStage(refused, 'finished_briefing', 'B', '2026-11-23', 1, false)).toBeNull();
  expect(offerStage(refused, 'finished_briefing', 'B', '2026-11-22', 2, false)).toBeNull();
  expect(offerStage(refused, 'finished_briefing', 'B', '2026-11-23', 2, true)).toBeNull();
});
it('requires current acknowledgement, consent and an effective channel', () => {
  const now = Date.now();
  const accepted = {
    status: 'accepted',
    reason: 'enable',
    delivery: { briefing: true, breaking: false },
    acceptedAt: now,
  } as const;
  expect(publisherEnabled(true, accepted, now)).toBe(true);
  expect(publisherEnabled(false, accepted, now)).toBe(false);
  expect(
    publisherEnabled(true, { ...accepted, delivery: { briefing: false, breaking: false } }, now),
  ).toBe(false);
  expect(publisherEnabled(true, accepted, now + 90 * 86400000)).toBe(false);
  for (const status of ['pending', 'failed', 'removed'] as const) {
    expect(publisherEnabled(true, { ...accepted, status }, now)).toBe(false);
  }
});

it('cannot spend the later invitation by finishing downloaded A while the feed shows B', () => {
  const { offerEdition } = jest.requireActual('../lib/publisher-offer');
  const recorded = offerEdition({ source: 'finished_briefing', recordingDate: 'A' }, 'B');
  expect(offerStage(refused, 'finished_briefing', recorded, '2026-11-23', 2, false)).toBeNull();
  expect(offerEdition({ source: 'opened_report' }, 'B')).toBe('B');
});
