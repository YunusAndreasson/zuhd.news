import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  STRAIT_BULGE,
  STRAIT_SIGN_R,
  type StraitState,
  straitMapChange,
  straitReach,
  straitSignDx,
  straitStateFor,
  straitWeekChange,
} from '../lib/strait-map';
test('straits identify traffic direction and the baseline, not a market price window', () => {
  expect(straitMapChange(-0.45)).toEqual({
    direction: 'down',
    value: '↓45%',
    basis: 'vs 90d',
    label: '↓45% vs 90d',
  });
  expect(straitMapChange(0.42)).toMatchObject({ direction: 'up', label: '↑42% vs 90d' });
  expect(straitMapChange(0.001)).toMatchObject({ direction: 'flat', label: '−0% vs 90d' });
  expect(straitMapChange(undefined)).toBeNull();
  expect(straitMapChange(NaN)).toBeNull();
});

test('the one-line label is the two globe lines joined, so a row and the map agree', () => {
  const change = straitMapChange(-0.57);
  expect(change?.label).toBe(`${change?.value} ${change?.basis}`);
});

test('the globe prints the strip’s seven-day move, so one strait reads one number', () => {
  // The strip said ▼38% (the week) while the label said ↓62% vs 90d (the
  // normal), a few centimetres apart.
  const change = straitWeekChange({
    direction: 'down',
    magnitude: '38%',
    window: 'over 7 days',
    valence: 'unfavorable',
    size: 38,
  });
  expect(change).toMatchObject({ direction: 'down', value: '↓38%', basis: undefined, alarm: true });
  expect(straitWeekChange({ direction: 'up', magnitude: '5%', valence: 'neutral' })).toMatchObject({
    value: '↑5%',
    alarm: false,
  });
});

describe('a strait’s glyph says its state in its shape', () => {
  const STATES: StraitState[] = ['pinch', 'rest', 'surge'];

  // "The phone and the map draw one mark": the web's `strait(bulge)` on its
  // 16-unit box, scaled to the app's 22. Nothing checked that they agreed.
  it.each(STATES)('%s bows as far as the web’s, at the app’s scale', (state) => {
    const web = readFileSync(resolve(__dirname, '../../public/islands/_map/glyphs.ts'), 'utf8');
    const found = web.match(new RegExp(`'strait-${state}': strait\\(([\\d.]+)\\)`));
    expect(found).not.toBeNull();
    expect(STRAIT_BULGE[state]).toBeCloseTo((Number(found?.[1]) * 22) / 16, 6);
  });

  it('closes in when pinched and opens when surging', () => {
    expect(STRAIT_BULGE.pinch).toBeLessThan(STRAIT_BULGE.rest);
    expect(STRAIT_BULGE.rest).toBeLessThan(STRAIT_BULGE.surge);
  });

  // The sign's backing disc sat on the right-hand shore at a fixed 12.
  it.each(STATES)('puts the traffic sign clear of the %s shape’s shore', (state) => {
    expect(straitSignDx(state, 1) - STRAIT_SIGN_R).toBeGreaterThan(straitReach(state, 1));
  });

  it('stays inside the 22-unit glyph box', () => {
    for (const state of STATES) expect(straitReach(state, 1)).toBeLessThanOrEqual(11);
  });

  it('is pinched by the disruption and opened past the same bar the other way', () => {
    expect(straitStateFor(-0.57)).toBe('pinch');
    expect(straitStateFor(-0.15)).toBe('pinch');
    expect(straitStateFor(-0.1)).toBe('rest');
    expect(straitStateFor(0)).toBe('rest');
    expect(straitStateFor(0.15)).toBe('rest');
    expect(straitStateFor(0.4)).toBe('surge');
  });
});
