import { RESUME_TOP_AFTER_MS, resumeLanding, unreadNewBehind } from '../lib/resume-landing';

const MIN = 60_000;

describe('resumeLanding', () => {
  it('keeps the place after a short break, and says what arrived', () => {
    expect(resumeLanding({ awayMs: 10 * MIN, coldStart: false, added: 3, readerMoved: true })).toBe(
      'toast',
    );
    expect(resumeLanding({ awayMs: 10 * MIN, coldStart: false, added: 0, readerMoved: true })).toBe(
      'stay',
    );
  });

  it('starts the day again after an hour away, whether or not anything arrived', () => {
    for (const added of [0, 4]) {
      expect(
        resumeLanding({ awayMs: RESUME_TOP_AFTER_MS, coldStart: false, added, readerMoved: true }),
      ).toBe('front');
    }
  });

  it('puts a launch on the front, unless the reader has already moved', () => {
    const launch = { awayMs: Infinity, coldStart: true };
    expect(resumeLanding({ ...launch, added: 2, readerMoved: false })).toBe('front');
    // The network answered after the first swipe: pulling them back would be
    // the jump this exists to remove.
    expect(resumeLanding({ ...launch, added: 2, readerMoved: true })).toBe('toast');
    expect(resumeLanding({ ...launch, added: 0, readerMoved: true })).toBe('stay');
  });
});

describe('unreadNewBehind', () => {
  it('counts new, unread stories before the one in front, and finds the first', () => {
    const fresh = [true, true, false, true, true];
    const read = [false, true, false, false, false];
    expect(unreadNewBehind(fresh, read, 4)).toEqual({ count: 2, first: 0 });
  });

  it('ignores new stories still ahead of the reader', () => {
    expect(unreadNewBehind([false, true, true], [false, false, false], 1)).toEqual({
      count: 0,
      first: -1,
    });
  });
});
