import type { ConflictEvent, GdacsAlert } from '@shared/types';
import type { ConflictWeek } from '../lib/conflict-week';
import {
  type HazardItem,
  hazardItems,
  hazardLayers,
  isListLabel,
  type MenuHazards,
  markDetail,
} from '../lib/menu-hazards';
import type { ThermalEvent } from '../lib/overlays';
import { countryTap, markTap } from '../lib/tap-result';

const hazards = (over: Partial<MenuHazards> = {}): MenuHazards => ({
  disasters: [],
  conflict: [],
  famine: [],
  genocide: [],
  fires: [],
  famineTotals: [],
  conflictWeek: null,
  ...over,
});

const alert = (eventid: string, alertlevel: GdacsAlert['alertlevel']) =>
  ({
    eventid,
    eventtype: 'EQ',
    alertlevel,
    name: `Quake ${eventid}`,
    country: '',
    severityText: '',
  }) as unknown as GdacsAlert;

const event = (id: string, country: string, fatalities: number, eventDate: string) =>
  ({
    id,
    country,
    fatalities,
    eventDate,
    subEvent: 'armed_clash',
    family: 'kinetic',
    location: `${country} town`,
  }) as unknown as ConflictEvent;

const week = (events: ConflictEvent[]): ConflictWeek =>
  ({ windowStart: '2026-08-24', windowEnd: '2026-08-30', events }) as ConflictWeek;

const labels = (items: HazardItem[]) => items.filter(isListLabel);
const rows = (items: HazardItem[]) => items.filter((item) => !isListLabel(item));

describe('hazardLayers', () => {
  it('lists only the layers with something in them', () => {
    expect(hazardLayers(hazards())).toEqual([]);
    const layers = hazardLayers(hazards({ disasters: [alert('1', 'Green')] }));
    expect(layers.map((l) => l.key)).toEqual(['disasters']);
    expect(layers[0]?.count).toBe(1);
  });

  it('counts the conflict week where it is held, and its line names the week’s dates', () => {
    const last = event('c', 'Sudan', 3, '2026-08-30');
    const layers = hazardLayers(
      hazards({
        conflict: [last],
        conflictWeek: week([event('a', 'Sudan', 10, '2026-08-25'), last]),
      }),
    );
    expect(layers[0]?.count).toBe(2);
    expect(layers[0]?.note).toContain('Aug 24–30');
    expect(layers[0]?.note).toContain('13 killed');
  });
});

describe('hazardItems', () => {
  it('heads the serious alerts and the minor ones apart, gravest first', () => {
    // The globe's order is gravest last, so they paint on top.
    const items = hazardItems(
      'disasters',
      hazards({ disasters: [alert('1', 'Green'), alert('2', 'Orange'), alert('3', 'Red')] }),
    );
    expect(items.map((item) => (isListLabel(item) ? item.label : item.primary))).toEqual([
      'red and orange alerts',
      'Quake 3',
      'Quake 2',
      'minor alerts',
      'Quake 1',
    ]);
  });

  it('heads each country of the conflict week by name, its toll set apart from the name', () => {
    const items = hazardItems(
      'conflict',
      hazards({
        conflictWeek: week([
          event('a', 'Sudan', 10, '2026-08-25'),
          event('b', 'Sudan', 2, '2026-08-26'),
          event('c', 'Yemen', 40, '2026-08-27'),
        ]),
      }),
    );
    // Deadliest country first.
    expect(labels(items).map((l) => l.label)).toEqual(['Yemen', 'Sudan']);
    expect(labels(items)[1]?.note).toBe('2 events · 12 killed');
    expect(rows(items)).toHaveLength(3);
  });

  it('strips what the page already says from a fire’s row', () => {
    const fires = [
      { id: 'f', frp: 120, near: 'Basra', lat: 0, lng: 0 },
    ] as unknown as ThermalEvent[];
    const [row] = hazardItems('fires', hazards({ fires }));
    expect(row && !isListLabel(row) ? row.secondary : '').toBe('120 MW');
  });
});

describe('markDetail', () => {
  it('opens the alert a row names', () => {
    const quake = alert('7', 'Red');
    expect(markDetail(markTap({ gdacsEventId: '7' }), hazards({ disasters: [quake] }))).toEqual({
      kind: 'alert',
      alert: quake,
    });
  });

  it('finds a conflict event in the week, which holds events the globe does not draw', () => {
    const earlier = event('a', 'Sudan', 10, '2026-08-25');
    const detail = markDetail(
      markTap({ conflictEventId: 'a' }),
      hazards({ conflict: [], conflictWeek: week([earlier]) }),
    );
    expect(detail).toEqual({ kind: 'conflict', event: earlier });
  });

  it('opens a country for a row that is a country and no mark', () => {
    expect(markDetail(countryTap('Sudan'), hazards())).toEqual({ kind: 'country', name: 'Sudan' });
  });

  it('opens nothing for a mark that has left its layer', () => {
    expect(markDetail(markTap({ gdacsEventId: '9' }), hazards())).toBeNull();
  });
});
