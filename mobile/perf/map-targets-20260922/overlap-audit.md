# Map overlap audit

22 September 2026. Swiped across the live Android map through the Europe,
Levant and Red Sea regions and inspected the projected marker coordinates.

The main overlap was the conflict layer. Before the change, Gaza had two UCDP
events and the genocide marker at essentially one point (the closest pair was
0.1 px). Ukraine contained a dense theatre with several conflict points within
1–4 px. Other mixed-layer cases were also present: Yemen story/conflict points
were about 4 px apart, and Sudan conflict/famine points were about 6 px apart.
The existing hit-testing correctly returned a chooser for these cases, but
painting every conflict glow made the dense theatres look like an unreadable
smear.

The renderer now collapses only nearby conflict glows into one screen-space
density mark. The underlying event points and their 36 px hit zones are
unchanged, so every report remains selectable and the chooser still contains
all records. Clusters of three or more receive a small count label. The
clustering is transitive, deterministic, and keeps the strongest recency and
fatality scale for the aggregate visual. This preserves the existing story and
hazard layer ordering: stories remain the loudest targets, while genocide and
famine retain their dedicated symbols.

The audit path is recorded at
[map-overlap-audit-20260922.yaml](../../.argent/flows/map-overlap-audit-20260922.yaml)
and replayed successfully: four map swipes, zero failures. The clustering
helper has focused unit coverage for ordinary and transitive clusters.

Other observations:

- Market labels already use obstacle-aware screen-space packing and remained
  legible in the swiped views.
- The Gaza, Suez and Bosporus labels remain close to nearby markers but retain
  visible text and chooser behavior after the conflict aggregation.
- Cross-layer proximity is intentionally preserved geographically; only the
  conflict glow is aggregated. A future zoom-specific decluttering pass could
  add leader lines or aggregate mixed hazard families, but doing that now would
  change the meaning of the existing dedicated symbols and hit priorities.

Verification after the change:

- 69 Jest suites, **645 tests passed**.
- TypeScript, Biome (327 files), deprecated-API checks, and `git diff --check`
  passed.
