# perf/ — headless perf harness

Microbench runner for the pure-TS hot paths in this app — primarily the
d3-geo projection pipeline that drives the **32 ms JS-thread budget per
`callReproject` frame** in `components/globe/MiniGlobe.tsx`. Pure-math
only, no Skia / Reanimated / React — runs anywhere node runs.

**This is not a substitute for on-device profiling.** It catches
algorithmic and allocation regressions cheaply. UI-thread cost (Skia
rasterization, Reanimated worklets, frame pacing) still needs a device.

## Run

```sh
npm run bench                  # run all, compare against baseline
npm run bench:update           # rewrite baseline from current run
npx tsx perf/run-bench.ts --filter projection   # subset by name
npx tsx perf/run-bench.ts --json                # machine output for CI
```

Exit codes: `0` ok, `1` regression or budget overrun, `2` runner error.

## Baseline

`baselines.json` is committed. It records `p50_ms` / `p95_ms` per bench
and the machine that produced them. The runner fails a PR when **p50 drifts
more than ±15%** vs baseline, or when a bench's hard `budgetP95Ms` ceiling
is exceeded.

Baselines are machine-relative. Cross-machine comparisons (laptop vs CI
runner) will show drift; that's why baselines should be rewritten on the
machine that gates merges. The `meta` block in `baselines.json` is
informational, not enforced.

## Adding a bench

Drop a file in `benches/` ending in `.bench.ts`. Default-export a `bench(...)`
spec — the runner auto-discovers it.

```ts
import { bench } from '../bench-utils';

export default bench({
  name: 'category.what-you-measure',   // unique key
  iterations: 200,                      // measured runs (default 500)
  warmup: 30,                           // unmeasured warmup (default 50)
  budgetP95Ms: 16,                      // optional hard ceiling
  driftPct: 15,                         // optional override (default 15)
  setup: () => ({ /* built once */ }),
  run: (ctx) => { /* one iteration */ },
});
```

Pick `iterations` so a full bench takes ~100–500 ms — short enough to
iterate, long enough that p50 jitter < 5% across consecutive runs.

## Improving perf with this harness

1. `npm run bench` — note the current p50 of the bench you're targeting.
2. Make one change.
3. `npm run bench --filter <name>` — see the delta.
4. If improved and stable across 3 runs, `npm run bench:update`.

The runner refuses to silently lock in regressions: improvements need
`--update-baseline`, regressions fail the run.
