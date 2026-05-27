/**
 * Microbench primitives. No deps. Measures wall-clock per-iteration time
 * via `performance.now()`, reports p50/p95/mean/min from sorted samples.
 *
 * Bench files export a default `BenchSpec` via `bench(...)`; the runner in
 * `run-bench.ts` picks them up.
 */

export interface BenchSpec<C = unknown> {
  /** Unique name; used as the baseline key. Convention: `module.what`. */
  name: string;
  /** Number of measured iterations (after warmup). Default 500. */
  iterations?: number;
  /** Warmup iterations, not measured. Default 50. */
  warmup?: number;
  /** Built once; result passed into every `run` call. */
  setup?: () => C;
  /** Single iteration of work to measure. */
  run: (ctx: C) => void;
  /** Optional hard ceiling on p95 (ms). If set and exceeded, runner exits 1. */
  budgetP95Ms?: number;
  /** Allowed drift on p50 relative to baseline (percent). Default 15. */
  driftPct?: number;
}

export interface BenchResult {
  name: string;
  iterations: number;
  warmup: number;
  p50_ms: number;
  p95_ms: number;
  mean_ms: number;
  min_ms: number;
}

export function bench<C>(spec: BenchSpec<C>): BenchSpec<C> {
  return spec;
}

export function measure<C>(spec: BenchSpec<C>): BenchResult {
  const iterations = spec.iterations ?? 500;
  const warmup = spec.warmup ?? 50;
  const ctx = spec.setup ? spec.setup() : (undefined as unknown as C);

  for (let i = 0; i < warmup; i++) spec.run(ctx);

  const samples = new Float64Array(iterations);
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    spec.run(ctx);
    samples[i] = performance.now() - t0;
  }

  const sorted = Array.from(samples).sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  let sum = 0;
  for (const v of sorted) sum += v;

  return {
    name: spec.name,
    iterations,
    warmup,
    p50_ms: p(0.5),
    p95_ms: p(0.95),
    mean_ms: sum / sorted.length,
    min_ms: sorted[0] ?? 0,
  };
}

export function fmt(n: number): string {
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(3);
}
