import { GENOCIDE_MARKED, GENOCIDE_SITUATIONS } from '@shared/genocide';
import { isGenocideSnapshot } from '../lib/validate';

// The bar for this layer is stated in `shared/genocide.ts` and enforced in two
// places: the `GENOCIDE_MARKED` filter upstream, and `isGenocideSnapshot` at
// the app's edge. Both are pinned here, because the failure mode is a mark
// appearing for something no UN body determined — which no amount of visual
// QA would catch, since a wrong ring looks exactly like a right one.

const gaza = {
  id: 'gaza',
  name: 'Gaza',
  iso2: 'PS',
  profile: 'Palestine',
  lat: 31.42,
  lng: 34.36,
  finding: 'determination',
  body: 'UN Independent International Commission of Inquiry on the Occupied Palestinian Territory',
  document: 'Report to the Human Rights Council, A/HRC/60/CRP.3',
  date: '2025-09-16',
  summary: 'The Commission concluded that genocide has been and is being committed in Gaza.',
  url: 'https://www.ohchr.org/en/hr-bodies/hrc/co-israel/index',
  since: '2023-10',
};

describe('GENOCIDE_MARKED', () => {
  it('publishes only determinations, never risk warnings', () => {
    expect(GENOCIDE_MARKED.length).toBeGreaterThan(0);
    for (const s of GENOCIDE_MARKED) {
      expect(s.finding).toBe('determination');
    }
  });

  it('keeps the risk entries in the full record rather than deleting them', () => {
    // Promoting a warning must be a data edit, not research done twice — so
    // the record has to be strictly larger than what reaches the map.
    expect(GENOCIDE_SITUATIONS.length).toBeGreaterThanOrEqual(GENOCIDE_MARKED.length);
    expect(GENOCIDE_SITUATIONS.some((s) => s.finding === 'risk')).toBe(true);
  });

  it('carries a full citation on every marked situation', () => {
    for (const s of GENOCIDE_MARKED) {
      expect(s.body.length).toBeGreaterThan(0);
      expect(s.document.length).toBeGreaterThan(0);
      expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.url).toMatch(/^https?:\/\//);
      expect(Number.isFinite(s.lat)).toBe(true);
      expect(Number.isFinite(s.lng)).toBe(true);
    }
  });
});

describe('isGenocideSnapshot', () => {
  it('accepts the published shape', () => {
    expect(isGenocideSnapshot({ situations: [gaza] })).toBe(true);
    expect(isGenocideSnapshot({ situations: GENOCIDE_MARKED })).toBe(true);
  });

  it('rejects a risk warning arriving on the marked endpoint', () => {
    expect(isGenocideSnapshot({ situations: [{ ...gaza, finding: 'risk' }] })).toBe(false);
  });

  it('rejects a situation missing any part of its citation', () => {
    for (const field of ['body', 'document', 'date', 'url', 'summary'] as const) {
      expect(isGenocideSnapshot({ situations: [{ ...gaza, [field]: '' }] })).toBe(false);
      const { [field]: _dropped, ...without } = gaza;
      expect(isGenocideSnapshot({ situations: [without] })).toBe(false);
    }
  });

  it('rejects a situation without a position to draw it at', () => {
    expect(isGenocideSnapshot({ situations: [{ ...gaza, lat: 'north' }] })).toBe(false);
    expect(isGenocideSnapshot({ situations: [{ ...gaza, lng: Number.NaN }] })).toBe(false);
  });

  it('rejects a malformed envelope', () => {
    expect(isGenocideSnapshot(null)).toBe(false);
    expect(isGenocideSnapshot({})).toBe(false);
    expect(isGenocideSnapshot({ situations: {} })).toBe(false);
  });

  // An empty list is structurally valid — it just means the app falls through
  // to `?? GENOCIDE_MARKED` in `useGenocide` and keeps the bundled record,
  // which is the intended behaviour and not an error.
  it('accepts an empty list', () => {
    expect(isGenocideSnapshot({ situations: [] })).toBe(true);
  });
});
