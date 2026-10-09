import { sameItems } from './arrays';
import { createListeners } from './store-plumbing';

/** The band of the canvas the chrome leaves visible. */
interface Band {
  width: number;
  top: number;
  bottom: number;
}
/** Half a market target, the room the globe keeps between its own targets and
 *  the band's edge (`layoutMarketClusters`). A strait or a capital nearer the
 *  edge than that is cut by it: on the canvas, and not where a reader looks. */
const EDGE = 24;
const inBand = (p: { x: number; y: number }, band: Band) =>
  p.x >= EDGE && p.x <= band.width - EDGE && p.y >= band.top + EDGE && p.y <= band.bottom - EDGE;

/** A market target as the globe's frame holds it: one exchange, or several
 *  under a count. */
interface MarketMark {
  ids: readonly string[];
  labelY: number | null;
}
interface Point {
  id: string;
  x: number;
  y: number;
}
interface StraitMark extends Point {
  labelY: number | null;
}

/**
 * The gauges on the globe, as strip ids, by whether their week is printed.
 *
 * `named`: a lone exchange or a strait with its label down. The strip leaves
 * these to the globe, so no number is printed twice.
 * `unnamed`: every member of a cluster (a count carries no move), and a lone
 * exchange or a strait whose name found no room. The strip shows these.
 *
 * An unnamed one counts only where its own place is in view: a cluster's
 * target is set on the ground, but a member whose city is at the band's edge
 * is not where the reader is looking.
 */
export function marksInView(
  markets: readonly MarketMark[],
  cities: readonly Point[],
  straits: readonly StraitMark[],
  band: Band,
): { named: string[]; unnamed: string[] } {
  const named: string[] = [];
  const unnamed: string[] = [];
  const at = new Map(cities.map((city) => [city.id, city]));
  for (const m of markets) {
    const lone = m.ids.length === 1 ? m.ids[0] : undefined;
    if (lone !== undefined && m.labelY !== null) {
      named.push(lone);
      continue;
    }
    for (const id of m.ids) {
      const city = at.get(id);
      if (city && inBand(city, band)) unnamed.push(id);
    }
  }
  for (const cp of straits) {
    if (cp.labelY !== null) named.push(`strait-${cp.id}`);
    else if (inBand(cp, band)) unnamed.push(`strait-${cp.id}`);
  }
  // Code-point order: each list is compared with the last one published.
  return { named: named.sort(), unnamed: unnamed.sort() };
}

/**
 * The countries whose capital is in view, as ISO-2. A country is in view by
 * its capital, not its land: the strip reads this for what belongs to a
 * country and has no place of its own (its currency), and Russia's land is on
 * screen from Europe to Japan.
 */
export function capitalsInView(
  capitals: readonly { iso2: string; x: number; y: number }[],
  band: Band,
): string[] {
  const countries: string[] = [];
  for (const capital of capitals) {
    if (inBand(capital, band)) countries.push(capital.iso2);
  }
  return countries.sort();
}

/** What the resting globe shows that the strip reads. */
export interface RestingView {
  named: readonly string[];
  unnamed: readonly string[];
  countries: readonly string[];
}

const listeners = createListeners();
let current: RestingView = { named: [], unnamed: [], countries: [] };
let resting = false;

/** From a frame the globe drew in motion: what it last published is no longer
 *  what is on screen. */
export function markGlobeMoving(): void {
  resting = false;
}

const kept = (next: readonly string[], last: readonly string[]) =>
  sameItems(next, last) ? last : next;

/** From the globe's resting frame. Listeners hear a view that changed, and the
 *  globe coming to rest on the same one; none of them may set React state:
 *  this runs inside the frame. A list that did not change keeps its identity. */
export function publishRestingView(next: RestingView): void {
  const named = kept(next.named, current.named);
  const unnamed = kept(next.unnamed, current.unnamed);
  const countries = kept(next.countries, current.countries);
  const changed =
    named !== current.named || unnamed !== current.unnamed || countries !== current.countries;
  const cameToRest = !resting;
  resting = true;
  if (changed) current = { named, unnamed, countries };
  if (changed || cameToRest) listeners.emit();
}
export const getRestingView = (): RestingView => current;
/** Whether the last frame the globe drew was a resting one. */
export const isGlobeResting = (): boolean => resting;
export const subscribeRestingView = listeners.subscribe;
