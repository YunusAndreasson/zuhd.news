# Profiling Analysis — 14.7s session
**React Compiler:** ✓  **Hot commits:** 8 of 17 total

> **Duration columns:** `self` = this component's own render work only (exclusive).
> `w/children` = self + the entire subtree it owns (inclusive).
> Do not sum the `w/children` column — a parent's inclusive time already contains its
> children's time. Use `self` for summing; use `w/children` to understand container cost.

---
## Slow React Batches

### Commit #0 — 1.98ms 🔵 (t=3.0s, margin)

- `NativeDetector` — 1.03ms self, 1.98ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.62ms self, 0.94ms w/children — props: onStartShouldSetResponder

### Commit #1 — 210.64ms 🔴 (t=3.8s)

**Root cause:** `HomeScreen` [React Compiler] re-rendered — hooks

Render cascade:
- `HomeScreen` [React Compiler] — 47.8ms self, 210.64ms w/children — hooks
- `View` ×32 — 30.01ms self, 719.66ms w/children — props: style, children
- `GlobeGestureLayer` [React.memo] — 25.05ms self, 36.83ms w/children — (mount)
- `ScrollView` ×10 — 13.98ms self, 102.67ms w/children — props: children
- `AnimatedComponent(View)` ×7 — 11.19ms self, 121.75ms w/children — props: style, children
- `IndicatorStrip` [React.memo + React Compiler] — 7.56ms self, 18.63ms w/children — props: linkedIds, linkedColor
- `MapSheet` [React Compiler] — 6.65ms self, 75.82ms w/children — props: renderList
- `NativeDetector` ×6 — 6.61ms self, 161.82ms w/children — parent re-render
- `StoryDock` [React.memo + React Compiler] — 6.48ms self, 16.12ms w/children — props: ruled
- `DeckSlot` [React.memo] ×2 — 6.47ms self, 47.55ms w/children — props: scrollEnabled, children
- `StoryDeck` [React.memo] — 4.76ms self, 56.74ms w/children — props: scrollEnabled, renderStory
- `GestureDetector` ×6 — 4.51ms self, 166.33ms w/children — parent re-render
- `StoryCard` [React.memo + React Compiler] — 4.49ms self, 14.89ms w/children — props: open
- `LeanReanimatedNativeDetector` ×4 — 4.06ms self, 124.81ms w/children — parent re-render
- `AnimatedComponent(ScrollView)` ×2 — 2.7ms self, 26.39ms w/children — props: scrollEnabled, children
- _... and 12 more_
- _Shown: 182.3ms self / 210.64ms commit (87%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=1` to see all._

**CPU during this commit:**
- `[Native] errorStackGetter` self=24.14ms total=24.14ms ([native]:0)
- `[Host Function] completeRoot` self=23.87ms total=23.87ms ([host]:0)
- `addObjectDiffToProperties` self=17.81ms total=17.81ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:20174)
- `[Native] errorStackGetter` self=16.43ms total=16.43ms ([native]:0)
- `ReactElement` self=15.57ms total=15.57ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:10922)

### Commit #2 — 90.99ms 🔴 (t=5.0s)

**Root cause:** `HomeScreen` [React Compiler] re-rendered — hooks

Render cascade:
- `HomeScreen` [React Compiler] — 15.7ms self, 90.99ms w/children — hooks
- `View` ×32 — 15.49ms self, 347.36ms w/children — props: style, children
- `ScrollView` ×10 — 6.67ms self, 34.9ms w/children — props: children
- `NativeDetector` ×6 — 5.81ms self, 78.02ms w/children — props: gesture, children
- `AnimatedComponent(View)` ×7 — 5.73ms self, 57.82ms w/children — props: style, children
- `DeckSlot` [React.memo] ×2 — 5.08ms self, 22.62ms w/children — props: scrollEnabled, children
- `MapSheet` [React Compiler] — 4.74ms self, 42.65ms w/children — props: renderList
- `GestureDetector` ×6 — 3.76ms self, 81.78ms w/children — props: gesture, children
- `IndicatorStrip` [React.memo + React Compiler] — 3.36ms self, 9.02ms w/children — props: linkedIds, linkedColor
- `StoryDeck` [React.memo] — 2.88ms self, 29.81ms w/children — props: scrollEnabled, renderStory
- `StoryDock` [React.memo + React Compiler] — 2.77ms self, 12.02ms w/children — props: ruled
- `LeanReanimatedNativeDetector` ×4 — 2.62ms self, 63.06ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- `ScrubBar` [React.memo + React Compiler] — 2.59ms self, 7.33ms w/children — props: scrub, accessibilityValue, children
- `MapHeader` [React.memo + React Compiler] — 1.95ms self, 12.78ms w/children — props: linkedIds, linkedColor
- `GlobeGestureLayer` [React.memo] — 1.46ms self, 5.05ms w/children — props: enabled, collapseMode
- _... and 12 more_
- _Shown: 80.6ms self / 90.99ms commit (89%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=2` to see all._

**CPU during this commit:**
- `propagateParentContextChanges` self=18.34ms total=18.34ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:20697)
- `get` self=15.44ms total=15.44ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:222740)
- `useFiber` self=14.72ms total=14.72ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:21226)
- `[Host Function] createTask` self=11.66ms total=11.66ms ([host]:0)
- `updateHookTypesDev` self=10.97ms total=10.97ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:21879)

### Commit #3 — 0.5ms 🔵 (t=5.0s, margin)

- `NativeDetector` — 0.31ms self, 0.5ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.15ms self, 0.19ms w/children — props: onStartShouldSetResponder

### Commit #4 — 23.45ms 🟡 (t=6.2s)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Root cause:** `View` re-rendered — props: style, transform

Render cascade:
- `AnimatedComponent(View)` ×7 — 13.53ms self, 57.45ms w/children — parent re-render
- `View` ×7 — 7.39ms self, 43.92ms w/children — props: style, transform

### Commit #5 — 13.45ms 🔵 (t=6.7s, margin)

- `AnimatedComponent(View)` ×7 — 9.21ms self, 31.62ms w/children — parent re-render
- `View` ×7 — 6.74ms self, 22.42ms w/children — props: style, transform

### Commit #6 — 2.84ms 🔵 (t=7.4s, margin)

- `LeanReanimatedNativeDetector` — 1.35ms self, 1.57ms w/children — props: onStartShouldSetResponder
- `NativeDetector` — 1.26ms self, 2.84ms w/children — state: useState

### Commit #7 — 174.78ms 🔴 (t=8.1s)

**Root cause:** `HomeScreen` [React Compiler] re-rendered — hooks

Render cascade:
- `HomeScreen` [React Compiler] — 40.14ms self, 174.78ms w/children — hooks
- `View` ×32 — 25.08ms self, 678.49ms w/children — props: style, children
- `IndicatorStrip` [React.memo + React Compiler] — 17.85ms self, 32.2ms w/children — props: linkedIds, linkedColor
- `ScrollView` ×10 — 15.03ms self, 101.71ms w/children — props: children
- `AnimatedComponent(View)` ×7 — 8.9ms self, 110.04ms w/children — props: style, children
- `MapSheet` [React Compiler] — 8.7ms self, 73.57ms w/children — props: renderList
- `StoryDeck` [React.memo] — 5.73ms self, 52.37ms w/children — props: scrollEnabled, renderStory
- `NativeDetector` ×6 — 5.3ms self, 143.16ms w/children — props: gesture, children
- `DeckSlot` [React.memo] ×2 — 5.03ms self, 43.27ms w/children — props: scrollEnabled, children
- `GestureDetector` ×6 — 4.77ms self, 147.92ms w/children — props: gesture, children
- `StoryDock` [React.memo + React Compiler] — 3.31ms self, 7.38ms w/children — props: ruled
- `MapHeader` [React.memo + React Compiler] — 3.01ms self, 37.41ms w/children — props: linkedIds, linkedColor
- `InterceptingGestureDetector` — 2.95ms self, 8.5ms w/children — props: gesture, children
- `GlobeGestureLayer` [React.memo] — 2.9ms self, 10.23ms w/children — props: enabled, collapseMode
- `StoryCard` [React.memo + React Compiler] — 2.81ms self, 12.01ms w/children — props: open
- _... and 12 more_
- _Shown: 151.5ms self / 174.78ms commit (87%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=7` to see all._

**CPU during this commit:**
- `[Host Function] createTask` self=15.72ms total=15.72ms ([host]:0)
- `[Host Function] createTask` self=14.68ms total=14.68ms ([host]:0)
- `isSharedValue` self=14.44ms total=14.44ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:182843)
- `recursivelyTraversePassiveUnmountEffects` self=13.7ms total=13.7ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:25034)
- `jsxDEVImpl` self=13.32ms total=13.32ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:10966)

### Commit #8 — 101.96ms 🔴 (t=9.3s)

**Root cause:** `View` re-rendered — props: style, children

Render cascade:
- `View` ×32 — 18.87ms self, 421.94ms w/children — props: style, children
- `ScrollView` ×10 — 11.6ms self, 62.27ms w/children — props: children
- `HomeScreen` [React Compiler] — 11.22ms self, 101.96ms w/children — hooks
- `AnimatedComponent(View)` ×7 — 8.39ms self, 73.98ms w/children — props: style, children
- `MapSheet` [React Compiler] — 7.59ms self, 50.1ms w/children — props: renderList
- `StoryDeck` [React.memo] — 6.43ms self, 33.29ms w/children — props: scrollEnabled, renderStory
- `IndicatorStrip` [React.memo + React Compiler] — 5.89ms self, 13.1ms w/children — props: linkedIds, linkedColor
- `StoryDock` [React.memo + React Compiler] — 3.62ms self, 7.13ms w/children — props: ruled
- `GlobeGestureLayer` [React.memo] — 2.72ms self, 6.85ms w/children — props: enabled, collapseMode
- `StoryCard` [React.memo + React Compiler] — 2.58ms self, 6.31ms w/children — props: open
- `AnimatedComponent(ScrollView)` ×2 — 2.51ms self, 18.2ms w/children — props: scrollEnabled, children
- `NativeDetector` ×6 — 2.43ms self, 90.85ms w/children — props: gesture, children
- `DeckSlot` [React.memo] ×2 — 2.23ms self, 25.08ms w/children — props: scrollEnabled, children
- `GestureDetector` ×6 — 2.12ms self, 92.96ms w/children — props: gesture, children
- `LeanReanimatedNativeDetector` ×4 — 1.88ms self, 69.01ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- _... and 12 more_
- _Shown: 90.1ms self / 101.96ms commit (88%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=8` to see all._

**CPU during this commit:**
- `[Host Function] createTask` self=18.7ms total=18.7ms ([host]:0)
- `[Host Function] createTask` self=16.33ms total=16.33ms ([host]:0)
- `[Host Function] createTask` self=16.02ms total=16.02ms ([host]:0)
- `[Host Function] createTask` self=13.21ms total=13.21ms ([host]:0)
- `[Host Function] completeRoot` self=13.05ms total=13.05ms ([host]:0)

### Commit #9 — 0.63ms 🔵 (t=9.4s, margin)

- `NativeDetector` — 0.33ms self, 0.63ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.25ms self, 0.3ms w/children — props: onStartShouldSetResponder

### Commit #10 — 15.45ms 🔵 (t=10.4s, margin)

- `AnimatedComponent(View)` ×7 — 10.88ms self, 39.24ms w/children — parent re-render
- `View` ×7 — 6.7ms self, 28.35ms w/children — props: style, transform

### Commit #11 — 16ms 🟡 (t=10.9s)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Root cause:** `View` re-rendered — props: style, transform

Render cascade:
- `AnimatedComponent(View)` ×7 — 11.56ms self, 39.61ms w/children — parent re-render
- `View` ×7 — 6.33ms self, 28.04ms w/children — props: style, transform

### Commit #12 — 1.54ms 🔵 (t=11.5s, margin)

- `NativeDetector` — 0.79ms self, 1.54ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.61ms self, 0.75ms w/children — props: onStartShouldSetResponder

### Commit #13 — 169.17ms 🔴 (t=12.3s)

**Root cause:** `View` re-rendered — props: style, children

Render cascade:
- `View` ×32 — 27.89ms self, 679.52ms w/children — props: style, children
- `HomeScreen` [React Compiler] — 26.76ms self, 169.17ms w/children — hooks
- `StoryDeck` [React.memo] — 16.89ms self, 56.9ms w/children — props: scrollEnabled, renderStory
- `ScrollView` ×10 — 14.3ms self, 92.4ms w/children — props: children
- `IndicatorStrip` [React.memo + React Compiler] — 12.6ms self, 27.13ms w/children — props: linkedIds, linkedColor
- `AnimatedComponent(View)` ×7 — 8.67ms self, 109.66ms w/children — props: style, children
- `MapSheet` [React Compiler] — 5.98ms self, 76.08ms w/children — props: renderList
- `NativeDetector` ×6 — 5.42ms self, 138.6ms w/children — props: gesture, children
- `DeckSlot` [React.memo] ×2 — 5.13ms self, 36.71ms w/children — props: scrollEnabled, children
- `GlobeGestureLayer` [React.memo] — 4.68ms self, 12.84ms w/children — props: enabled, collapseMode
- `StoryDock` [React.memo + React Compiler] — 4.25ms self, 11.49ms w/children — props: ruled
- `GestureDetector` ×6 — 4.15ms self, 142.76ms w/children — props: gesture, children
- `StoryCard` [React.memo + React Compiler] — 3.31ms self, 10.6ms w/children — props: open
- `LeanReanimatedNativeDetector` ×4 — 3.22ms self, 109.84ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- `MapHeader` [React.memo + React Compiler] — 2.93ms self, 34.3ms w/children — props: linkedIds, linkedColor
- _... and 12 more_
- _Shown: 146.2ms self / 169.17ms commit (86%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=13` to see all._

**CPU during this commit:**
- `[Host Function] createTask` self=21.22ms total=21.22ms ([host]:0)
- `[Host Function] createTask` self=20.68ms total=20.68ms ([host]:0)
- `updateElement` self=15.42ms total=15.42ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:21251)
- `[Native] errorStackGetter` self=14.22ms total=14.22ms ([native]:0)
- `[Host Function] completeRoot` self=13.82ms total=13.82ms ([host]:0)

### Commit #14 — 59.77ms 🔴 (t=13.4s)

**Root cause:** `HomeScreen` [React Compiler] re-rendered — hooks

Render cascade:
- `HomeScreen` [React Compiler] — 12.77ms self, 59.77ms w/children — hooks
- `View` ×32 — 9.83ms self, 230.55ms w/children — props: style, children
- `IndicatorStrip` [React.memo + React Compiler] — 5.71ms self, 10.52ms w/children — props: linkedIds, linkedColor
- `ScrollView` ×10 — 4.72ms self, 34.49ms w/children — props: children
- `AnimatedComponent(View)` ×7 — 2.86ms self, 35.42ms w/children — props: style, children
- `StoryDock` [React.memo + React Compiler] — 2.79ms self, 7.47ms w/children — props: ruled
- `DeckSlot` [React.memo] ×2 — 1.85ms self, 15.07ms w/children — props: scrollEnabled, children
- `StoryCard` [React.memo + React Compiler] — 1.78ms self, 4.96ms w/children — props: open
- `NativeDetector` ×6 — 1.55ms self, 48.76ms w/children — props: gesture, children
- `MapSheet` [React Compiler] — 1.27ms self, 21.44ms w/children — props: renderList
- `GlobeGestureLayer` [React.memo] — 1.27ms self, 3ms w/children — props: enabled, collapseMode
- `StoryDeck` [React.memo] — 1.14ms self, 17.39ms w/children — props: scrollEnabled, renderStory
- `ScrollViewResponderProvider` — 1.1ms self, 4.1ms w/children — props: children
- `GestureDetector` ×6 — 1.09ms self, 49.85ms w/children — props: gesture, children
- `AnimatedComponent(ScrollView)` ×2 — 1.01ms self, 9.1ms w/children — props: scrollEnabled, children
- _... and 12 more_
- _Shown: 50.7ms self / 59.77ms commit (85%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=14` to see all._

**CPU during this commit:**
- `[Native] mapPrototypeGet` self=12.6ms total=12.6ms ([native]:0)
- `[Host Function] createTask` self=10.25ms total=10.25ms ([host]:0)
- `get` self=6.29ms total=6.29ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:176649)
- `[Host Function] createTask` self=5.85ms total=5.85ms ([host]:0)

### Commit #15 — 0.7ms 🔵 (t=13.4s, margin)

- `NativeDetector` — 0.37ms self, 0.7ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.25ms self, 0.33ms w/children — props: onStartShouldSetResponder

---
## Top Components by Total Render Cost

| Component | Renders | Total | Avg | Max | Reason | File |
|---|---|---|---|---|---|---|
| `HomeScreen` [React Compiler] ⚠️ | 6 | 154.4ms | 25.73ms | 47.8ms | hooks | — |
| `View` ⚠️ | 217 | 152ms | 0.7ms | 4.1ms | props: children, style, transform | — |
| `ScrollView` ⚠️ | 60 | 66.3ms | 1.11ms | 3.59ms | props: children, style, scrollEnabled | — |
| `IndicatorStrip` [React.memo + React Compiler] ⚠️ | 6 | 53ms | 8.83ms | 17.85ms | props: linkedIds, linkedColor | `map/IndicatorStrip.tsx:178` |
| `StoryDeck` [React.memo] ⚠️ | 6 | 37.8ms | 6.3ms | 16.89ms | props: scrollEnabled, renderStory | `map/StoryDeck.tsx:250` |
| `MapSheet` [React Compiler] ⚠️ | 6 | 34.9ms | 5.82ms | 8.7ms | props: renderList | `map/MapSheet.tsx:136` |
| `NativeDetector` ⚠️ | 41 | 29.6ms | 0.72ms | 2.12ms | props: children, gesture | — |
| `DeckSlot` [React.memo] ⚠️ | 12 | 25.8ms | 2.15ms | 3.49ms | props: scrollEnabled, children | `map/StoryDeck.tsx:136` |
| `StoryDock` [React.memo + React Compiler] ⚠️ | 6 | 23.2ms | 3.87ms | 6.48ms | props: ruled | `map/StoryDock.tsx:74` |
| `GestureDetector` ⚠️ | 35 | 19.4ms | 0.55ms | 1.51ms | props: children, gesture | — |
| `LeanReanimatedNativeDetector` ⚠️ | 29 | 17.4ms | 0.6ms | 1.35ms | props: onStartShouldSetResponder, children, onGestureHandlerStateChange | — |
| `StoryCard` [React.memo + React Compiler] ⚠️ | 6 | 15.8ms | 2.64ms | 4.49ms | props: open | `map/StoryCard.tsx:207` |
| `GlobeGestureLayer` [React.memo] | 5 | 13ms | 2.61ms | 4.68ms | props: enabled, collapseMode | `map/GlobeGestureLayer.tsx:129` |
| `MapHeader` [React.memo + React Compiler] ⚠️ | 6 | 12.2ms | 2.03ms | 3.01ms | props: linkedIds, linkedColor | `map/MapHeader.tsx:195` |
| `InterceptingGestureDetector` ⚠️ | 6 | 9.9ms | 1.64ms | 2.95ms | props: gesture, children | — |
| `ScrubBar` [React.memo + React Compiler] ⚠️ | 6 | 9.8ms | 1.63ms | 2.59ms | props: scrub, accessibilityValue, children | `components/ScrubBar.tsx:281` |
| `ScrollViewResponderProvider` ⚠️ | 6 | 7.1ms | 1.19ms | 2.13ms | props: children | — |
| `Text` ✓ | 24 | 4.8ms | 0.2ms | 0.28ms | parent re-render | `primitives/Text.tsx:33` |
| `Veil` [React.memo + React Compiler] ⚠️ | 6 | 4.3ms | 0.72ms | 1.33ms | props: open | `map/StoryCard.tsx:160` |
| `BriefingChrome` [forwardRef] ⚠️ | 6 | 3.5ms | 0.58ms | 1.06ms | parent re-render | `components/BriefingChrome.tsx:62` |

---
## Suggested Improvements

### `HomeScreen` [React Compiler]

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

### `View`

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

### `StoryDeck` [React.memo] — `map/StoryDeck.tsx:250`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

<details><summary>Source — `map/StoryDeck.tsx:250`</summary>

```tsx

export const StoryDeck = memo(function StoryDeck({
  count,
  peekFade,
  index,
  progress,
  width,
  sheetGesture,
  scrollEnabled,
  onScrollOffset,
  bottomInset = 0,
  keyOf,
  renderStory,
  renderEnd,
  onDragStart,
  onClaim,
  onRollback,
  onSettle,
  ref,
}: StoryDeckProps) {
  // Use the full reading width at both detents. The scrubber signals more
  // stories; reserving a neighbour preview narrowed every paragraph, even
  // when expanded. A fixed width also avoids reflow during vertical drags.
  const pitch = Math.max(1, width);
  const slotWidth = pitch;
  /** Where the card was when the pan claimed it, and the finger's translation then. */
  const start = useSharedValue(0);
  const startX = useSharedValue(0);
  /** The story last handed to `onSettle`, so a caught card is not re-committed. */
  const committed = useSharedValue(index);
  /** Where the last `step` sent the deck, so a second tap before React has
   *  caught up goes one further. JS-side on purpose: reading `committed`
   *  from JS would wait on the UI thread. */
  const stepTarget = useRef(index);
  useEffect(() => {
    committed.value = index;
    stepTarget.current = index;
  }, [committed, index]);

  useImperativeHandle(
    ref,
    () => ({
      step: (delta: number) => {
        const target = Math.max(0, Math.min(count, stepTarget.current + delta));
        if (target === stepTarget.current) return;
        stepTarget.current = target;
        onDragStart();
        // A tap is not a finger carrying the card, so it takes the plain
        // landing, which Reanimated snaps under Reduce Motion; a released
        // swipe keeps its spring (`KEEP_MOTION`) because it continues a hand.
```

</details>


> 📝 Dev mode renders are ~3× slower than production. Divide ms values by ~3 for a rough production estimate.

---
## Next Steps

Ask the user which path to take:

1. **Investigate further** — use query tools to drill into specific findings before making changes:
   - `profiler-commit-query` mode=`by_index` commit_index=1 — full breakdown of the slowest commit
   - `profiler-cpu-query` mode=`component_cpu` component_name=`Forget(HomeScreen)` — CPU activity during this component's renders
   - `profiler-cpu-query` mode=`call_tree` — trace callers/callees of hot functions
2. **Implement fixes** — apply changes to the top offenders identified above, then re-profile the same scenario to measure improvement.
3. **Done for now** — save the report for reference.
