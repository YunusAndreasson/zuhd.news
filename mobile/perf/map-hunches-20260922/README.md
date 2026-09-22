# Follow-up map investigation — 2026-09-22

Tested the interruption, crowded-target, sheet-boundary, changed-data and larger-text
hunches using Argent on the current worktree. Android 15/API 35 emulator `zuhd-qa`,
411 × 914 logical screen, Expo development client, Hermes, React Native 0.86.3.
The feed changed from 42 to 41 stories during the session. Only an emulator was
connected: the slower physical-phone/release-build hunch remains unverified.

This pass adds evidence and diagnostic flows, with no application-code fixes.

## Recommended improvements, in priority order

### 1. Cancel pending camera actions when a newer gesture takes control

**Observed:** from Beijing, tap the Alibaba story marker then immediately drag
the map right for 200ms without momentum. The drag moves the camera to longitude
102.1287, but the earlier marker action subsequently flies it to Hangzhou
(30.27, 120.15), returning ownership to the deck. The map overrides the newer drag.

**Cause supported by source:** `app/index.tsx` `focusStory` schedules a flight
after `COLLECT_MS - 120` (300ms). Another `focusStory` clears this timer, but
starting a globe drag/pinch only cancels an already active flight. It does not
invalidate the pending timer.

**Evidence:** [camera trace](delayed-flight-trace.json), live projected-marker
hit-test, and `map-found-then-drag-20260922` replay. The trace is a passive JS
sampler with visible scheduling gaps; its timestamps are not a production latency
benchmark. A final replay was performed without the sampler or font changes.

**Improvement:** make a new interaction invalidate earlier pending flights as
well as active animations. Test marker → drag, marker → pinch, marker → deck
swipe and marker → scrub, including a delayed JS thread. The newest user action
should remain authoritative.

### 2. Update the highlighted story independently of camera ownership

**Observed twice:** scrub to the Washington story “Trump Turns to Belarus”,
immediately pinch, background, then resume. The selected slug/index survived
(index 38 / story 39), but the map retained the preceding story's pin and country
highlight. Starting from Mumbai left Mumbai/India; replaying from Beijing left
Beijing/China. The Washington coordinates in the current camera track were
(38.9, -77.04). The mismatch persisted after settling.

Holding the camera at the reader's pinch location is expected. Continuing to
show the previous story as the highlighted story is the mismatch.

**Evidence:** [Washington card with Mumbai pin](stale-story-highlight.png), runtime
`StoryDeck` slug/progress and `MiniGlobe` frame inspection, two walkthroughs of
`map-scrub-pinch-resume-20260922`. The `cameraOwner === 1` branch in
`components/globe/MiniGlobe.tsx` reuses the last published story window.

**Improvement:** separate selected-story metadata/highlighting from camera
position. A cancelled flight may keep the current view, while the selected pin
and country should belong to the current story, or be hidden if offscreen.

### 3. Make visible market labels part of their selection target

**Observed:** tapping the visible “Nikkei 225” label on the Beijing view opened
Russia's country sheet. The live frame placed the label baseline at
(303.7466, 286.6661); a tap at (303.7466, 281.6661) hit Russia. The circular
market marker was at (303.7466, 325.6661).

All seven visible market-circle centres resolved correctly. None of their
sampled label centres resolved to their market: five returned no hit, Nikkei
returned Russia and TAIEX returned China. Only the Nikkei label mismatch was
also exercised as an actual device tap; the others are hit-test evidence.

**Cause supported by source:** market targets in `MiniGlobe.hitTest` use a
24-point radius around the circle, while label placement can move text beyond
that circle. Country selection remains possible beneath the visible label.

**Improvement:** include the actual rendered label bounds in target resolution,
with the same overlap/chooser rules as marker circles. Do not simply enlarge all
circle radii, which could swallow unrelated nearby targets.

### 4. Preserve the explored view when a feed update reorders stories

**Observed in a controlled runtime test:** on the Mumbai story, pan west. The
camera rested at (19.08, 56.2086), owned by the reader. Reorder an existing tech
story ahead of it by temporarily updating that article's recency in the local
query cache. The Mumbai slug stayed selected and moved from index 1 to 2, but
the map reset to (19.08, 72.88), owned by the deck.

**Evidence:** before/after runtime camera, slug and index reads, plus the
`storyRows` reconciliation effect in `app/index.tsx`, which assigns the selected
story's coordinates when its index changes. This was a controlled cache reorder,
not a naturally arriving new network article. The original feed and its query
update timestamp were restored; deep equality was checked after restoration.

**Improvement:** preserve both selected slug and current camera position when
the reader is exploring. Remap indices without changing the view; only start a
new flight when an explicit user action calls for one.

## Checks that behaved well

- **Sheet reversal:** expand → immediately drag down → horizontal swipe during
  collapse. The sheet settled at progress 0, story index/progress 1, and the
  camera at Mumbai (19.08, 72.88), owner 0. Recorded and fully replayed.
- **Crowded market cluster:** a six-market target opened a chooser containing
  Hang Seng, PSEi, SSE Composite, KOSPI, Nikkei 225 and TAIEX. Selecting Nikkei
  opened the Tokyo exchange detail. [Chooser screenshot](market-cluster-chooser.png).
- **150% system text:** story content remained readable, actions were reachable
  by scrolling, the menu opened and market filter labels fit (Other data wrapped).
  [Market sheet screenshot](markets-large-text.png). System font scale was restored
  to 1.0 and verified. Changing system font scale recreated the Android activity;
  it was not treated as an ordinary background/resume test.
- **Resume:** the selected story survived background/resume, and subsequent
  story swiping, pinching, cluster selection and detail opening worked. The stale
  highlight issue above is separate from navigation recovery.
- **Console:** final registry contained two normal app-start log entries and
  no captured warnings/errors. No app crash or persistent input lock observed.

## Performance lead, not yet a confirmed optimization

The recorded sheet reversal profile captured 18 commits over 4.946s, four at
or above 16ms: 157.19, 69.64, 106.91 and 19.95ms. `MiniGlobe` rendered four
times, reporting `marketViewport` changes, with 41.7ms total self render cost.
That prop is passed as an inline object in `app/index.tsx`; examining whether
its *values* changed versus only its identity is a useful next measurement.

CPU drill-down also contained GC, native commits, worklet serialization and
React/debug overhead. This capture does not prove a production FPS problem,
an achievable speedup, or that `MiniGlobe` alone caused the whole commit cost.
React Compiler is enabled; the generated report's generic memoization advice
is not an endorsed fix. [Raw profiler report](sheet-profile.md).
Session ID: `20260922-120039`; native Android profiling was unavailable.

## Replay scope and limits

Saved under `.argent/flows/`:

- `map-found-then-drag-20260922`: diagnostic action reproducer, live geometry/feed
  prerequisite. Its PASS means actions executed; it does not assert camera
  correctness. The undesired camera result was inspected separately.
- `map-sheet-reversal-20260922`: raw timing-sensitive action sequence plus a
  story-position assertion; final polished replay passed.
- `map-scrub-pinch-resume-20260922`: raw scrub/pinch/home sequence, resume and
  app-control visibility checks; final polished replay passed. Pin/highlight
  correctness and slug preservation were inspected separately, not asserted
  by its smoke checks.

Raw coordinates are intentional for the Skia canvas and rapid gesture sequences;
targets were discovered from component/native trees or current projected frame
geometry. These fragments are not portable across arbitrary text sizes/devices.

No physical-device release FPS, iOS, long offline interval, changed-feed insertion
during a held finger, or full accessibility audit is claimed. This pass's findings
are recommendations; application code and its prior test results were not changed.
