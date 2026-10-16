import { playerMaterial, playerMotion } from '../lib/player-material';

it.each([
  ['ios', true, false, 'glass'],
  ['ios', false, false, 'blur'],
  ['ios', true, true, 'solid'],
  ['ios', false, true, 'solid'],
  ['android', true, false, 'solid'],
  ['android', false, false, 'solid'],
  ['android', true, true, 'solid'],
  ['android', false, true, 'solid'],
] as const)(
  '%s, glass %s, Reduce Transparency %s: %s',
  (os, glassAvailable, reduceTransparency, material) => {
    expect(playerMaterial({ os, glassAvailable, reduceTransparency })).toBe(material);
  },
);

it('slides, and never fades a material that cannot fade', () => {
  for (const material of ['glass', 'blur', 'solid'] as const) {
    expect(playerMotion(material, false)).toBe('slide');
  }
  expect(playerMotion('solid', true)).toBe('dissolve');
  expect(playerMotion('glass', true)).toBe('appear');
  expect(playerMotion('blur', true)).toBe('appear');
});
