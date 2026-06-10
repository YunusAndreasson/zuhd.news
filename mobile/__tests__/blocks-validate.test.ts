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
    expect(parseArticleBlocks([{ type: 'compare', rows: [{ label: 'broken' }] }])).toEqual([]);
  });

  it('parses a trend block with minimum 2 values', () => {
    const out = parseArticleBlocks([
      { type: 'trend', values: [1, 2, 3, 4], label: 'growth', highlight: 'last' },
    ]);
    expect(out[0]).toMatchObject({ type: 'trend', values: [1, 2, 3, 4], highlight: 'last' });
  });

  it('drops trend block with <2 values or non-numeric values', () => {
    expect(parseArticleBlocks([{ type: 'trend', values: [1], label: 'x' }])).toEqual([]);
    expect(parseArticleBlocks([{ type: 'trend', values: [1, 'x'], label: 'x' }])).toEqual([]);
  });

  it('parses a locations block', () => {
    const out = parseArticleBlocks([{ type: 'locations', codes: ['PK', 'BH'], label: 'region' }]);
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
    expect(parseArticleBlocks([{ type: 'actors', people: [{ name: 'no role' }] }])).toEqual([]);
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

  it('parses a well-formed quiz block', () => {
    const out = parseArticleBlocks([
      {
        type: 'quiz',
        question: 'Which country hosts the largest Afghan diaspora?',
        options: ['Iran', 'Pakistan', 'Turkey'],
        correct: 0,
        explanation: 'Iran has hosted ~3.8m vs Pakistan ~1.7m.',
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      type: 'quiz',
      question: 'Which country hosts the largest Afghan diaspora?',
      options: ['Iran', 'Pakistan', 'Turkey'],
      correct: 0,
    });
  });

  it('parses a multi-series trend block (series instead of values)', () => {
    const out = parseArticleBlocks([
      {
        type: 'trend',
        series: [
          { values: [1, 2, 3], label: 'exports' },
          { values: [3, 2, 1], label: 'imports', highlight: 'last' },
        ],
        label: 'trade',
        periods: ['2020', '2021', '2022'],
      },
    ]);
    expect(out[0]).toMatchObject({
      type: 'trend',
      series: [
        { values: [1, 2, 3], label: 'exports' },
        { values: [3, 2, 1], label: 'imports', highlight: 'last' },
      ],
      periods: ['2020', '2021', '2022'],
    });
  });

  it('caps trend series at 3 and drops series-only blocks with a malformed entry', () => {
    const s = (label: string) => ({ values: [1, 2], label });
    const capped = parseArticleBlocks([
      { type: 'trend', series: [s('a'), s('b'), s('c'), s('d')], label: 'x' },
    ]);
    expect(capped[0]).toMatchObject({ type: 'trend' });
    expect((capped[0] as { series: unknown[] }).series).toHaveLength(3);
    expect(
      parseArticleBlocks([{ type: 'trend', series: [s('a'), { values: [1] }], label: 'x' }]),
    ).toEqual([]);
  });

  it('parses trend scale and band, downgrading log when values are not positive', () => {
    const out = parseArticleBlocks([
      {
        type: 'trend',
        values: [1, 2, 3],
        label: 'x',
        scale: 'log',
        band: { low: [0, 1, 2], high: [2, 3, 4], label: 'range' },
      },
      { type: 'trend', values: [0, 2, 3], label: 'y', scale: 'log' },
      { type: 'trend', values: [1, 2], label: 'z', band: { low: [0], high: [9] } }, // length mismatch
    ]);
    expect(out[0]).toMatchObject({
      scale: 'log',
      band: { low: [0, 1, 2], high: [2, 3, 4], label: 'range' },
    });
    expect(out[1]).not.toHaveProperty('scale');
    expect(out[2]).not.toHaveProperty('band');
  });

  it('parses locations markers and choropleth values scoped to codes', () => {
    const out = parseArticleBlocks([
      {
        type: 'locations',
        codes: ['PK', 'IR'],
        markers: [
          { lat: 24.86, lng: 67.0, label: 'Karachi' },
          { lat: 999, lng: 0, label: 'bad lat' }, // dropped
        ],
        values: [
          { cc: 'PK', value: 3.1 },
          { cc: 'IR', value: 1.7 },
          { cc: 'US', value: 9 }, // not in codes — dropped
        ],
        valueLabel: 'refugees per capita',
      },
    ]);
    expect(out[0]).toMatchObject({
      type: 'locations',
      markers: [{ lat: 24.86, lng: 67.0, label: 'Karachi' }],
      values: [
        { cc: 'PK', value: 3.1 },
        { cc: 'IR', value: 1.7 },
      ],
      valueLabel: 'refugees per capita',
    });
  });

  it('drops choropleth values when fewer than 2 remain valid', () => {
    const out = parseArticleBlocks([
      { type: 'locations', codes: ['PK'], values: [{ cc: 'PK', value: 1 }], valueLabel: 'x' },
    ]);
    expect(out[0]).not.toHaveProperty('values');
    expect(out[0]).not.toHaveProperty('valueLabel');
  });

  it('parses compare rows with segments and drops rows with malformed segments', () => {
    const out = parseArticleBlocks([
      {
        type: 'compare',
        rows: [
          {
            label: 'Energy',
            value: 'mix',
            segments: [{ value: 60 }, { value: 40, tone: 'favorable' }],
          },
          { label: 'Broken', value: 'mix', segments: [{ value: 'lots' }] }, // dropped
        ],
      },
    ]);
    expect(out[0]).toMatchObject({
      type: 'compare',
      rows: [{ label: 'Energy', segments: [{ value: 60 }, { value: 40, tone: 'favorable' }] }],
    });
    expect((out[0] as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it('parses a timeline block with events and spans', () => {
    const out = parseArticleBlocks([
      {
        type: 'timeline',
        events: [
          { year: '1979', label: 'Soviet invasion', emphasis: 'start' },
          { year: 'nope', label: 'bad year' }, // dropped
        ],
        spans: [{ from: '1979', to: '1989', label: 'Occupation', tone: 'unfavorable' }],
        label: 'Afghanistan',
      },
    ]);
    expect(out[0]).toEqual({
      type: 'timeline',
      events: [{ year: '1979', label: 'Soviet invasion', emphasis: 'start' }],
      spans: [{ from: '1979', to: '1989', label: 'Occupation', tone: 'unfavorable' }],
      label: 'Afghanistan',
    });
  });

  it('drops timeline with no valid events or spans', () => {
    expect(parseArticleBlocks([{ type: 'timeline', events: [{ year: 'x', label: '' }] }])).toEqual(
      [],
    );
  });

  it('parses a rank block when subject is among ≥5 peers', () => {
    const peers = [
      { cc: 'PK', value: 2 },
      { cc: 'IR', value: 3 },
      { cc: 'TR', value: 5 },
      { cc: 'EG', value: 1 },
      { cc: 'ID', value: 4 },
    ];
    const out = parseArticleBlocks([
      { type: 'rank', metric: 'GDP growth', unit: '%', subjectCc: 'pk', peers },
    ]);
    expect(out[0]).toMatchObject({ type: 'rank', metric: 'GDP growth', subjectCc: 'pk', peers });
  });

  it('drops rank blocks missing subject, subject-not-in-peers, or <5 peers', () => {
    const peers = [
      { cc: 'PK', value: 2 },
      { cc: 'IR', value: 3 },
      { cc: 'TR', value: 5 },
      { cc: 'EG', value: 1 },
      { cc: 'ID', value: 4 },
    ];
    expect(parseArticleBlocks([{ type: 'rank', metric: 'm', peers }])).toEqual([]);
    expect(parseArticleBlocks([{ type: 'rank', metric: 'm', subjectCc: 'US', peers }])).toEqual([]);
    expect(
      parseArticleBlocks([
        { type: 'rank', metric: 'm', subjectCc: 'PK', peers: peers.slice(0, 4) },
      ]),
    ).toEqual([]);
  });

  it('parses a sankey block and drops links to unknown or self nodes', () => {
    const out = parseArticleBlocks([
      {
        type: 'sankey',
        nodes: [
          { id: 'a', label: 'Origin' },
          { id: 'b', label: 'Host' },
        ],
        links: [
          { source: 'a', target: 'b', value: 10 },
          { source: 'a', target: 'a', value: 1 }, // self — dropped
          { source: 'a', target: 'zz', value: 1 }, // unknown — dropped
          { source: 'a', target: 'b', value: 0 }, // non-positive — dropped
        ],
      },
    ]);
    expect(out[0]).toEqual({
      type: 'sankey',
      nodes: [
        { id: 'a', label: 'Origin' },
        { id: 'b', label: 'Host' },
      ],
      links: [{ source: 'a', target: 'b', value: 10 }],
    });
  });

  it('drops sankey with <2 nodes or no valid links', () => {
    expect(
      parseArticleBlocks([{ type: 'sankey', nodes: [{ id: 'a', label: 'A' }], links: [] }]),
    ).toEqual([]);
    expect(
      parseArticleBlocks([
        {
          type: 'sankey',
          nodes: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
          links: [{ source: 'a', target: 'b', value: -1 }],
        },
      ]),
    ).toEqual([]);
  });

  it('parses a treemap block, dropping non-positive items and requiring ≥2', () => {
    const out = parseArticleBlocks([
      {
        type: 'treemap',
        items: [
          { label: 'Defense', value: 40, tone: 'unfavorable' },
          { label: 'Health', value: 25 },
          { label: 'Ghost', value: 0 }, // dropped
        ],
        label: 'Budget',
      },
      { type: 'treemap', items: [{ label: 'Only', value: 1 }] }, // <2 valid — dropped
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      type: 'treemap',
      items: [
        { label: 'Defense', value: 40, tone: 'unfavorable' },
        { label: 'Health', value: 25 },
      ],
      label: 'Budget',
    });
  });

  it('parses block source index on the chart variants too', () => {
    const out = parseArticleBlocks([
      { type: 'timeline', events: [{ year: '2001', label: 'x' }], source: 0 },
      {
        type: 'rank',
        metric: 'm',
        subjectLabel: 'A',
        peers: [
          { label: 'A', value: 1 },
          { label: 'B', value: 2 },
          { label: 'C', value: 3 },
          { label: 'D', value: 4 },
          { label: 'E', value: 5 },
        ],
        source: 1,
      },
      {
        type: 'sankey',
        nodes: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        links: [{ source: 'a', target: 'b', value: 1 }],
        source: 2,
      },
      {
        type: 'treemap',
        items: [
          { label: 'A', value: 1 },
          { label: 'B', value: 2 },
        ],
        source: 3,
      },
    ]);
    expect(out.map((b) => b.source)).toEqual([0, 1, 2, 3]);
  });

  it('drops malformed quiz blocks', () => {
    const out = parseArticleBlocks([
      { type: 'quiz', question: '', options: ['a', 'b'], correct: 0 }, // empty question
      { type: 'quiz', question: 'Q?', options: ['solo'], correct: 0 }, // <2 options
      { type: 'quiz', question: 'Q?', options: ['a', 'b'], correct: 5 }, // out-of-range correct
      { type: 'quiz', question: 'Q?', options: ['a', 'b'], correct: 1.5 }, // non-integer correct
      { type: 'quiz', question: 'Q?', options: ['a', 'b'] }, // missing correct
    ]);
    expect(out).toEqual([]);
  });
});
