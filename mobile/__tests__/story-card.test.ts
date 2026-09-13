import { articleThreadContext, leadOf, restOf } from '../lib/story-card';

const SENTENCES = [
  'Kyiv — A machine gun, not a missile, made this a first.',
  "Until now only a warship's guns could counter a drone boat.",
  'Ukraine says a Sargan drone boat sank a Russian one.',
  'Russia has not confirmed the loss.',
];

describe('leadOf / restOf', () => {
  it('splits the hook and why-it-matters from the rest', () => {
    expect(leadOf(SENTENCES)).toEqual(SENTENCES.slice(0, 2));
    expect(restOf(SENTENCES)).toEqual(SENTENCES.slice(2));
  });

  it('loses nothing on a short story', () => {
    const short = SENTENCES.slice(0, 1);
    expect([...leadOf(short), ...restOf(short)]).toEqual(short);
  });
});

describe('articleThreadContext', () => {
  it('omits thread context when there is only one report', () => {
    expect(articleThreadContext({ threadArticleCount: 1, threadDay: 13 })).toBe(null);
  });

  it('names the run only when the ledger holds more than one report', () => {
    expect(
      articleThreadContext({
        threadArticleCount: 4,
        threadArc: 'ongoing',
        threadDay: 9,
      }),
    ).toBe('ongoing, day 9 · 4 reports');
  });
});
