import { buildSearchIndex, fold, plainText, type SearchDoc } from '../lib/search';

function doc(
  id: string,
  title: string,
  time: number,
  body: string[] = [],
  place = '',
  topics: string[] = [],
): SearchDoc<string> {
  return { item: id, time, title, place, topics, body: body.map(plainText) };
}

const ids = (hits: { item: string }[]) => hits.map((h) => h.item);

describe('plainText', () => {
  it('keeps the words a reader sees and drops what a link points at', () => {
    expect(plainText("[Iran](country:IR)'s exports of [Brent](entity:brent) rose.")).toBe(
      "Iran's exports of Brent rose.",
    );
    expect(plainText('A **firm** and *quiet* line')).toBe('A firm and quiet line');
  });
});

describe('fold', () => {
  it('is what a keyboard types: no accents, straight quotes, lowercase', () => {
    expect(fold('São Paulo’s Türkiye')).toBe("sao paulo's turkiye");
  });
});

describe('search', () => {
  const docs = [
    doc('peru', 'Peru Grows Despite Turmoil', 30, ['Lima — Peru has had 9 presidents.'], 'Lima'),
    doc('iea', 'IEA Releases Oil Reserves', 20, ['Istanbul — The agency will release fuel.']),
    doc('gulf', 'Gulf Crude Exports Rebound', 10, [
      'Yanbu — Exports rebounded.',
      'Tankers carried more oil through [Saudi Arabia](country:SA) than a year ago.',
    ]),
  ];
  const { search } = buildSearchIndex(docs);

  it('matches a term where a word starts, never inside one', () => {
    // `Turmoil` ends in the query: it was the first result.
    expect(ids(search('oil'))).toEqual(['iea', 'gulf']);
    expect(ids(search('turm'))).toEqual(['peru']);
  });

  it('puts a story with the term in its title over one that mentions it', () => {
    // `gulf` is older and only says it in its second sentence.
    const { search: s } = buildSearchIndex([
      doc('mention', 'Tankers Idle', 99, ['Port — Crews wait.', 'No oil moved.']),
      doc('title', 'Oil Falls', 1),
    ]);
    expect(ids(s('oil'))).toEqual(['title', 'mention']);
  });

  it('is newest first within a rank', () => {
    const { search: s } = buildSearchIndex([doc('old', 'Oil Falls', 1), doc('new', 'Oil Up', 2)]);
    expect(ids(s('oil'))).toEqual(['new', 'old']);
  });

  it('needs every term, in any order, anywhere in the story', () => {
    expect(ids(search('reserves iea'))).toEqual(['iea']);
    expect(ids(search('oil saudi'))).toEqual(['gulf']);
    expect(ids(search('oil peru'))).toEqual([]);
  });

  it('does not search what a link points at', () => {
    expect(search('country')).toEqual([]);
    expect(search('sa')).toHaveLength(1); // `Saudi`, the word
  });

  it('finds a place, and reads accents as their letters', () => {
    expect(ids(search('lima'))).toEqual(['peru']);
    const { search: s } = buildSearchIndex([doc('tr', 'Vote Nears', 1, [], 'São Paulo')]);
    expect(ids(s('sao'))).toEqual(['tr']);
  });

  it('says why a story is there when its title does not', () => {
    const [iea, gulf] = search('oil');
    expect(iea?.note).toBeUndefined();
    expect(gulf?.note).toEqual({
      before: 'Tankers carried more ',
      match: 'oil',
      after: ' through Saudi Arabia than a year ago.',
    });
  });

  it('cuts a long sentence at word breaks around the match', () => {
    const long =
      'The ministry said on Tuesday that production at the northern fields had fallen for a ninth month while oilfield crews waited for parts held at the border since the spring.';
    const { search: s } = buildSearchIndex([doc('long', 'Output Falls', 1, [long])]);
    const note = s('oil')[0]?.note;
    expect(note?.match).toBe('oilfield');
    expect(note?.before.startsWith('…')).toBe(true);
    expect(note?.before.endsWith(' ')).toBe(true);
    expect(note?.after.endsWith('…')).toBe(true);
    expect(`${note?.before}${note?.match}${note?.after}`.length).toBeLessThan(long.length);
  });

  it('names the topic when only a topic matched', () => {
    const { search: s } = buildSearchIndex([
      doc('ai', 'Apple Restricts Mac Disk Access', 1, ['Cupertino — Agents lose a grant.'], '', [
        'Artificial intelligence',
      ]),
    ]);
    expect(s('artificial')[0]?.note).toEqual({
      before: 'topic · ',
      match: 'Artificial intelligence',
      after: '',
    });
  });

  it('returns nothing for an empty query', () => {
    expect(search('')).toEqual([]);
    expect(search('   ')).toEqual([]);
  });
});
