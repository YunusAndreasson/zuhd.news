/**
 * The tap chooser's title: how many marks are under the finger, and what they
 * are when they are one kind — `6 exchanges here`, `3 conflict events here`.
 * It was `multiple items here` whatever it held, a developer's word for a list
 * that the rows then had to explain. Mixed marks are `marks`, the map key's
 * own word for everything on the globe.
 */
const NOUNS: Readonly<Record<string, readonly [string, string]>> = {
  market: ['exchange', 'exchanges'],
  chokepoint: ['strait', 'straits'],
  gdacs: ['hazard', 'hazards'],
  conflict: ['conflict event', 'conflict events'],
  famine: ['hunger area', 'hunger areas'],
  genocide: ['genocide determination', 'genocide determinations'],
};

export function chooserTitle(kinds: readonly string[]): string {
  const n = kinds.length;
  const first = kinds[0];
  const same = first !== undefined && kinds.every((k) => k === first);
  const noun = same ? NOUNS[first] : undefined;
  const [one, many] = noun ?? ['mark', 'marks'];
  return `${n} ${n === 1 ? one : many} here`;
}
