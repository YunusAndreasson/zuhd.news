import { resolveDownloadedAudioSource } from '../lib/audio-source';

describe('audio source preparation', () => {
  it('uses the local cached file when the download completes', async () => {
    await expect(
      resolveDownloadedAudioSource(
        'https://example.com/briefing.mp3',
        Promise.resolve({ localUri: 'file:///cache/briefing.mp3' }),
        100,
        jest.fn(),
      ),
    ).resolves.toBe('file:///cache/briefing.mp3');
  });

  it('falls back to streaming when the download fails', async () => {
    await expect(
      resolveDownloadedAudioSource(
        'https://example.com/briefing.mp3',
        Promise.reject(new Error('offline')),
        100,
        jest.fn(),
      ),
    ).resolves.toBe('https://example.com/briefing.mp3');
  });

  it('settles cancellation before starting a streaming fallback', async () => {
    jest.useFakeTimers();
    let reject!: (error: Error) => void;
    const download = new Promise<never>((_resolve, fail) => {
      reject = fail;
    });
    const cancel = jest.fn();
    const result = resolveDownloadedAudioSource(
      'https://example.com/briefing.mp3',
      download,
      100,
      cancel,
    );
    const settled = jest.fn();
    void result.then(settled);
    jest.advanceTimersByTime(100);
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(settled).not.toHaveBeenCalled();
    reject(new Error('cancelled'));
    await expect(result).resolves.toBe('https://example.com/briefing.mp3');
    jest.useRealTimers();
  });
});
