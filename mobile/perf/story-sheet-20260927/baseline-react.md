# Profiling Analysis — 31.1s session
**React Compiler:** ✓  **Hot commits:** 7 of 18 total

> **Duration columns:** `self` = this component's own render work only (exclusive).
> `w/children` = self + the entire subtree it owns (inclusive).
> Do not sum the `w/children` column — a parent's inclusive time already contains its
> children's time. Use `self` for summing; use `w/children` to understand container cost.

---
## Slow React Batches

### Commit #1 — 10.44ms 🔵 (t=1.6s, margin)

- `AnimatedComponent(View)` ×7 — 8ms self, 26.96ms w/children — parent re-render
- `View` ×7 — 4.72ms self, 18.96ms w/children — props: style, transform

### Commit #2 — 165.24ms 🔴 (t=10.0s)

**Root cause:** `View` re-rendered — props: style, children

Render cascade:
- `View` ×32 — 26.28ms self, 730ms w/children — props: style, children
- `HomeScreen` [React Compiler] — 22.89ms self, 165.24ms w/children — hooks
- `ScrollView` ×10 — 16.47ms self, 106.92ms w/children — props: children
- `AnimatedComponent(View)` ×7 — 9.77ms self, 134.52ms w/children — props: style, children
- `NativeDetector` ×6 — 9.17ms self, 171.56ms w/children — props: gesture, children
- `IndicatorStrip` [React.memo + React Compiler] — 7.53ms self, 18.33ms w/children — props: linkedIds, linkedColor
- `StoryDeck` [React.memo] — 7.29ms self, 62.56ms w/children — props: scrollEnabled, renderStory
- `MapSheet` [React Compiler] — 7.27ms self, 85.65ms w/children — props: renderList
- `GestureDetector` ×6 — 6.48ms self, 178.04ms w/children — props: gesture, children
- `DeckSlot` [React.memo] ×2 — 6.31ms self, 49.83ms w/children — props: scrollEnabled, children
- `StoryCard` [React.memo + React Compiler] — 4.99ms self, 14.86ms w/children — props: open
- `StoryDock` [React.memo + React Compiler] — 4.29ms self, 14.35ms w/children — props: ruled
- `LeanReanimatedNativeDetector` ×4 — 4.1ms self, 129.81ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- `MapHeader` [React.memo + React Compiler] — 3.3ms self, 24.12ms w/children — props: linkedIds, linkedColor
- `GlobeGestureLayer` [React.memo] — 2.94ms self, 11.71ms w/children — props: enabled, collapseMode
- _... and 12 more_
- _Shown: 139.1ms self / 165.24ms commit (84%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=2` to see all._

**CPU during this commit:**
- `recordConsoleLogs` self=17.5ms total=17.5ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:44785)
- `propagateParentContextChanges` self=17.13ms total=17.13ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:20697)
- `addObjectDiffToProperties` self=15.24ms total=15.24ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:20174)
- `recursivelyTraverseLayoutEffects` self=13.87ms total=13.87ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:24710)
- `addObjectDiffToProperties` self=13.71ms total=13.71ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:20174)

### Commit #3 — 1.29ms 🔵 (t=10.1s, margin)

- `NativeDetector` — 0.56ms self, 1.29ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.47ms self, 0.73ms w/children — props: onStartShouldSetResponder

### Commit #4 — 234.9ms 🔴 (t=11.4s)

**Root cause:** `ScrollView` re-rendered — props: children

Render cascade:
- `ScrollView` ×10 — 28.89ms self, 232.65ms w/children — props: children
- `View` ×32 — 28.65ms self, 1163.36ms w/children — props: style, children
- `ScrollViewContext.Provider` ×3 — 27.96ms self, 40.22ms w/children — (mount)
- `LeanReanimatedNativeDetector` ×4 — 25.71ms self, 230.37ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- `HomeScreen` [React Compiler] — 25.51ms self, 234.9ms w/children — hooks
- `StoryDeck` [React.memo] — 21.43ms self, 119.66ms w/children — props: scrollEnabled, renderStory
- `AnimatedComponent(View)` ×7 — 9.94ms self, 214.23ms w/children — props: style, children
- `MapSheet` [React Compiler] — 8.74ms self, 145.38ms w/children — props: renderList
- `IndicatorStrip` [React.memo + React Compiler] — 7.87ms self, 33.56ms w/children — props: linkedIds, linkedColor
- `NativeDetector` ×6 — 5.33ms self, 292.74ms w/children — props: gesture, children
- `GlobeGestureLayer` [React.memo] — 4.96ms self, 12.1ms w/children — props: enabled, collapseMode
- `DeckSlot` [React.memo] ×2 — 4.55ms self, 69.88ms w/children — props: scrollEnabled, children
- `GestureDetector` ×6 — 4.05ms self, 296.78ms w/children — props: gesture, children
- `StoryCard` [React.memo + React Compiler] — 4.04ms self, 11.91ms w/children — props: open
- `MapHeader` [React.memo + React Compiler] — 2.52ms self, 38.32ms w/children — props: linkedIds, linkedColor
- _... and 12 more_
- _Shown: 210.2ms self / 234.9ms commit (89%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=4` to see all._

**CPU during this commit:**
- `[GC Young Gen]` self=12.95ms total=12.95ms ([suspended]:0)
- `updateVirtualChildrenRecursively` self=10.7ms total=10.7ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:45574)
- `resolveClassComponentProps` self=8.82ms total=8.82ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:22945)
- `updateFiberRecursively` self=5.49ms total=5.49ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:45768)
- `structuredCloneInternal` self=3.92ms total=3.92ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:29713)

### Commit #5 — 0.94ms 🔵 (t=11.4s, margin)

- `NativeDetector` — 0.56ms self, 0.94ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.29ms self, 0.38ms w/children — props: onStartShouldSetResponder

### Commit #7 — 9.98ms 🔵 (t=13.6s, margin)

- `AnimatedComponent(View)` ×7 — 7.82ms self, 25.7ms w/children — parent re-render
- `View` ×7 — 4.51ms self, 17.87ms w/children — props: style, transform

### Commit #8 — 226.15ms 🔴 (t=24.4s)

**Root cause:** `View` re-rendered — props: style, children

Render cascade:
- `View` ×32 — 47.39ms self, 1192.25ms w/children — props: style, children
- `ScrollView` ×10 — 25.22ms self, 183.32ms w/children — props: children
- `HomeScreen` [React Compiler] — 18.9ms self, 226.15ms w/children — hooks
- `StoryCard` [React.memo + React Compiler] — 17.05ms self, 31.57ms w/children — props: open
- `AnimatedComponent(View)` ×7 — 16.65ms self, 233.12ms w/children — props: style, children
- `IndicatorStrip` [React.memo + React Compiler] — 9.95ms self, 28.11ms w/children — props: linkedIds, linkedColor
- `StoryDeck` [React.memo] — 9.81ms self, 111.08ms w/children — props: scrollEnabled, renderStory
- `MapSheet` [React Compiler] — 9.8ms self, 144.04ms w/children — props: renderList
- `DeckSlot` [React.memo] ×2 — 9.32ms self, 95.42ms w/children — props: scrollEnabled, children
- `NativeDetector` ×6 — 6.92ms self, 289.7ms w/children — props: gesture, children
- `GestureDetector` ×6 — 6.78ms self, 296.48ms w/children — props: gesture, children
- `StoryDock` [React.memo + React Compiler] — 6.08ms self, 14.91ms w/children — props: ruled
- `LeanReanimatedNativeDetector` ×4 — 4.13ms self, 227.26ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- `MapHeader` [React.memo + React Compiler] — 3.08ms self, 33.46ms w/children — props: linkedIds, linkedColor
- `GlobeGestureLayer` [React.memo] — 2.98ms self, 8.25ms w/children — props: enabled, collapseMode
- _... and 12 more_
- _Shown: 194.1ms self / 226.15ms commit (86%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=8` to see all._

**CPU during this commit:**
- `[Native] objectKeys` self=18.01ms total=18.01ms ([native]:0)
- `[Host Function] createChildSet` self=10.67ms total=10.67ms ([host]:0)
- `[Native] errorStackGetter` self=10.47ms total=10.47ms ([native]:0)
- `createResult` self=5.31ms total=5.31ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:103184)
- `structuredCloneInternal` self=2.27ms total=2.27ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:29713)

### Commit #9 — 0.99ms 🔵 (t=24.4s, margin)

- `NativeDetector` — 0.48ms self, 0.99ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.46ms self, 0.51ms w/children — props: onStartShouldSetResponder

### Commit #10 — 143.84ms 🔴 (t=25.6s)

**Root cause:** `HomeScreen` [React Compiler] re-rendered — hooks

Render cascade:
- `HomeScreen` [React Compiler] — 32.45ms self, 143.84ms w/children — hooks
- `View` ×32 — 21.14ms self, 552.13ms w/children — props: style, children
- `ScrollView` ×10 — 17.01ms self, 89.32ms w/children — props: children
- `LeanReanimatedNativeDetector` ×4 — 15.99ms self, 108.15ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- `AnimatedComponent(View)` ×7 — 7.96ms self, 111.62ms w/children — props: style, children
- `GlobeGestureLayer` [React.memo] — 6.36ms self, 29.12ms w/children — props: enabled, collapseMode
- `IndicatorStrip` [React.memo + React Compiler] — 5.39ms self, 11.95ms w/children — props: linkedIds, linkedColor
- `DeckSlot` [React.memo] ×2 — 4.53ms self, 39.31ms w/children — props: scrollEnabled, children
- `NativeDetector` ×6 — 3.9ms self, 139.05ms w/children — props: gesture, children
- `MapSheet` [React Compiler] — 3.11ms self, 54.62ms w/children — props: renderList
- `GestureDetector` ×6 — 3.09ms self, 142.14ms w/children — props: gesture, children
- `StoryDock` [React.memo + React Compiler] — 2.67ms self, 6.96ms w/children — props: ruled
- `StoryDeck` [React.memo] — 2.47ms self, 45.57ms w/children — props: scrollEnabled, renderStory
- `StoryCard` [React.memo + React Compiler] — 2.19ms self, 9.87ms w/children — props: open
- `MapHeader` [React.memo + React Compiler] — 1.18ms self, 14.04ms w/children — props: linkedIds, linkedColor
- _... and 12 more_
- _Shown: 129.4ms self / 143.84ms commit (90%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=10` to see all._

**CPU during this commit:**
- `[Native] errorStackGetter` self=19.46ms total=19.46ms ([native]:0)
- `[Native] hermesBuiltinCopyDataProperties` self=15.15ms total=15.15ms ([native]:0)
- `[Host Function] now` self=14.8ms total=14.8ms ([host]:0)
- `[Host Function] completeRoot` self=11.67ms total=11.67ms ([host]:0)
- `updateFunctionComponent` self=11ms total=11ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:23202)

### Commit #11 — 2.61ms 🔵 (t=25.7s, margin)

- `LeanReanimatedNativeDetector` — 2.19ms self, 2.26ms w/children — props: onStartShouldSetResponder
- `NativeDetector` — 0.35ms self, 2.61ms w/children — state: useState

### Commit #12 — 16.95ms 🟡 (t=27.5s)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Root cause:** `View` re-rendered — props: style, transform

Render cascade:
- `AnimatedComponent(View)` ×7 — 12.16ms self, 42.64ms w/children — parent re-render
- `View` ×7 — 7.8ms self, 30.49ms w/children — props: style, transform

**CPU during this commit:**
- `pushComponentEffectStart` self=6.98ms total=6.98ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:20813)
- `[Host Function] createTask` self=5.08ms total=5.08ms ([host]:0)
- `get` self=4.89ms total=4.89ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:176576)

### Commit #13 — 261.1ms 🔴 (t=28.3s)

**Root cause:** `View` re-rendered — props: style, children

Render cascade:
- `View` ×32 — 46.78ms self, 1119.84ms w/children — props: style, children
- `HomeScreen` [React Compiler] — 44.89ms self, 261.1ms w/children — hooks
- `ScrollView` ×10 — 30.74ms self, 171.66ms w/children — props: children
- `IndicatorStrip` [React.memo + React Compiler] — 15.89ms self, 40.08ms w/children — props: linkedIds, linkedColor
- `AnimatedComponent(View)` ×7 — 13.7ms self, 200.46ms w/children — props: style, children
- `MapSheet` [React Compiler] — 11.26ms self, 132.76ms w/children — props: renderList
- `StoryDeck` [React.memo] — 10.2ms self, 97.11ms w/children — props: scrollEnabled, renderStory
- `DeckSlot` [React.memo] ×2 — 9.77ms self, 77.57ms w/children — props: scrollEnabled, children
- `GlobeGestureLayer` [React.memo] — 9.04ms self, 18.44ms w/children — props: enabled, collapseMode
- `GestureDetector` ×6 — 8.93ms self, 262.9ms w/children — props: gesture, children
- `NativeDetector` ×6 — 7.77ms self, 253.96ms w/children — props: gesture, children
- `StoryCard` [React.memo + React Compiler] — 7.43ms self, 20.58ms w/children — props: open
- `MapHeader` [React.memo + React Compiler] — 4.46ms self, 46.85ms w/children — props: linkedIds, linkedColor
- `AnimatedComponent(ScrollView)` ×2 — 4.27ms self, 41.15ms w/children — props: scrollEnabled, children
- `LeanReanimatedNativeDetector` ×4 — 4.2ms self, 196.99ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- _... and 12 more_
- _Shown: 229.3ms self / 261.1ms commit (88%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=13` to see all._

**CPU during this commit:**
- `updateVirtualChildrenRecursively` self=14.78ms total=14.78ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:45574)
- `measure` self=13.89ms total=13.89ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:29424)
- `[Host Function] completeRoot` self=10.51ms total=10.51ms ([host]:0)
- `[Host Function] createTask` self=7.59ms total=7.59ms ([host]:0)
- `get` self=6.04ms total=6.04ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:202799)

### Commit #14 — 0.72ms 🔵 (t=28.3s, margin)

- `NativeDetector` — 0.39ms self, 0.72ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.27ms self, 0.33ms w/children — props: onStartShouldSetResponder

### Commit #15 — 265.61ms 🔴 (t=29.6s)

**Root cause:** `View` re-rendered — props: style, children

Render cascade:
- `View` ×32 — 63.56ms self, 1126.46ms w/children — props: style, children
- `IndicatorStrip` [React.memo + React Compiler] — 46.75ms self, 69.72ms w/children — props: linkedIds, linkedColor
- `ScrollView` ×10 — 24.12ms self, 138.11ms w/children — props: children
- `HomeScreen` [React Compiler] — 22.02ms self, 265.61ms w/children — hooks
- `DeckSlot` [React.memo] ×2 — 17.37ms self, 63.76ms w/children — props: scrollEnabled, children
- `AnimatedComponent(View)` ×7 — 10.27ms self, 156.23ms w/children — props: style, children
- `StoryDeck` [React.memo] — 10.07ms self, 80.29ms w/children — props: scrollEnabled, renderStory
- `MapSheet` [React Compiler] — 9.61ms self, 105.26ms w/children — props: renderList
- `Veil` [React.memo + React Compiler] — 6.69ms self, 10.1ms w/children — props: open
- `GestureDetector` ×6 — 6.66ms self, 208.95ms w/children — props: gesture, children
- `NativeDetector` ×6 — 6.3ms self, 202.29ms w/children — props: gesture, children
- `StoryCard` [React.memo + React Compiler] — 6.06ms self, 25.5ms w/children — props: open
- `LeanReanimatedNativeDetector` ×4 — 3.9ms self, 158.83ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- `MapHeader` [React.memo + React Compiler] — 3.57ms self, 75.03ms w/children — props: linkedIds, linkedColor
- `GlobeGestureLayer` [React.memo] — 3.29ms self, 12.16ms w/children — props: enabled, collapseMode
- _... and 12 more_
- _Shown: 240.2ms self / 265.61ms commit (90%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=15` to see all._

**CPU during this commit:**
- `[Host Function] completeRoot` self=14.48ms total=14.48ms ([host]:0)
- `createSerializable` self=11.15ms total=11.15ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:158424)
- `[Host Function] run` self=10.78ms total=10.78ms ([host]:0)
- `[Host Function] cloneNodeWithNewChildren` self=4.44ms total=4.44ms ([host]:0)

### Commit #16 — 0.74ms 🔵 (t=29.6s, margin)

- `NativeDetector` — 0.47ms self, 0.74ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.2ms self, 0.27ms w/children — props: onStartShouldSetResponder

---
## Top Components by Total Render Cost

| Component | Renders | Total | Avg | Max | Reason | File |
|---|---|---|---|---|---|---|
| `View` ⚠️ | 213 | 250.8ms | 1.18ms | 39.35ms | props: children, style, pointerEvents | — |
| `HomeScreen` [React Compiler] ⚠️ | 6 | 166.7ms | 27.78ms | 44.89ms | hooks | — |
| `ScrollView` ⚠️ | 60 | 142.4ms | 2.37ms | 13.7ms | props: children, style, scrollEnabled | — |
| `IndicatorStrip` [React.memo + React Compiler] ⚠️ | 6 | 93.4ms | 15.56ms | 46.75ms | props: linkedIds, linkedColor | `map/IndicatorStrip.tsx:178` |
| `LeanReanimatedNativeDetector` ⚠️ | 30 | 61.9ms | 2.06ms | 22.36ms | props: onStartShouldSetResponder, children, onGestureHandlerStateChange | — |
| `StoryDeck` [React.memo] ⚠️ | 6 | 61.3ms | 10.21ms | 21.43ms | props: scrollEnabled, renderStory | `map/StoryDeck.tsx:250` |
| `DeckSlot` [React.memo] ⚠️ | 12 | 51.8ms | 4.32ms | 15.48ms | props: scrollEnabled, children | `map/StoryDeck.tsx:136` |
| `MapSheet` [React Compiler] ⚠️ | 6 | 49.8ms | 8.3ms | 11.26ms | props: renderList | `map/MapSheet.tsx:134` |
| `NativeDetector` ⚠️ | 42 | 42.2ms | 1ms | 2.71ms | props: children, gesture | — |
| `StoryCard` [React.memo + React Compiler] ⚠️ | 6 | 41.8ms | 6.96ms | 17.05ms | props: open | `map/StoryCard.tsx:207` |
| `GestureDetector` ⚠️ | 36 | 36ms | 1ms | 2.93ms | props: children, gesture | — |
| `GlobeGestureLayer` [React.memo] ⚠️ | 6 | 29.6ms | 4.93ms | 9.04ms | props: enabled, collapseMode | `map/GlobeGestureLayer.tsx:128` |
| `StoryDock` [React.memo + React Compiler] ⚠️ | 6 | 21.2ms | 3.54ms | 6.08ms | props: ruled | `map/StoryDock.tsx:74` |
| `MapHeader` [React.memo + React Compiler] ⚠️ | 6 | 18.1ms | 3.02ms | 4.46ms | props: linkedIds, linkedColor | `map/MapHeader.tsx:195` |
| `Veil` [React.memo + React Compiler] ⚠️ | 6 | 14ms | 2.34ms | 6.69ms | props: open | `map/StoryCard.tsx:160` |
| `InterceptingGestureDetector` ⚠️ | 6 | 12ms | 2.01ms | 4.08ms | props: gesture, children | — |
| `ScrollViewResponderProvider` ⚠️ | 6 | 9.7ms | 1.61ms | 2.07ms | props: children | — |
| `ScrubBar` [React.memo + React Compiler] ⚠️ | 6 | 7.3ms | 1.22ms | 1.66ms | props: scrub, accessibilityValue, children | `components/ScrubBar.tsx:281` |
| `BriefingChrome` [forwardRef] ⚠️ | 6 | 4.3ms | 0.71ms | 1.4ms | parent re-render | `components/BriefingChrome.tsx:62` |
| `Text` ✓ | 24 | 3.4ms | 0.14ms | 0.26ms | parent re-render | `primitives/Text.tsx:33` |

---
## Suggested Improvements

### `View`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

### `HomeScreen` [React Compiler]

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

### `ScrollView`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

### `IndicatorStrip` [React.memo + React Compiler] — `map/IndicatorStrip.tsx:178`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

<details><summary>Source — `map/IndicatorStrip.tsx:178`</summary>

```tsx

export const IndicatorStrip = memo(function IndicatorStrip({
  items,
  onSelect,
  onAll,
  selectedId = null,
  linkedIds,
  linkedColor,
  initialViewport,
}: {
  items: StripItem[];
  onSelect: (item: StripItem) => void;
  /** Opens every instrument as one ranked list. */
  onAll: () => void;
  /** The gauge whose card is open. */
  selectedId?: string | null;
  /** Gauges tied to the open story: marked in `linkedColor`, the first
   *  scrolled into view. */
  linkedIds?: ReadonlySet<string>;
  linkedColor?: string;
  /** The room the bar will leave, computed by the bar before layout, so the
   *  slots are not laid out at a guess and then resized once measured. */
  initialViewport?: number;
}) {
  // Sized from the room the bar actually leaves; `initialViewport` is the
  // bar's own arithmetic, and the layout pass only corrects it.
  const { width: screenWidth } = useWindowDimensions();
  const [viewport, setViewport] = useState(initialViewport ?? screenWidth / 2);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setViewport((prev) => (prev === next ? prev : next));
  }, []);
  const slotWidth = Math.round((viewport - SPACING.md * Math.floor(VISIBLE_SLOTS)) / VISIBLE_SLOTS);

  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const slotX = useRef(new Map<string, number>());
  // A slot placing itself is not news, so the offsets live in a ref — but the
  // recompute has to know they arrived. The row's own layout and its content's
  // size are both events on views *above* the slots, so either can reach JS
  // first and find nothing measured; this counts the slots that moved instead.
  // React batches a whole layout pass into one render, so twenty-odd slots
  // reporting together cost one.
  const [placements, setPlacements] = useState(0);
  const handlePlaced = useCallback((id: string, x: number) => {
    if (slotX.current.get(id) === x) return;
    slotX.current.set(id, x);
    setPlacements((n) => n + 1);
  }, []);

```

</details>

### `LeanReanimatedNativeDetector`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.


> 📝 Dev mode renders are ~3× slower than production. Divide ms values by ~3 for a rough production estimate.

---
## Next Steps

Ask the user which path to take:

1. **Investigate further** — use query tools to drill into specific findings before making changes:
   - `profiler-commit-query` mode=`by_index` commit_index=15 — full breakdown of the slowest commit
   - `profiler-cpu-query` mode=`component_cpu` component_name=`View` — CPU activity during this component's renders
   - `profiler-cpu-query` mode=`call_tree` — trace callers/callees of hot functions
2. **Implement fixes** — apply changes to the top offenders identified above, then re-profile the same scenario to measure improvement.
3. **Done for now** — save the report for reference.
