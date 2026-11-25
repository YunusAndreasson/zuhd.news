import { hasMp3Frames, mp3AudioOffset } from '../lib/mp3-format';

it('rejects empty, zero-filled and truncated downloads', () => {
  expect(hasMp3Frames(new Uint8Array(1_024))).toBe(false);
  expect(hasMp3Frames(new Uint8Array([255, 251, 144, 0]))).toBe(false);
  const frames = new Uint8Array(834);
  frames.set([255, 251, 144, 0], 0);
  frames.set([255, 251, 144, 0], 417);
  expect(hasMp3Frames(frames)).toBe(true);
  expect(hasMp3Frames(frames.subarray(0, 833))).toBe(false);
});

it('calculates the frame start after a variable-length ID3 tag', () => {
  expect(mp3AudioOffset(new Uint8Array([73, 68, 51, 4, 0, 16, 0, 0, 1, 2]))).toBe(150);
  expect(mp3AudioOffset(new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 128]))).toBe(-1);
  expect(mp3AudioOffset(new Uint8Array([255, 251, 144, 0]))).toBe(0);
});

it('recognizes the publisher’s MPEG-2 24 kHz stream and MPEG-2.5', () => {
  const mpeg2 = new Uint8Array(384);
  mpeg2.set([255, 243, 132, 192], 0);
  mpeg2.set([255, 243, 132, 192], 192);
  expect(hasMp3Frames(mpeg2)).toBe(true);

  const mpeg25 = new Uint8Array(768);
  mpeg25.set([255, 227, 132, 192], 0);
  mpeg25.set([255, 227, 132, 192], 384);
  expect(hasMp3Frames(mpeg25)).toBe(true);
});
