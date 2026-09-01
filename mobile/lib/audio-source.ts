interface DownloadedAudioAsset {
  localUri?: string | null;
}

/** Prefer a downloaded local audio URI, with a bounded streaming fallback. */
export async function resolveDownloadedAudioSource(
  remoteUrl: string,
  download: Promise<DownloadedAudioAsset>,
  timeoutMs: number,
): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const downloaded = await Promise.race([
      download,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    return downloaded?.localUri ?? remoteUrl;
  } catch {
    return remoteUrl;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
