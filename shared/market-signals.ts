/** Additive endpoint; consumers may ignore it entirely on older deployments. */
export interface MarketSignal {
  id: string;
  eventId: string;
  revision: string;
  title: string;
  sourceLabel: string;
  asOf: string;
  pattern: {
    kind: 'sharp' | 'weekly' | 'monthly' | 'streak' | 'reversal' | 'divergence';
    sessions: number;
    changePct: number;
    direction: number;
    score: number;
    startDate: string;
    endDate: string;
    peerChangePct?: number;
    gapPct?: number;
  };
  series: { values: number[]; dates: string[] };
  facts: string;
  commentary: string;
  citations: { slug: string; title: string; date: string; url: string }[];
}
export interface MarketSignalsSnapshot {
  version: 1;
  generatedAt: string;
  signals: MarketSignal[];
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const date = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v));
export function isMarketSignalsSnapshot(v: unknown): v is MarketSignalsSnapshot {
  if (!object(v) || v.version !== 1 || typeof v.generatedAt !== 'string' ||
    !Number.isFinite(Date.parse(v.generatedAt)) || !Array.isArray(v.signals) || v.signals.length > 3) return false;
  const ids = new Set<string>();
  return v.signals.every((s) => {
    if (!object(s) || !['id','eventId','revision','title','sourceLabel','facts'].every((k) => typeof s[k] === 'string' && !!s[k]) ||
      typeof s.commentary !== 'string' || !date(s.asOf) || !object(s.pattern) || !object(s.series)) return false;
    const p = s.pattern, series = s.series;
    const dates = series.dates;
    if (!['sharp','weekly','monthly','streak','reversal','divergence'].includes(String(p.kind)) ||
      !Number.isInteger(p.sessions) || Number(p.sessions) < 1 || !Number.isFinite(p.changePct) ||
      ![-1, 1].includes(Number(p.direction)) || !Number.isFinite(p.score) ||
      !date(p.startDate) || !date(p.endDate) || p.startDate >= p.endDate || p.endDate !== s.asOf) return false;
    if (!Array.isArray(series.values) || !Array.isArray(series.dates) || series.values.length < 2 ||
      series.values.length !== series.dates.length || series.values.length > 1000 ||
      !series.values.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0) ||
      !Array.isArray(dates) || !dates.every((d, i) => date(d) && (i === 0 || d > dates[i - 1])) ||
      series.dates.at(-1) !== s.asOf) return false;
    if (!Array.isArray(s.citations) || s.citations.length > 3 ||
      !s.citations.every((c) => object(c) && typeof c.slug === 'string' && typeof c.title === 'string' &&
        date(c.date) && typeof c.url === 'string' && /^https:\/\/zuhd\.news\//.test(c.url))) return false;
    if (ids.has(String(s.id))) return false;
    ids.add(String(s.id));
    return true;
  });
}
