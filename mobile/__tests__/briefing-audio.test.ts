let mockFiles: Set<string>;

jest.mock('expo-file-system', () => {
  class MockFile {
    path: string;
    constructor(dir: string, name: string) {
      this.path = `${dir}/${name}`;
    }
    get name() {
      return this.path.slice(this.path.lastIndexOf('/') + 1);
    }
    get uri() {
      return `file://${this.path}`;
    }
    delete() {
      mockFiles.delete(this.path);
    }
  }
  const cache = Object.assign(new String('/cache'), {
    list: () => [...mockFiles].map((path) => new MockFile('/cache', path.slice('/cache/'.length))),
  });
  return { Paths: { cache }, File: MockFile };
});

import { briefingAudioFile, deleteBriefingAudio } from '../lib/briefing-audio';

beforeEach(() => {
  mockFiles = new Set([
    '/cache/briefing-old.mp3',
    '/cache/briefing-new.mp3',
    '/cache/briefing-1-1.part',
    '/cache/zuhd-feed.json',
  ]);
});

// A re-recording has a new URL and so a new file: kept without end, about
// 4 MB each piled up.
it('keeps only the recording just saved, and leaves a download in progress', () => {
  const keep = briefingAudioFile('x');
  const kept = keep.uri.slice('file://'.length);
  mockFiles.add(kept);
  deleteBriefingAudio({ keep });
  expect([...mockFiles].sort()).toEqual(
    ['/cache/briefing-1-1.part', kept, '/cache/zuhd-feed.json'].sort(),
  );
});

it('deletes unfinished downloads too when asked, and nothing else', () => {
  deleteBriefingAudio({ partials: true });
  expect([...mockFiles]).toEqual(['/cache/zuhd-feed.json']);
});
