---
paths:
  - "content/articles/**"
  - "scripts/lib/article-chain.js"
  - "scripts/lib/article-chain.test.js"
  - "scripts/lib/corpus.test.js"
  - "scripts/validate-articles.js"
  - "scripts/lib/frontmatter.js"
  - "scripts/lib/blocks.js"
  - "scripts/lib/validate-blocks.js"
---

# The body's shape, the isnad, and corrections

## The body's shape

`scripts/write-prompt.md` §rhythm is the contract; `scripts/check-prompt.md`
enforces it and `scripts/measure-quality.js` measures the drift. Everything
downstream — `splitBlocks`, the web `<p>` run, the app's `article.sentences`,
the Swedish translator, `mapLeads` — is written against a *list* of blocks and
must stay that way.

- **Four blocks are required, a fifth is optional and earned.** Hook → why it
  matters → mechanism → *counterpoint or quote* → what's next. The optional
  block is Axios's "Yes, but" and "What they're saying" collapsed into one
  slot, and the writer picks which form the sources support. It went in on
  2026-09-20, when the app's open sheet gained the room for it. **Nothing may
  assume a length of four**: `hookOf`/`restOf` in the app slice, they do not
  index, and a validator that hard-codes 4 quarantines every earned fifth
  block.
- **A fabricated quote is the one failure here that is a correction, not an
  edit.** The quoted words must be verbatim in a source `body`, attributed
  there to the person the article names. The editor stage checks this
  explicitly because a plausible quotation is indistinguishable from a real one
  at every later stage — it survives the build, the API, the app and the feed,
  and the first reader to notice is the person misquoted.
- **A counterpoint is not balance.** A denial of a fact the denier's own
  institution has confirmed is the false equivalence `<values>` forbids, and it
  gets dropped rather than softened. This is the one rule where the block loses
  to the values; every other rule about the block is about whether it earns its
  space.
- **Three numbers move together or not at all**: the target (400-480 visible
  characters) and ceiling (560) in `write-prompt.md` and `check-prompt.md`, the
  `CEILING` in the `<body-lengths>` probe inside `run-cycle.sh` — the only one
  that reaches the editor as *data* — and `STORY_LINES` in
  `mobile/lib/deck-layout.ts`, which sizes the app's open sheet before it has
  measured a card. The probe drifted to 400 while both prompts said 440 and
  nothing caught it, because a too-low ceiling only makes the editor trim
  articles that were within budget.
- **The blank line between blocks is load-bearing on every surface.** The web
  reader emits one `<p>` per block; the app draws one `Text` per block with
  `mdStyles.sentence`'s `marginBottom` between them. A surface that merges
  blocks back into one paragraph makes the writer's blank lines mean nothing,
  and the app did exactly that for a day in September 2026 to save vertical
  space. If the separation ever needs paying for again, pay in *length*, not by
  merging.
- **Link markup is free against the budget.** `[Iran](country:IR)` costs its
  label, not its target, everywhere the budget is counted. Every counter in the
  pipeline strips `\[([^\]]+)\]\([^)]+\)` before measuring; one that forgets
  reads a well-tagged article as 15% over.

## Isnad and corrections

Both implement a sentence the site publishes about itself. A defect here does
not look like a bug — it looks like the page working while the claim on the
about page quietly stops being true.

`scripts/lib/article-chain.js`, pinned by `article-chain.test.js` and the
corpus test. Both implement a sentence the site publishes about itself, which
is why they are extracted and tested rather than living inline in `build.js`: a
defect here does not look like a bug, it looks like the page working while the
claim on the about page quietly stops being true.

- **The chain is linked, and ranked by proximity to the event.** `about.md`
  says "*isnad* — Every article ends with its chain of sources, **named and
  linked**", and the article page printed `Sources: A, B, C` as flat text in
  publication order — while the map's story card linked them. The claim was
  false on the canonical page and true on the derived one. Ranking is the other
  half: an isnad is not a bibliography, and what ranks it is how close the
  transmitter stood. For a newsroom that reads as **jurisdiction** — an outlet
  inside the country where it happened leads.
- **Not by distance in kilometres.** `SOURCE_COORDS` covers 41 outlets against
  the corpus's 489 distinct names, so only **32%** of source references resolve
  to a coordinate and a distance sort would be arbitrary two thirds of the time
  while looking principled. `source.country` is on **99%** of them. Story-side,
  the inline `(country:XX)` tags cover ~52% of articles; where there is no tag
  the published order stands, which is what the **stable** sort protects.
- **`adalah` outranks nearness, and that is not a detail.** Ranked on nearness
  alone a state agency leads every chain about its own state — measured against
  this corpus, TASS at the head of 6, RT 10, Mehr 3 — which is exactly what the
  source policy forbids: "State media is included to carry a government's
  position, never as a substitute for independent reporting." `STATE_OUTLETS`
  withholds the promotion and nothing else: those outlets stay in the chain,
  named and linked, in the position the pipeline published them in. The list is
  **editorial, short, and holds allies to the same rule** — Anadolu is on it for
  the same reason TASS is. State-*funded* with editorial independence (BBC, Al
  Jazeera) is a different thing and must not creep in; a test asserts the
  boundary in both directions.
- **`sources[]` is never reordered.** `sources[0]` is the published primary
  source in `/api/*.json`, in `feed.xml` and on the generated share card. The
  ordering sorts a display copy.
- **Corrections are a record on the article, not an edit to it.**
  `foundation.md`'s first principle promises "Corrections issued openly" and
  nothing in the repo could record that an article had ever been wrong — so a
  correction meant editing the prose and letting the earlier version disappear.
  The record is `corrections: [{ date, note }]` in the article's own
  frontmatter, so it travels with the article in git and lands in the same diff
  as the text it fixes. It renders as a dated block **above** the source chain
  (the isnad has to stay last, or `about.md`'s sentence is untrue), with a
  `corrected` mark in the kicker linking to it — a correction the reader has to
  scroll to find is filed, not issued.
- **It reaches people through the channels that already exist**: `dateModified`
  in the article's JSON-LD, `<updated>` in the Atom feed, and a `corrections`
  field on the article in both `feed.json` and `feed-lite.json` (added to the
  one `apiCategories` object, spread-conditionally — absent on the ~100% of
  articles never corrected, so the published shape is unchanged and the app
  keeps parsing). There is no `/corrections` index page.
- **The parser drops a malformed correction rather than throwing**, which is
  right inside a live pipeline and useless as a warning — so `corpus.test.js`
  fails the build on any `corrections:` entry that would not survive the filter,
  including one dated before the article it corrects.
