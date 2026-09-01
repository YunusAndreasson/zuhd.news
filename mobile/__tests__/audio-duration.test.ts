import { resolveAudioDuration } from '../lib/audio-duration';

describe('audio duration', () => {
  it('prefers the loaded player duration over feed metadata', () => {
    expect(resolveAudioDuration(744.8, 745)).toBe(744);
  });

  it('uses feed metadata while the native player is still loading', () => {
    expect(resolveAudioDuration(0, 745)).toBe(745);
  });

  it('rejects invalid durations before considering the development fallback', () => {
    expect(resolveAudioDuration(Number.NaN, -1, 720)).toBe(720);
    expect(resolveAudioDuration(0, undefined)).toBe(0);
  });
});
