import { UMM_AL_QURA } from '@shared/prayer';
import { NIGHT_DEPTHS, nightStep } from '../components/globe/night';

describe('the night in steps', () => {
  it('stacks to the veil one fill drew, so deep night is as dark as it was', () => {
    for (const veil of [0.15, 0.2]) {
      const step = nightStep(veil);
      const layers = NIGHT_DEPTHS.length + 1;
      expect(1 - (1 - step) ** layers).toBeCloseTo(veil, 12);
    }
  });

  it('deepens from civil twilight to the angle Fajr is read at', () => {
    expect(NIGHT_DEPTHS[0]).toBe(6);
    expect(NIGHT_DEPTHS[1]).toBe(12);
    expect(NIGHT_DEPTHS[NIGHT_DEPTHS.length - 1]).toBe(UMM_AL_QURA.fajrAngle);
  });
});
