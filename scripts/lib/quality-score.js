#!/usr/bin/env node
// Score articles on objective quality metrics.
// Usage: node scripts/lib/quality-score.js <dir1> <dir2> ...
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Hedges & filler explicitly called out in the prompt's antipatterns block
const HEDGE_PATTERNS = [
  /\bmay\b/i, /\bcould\b/i, /\bpotentially\b/i, /\bis poised to\b/i,
  /\bcould reshape\b/i, /\bmay signal\b/i, /\braises questions about\b/i,
  /\bin a significant development\b/i, /\bit remains to be seen\b/i,
  /\bsituation remains fluid\b/i, /\bat press time\b/i,
  /\bgrowing risk\b/i, /\bmust now\b/i,
];

// Sentence-start word stop list — these are capitalized but not proper nouns
const STOPSTART = new Set([
  'The', 'A', 'An', 'But', 'And', 'Or', 'If', 'When', 'Where', 'While',
  'After', 'Before', 'During', 'In', 'On', 'At', 'For', 'With', 'By',
  'From', 'To', 'Of', 'As', 'It', 'This', 'That', 'These', 'Those',
  'Here', 'There', 'Now', 'Then', 'Today', 'Yesterday', 'Tomorrow',
  'He', 'She', 'They', 'We', 'I', 'You',
]);

function parseArticle(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n+([\s\S]*)$/);
  if (!m) return { title: '', body: raw.trim() };
  const fm = m[1];
  const body = m[2].trim();
  const tm = fm.match(/title:\s*"([^"]+)"/);
  return { title: tm ? tm[1] : '', body };
}

function tokenize(s) {
  return s.toLowerCase().match(/[a-z0-9']+/g) || [];
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter(x => B.has(x)).length;
  const uni = new Set([...A, ...B]).size;
  return uni === 0 ? 0 : inter / uni;
}

function score(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { title, body } = parseArticle(raw);
  const noDateline = body.replace(/^[^—]+—\s*/, '');
  // strip markdown link markup, keep visible text
  const visible = noDateline.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Sentence split
  const sentences = visible.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);

  // Specificity: digits/numbers + proper-noun-like tokens
  const digitsCount = (visible.match(/\d+/g) || []).length;
  // Proper noun heuristic: capitalized word not at sentence start
  let properNouns = 0;
  for (const sent of sentences) {
    const tokens = sent.match(/[A-Za-z][A-Za-z'-]+/g) || [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (i === 0) continue; // skip sentence start
      if (/^[A-Z]/.test(t) && !STOPSTART.has(t)) properNouns++;
    }
  }
  const specificity = digitsCount + properNouns;

  // Hedges
  let hedgeCount = 0;
  for (const pat of HEDGE_PATTERNS) {
    const m = visible.match(new RegExp(pat.source, 'gi'));
    if (m) hedgeCount += m.length;
  }

  // Title-echo: Jaccard of title vs sentence 1
  const s1 = sentences[0] || '';
  const echo = jaccard(tokenize(title), tokenize(s1));

  // Comparison detection: phrases that anchor a figure to a baseline/peer/range
  const COMPARISON_PATTERNS = [
    /\b\d[\d.,]*\s*(?:%|percent)\s+of\b/i,                     // "20% of"
    /\b\d[\d.,]*\s+(?:of|out of)\s+\d/i,                       // "5,000 of 35,000"
    /\bdown from\b/i, /\bup from\b/i, /\bfell from\b/i, /\brose from\b/i,
    /\bcompared (?:to|with)\b/i,
    /\bvs\.?\b/i, /\bversus\b/i,
    /\b(?:highest|lowest|biggest|smallest|first|worst|best|fastest|slowest)\s+(?:[a-z]+\s+){0,2}(?:since|in)\s+(?:\d|[a-z])/i,  // "highest since 2010", "lowest in years"
    /\bfrom \d[\d.,]*\s+to \d/i,                               // "from 10 to 20"
    /\bdoubled?\b/i, /\btripled?\b/i, /\bhalved?\b/i, /\bquadrupled?\b/i,
    /\b\d[\d.,]*x\s+(?:more|larger|smaller|higher|lower)\b/i,  // "3x more"
    /\bmore than\s+\d/i, /\bless than\s+\d/i,
    /\bbetween \d[\d.,]*\s+and \d/i,                           // "between 30 and 47"
    /\b\d[\d.,]*[%]\s+(?:above|below)\b/i,                     // "20% above"
    /\b(?:a third|two-thirds|two thirds|three-quarters|three quarters|half|a quarter)\s+of\b/i,  // "a third of"
    /\b(?:above|below|under|over|exceeds?|exceeded)\s+(?:pre-|prior|previous|baseline|projections?|estimates?|forecasts?|trend)/i,
    /\b(?:above|below|over|under)\s+(?:the\s+)?\d/i,           // "above 5%", "below 50"
    /\b(?:another|second|third|fourth)\s+record\b/i,           // "another record"
    /\bsecond[- ]worst\b/i, /\bsecond[- ]best\b/i,
    /\b(?:topped|exceeded|broke|hit)\s+(?:the\s+)?\$?\d/i,     // "topped $120"
    /\bsharing\s+\d[\d.,]*[%]/i,                               // "sharing 20%"
    /\baccount(?:s|ing|ed)?\s+for\s+\d[\d.,]*\s*(?:%|percent|of)/i, // "accounts for 20%"
    /\brepresent(?:s|ing|ed)?\s+(?:[a-z]+\s+){0,2}(?:third|half|quarter|tenth|fifth)\b/i,
    /\bthird\s+(?:of|consecutive)\b/i, /\bfirst\s+ever\b/i, /\bfirst\s+time\b/i,
    /\bnow\s+(?:above|below|at|exceeds)\b/i,
  ];
  let comparisonCount = 0;
  const matchedComparisons = [];
  for (const pat of COMPARISON_PATTERNS) {
    const m = visible.match(new RegExp(pat.source, 'gi'));
    if (m) { comparisonCount += m.length; matchedComparisons.push(...m); }
  }

  return {
    file: path.basename(filePath, '.md'),
    title,
    sentences: sentences.length,
    digits: digitsCount,
    properNouns,
    specificity,
    hedges: hedgeCount,
    titleEcho: echo,
    comparisons: comparisonCount,
    matchedComparisons,
  };
}

function summarize(label, dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  const rows = files.map(f => score(path.join(dir, f)));
  const avg = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
  console.log(`\n=== ${label}  (${dir}) ===`);
  console.log(`${'slug'.padEnd(60)} sent  dig  PN  spec  hedge  echo`);
  for (const r of rows) {
    console.log(
      `${r.file.slice(0, 60).padEnd(60)} ` +
      `${String(r.sentences).padStart(4)} ` +
      `${String(r.digits).padStart(4)} ` +
      `${String(r.properNouns).padStart(3)} ` +
      `${String(r.specificity).padStart(5)} ` +
      `${String(r.hedges).padStart(6)} ` +
      `${r.titleEcho.toFixed(2).padStart(5)}`
    );
  }
  console.log(`${'AVG'.padEnd(60)} ` +
    `${avg('sentences').toFixed(1).padStart(4)} ` +
    `${avg('digits').toFixed(1).padStart(4)} ` +
    `${avg('properNouns').toFixed(1).padStart(3)} ` +
    `${avg('specificity').toFixed(1).padStart(5)} ` +
    `${avg('hedges').toFixed(2).padStart(6)} ` +
    `${avg('titleEcho').toFixed(2).padStart(5)}`);
  return { label, avg: { specificity: avg('specificity'), hedges: avg('hedges'), titleEcho: avg('titleEcho') } };
}

function scoreDir(dir, limit) {
  let files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  if (limit) files = files.slice(-limit);
  const rows = files.map(f => score(path.join(dir, f)));
  if (rows.length === 0) return { rows: [], mean: null };
  const meanOf = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
  const mean = {
    specificity: meanOf('specificity'),
    digits: meanOf('digits'),
    properNouns: meanOf('properNouns'),
    hedges: meanOf('hedges'),
    titleEcho: meanOf('titleEcho'),
    comparisons: meanOf('comparisons'),
    sentences: meanOf('sentences'),
    articleCount: rows.length,
    comparisonRate: rows.filter(r => r.comparisons > 0).length / rows.length,
  };
  return { rows, mean };
}

export { score, scoreDir };

const isMain = (() => {
  try { return process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]); }
  catch { return false; }
})();

if (isMain) {
  const dirs = process.argv.slice(2);
  const results = [];
  for (const d of dirs) {
    const label = path.basename(d).replace(/^zuhd-eval-/, '');
    results.push(summarize(label, d));
  }

  console.log('\n=== SUMMARY (higher specificity = better, lower hedges/echo = better) ===');
  console.log(`${'variant'.padEnd(10)} specificity  hedges  titleEcho`);
  for (const r of results) {
    console.log(
      `${r.label.padEnd(10)} ${r.avg.specificity.toFixed(2).padStart(11)} ` +
      `${r.avg.hedges.toFixed(2).padStart(7)} ` +
      `${r.avg.titleEcho.toFixed(2).padStart(10)}`
    );
  }
}
