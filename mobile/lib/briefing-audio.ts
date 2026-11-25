import { File, FileMode, Paths } from 'expo-file-system';
import { hasMp3Frames, mp3AudioOffset } from './mp3-format';

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

/** Check completed downloads, including files saved by older versions. */
export function validBriefingAudio(file: File): boolean {
  try {
    if (!file.exists || file.size < 10) return false;
    const handle = file.open(FileMode.ReadOnly);
    try {
      const offset = mp3AudioOffset(handle.readBytesSync(10));
      if (offset < 0 || offset >= file.size) return false;
      handle.offset = offset;
      const sampleSize = 8_192;
      if (!hasMp3Frames(handle.readBytesSync(sampleSize))) return false;
      if (file.size - offset <= sampleSize) return true;
      handle.offset = file.size - sampleSize;
      return hasMp3Frames(handle.readBytesSync(sampleSize));
    } finally {
      handle.close();
    }
  } catch {
    return false;
  }
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
