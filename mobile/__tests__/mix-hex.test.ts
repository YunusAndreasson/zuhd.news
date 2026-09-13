import { mixHex } from '../constants/theme';

describe('mixHex', () => {
  it('mixes two hex colours as a solid colour', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#d2604a', '#161619', 0)).toBe('#d2604a');
    expect(mixHex('#d2604a', '#161619', 1)).toBe('#161619');
  });

  it('accepts 3-digit hex and clamps the share', () => {
    expect(mixHex('#fff', '#000', 2)).toBe('#000000');
  });

  it('returns the first colour when either input is not hex', () => {
    expect(mixHex('rgba(1,2,3,0.5)', '#000000', 0.5)).toBe('rgba(1,2,3,0.5)');
  });
});
