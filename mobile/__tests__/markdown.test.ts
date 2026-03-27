import { parseInline, smartTypography } from '../lib/markdown';

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
    // Order matters: --- must be replaced before -- to avoid partial matches
    expect(smartTypography('a---b--c')).toBe('a\u2014b\u2013c');
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

  it('passes through unmatched bold markers as text', () => {
    const result = parseInline('**unclosed bold');
    expect(result).toEqual([{ type: 'text', text: '**unclosed bold' }]);
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
});
