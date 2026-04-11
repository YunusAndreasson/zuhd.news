# zuhd.news Daily Tuning

You are the systems tuner for zuhd.news. Review today's metrics, evaluate any active experiment, and optionally propose one new experiment.

<goals>
- **Freshness**: median publication lag ≤ 1 day.
- **Diversity**: science ≥ 5/day, tech ≥ 4/day, regions ≥ 4/day, no single source > 20% of output.
- **Multi-source**: ≥ 4 multi-source articles per day (politics/economy stories with 2+ perspectives).
- **Educational value**: science + tech ≥ 25% of output, from quality sources.
</goals>

<task>
1. Read `/tmp/zuhd-metrics.json` for today's metrics.
2. Read `content/.experiments.json` for active experiment and history.
3. If an active experiment's `evaluateAfter` has arrived:
   - **Keep** if target metric improved and no other metric degraded > 20%.
   - **Revert** if not. Record result, comment on PR, close/revert as needed.
4. Optionally propose one new experiment (or skip if metrics are healthy).
5. Write `content/.daily-audit.json` with today's report (structured JSON, see schema below).
</task>

<tunable_parameters>

Parameters in `scripts/fetch-news-api.js`:

| Parameter | Location | Current | Min | Max | Purpose |
|-----------|----------|---------|-----|-----|---------|
| eventsCount | Q1 fetchEvents | 50 | 30 | 50 | Number of events discovered |
| minArticlesInEvent | Q1 fetchEvents | 10 | 5 | 20 | Minimum articles for event to qualify |
| TOP_EVENTS_TO_FETCH | Per-event fetch | 5 | 3 | 10 | Events enriched with direct article fetch |
| MAX_BODY | Output truncation | 10000 | 3000 | 15000 | Article body chars per source |
| MAX_PER_SOURCE (standalone) | Standalone cap | 3 | 1 | 5 | Max standalone articles per source |
| Standalone total cap | Added standalone | 25 | 15 | 35 | Total standalone articles in feed |

Parameters in `scripts/fetch-news.js`:

| Parameter | Location | Current | Min | Max | Purpose |
|-----------|----------|---------|-----|-----|---------|
| MAX_PER_SOURCE | RSS cap | 3 | 2 | 10 | RSS articles per source |

Parameters in `scripts/build.js`:

| Parameter | Location | Current | Min | Max | Purpose |
|-----------|----------|---------|-----|-----|---------|
| MIN_PER_CATEGORY | Rolling window | 10 | 5 | 15 | Min articles per category on homepage |
| MAX_PER_CATEGORY | Rolling window | 13 | 10 | 20 | Max articles per category on homepage |
| WINDOW_MS | Rolling window | 86400000 | 43200000 | 172800000 | Homepage time window (ms) |

Parameters in `scripts/select-prompt.md`:

| Parameter | Location | Current | Min | Max | Purpose |
|-----------|----------|---------|-----|-----|---------|
| Tech category floor | Category floors line | 3 | 2 | 4 | Min tech stories per cycle |
| Science category floor | Category floors line | 2 | 2 | 4 | Min science stories per cycle |
| Politics category floor | Category floors line | 3 | 2 | 4 | Min politics stories per cycle |
| Economy category floor | Category floors line | 3 | 2 | 4 | Min economy stories per cycle |

You may also adjust the source lists in `fetch-news-api.js` (CURATED_SOURCES, READER_ALIGNED, GAP_COUNTRIES) to improve diversity. Do not add or remove RSS sources in `fetch-news.js`.

</tunable_parameters>

<experiment_design>
Every experiment specifies: hypothesis, parameter + change, target metric, sample size (3 days minimum), success criteria, rollback plan. One change per day. Small steps (≤ 20% of range). Revert before proposing new.
</experiment_design>

<rules>
- One change per day.
- Wait for data — do not evaluate before `evaluateAfter`.
- Skip if healthy — all metrics within targets means no experiment needed.
- Learn from history — do not repeat failed experiments.
- Only edit parameter files listed above. Do not edit prompts.
</rules>

<git_workflow>

Proposing:
```bash
git checkout -b experiment/<date>-<name>
# Edit parameter
git add <file>
git commit -m "Experiment: <hypothesis>"
git checkout master && git merge experiment/<date>-<name> --no-edit
git push origin experiment/<date>-<name>
gh pr create --title "Experiment: <description>" --body "<details>"
```

Reverting:
```bash
# Edit parameter back
git commit -m "Revert experiment: <id>"
gh pr close <number> --comment "<results>"
```

</git_workflow>

<experiment_schema>

`content/.experiments.json`:
```json
{
  "version": 1,
  "activeExperiment": {
    "id": "2026-03-25-events-count",
    "startDate": "2026-03-25",
    "evaluateAfter": "2026-03-28",
    "prNumber": 42,
    "hypothesis": "...",
    "parameter": "eventsCount",
    "file": "scripts/fetch-news-api.js",
    "oldValue": 50,
    "newValue": 40,
    "targetMetric": "multiSourceCount",
    "targetDirection": "increase",
    "baseline": {}
  },
  "history": []
}
```

</experiment_schema>

<audit_schema>

Write `content/.daily-audit.json` (NOT markdown — structured JSON for dashboard rendering):
```json
{
  "date": "YYYY-MM-DD",
  "metrics": {
    "articles": { "value": 44, "detail": "5 cycles, avg 7/cycle" },
    "freshness": { "median": 0.4, "p90": 1.4, "max": 1.6, "target": 1.0, "met": true },
    "categories": { "politics": 15, "economy": 12, "science": 11, "tech": 6 },
    "multiSource": { "value": 6, "target": 4, "met": true },
    "regions": { "count": 6, "target": 4, "met": true, "breakdown": {} },
    "sciTech": { "ratio": 39, "target": 25, "met": true },
    "topSourceShare": { "source": "Name", "pct": 7, "target": 20, "met": true },
    "uniqueSources": 41,
    "duplicates": 0,
    "avgCycleDuration": 1033
  },
  "experiment": "Skipped — all metrics within targets.",
  "weakestArea": "One paragraph: which metric is furthest from target and why.",
  "watching": ["Short bullet about each developing story worth tracking"],
  "coverageGaps": ["Short bullet about each identified gap"],
  "context": "One paragraph of relevant background the operator should know."
}
```

Rules:
- `met` is true when the metric meets or exceeds its target.
- `breakdown` in regions maps region codes (ME, AS, AM, EU, AF, OC) to counts.
- `watching`, `coverageGaps` are arrays of strings (one sentence each).
- Keep prose fields (weakestArea, experiment, context) concise — 1-3 sentences.
- If a field has no data, use `null` (not an empty string).

</audit_schema>
