/**
 * Bench runner. Discovers `perf/benches/*.bench.ts`, runs each spec,
 * compares against `perf/baselines.json`, prints a table, exits non-zero
 * on regression or budget overrun.
 *
 *   tsx perf/run-bench.ts                   # run all, check baseline
 *   tsx perf/run-bench.ts --update-baseline # rewrite baseline from current run
 *   tsx perf/run-bench.ts --filter project  # substring match on bench name
 *   tsx perf/run-bench.ts --json            # machine-readable output
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import { type BenchResult, type BenchSpec, fmt, measure } from './bench-utils';

const HERE = dirname(fileURLToPath(import.meta.url));
const BENCHES_DIR = join(HERE, 'benches');
const BASELINE_PATH = join(HERE, 'baselines.json');

interface BaselineEntry {
  p50_ms: number;
  p95_ms: number;
  budget_p95_ms?: number;
  drift_pct?: number;
}
interface Baseline {
  meta: { node: string; platform: string; cpu: string; updated: string };
  benches: Record<string, BaselineEntry>;
}

function parseArgs(argv: string[]) {
  const args = { update: false, json: false, filter: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--update-baseline') args.update = true;
    else if (a === '--json') args.json = true;
    else if (a === '--filter') args.filter = argv[++i] ?? '';
  }
  return args;
}

function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  const raw = readFileSync(BASELINE_PATH, 'utf8').trim();
  if (!raw) return null;
  return JSON.parse(raw) as Baseline;
}

function saveBaseline(b: Baseline) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(b, null, 2)}\n`);
}

function isBenchSpec(v: unknown): v is BenchSpec {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as BenchSpec).name === 'string' &&
    typeof (v as BenchSpec).run === 'function'
  );
}

async function loadBenches(filter: string): Promise<BenchSpec[]> {
  const files = readdirSync(BENCHES_DIR).filter((f) => f.endsWith('.bench.ts'));
  const specs: BenchSpec[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const mod = (await import(pathToFileURL(join(BENCHES_DIR, f)).href)) as Record<
      string,
      unknown
    >;
    let fileHasSpecs = false;
    for (const value of Object.values(mod)) {
      if (!isBenchSpec(value)) continue;
      fileHasSpecs = true;
      if (seen.has(value.name)) continue; // dedupe re-exports (default === named)
      seen.add(value.name);
      if (filter && !value.name.includes(filter)) continue;
      specs.push(value);
    }
    if (!fileHasSpecs) console.warn(`skip ${f}: no bench specs found`);
  }
  return specs;
}

interface Outcome {
  result: BenchResult;
  baseline: BaselineEntry | null;
  status: 'ok' | 'regress' | 'budget' | 'new' | 'improve';
  driftPct: number | null;
  message: string;
}

function evaluate(result: BenchResult, base: BaselineEntry | null, spec: BenchSpec): Outcome {
  if (spec.budgetP95Ms != null && result.p95_ms > spec.budgetP95Ms) {
    return {
      result,
      baseline: base,
      status: 'budget',
      driftPct: null,
      message: `p95 ${fmt(result.p95_ms)}ms exceeds budget ${fmt(spec.budgetP95Ms)}ms`,
    };
  }
  if (!base) {
    return { result, baseline: null, status: 'new', driftPct: null, message: 'no baseline yet' };
  }
  const drift = ((result.p50_ms - base.p50_ms) / base.p50_ms) * 100;
  const allowed = spec.driftPct ?? base.drift_pct ?? 25;
  if (drift > allowed) {
    return {
      result,
      baseline: base,
      status: 'regress',
      driftPct: drift,
      message: `p50 regressed +${drift.toFixed(1)}% vs baseline (allowed ${allowed}%)`,
    };
  }
  if (drift < -allowed) {
    return {
      result,
      baseline: base,
      status: 'improve',
      driftPct: drift,
      message: `p50 improved ${drift.toFixed(1)}% — consider --update-baseline`,
    };
  }
  return {
    result,
    baseline: base,
    status: 'ok',
    driftPct: drift,
    message: `Δ ${drift >= 0 ? '+' : ''}${drift.toFixed(1)}%`,
  };
}

function printTable(outcomes: Outcome[]) {
  const cols = ['name', 'p50', 'p95', 'mean', 'min', 'Δ p50', 'status'];
  const rows = outcomes.map((o) => [
    o.result.name,
    `${fmt(o.result.p50_ms)}ms`,
    `${fmt(o.result.p95_ms)}ms`,
    `${fmt(o.result.mean_ms)}ms`,
    `${fmt(o.result.min_ms)}ms`,
    o.driftPct == null ? '—' : `${o.driftPct >= 0 ? '+' : ''}${o.driftPct.toFixed(1)}%`,
    o.status === 'ok' ? 'ok' : o.status.toUpperCase(),
  ]);
  const widths = cols.map((c, i) =>
    Math.max(c.length, ...rows.map((r) => (r[i] ?? '').length)),
  );
  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length));
  const sep = widths.map((w) => '─'.repeat(w)).join('─┼─');
  console.log(cols.map((c, i) => pad(c, widths[i] ?? 0)).join(' │ '));
  console.log(sep);
  for (const r of rows) {
    console.log(r.map((c, i) => pad(c, widths[i] ?? 0)).join(' │ '));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const specs = await loadBenches(args.filter);
  if (specs.length === 0) {
    console.error('no benches matched');
    process.exit(2);
  }

  const baseline = loadBaseline();
  const outcomes: Outcome[] = [];
  for (const spec of specs) {
    const result = measure(spec);
    const base = baseline?.benches[spec.name] ?? null;
    outcomes.push(evaluate(result, base, spec));
  }

  if (args.json) {
    console.log(JSON.stringify({ outcomes }, null, 2));
  } else {
    printTable(outcomes);
    for (const o of outcomes) {
      if (o.status !== 'ok' && o.status !== 'new') {
        console.log(`  ${o.result.name}: ${o.message}`);
      }
    }
  }

  if (args.update) {
    const newBaseline: Baseline = {
      meta: {
        node: process.version,
        platform: `${os.platform()} ${os.arch()}`,
        cpu: os.cpus()[0]?.model ?? 'unknown',
        updated: new Date().toISOString(),
      },
      benches: Object.fromEntries(
        outcomes.map((o) => {
          const prev = baseline?.benches[o.result.name];
          return [
            o.result.name,
            {
              p50_ms: Number(o.result.p50_ms.toFixed(3)),
              p95_ms: Number(o.result.p95_ms.toFixed(3)),
              ...(prev?.budget_p95_ms != null ? { budget_p95_ms: prev.budget_p95_ms } : {}),
              ...(prev?.drift_pct != null ? { drift_pct: prev.drift_pct } : {}),
            } satisfies BaselineEntry,
          ];
        }),
      ),
    };
    saveBaseline(newBaseline);
    console.log(`\nbaseline written to ${BASELINE_PATH}`);
    process.exit(0);
  }

  const failed = outcomes.filter((o) => o.status === 'regress' || o.status === 'budget');
  if (failed.length > 0) {
    console.log(`\n${failed.length} bench(es) failed`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
