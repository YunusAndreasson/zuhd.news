import { parseArticleBlocks } from '../lib/validate';

describe('parseArticleBlocks', () => {
  it('returns empty array for non-array input', () => {
    expect(parseArticleBlocks(undefined)).toEqual([]);
    expect(parseArticleBlocks(null)).toEqual([]);
    expect(parseArticleBlocks('nope')).toEqual([]);
    expect(parseArticleBlocks({})).toEqual([]);
  });

  it('parses a well-formed prose block', () => {
    expect(parseArticleBlocks([{ type: 'prose', text: 'Hello.' }])).toEqual([
      { type: 'prose', text: 'Hello.' },
    ]);
  });

  it('parses a compare block and drops malformed rows', () => {
    const out = parseArticleBlocks([
      {
        type: 'compare',
        rows: [
          { label: 'UAE', value: 'RSF', tone: 'unfavorable', cc: 'AE' },
          { label: 'Egypt' }, // bad — dropped
          { label: 'Turkey', value: 'SAF' },
        ],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: 'compare',
      rows: [
        { label: 'UAE', value: 'RSF' },
        { label: 'Turkey', value: 'SAF' },
      ],
    });
  });

  it('drops compare block with zero valid rows', () => {
    expect(
      parseArticleBlocks([{ type: 'compare', rows: [{ label: 'broken' }] }]),
    ).toEqual([]);
  });

  it('parses a trend block with minimum 2 values', () => {
    const out = parseArticleBlocks([
      { type: 'trend', values: [1, 2, 3, 4], label: 'growth', highlight: 'last' },
    ]);
    expect(out[0]).toMatchObject({ type: 'trend', values: [1, 2, 3, 4], highlight: 'last' });
  });

  it('drops trend block with <2 values or non-numeric values', () => {
    expect(parseArticleBlocks([{ type: 'trend', values: [1], label: 'x' }])).toEqual([]);
    expect(
      parseArticleBlocks([{ type: 'trend', values: [1, 'x'], label: 'x' }]),
    ).toEqual([]);
  });

  it('parses a locations block', () => {
    const out = parseArticleBlocks([
      { type: 'locations', codes: ['PK', 'BH'], label: 'region' },
    ]);
    expect(out[0]).toMatchObject({ type: 'locations', codes: ['PK', 'BH'], label: 'region' });
  });

  it('drops locations block with empty codes', () => {
    expect(parseArticleBlocks([{ type: 'locations', codes: [] }])).toEqual([]);
  });

  it('parses a quote block with speaker and year', () => {
    const out = parseArticleBlocks([
      { type: 'quote', text: 'We will bury you.', speaker: 'Khrushchev', year: '1956' },
    ]);
    expect(out).toEqual([
      { type: 'quote', text: 'We will bury you.', speaker: 'Khrushchev', year: '1956' },
    ]);
  });

  it('parses a quote block with just text', () => {
    const out = parseArticleBlocks([{ type: 'quote', text: 'History is long.' }]);
    expect(out).toEqual([{ type: 'quote', text: 'History is long.' }]);
  });

  it('drops quote block with empty text', () => {
    expect(parseArticleBlocks([{ type: 'quote', text: '' }])).toEqual([]);
  });

  it('parses an actors block and drops malformed people', () => {
    const out = parseArticleBlocks([
      {
        type: 'actors',
        people: [
          { name: 'Gorbachev', role: 'Soviet GenSec', years: '1985–91', cc: 'RU' },
          { name: 'Missing role' }, // dropped
          { name: 'Reagan', role: 'US President' },
        ],
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: 'actors',
      people: [
        { name: 'Gorbachev', role: 'Soviet GenSec' },
        { name: 'Reagan', role: 'US President' },
      ],
    });
  });

  it('drops actors block with no valid people', () => {
    expect(
      parseArticleBlocks([{ type: 'actors', people: [{ name: 'no role' }] }]),
    ).toEqual([]);
  });

  it('parses trend annotations pinned to valid indices', () => {
    const out = parseArticleBlocks([
      {
        type: 'trend',
        values: [10, 20, 30, 40],
        label: 'growth',
        annotations: [
          { atIndex: 0, label: 'start' },
          { atIndex: 3, label: 'end' },
        ],
      },
    ]);
    expect(out[0]).toMatchObject({
      type: 'trend',
      annotations: [
        { atIndex: 0, label: 'start' },
        { atIndex: 3, label: 'end' },
      ],
    });
  });

  it('drops trend annotations out of range or malformed', () => {
    const out = parseArticleBlocks([
      {
        type: 'trend',
        values: [1, 2],
        label: 'x',
        annotations: [
          { atIndex: 5, label: 'far' }, // out of range — dropped
          { atIndex: 0, label: '' }, // empty label — dropped
          { atIndex: 1.5, label: 'float' }, // non-integer — dropped
          { atIndex: 1, label: 'ok' }, // valid
        ],
      },
    ]);
    expect(out[0]).toMatchObject({
      type: 'trend',
      annotations: [{ atIndex: 1, label: 'ok' }],
    });
  });

  it('parses compare rows with numeric weight', () => {
    const out = parseArticleBlocks([
      {
        type: 'compare',
        rows: [
          { label: 'A', value: '1', weight: 10 },
          { label: 'B', value: '2', weight: 20 },
        ],
      },
    ]);
    expect(out[0]).toMatchObject({
      type: 'compare',
      rows: [
        { label: 'A', value: '1', weight: 10 },
        { label: 'B', value: '2', weight: 20 },
      ],
    });
  });

  it('drops compare rows with non-finite weight', () => {
    const out = parseArticleBlocks([
      {
        type: 'compare',
        rows: [
          { label: 'A', value: '1', weight: Number.NaN },
          { label: 'B', value: '2', weight: 5 },
        ],
      },
    ]);
    expect(out[0]).toMatchObject({
      type: 'compare',
      rows: [{ label: 'B', value: '2', weight: 5 }],
    });
  });

  it('parses block source index on every variant', () => {
    const out = parseArticleBlocks([
      { type: 'prose', text: 'x', source: 0 },
      { type: 'quote', text: 'x', source: 1 },
      { type: 'actors', people: [{ name: 'A', role: 'x' }], source: 2 },
      { type: 'compare', rows: [{ label: 'A', value: '1' }], source: 3 },
      { type: 'trend', values: [1, 2], label: 'x', source: 4 },
      { type: 'locations', codes: ['US'], source: 5 },
    ]);
    expect(out.map((b) => b.source)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('ignores non-integer or negative source indices', () => {
    const out = parseArticleBlocks([
      { type: 'prose', text: 'a', source: -1 },
      { type: 'prose', text: 'b', source: 1.5 },
      { type: 'prose', text: 'c', source: 'zero' },
    ]);
    expect(out.every((b) => b.source === undefined)).toBe(true);
  });

  it('drops unknown block types without throwing', () => {
    const out = parseArticleBlocks([
      { type: 'prose', text: 'a' },
      { type: 'futuregizmo', payload: 123 },
      { type: 'prose', text: 'b' },
    ]);
    expect(out).toEqual([
      { type: 'prose', text: 'a' },
      { type: 'prose', text: 'b' },
    ]);
  });

  it('ignores non-object entries', () => {
    expect(parseArticleBlocks([null, 'string', 42, { type: 'prose', text: 'ok' }])).toEqual([
      { type: 'prose', text: 'ok' },
    ]);
  });
});
