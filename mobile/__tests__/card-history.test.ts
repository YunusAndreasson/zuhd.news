import Storage from 'expo-sqlite/kv-store';
import { cardStatus, cardVersion, clearCardHistory, markCardViewed } from '../lib/card-history';
import type { SwipeCard } from '../lib/cards/rank';

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

const card: SwipeCard = {
  id: 'oil',
  kind: 'reading',
  title: 'Oil',
  reading: '80',
  why: 'Analysis',
  series: { values: [78, 80], periods: ['2026-09-03', '2026-09-04'], label: 'Oil' },
};
beforeEach(() => clearCardHistory());

test('first view persists an exact version scoped to the section', () => {
  expect(cardStatus('markets', card)).toBe('new');
  markCardViewed('markets', card);
  expect(cardStatus('markets', card)).toBe('viewed');
  expect(cardStatus('shipping', card)).toBe('new');
  expect(Storage.setItemSync).toHaveBeenLastCalledWith(
    'zuhd_card_history_v1',
    expect.stringContaining('markets:oil'),
  );
});
test('timestamps and editorial promotion alone are not updates', () => {
  markCardViewed('markets', card);
  expect(cardStatus('markets', { ...card, asOf: '2026-09-05', lead: true })).toBe('viewed');
});
test('changed analysis, numbers and chart points are updates', () => {
  markCardViewed('markets', card);
  for (const changed of [
    { ...card, why: 'New analysis' },
    { ...card, reading: '81' },
    { ...card, series: { ...card.series, values: [78, 81] } },
  ])
    expect(cardStatus('markets', changed)).toBe('updated');
});
test('privacy erase forgets every version it recorded', () => {
  markCardViewed('markets', card);
  clearCardHistory();
  expect(cardStatus('markets', card)).toBe('new');
  expect(cardVersion(card)).toBe(cardVersion({ ...card }));
});
