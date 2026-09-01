import { resolveDownloadedAudioSource } from '../lib/audio-source';

describe('audio source preparation', () => {
  it('uses the local cached file when the download completes', async () => {
    await expect(
      resolveDownloadedAudioSource(
        'https://example.com/briefing.mp3',
        Promise.resolve({ localUri: 'file:///cache/briefing.mp3' }),
        100,
      ),
    ).resolves.toBe('file:///cache/briefing.mp3');
  });

  it('falls back to streaming when the download fails', async () => {
    await expect(
      resolveDownloadedAudioSource(
        'https://example.com/briefing.mp3',
        Promise.reject(new Error('offline')),
        100,
      ),
    ).resolves.toBe('https://example.com/briefing.mp3');
  });

  it('falls back to streaming when the cache wait reaches its deadline', async () => {
    jest.useFakeTimers();
    const result = resolveDownloadedAudioSource(
      'https://example.com/briefing.mp3',
      new Promise(() => {}),
      100,
    );
    jest.advanceTimersByTime(100);
    await expect(result).resolves.toBe('https://example.com/briefing.mp3');
    jest.useRealTimers();
  });
});
