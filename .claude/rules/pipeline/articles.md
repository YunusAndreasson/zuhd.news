---
paths:
  - "content/articles/**"
  - "scripts/lib/article-chain.js"
  - "scripts/lib/article-chain.test.js"
  - "scripts/lib/corpus.test.js"
  - "scripts/validate-articles.js"
  - "scripts/lib/frontmatter.js"
  - "scripts/lib/blocks.js"
  - "scripts/write-prompt.md"
  - "scripts/check-prompt.md"
---

# The body's shape, the isnad, and corrections

## The body's shape

`scripts/write-prompt.md` (the rhythm section) is the contract;
`scripts/check-prompt.md` enforces it and `scripts/measure-quality.js`
measures drift. Everything downstream reads a list of blocks: `splitBlocks`,
the web's `<p>` run, the app's `article.sentences`, the Swedish translator,
`mapLeads`.

- Four blocks are required and a fifth is optional: hook, why it matters,
  mechanism, counterpoint or quote, what's next. Nothing may assume four:
  slice, do not index. A validator that hard-codes 4 quarantines every earned
  fifth block.
- A quote must be verbatim in a source `body`, attributed there to the person
  the article names. The editor stage checks it: a fabricated quotation
  survives every later stage, and fixing one is a correction, not an edit.
- A counterpoint is not balance. A denial of a fact the denier's own
  institution has confirmed is the false equivalence `<values>` forbids: drop
  it.
- Three numbers move together: the target (400-480 visible characters) and
  ceiling (560) in `write-prompt.md` and `check-prompt.md`; `CEILING` in the
  `<body-lengths>` probe in `run-cycle.sh`, the only one that reaches the
  editor as data; and `STORY_LINES` in `mobile/lib/deck-layout.ts`.
- The blank line between blocks is the separation on every surface: one `<p>`
  or one `Text` per block. Never merge blocks to save space; pay in length.
- Link markup is free against the budget: `[Iran](country:IR)` costs its
  label. Every counter strips `\[([^\]]+)\]\([^)]+\)` before measuring.

## Isnad and corrections

`scripts/lib/article-chain.js`, pinned by `article-chain.test.js` and
`corpus.test.js`. Both implement a sentence the site publishes about itself,
so a defect here looks like the page working while the claim on the about page
stops being true.

- The chain is named, linked and ranked by proximity to the event, which for
  a newsroom is jurisdiction: an outlet inside the country where it happened
  leads.
- Rank on `source.country` against the story's `(country:XX)` tags, not on
  distance: `SOURCE_COORDS` covers too few outlets. With no tag the published
  order stands, so the sort must be stable.
- `STATE_OUTLETS` withholds that promotion from state media and nothing else:
  they stay in the chain, named and linked, where the pipeline put them. The
  list is editorial and short, and holds allies to the same rule.
  State-funded with editorial independence (BBC, Al Jazeera) is not on it; a
  test asserts the boundary in both directions.
- `sources[]` is never reordered: `sources[0]` is the published primary source
  in the APIs, the feed and the share card. The ranking sorts a display copy.
- A correction is a record on the article, not an edit to it:
  `corrections: [{ date, note }]` in the frontmatter. It renders as a dated
  block above the source chain (the isnad stays last), with a `corrected`
  mark in the kicker linking to it.
- A correction also reaches `dateModified` in the JSON-LD, `<updated>` in the
  Atom feed, and a `corrections` field in `feed.json` and `feed-lite.json`,
  added only when present so the published shape is unchanged. There is no
  `/corrections` page.
- The parser drops a malformed correction instead of throwing. `corpus.test.js`
  fails `npm test` (not the build, and not CI) on any entry that would not
  survive the filter, including one dated before its article.
