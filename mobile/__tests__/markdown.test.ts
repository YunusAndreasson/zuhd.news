import { COUNTRY_URL_SCHEME, parseInline, smartTypography } from '../lib/markdown';

describe('smartTypography', () => {
  it('converts straight double quotes to curly quotes', () => {
    expect(smartTypography('He said, "hello"')).toBe('He said, \u201chello\u201d');
  });

  it('converts opening quote at start of string', () => {
    expect(smartTypography('"Hello," she said')).toBe('\u201cHello,\u201d she said');
  });

  it('converts single quotes to curly quotes', () => {
    expect(smartTypography("'Hello'")).toBe('\u2018Hello\u2019');
  });

  it('handles apostrophes in contractions', () => {
    const result = smartTypography("don't stop, it's fine");
    // All remaining ' become right single quote (apostrophe)
    expect(result).toBe('don\u2019t stop, it\u2019s fine');
  });

  it('converts triple dash to em dash before double dash to en dash', () => {
    // Order matters: --- must be replaced before -- to avoid partial matches.
    // ZWSP (\u200b) inserted after each dash that's adjacent to a non-space
    // char gives RN's line-breaker a soft-break opportunity so unspaced
    // `EU--Russia`-style tokens don't bleed past the column.
    expect(smartTypography('a---b--c')).toBe('a\u2014\u200bb\u2013\u200bc');
  });

  it('does not insert ZWSP when dash is followed by whitespace', () => {
    // `word -- word` breaks after the dash; the space before it is
    // no-break, so the dash never starts a line.
    expect(smartTypography('word -- word')).toBe('word\u00a0\u2013 word');
  });

  it('keeps a spaced em dash with the word before it', () => {
    expect(smartTypography('the discipline \u2014 zuhd')).toBe('the discipline\u00a0\u2014 zuhd');
  });

  it('converts three dots to ellipsis', () => {
    expect(smartTypography('wait...')).toBe('wait\u2026');
  });

  it('converts common fractions', () => {
    expect(smartTypography('1/2 cup')).toBe('\u00BD cup');
    expect(smartTypography('3/4 done')).toBe('\u00BE done');
    expect(smartTypography('1/4 left')).toBe('\u00BC left');
    expect(smartTypography('1/3 and 2/3')).toBe('\u2153 and \u2154');
  });

  it('does NOT convert fractions embedded in larger numbers', () => {
    // Word boundary \b should prevent matching inside "11/2"
    expect(smartTypography('11/2')).toBe('11/2');
    expect(smartTypography('21/4')).toBe('21/4');
  });

  it('returns empty string unchanged', () => {
    expect(smartTypography('')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(smartTypography('Plain text here')).toBe('Plain text here');
  });
});

describe('parseInline', () => {
  it('returns plain text as single text segment', () => {
    expect(parseInline('Hello world')).toEqual([{ type: 'text', text: 'Hello world' }]);
  });

  it('parses bold markdown', () => {
    const result = parseInline('some **bold** text');
    expect(result).toEqual([
      { type: 'text', text: 'some ' },
      { type: 'bold', text: 'bold' },
      { type: 'text', text: ' text' },
    ]);
  });

  it('parses italic markdown', () => {
    const result = parseInline('some *italic* text');
    expect(result).toEqual([
      { type: 'text', text: 'some ' },
      { type: 'italic', text: 'italic' },
      { type: 'text', text: ' text' },
    ]);
  });

  it('parses link markdown', () => {
    const result = parseInline('click [here](http://example.com)');
    expect(result).toEqual([
      { type: 'text', text: 'click ' },
      { type: 'link', text: 'here', url: 'http://example.com' },
    ]);
  });

  it('parses multiple bold segments in one line', () => {
    const result = parseInline('**a** and **b**');
    expect(result).toEqual([
      { type: 'bold', text: 'a' },
      { type: 'text', text: ' and ' },
      { type: 'bold', text: 'b' },
    ]);
  });

  it('parses nested italic inside bold', () => {
    const result = parseInline('**bold *italic* bold**');
    expect(result).toEqual([
      { type: 'bold', text: 'bold ' },
      { type: 'boldItalic', text: 'italic' },
      { type: 'bold', text: ' bold' },
    ]);
  });

  it('strips unmatched bold markers from text', () => {
    // Unbalanced `**` (most often from a writer's bold spanning a sentence
    // boundary, since we parse per-sentence) used to leak literal asterisks
    // into the rendered text. We scrub stray `**` / `__` from text segments.
    expect(parseInline('**unclosed bold')).toEqual([{ type: 'text', text: 'unclosed bold' }]);
    expect(parseInline('trailing **')).toEqual([{ type: 'text', text: 'trailing ' }]);
    expect(parseInline('__double underscore__ orphan __')).toEqual([
      { type: 'text', text: 'double underscore orphan ' },
    ]);
  });

  it('strips stray single asterisks from text', () => {
    // LLM-emitted bullet lists, single-`*` footnote markers, and italic
    // spans split across our per-sentence parse all leave orphan single
    // `*` characters that used to render literally — most visibly in
    // ContextSheet briefs.
    expect(parseInline('Lorem * ipsum')).toEqual([{ type: 'text', text: 'Lorem  ipsum' }]);
    expect(parseInline('* item one')).toEqual([{ type: 'text', text: ' item one' }]);
    // Stray `*` after a balanced italic pair leaks through the post-match slice.
    const pairThenStray = parseInline('*one* and *two');
    expect(pairThenStray).toEqual([
      { type: 'italic', text: 'one' },
      { type: 'text', text: ' and two' },
    ]);
    // Stray single underscore is left alone — file paths and identifiers
    // legitimately contain it, and stripping would corrupt them.
    expect(parseInline('see foo_bar.ts')).toEqual([{ type: 'text', text: 'see foo_bar.ts' }]);
  });

  it('returns fallback segment for empty string', () => {
    const result = parseInline('');
    expect(result).toEqual([{ type: 'text', text: '' }]);
  });

  it('applies smartTypography to segment text', () => {
    const result = parseInline('**"Hello"**');
    expect(result[0]!.type).toBe('bold');
    // Straight quotes inside bold should become curly
    expect(result[0]!.text).toBe('\u201cHello\u201d');
  });

  it('applies smartTypography to plain text segments', () => {
    const result = parseInline('He said, "hello"');
    expect(result[0]!.text).toContain('\u201c');
    expect(result[0]!.text).toContain('\u201d');
  });

  it('parses country-scheme links as link segments with the url intact', () => {
    // Country links ride the ordinary link syntax; the scheme is intercepted
    // downstream in ArticlePage's openLink wrapper.
    const country = parseInline('tap [Japan](country:JP) now');
    expect(country[1]).toEqual({ type: 'link', text: 'Japan', url: 'country:JP' });
    expect(country[1]!.url!.startsWith(COUNTRY_URL_SCHEME)).toBe(true);
  });
  // The feed's first cycle of 2026-09-19 printed `China‘s` in a story card:
  // the text after a link is its own run, and a quote at the start of a run
  // was read as the start of a line.
  it('reads a quote straight after a link as an apostrophe', () => {
    const segs = parseInline("It is [China](country:CN)'s first visit");
    expect(segs.map((s) => s.text).join('')).toBe('It is China\u2019s first visit');
  });

  it('closes a quote straight after emphasis, and still opens one after a bracket', () => {
    expect(parseInline('*"Never"* again').map((s) => s.text)).toEqual([
      '\u201cNever\u201d',
      ' again',
    ]);
    expect(
      parseInline('He said *so*" twice')
        .map((s) => s.text)
        .join(''),
    ).toBe('He said so\u201d twice');
    expect(
      parseInline('(*"quoted"*)')
        .map((s) => s.text)
        .join(''),
    ).toBe('(\u201cquoted\u201d)');
  });
});
