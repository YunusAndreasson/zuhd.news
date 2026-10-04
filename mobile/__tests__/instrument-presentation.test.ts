import type { CatalogGroup, CatalogRow } from '../lib/instrument-catalog';
import {
  cardObservation,
  contextualTitle,
  listContext,
  menuCard,
} from '../lib/instrument-presentation';

function row(id: string, window = 'on the month', period = 'Sep 2026'): CatalogRow {
  return {
    id,
    short: id,
    weekly: false,
    move: { direction: 'up', magnitude: '0.25 points', window },
    card: {
      id,
      kind: 'reading',
      title: id,
      reading: '4.00%',
      kicker: 'money',
      asOf: '2026-09-01',
      delta: { direction: 'down', magnitude: '1%', window: 'since Aug 1' },
      series: { values: [3.75, 4], periods: ['Aug 2026', period], label: 'per cent', unit: '%' },
    },
  };
}

it('shows an observation month instead of its storage date', () => {
  expect(cardObservation(row('fed-funds').card!)).toBe('Sep 2026');
  expect(cardObservation(row('price', 'over 7 days', 'Sep 1').card!)).toBe('Sep 1');
});

it('shares a majority date while explicitly marking exceptions', () => {
  const group: CatalogGroup = {
    key: 'rates',
    title: 'rates',
    rows: [row('fed-funds'), row('ecb-rate')],
  };
  expect(listContext(group)).toMatchObject({ date: 'Sep 2026', window: 'on the month' });
  group.rows.push(row('older', 'since Jul 2026', 'Aug 2026'));
  expect(listContext(group)).toMatchObject({
    date: 'Sep 2026',
    dateLabel: 'Sep 2026 unless noted',
    window: 'on the month',
  });
  expect(group.rows[2]?.move?.window).toBe('since Jul 2026');
  group.rows.push(row('another-older', 'on the month', 'Aug 2026'));
  expect(listContext(group).date).toBeUndefined();
  group.rows.pop();
  group.rows.push({ ...row('missing'), card: null });
  expect(listContext(group).date).toBeUndefined();
});

it('keeps contextual country names out of unrelated lists and leaves unknown banks intact', () => {
  expect(contextualTitle(row('fed-funds'), 'rates')).toBe('United States');
  expect(contextualTitle(row('us-cpi'), 'inflation')).toBe('United States');
  expect(contextualTitle(row('fed-funds'), 'other')).toBeUndefined();
  expect(contextualTitle(row('unknown-bank'), 'rates')).toBeUndefined();
});

it('carries the followed comparison into the detail without changing the original card', () => {
  const item = row('price', 'over 7 days');
  expect(menuCard(item)?.delta).toEqual(item.move);
  expect(item.card?.delta?.window).toBe('since Aug 1');
});

it('explains currency direction once and keeps flat currencies neutral', () => {
  const item = row('fx-eur', 'over 7 days');
  expect(menuCard(item)?.delta?.window).toBe('stronger over 7 days');
  item.move = { direction: 'down', magnitude: '2%', window: 'weaker since Sep 1' };
  expect(menuCard(item)?.delta?.window).toBe('weaker since Sep 1');
  item.move = { direction: 'flat', magnitude: 'unchanged', window: 'over 7 days' };
  expect(menuCard(item)?.delta?.window).toBe('over 7 days');
});

it('preserves absent readings and comparisons', () => {
  const item = row('price');
  item.move = undefined;
  expect(menuCard(item)).toBe(item.card);
  item.card = null;
  expect(menuCard(item)).toBeNull();
});

it('does not label an upcoming event with the month of its background history', () => {
  expect(
    cardObservation({
      id: 'event-cpi',
      kind: 'scheduled',
      title: 'US CPI',
      date: '2026-10-14',
      reading: 'in 10 days',
      series: {
        values: [3, 3.1],
        periods: ['Jul 2026', 'Aug 2026'],
        label: 'US inflation',
        unit: '%',
      },
    }),
  ).toBe('');
});
