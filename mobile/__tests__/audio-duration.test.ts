import {
  briefingActionLabel,
  formatAudioDurationMinutes,
  resolveAudioDuration,
} from '../lib/audio-duration';

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

  it('formats briefing duration at a compact human scale', () => {
    expect(formatAudioDurationMinutes(745)).toBe('12 min');
    expect(formatAudioDurationMinutes(20)).toBe('1 min');
    expect(formatAudioDurationMinutes(0)).toBeNull();
  });

  it('labels the briefing action from resumability and available duration', () => {
    expect(briefingActionLabel(false, 745)).toBe('listen · 12 min');
    expect(briefingActionLabel(true, 745)).toBe('resume · 12 min');
    expect(briefingActionLabel(true, undefined)).toBe('resume');
  });
});
