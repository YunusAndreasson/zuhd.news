# Visible-screen performance pass — 2026-10-04

## Implemented and measured

The menu's root now stays mounted while its child pages are open. The existing
`RetainedListPage` preserves its viewport and excludes it from touch and
accessibility using `pointerEvents`, `accessibilityElementsHidden`, and
`importantForAccessibility`. `MenuRootPage` isolates the root from navigation
state so React Compiler can reuse its rows and callbacks.

Previously, Back from stock markets remounted all 16 root rows, including their
press animations, and discarded the root scroll position.

Android emulator `emulator-5554` (pixel, API 35), development build, React Compiler
enabled. Existing Metro at 8081 reused. The app's saved preference was large text
and dark appearance; those settings were preserved.

Recorded flow: `.argent/flows/markets-perf-20261004.yaml`. Prerequisite: loaded
app, menu root open at its top. Both comparison runs replayed the same complete
flow after a warm-up replay, with React/Hermes and native Perfetto in parallel.

| Measurement | Before | After |
| --- | ---: | ---: |
| Captured fiber renders | 2,215 | 1,624 |
| Main Back commit | 996.26 ms | 53.59 ms |
| First market-opening commit | 580.10 ms | 555.07 ms |
| React capture duration | 13.04 s | 12.53 s |
| Perfetto jank events | 63 | 51 |

The Back improvement is supported by eliminating row remounts, not merely by
timing. Opening performance is roughly unchanged. The emulator's native
hotspots are primarily graphics-driver/kernel functions; native counts and
development timings are not physical-device performance claims. Retention
keeps 16 bounded root rows allocated while a child is open.

Artifacts: `replay-baseline-react.md`, `replay-baseline-native.md`,
`root-page-react.md`, `root-page-native.md`. Raw React session IDs:
`20261004-110537` before and `20261004-110951` after, under
`/tmp/argent-profiler-cwd/`. Intermediate retained-root capture showed callbacks
still changing; extracting the root removed those navigation-driven renders.

## UI checks

- Market round trip passes using semantic selectors (stock markets, Filter
  markets, Back, country rankings) and idle gates.
- `.argent/flows/menu-scroll-retention-20261004.yaml` passes from the bottom of
  the root through settings & about and Back. The settings row returns to its
  exact original normalized frame `(0.044, 0.869, 0.913, 0.052)`.
- Root is visually hidden while a child is open. Argent's raw native tree still
  lists retained descendants despite the accessibility exclusion props; actual
  TalkBack traversal has not been verified. Treat tree-only visibility checks
  of root rows as insufficient to prove Back: the scroll flow also checks the
  root-only wordmark.
- User-requested casing: shared `GROUP_TITLES.ai` is now `ai models`, used by
  the menu row and page title. The emulator menu visibly confirms lowercase.

## Final verification of visible flows

- Idle: zero React commits in the earlier 15.6-second capture. The separate
  repository gate now also passes: after resetting `gfxinfo news.zuhd.app`,
  five untouched seconds produced **0 rendered frames**, 0 janky frames.
  PID 11876, stats start 11106720094851 ns. Screenshot alongside the reading
  shows the healthy globe and Cornell story, not an error or blank screen:
  `/tmp/simserver-idgDJy/media/951897342-1791114762975.png`.
- Deck profile: 504 captured fiber renders / 14 commits, maximum hot commit
  132.92 ms (`deck-react.md`). Native sampling is dominated by emulator
  graphics work (`deck-native.md`), not evidence for an application-side
  algorithm change. The original fast replay dispatched gestures without
  proving the destinations. The new `deck-verified-20261004` flow checks
  each story position and waits for idle: **1 → 2 → 3 → 2 → 1**, 12/12 replay
  steps pass. No change to deck gesture behavior was justified.
- Opening the first story expands it from y=0.703 to y=0.323; the body and
  save/share/sources footer are readable at large text. Pulling down returns
  it to peek. Screenshots `899725679-1791114813922.png` and
  `169430443-1791114835198.png` in the same temporary media directory.
- Search bug fixed: count-only deduplication suppressed the first zero-result
  announcement and distinct queries with equal result counts. The effect now
  responds to query and count, waits 300 ms for typing to pause, and cancels
  on clear/unmount. Runtime instrumentation observed repeated `No results`
  announcements for distinct queries. Regression tests cover initial zero,
  equal counts, intermediate typing, clear, and unmount cancellation.
- Search Back intentionally clears the query. `search-retention-20261004`
  verifies that behavior (10/10 steps), despite its historical recording name.
  `search-result-resume-20261004` verifies the separate result-opening path:
  select Cornell, reopen Menu, same query/results (9/9 replay steps).
  The hidden-keyboard wait alone is weak evidence because its selector is
  already absent when queried. The accompanying native tree and screenshot
  establish that the reopened results have no keyboard:
  `/tmp/simserver-h9yAzO/media/263006641-1791115140311.png` shows
  Cornell retained, its one result, and the full-height sheet without a keyboard.
- Menu user follow-ups: lowercase `ai models`; aggregate-capable groups
  precede mixed rates/predictions/events. AI now averages raw lab scores
  (157.2 in the current feed) instead of displaying the leading score (167.4).
  The same average appears on its list page with an `average` label.
  Largest companies already computes the mean weekly percentage change;
  the original result rounded to 0.0%. A subsequent correction preserves
  small aggregate moves: both companies and commodities now show down 0.04%.
  Signed raw weekly changes survive individual-chip rounding, and the commodity
  list explains its partial coverage and differing observation dates.

## Scope and measurement limits

This pass measured the main screen at idle, story navigation, and the menu's
market round trip, and optimized the demonstrated menu remount cost. It did
not infer production speedups from development-emulator timing. Physical
hardware and actual TalkBack traversal remain untested; the retained root's
accessibility exclusion props are present, but Argent's raw tree includes
its descendants. Recorded taps therefore use destination-specific selectors.

Static review also identified eager mounting of saved rows as a candidate for
a future large-collection profile. No measurement established a current
saved-list bottleneck, so it was not changed speculatively. Existing PageVeil
animation warnings were observed without JS errors in the measured menu flow.

Follow-up implemented at the user’s request: central bank rates (median) and
inflation (equal-weight US/eurozone mean) are separate groups, using the latest
reporting month shared by all members. Jobs and borrowing costs have separate
lists; unknown indicators stay separate. Emulator
verification showed 4.00% for September policy rates and 3.29% for August
inflation, with coverage and period on both list pages. Full verification after
this follow-up passed 105 suites / 1,049 tests
(`/tmp/zuhd-economic-groups-verify.log`).

The subsequent compound follow-up adds monthly percentage-point changes to
policy rates and inflation, the US unemployment level and monthly change,
and an equal-weight borrowing-cost basket (US 2-year and 10-year Treasury
yields and 30-year mortgages) with a matched seven-day change. Missing prior
periods retain the level without inventing a change. Root menu accessibility
inspection confirmed all four figures and their coverage. Full verification
passed 105 suites / 1,053 tests (`/tmp/zuhd-compound-moves-verify.log`).

## Checks

`npm run verify` passes after the final functional code change: typecheck, Biome (408
files), deprecated API check, and **105 suites / 1,053 tests**. Full output:
`/tmp/zuhd-compound-moves-verify.log`. `git diff --check` passes. No release, OTA
update, deployment or commit was made.
