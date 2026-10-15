interface DownloadedAudioAsset {
  localUri?: string | null;
}

/** Prefer a downloaded local audio URI, with a bounded streaming fallback. */
export async function resolveDownloadedAudioSource(
  remoteUrl: string,
  download: Promise<DownloadedAudioAsset>,
  timeoutMs: number,
  cancelDownload: () => void,
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const downloaded = await Promise.race([
      download,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          cancelDownload();
          resolve(null);
        }, timeoutMs);
      }),
    ]);
    // Cancellation must settle before the native player starts streaming.
    if (!downloaded) await download.catch(() => {});
    return downloaded?.localUri ?? remoteUrl;
  } catch {
    return remoteUrl;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
