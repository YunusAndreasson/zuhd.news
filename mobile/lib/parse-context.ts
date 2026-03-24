export type BriefNode =
  | { type: 'heading'; text: string }
  | { type: 'entry'; year: string; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'verse'; text: string };

const HEADING_RE = /^[A-Z][A-Z\s,\u2013\-&']{2,}$/;
const YEAR_RE = /^(\d{4}(?:[–\-]\d{4})?)\s{2,}(.+)/;

export function parseContext(raw: string): BriefNode[] {
  const nodes: BriefNode[] = [];
  let inIslamic = false;

  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('CONTEXT:') || t === '---' || t === '\u2015') continue;

    if (HEADING_RE.test(t)) {
      inIslamic = t === 'ISLAMIC CONTEXT';
      nodes.push({ type: 'heading', text: t });
    } else if (inIslamic) {
      const clean = t.replace(/^>\s*/, '').replace(/^\*\*?(.*?)\*?\*?$/, '$1');
      nodes.push({ type: 'verse', text: clean });
    } else {
      const ym = t.match(YEAR_RE);
      if (ym) {
        nodes.push({ type: 'entry', year: ym[1]!, text: ym[2]! });
      } else {
        nodes.push({ type: 'paragraph', text: t });
      }
    }
  }
  return nodes;
}
