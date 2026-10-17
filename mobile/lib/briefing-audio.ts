import { File, Paths } from 'expo-file-system';

/**
 * The briefing's audio on the device. Each recording is about 4 MB, and a
 * re-recording carries a new `?v=` in its URL and so a new file name: kept
 * without end, they piled up a few MB a day, and the privacy page's erase left
 * them behind.
 */

const PREFIX = 'briefing-';

/** Where a completed download of `url` lives. Only a complete file takes it. */
export function briefingAudioFile(url: string): File {
  return new File(Paths.cache, `${PREFIX}${encodeURIComponent(url)}.mp3`);
}

/** A download in progress, never mistaken for audio. */
export function briefingPartialFile(sequence: number): File {
  return new File(Paths.cache, `${PREFIX}${Date.now()}-${sequence}.part`);
}

/**
 * Delete the briefing audio on the device: every completed recording but
 * `keep`, and with `partials` the unfinished downloads too (only when nothing
 * is downloading: the erase).
 */
export function deleteBriefingAudio({
  keep,
  partials = false,
}: {
  keep?: File;
  partials?: boolean;
} = {}): void {
  let entries: ReturnType<typeof Paths.cache.list>;
  try {
    entries = Paths.cache.list();
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!(entry instanceof File) || !entry.name.startsWith(PREFIX)) continue;
    const audio = entry.name.endsWith('.mp3');
    if (!audio && !(partials && entry.name.endsWith('.part'))) continue;
    if (keep && entry.uri === keep.uri) continue;
    try {
      entry.delete();
    } catch {}
  }
}
