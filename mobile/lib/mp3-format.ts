// MPEG Layer III frame sizes. Looking for consecutive frames rejects an ID3
// tag, an HTML error body or a nonempty zero-filled file on its own.
const MPEG1_RATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2_RATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES = [44_100, 48_000, 32_000];

export function mp3AudioOffset(bytes: Uint8Array): number {
  if (bytes.length < 10 || bytes[0] !== 73 || bytes[1] !== 68 || bytes[2] !== 51) return 0;
  const size = bytes.subarray(6, 10);
  if (size.some((part) => part > 127)) return -1;
  const footer = bytes[3] === 4 && (bytes[5]! & 16) !== 0 ? 10 : 0;
  return 10 + footer + size.reduce((total, part) => total * 128 + part, 0);
}

function mp3Frame(bytes: Uint8Array, offset: number): number {
  const b = bytes[offset + 1] ?? 0;
  const c = bytes[offset + 2] ?? 0;
  const version = (b >> 3) & 3;
  if (bytes[offset] !== 255 || (b & 224) !== 224 || version === 1 || (b & 6) !== 2) return 0;
  const bitRates = version === 3 ? MPEG1_RATES : MPEG2_RATES;
  const bitRate = bitRates[c >> 4] ?? 0;
  const baseRate = SAMPLE_RATES[(c >> 2) & 3] ?? 0;
  const sampleRate = baseRate / (version === 3 ? 1 : version === 2 ? 2 : 4);
  if (!bitRate || !sampleRate) return 0;
  const factor = version === 3 ? 144_000 : 72_000;
  return Math.floor((factor * bitRate) / sampleRate) + ((c >> 1) & 1);
}

export function hasMp3Frames(bytes: Uint8Array): boolean {
  for (let i = 0; i + 4 < bytes.length; i++) {
    const length = mp3Frame(bytes, i);
    if (!length) continue;
    const nextLength = mp3Frame(bytes, i + length);
    if (nextLength && i + length + nextLength <= bytes.length) return true;
  }
  return false;
}
