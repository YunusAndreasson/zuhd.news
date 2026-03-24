# Context Feature — Historical Timelines for Story Threads

## Idea

Every major story thread (Israel-Lebanon, Iran-US, Sudan civil war) gets a historical timeline generated once and reused across all articles in that thread. The reader taps "context" and sees the deep history that makes today's news make sense.

## Why

The reader is a Muslim in tech who sees connections between power, history, and current events. "Israel declares South Lebanon zone" means nothing without knowing 1978, 2000, 2006. Most news apps assume the reader already knows — or worse, assume they don't need to.

## Architecture

### Data flow

1. **New thread appears** in story ledger (arc: "breaking", no `timeline` field)
2. **Fetch Wikipedia summaries** for the thread's key concepts (free, 0 tokens)
   - Concepts already have Wikipedia URIs from NewsAPI.ai
   - Wikipedia REST API: `https://en.wikipedia.org/api/rest_v1/page/summary/{title}`
3. **Opus generates timeline** from the Wikipedia extracts (one-time, ~500 tokens)
   - Grounded: "Every date and fact must come from the provided Wikipedia extracts"
   - Perspective: "Include events often omitted from Western summaries: the Nakba, colonial mandates, partition plans, displacement. Name events as the affected communities name them."
4. **Timeline stored** in story ledger alongside the thread
5. **Every article** in that thread inherits the timeline via `threadId`
6. **Displayed** in mobile bottom sheet + web collapsible section

### Generation step

New step in `run-cycle.sh` after the selector updates the ledger:
- Check for threads with no `timeline` field
- For each: fetch Wikipedia summaries for top 5 concepts → Opus call → save to ledger
- Runs only when new threads appear (~2-3 per week)

### Avoiding hallucinations

- Wikipedia provides the facts (dates, events, names, numbers)
- Opus provides the framing and selection (what matters to this reader)
- Prompt: "Every date and fact must come from the provided Wikipedia extracts. If a fact isn't in the extracts, don't include it."
- The Nakba, Sabra and Shatila, Sykes-Picot — these ARE in Wikipedia, they're just rarely surfaced

### The Muslim perspective

Not a different set of facts — a different selection of which facts matter:
- Include the Nakba alongside "Israel established"
- Include colonial mandates alongside "independence"
- Include Sabra and Shatila alongside "withdrawal"
- Name events as affected communities name them
- Frame resistance as resistance, occupation as occupation
- Include Islamic historical context where relevant (fall of Ottoman caliphate, Sykes-Picot carving Muslim lands)

## Timeline format

Readable, scannable, not prose. Sections + year + one sentence:

```
CONTEXT: Israel–Lebanon

Origins
1917  Balfour Declaration promises Palestine to Zionist movement.
1948  Nakba: 750,000 Palestinians expelled. Israel established.

Escalation
1978  Israel invades southern Lebanon (Operation Litani).
1982  Full invasion. Sabra and Shatila massacre kills 2,000+.
1985  Israel establishes "security zone" south of Litani.

Resistance
2000  Hezbollah forces Israeli withdrawal after 22 years.
2006  34-day war. 1,200 Lebanese killed. UN Resolution 1701.

Current
2026  Israel declares third security zone south of Litani.
```

Each line: **year + one sentence**. Reader scans in 10 seconds.

## Display

### Mobile
- "context" button in article meta row (same pattern as "sources")
- Opens bottom sheet with scrollable timeline
- Section headers in small caps, year in bold, text in regular

### Web
- Collapsible `<details>` section below sources
- Same typography as concept tags — subtle, earned depth

## Cost

- Wikipedia API: free, no auth
- Opus generation: ~500 tokens per thread, one-time
- ~2-3 new threads per week = ~1,500 tokens/week
- Storage: in story ledger JSON, persists across cycles

## Dependencies

- Story ledger (`content/.story-ledger.json`) — already has thread tracking
- Wikipedia REST API — free, no setup
- NewsAPI.ai concepts — already provide Wikipedia URIs
- Opus — already in the pipeline
