# Profiling Analysis — 22.0s session
**React Compiler:** ✓  **Hot commits:** 6 of 17 total

> **Duration columns:** `self` = this component's own render work only (exclusive).
> `w/children` = self + the entire subtree it owns (inclusive).
> Do not sum the `w/children` column — a parent's inclusive time already contains its
> children's time. Use `self` for summing; use `w/children` to understand container cost.

---
## Slow React Batches

### Commit #0 — 58.12ms 🔴 (t=12.9s)

**Root cause:** `View` re-rendered — props: style, children

Render cascade:
- `View` ×32 — 9.36ms self, 269.41ms w/children — props: style, children
- `HomeScreen` [React Compiler] — 7.4ms self, 58.12ms w/children — hooks
- `NativeDetector` ×6 — 5.27ms self, 69.1ms w/children — props: gesture, children
- `ScrollView` ×10 — 4.77ms self, 40.91ms w/children — props: children
- `AnimatedComponent(View)` ×7 — 3.96ms self, 49.75ms w/children — props: style, children
- `DeckSlot` [React.memo] ×2 — 3.27ms self, 19.18ms w/children — props: scrollEnabled, children
- `MapSheet` [React Compiler] — 2.52ms self, 34.21ms w/children — props: renderList
- `StoryCard` [React.memo + React Compiler] — 2.29ms self, 6.5ms w/children — props: open
- `StoryDock` [React.memo + React Compiler] — 2.25ms self, 5.28ms w/children — props: ruled
- `IndicatorStrip` [React.memo + React Compiler] — 1.94ms self, 5.26ms w/children — props: linkedIds, linkedColor
- `StoryDeck` [React.memo] — 1.91ms self, 26.46ms w/children — props: scrollEnabled, renderStory
- `GestureDetector` ×6 — 1.37ms self, 70.47ms w/children — props: gesture, children
- `LeanReanimatedNativeDetector` ×4 — 1.36ms self, 51.31ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- `AnimatedComponent(ScrollView)` ×2 — 0.92ms self, 11.61ms w/children — props: scrollEnabled, children
- `GlobeGestureLayer` [React.memo] — 0.9ms self, 2.96ms w/children — props: enabled, collapseMode
- _... and 12 more_
- _Shown: 49.5ms self / 58.12ms commit (85%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=0` to see all._

**CPU during this commit:**
- `popHostContext` self=11.85ms total=11.85ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:20406)
- `[Host Function] createSerializableNumber` self=9.33ms total=9.33ms ([host]:0)
- `[Host Function] createTask` self=8.45ms total=8.45ms ([host]:0)
- `createWorkInProgress` self=1.96ms total=1.96ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:26352)

### Commit #1 — 0.64ms 🔵 (t=13.0s, margin)

- `NativeDetector` — 0.32ms self, 0.64ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.26ms self, 0.32ms w/children — props: onStartShouldSetResponder

### Commit #2 — 3.17ms 🔵 (t=14.1s, margin)

- `AnimatedComponent(View)` ×2 — 2.85ms self, 6.29ms w/children — parent re-render
- `View` ×2 — 1.99ms self, 3.43ms w/children — props: style, opacity

### Commit #3 — 231.49ms 🔴 (t=14.4s)

**Root cause:** `View` re-rendered — props: style, children

Render cascade:
- `View` ×32 — 27.61ms self, 990.17ms w/children — props: style, children
- `HomeScreen` [React Compiler] — 27.32ms self, 231.49ms w/children — hooks
- `StoryDock` [React.memo + React Compiler] — 27.16ms self, 42.37ms w/children — props: ruled
- `ScrollView` ×10 — 25.49ms self, 141.55ms w/children — props: children
- `LeanReanimatedNativeDetector` ×4 — 12.35ms self, 196.28ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- `AnimatedComponent(View)` ×7 — 9.91ms self, 171.11ms w/children — props: style, children
- `DeckSlot` [React.memo] ×2 — 7.38ms self, 61.62ms w/children — props: scrollEnabled, children
- `IndicatorStrip` [React.memo + React Compiler] — 7.35ms self, 24.1ms w/children — props: linkedIds, linkedColor
- `MapSheet` [React Compiler] — 7.1ms self, 115.04ms w/children — props: renderList
- `AnimatedComponent(ScrollView)` ×2 — 6.55ms self, 37.62ms w/children — props: scrollEnabled, children
- `NativeDetector` ×6 — 6.07ms self, 247.07ms w/children — props: gesture, children
- `StoryDeck` [React.memo] — 6.01ms self, 92.35ms w/children — props: scrollEnabled, renderStory
- `GestureDetector` ×6 — 5.26ms self, 252.33ms w/children — props: gesture, children
- `StoryCard` [React.memo + React Compiler] — 3.76ms self, 14.22ms w/children — props: open
- `AnimatedScrollView` ×2 — 3.11ms self, 44.25ms w/children — props: scrollEnabled, children
- _... and 12 more_
- _Shown: 182.4ms self / 231.49ms commit (79%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=3` to see all._

**CPU during this commit:**
- `unmountRemainingChildren` self=19.39ms total=19.39ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:45154)
- `[Host Function] createTask` self=19.18ms total=19.18ms ([host]:0)
- `pushSimpleEffect` self=18.94ms total=18.94ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:22498)
- `setCurrentFiber` self=16.27ms total=16.27ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:19386)
- `[Host Function] completeRoot` self=14.89ms total=14.89ms ([host]:0)

### Commit #4 — 4.46ms 🔵 (t=14.5s, margin)

- `NativeDetector` — 4.13ms self, 4.46ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.25ms self, 0.33ms w/children — props: onStartShouldSetResponder

### Commit #6 — 10ms 🔵 (t=16.6s, margin)

- `AnimatedComponent(View)` ×7 — 7.55ms self, 25.43ms w/children — parent re-render
- `View` ×7 — 4.07ms self, 17.88ms w/children — props: style, transform

### Commit #7 — 185.98ms 🔴 (t=16.9s)

**Root cause:** `View` re-rendered — props: style, children

Render cascade:
- `View` ×32 — 26.74ms self, 831.61ms w/children — props: style, children
- `HomeScreen` [React Compiler] — 21.13ms self, 185.98ms w/children — hooks
- `ScrollView` ×10 — 16.39ms self, 141.55ms w/children — props: children
- `InterceptingGestureDetector` — 15.86ms self, 23.61ms w/children — props: gesture, children
- `AnimatedComponent(View)` ×7 — 10.11ms self, 128.88ms w/children — props: style, children
- `IndicatorStrip` [React.memo + React Compiler] — 9.03ms self, 38.53ms w/children — props: linkedIds, linkedColor
- `NativeDetector` ×6 — 8.56ms self, 175.17ms w/children — props: gesture, children
- `MapSheet` [React Compiler] — 8.43ms self, 85.46ms w/children — props: renderList
- `DeckSlot` [React.memo] ×2 — 7.12ms self, 52.07ms w/children — props: scrollEnabled, children
- `GestureDetector` ×6 — 5.89ms self, 181.06ms w/children — props: gesture, children
- `StoryDeck` [React.memo] — 5.49ms self, 63.59ms w/children — props: scrollEnabled, renderStory
- `StoryDock` [React.memo + React Compiler] — 5.19ms self, 17.05ms w/children — props: ruled
- `LeanReanimatedNativeDetector` ×4 — 4.56ms self, 133.54ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- `AnimatedScrollView` ×2 — 4.36ms self, 32.71ms w/children — props: scrollEnabled, children
- `StoryCard` [React.memo + React Compiler] — 3.53ms self, 14.51ms w/children — props: open
- _... and 12 more_
- _Shown: 152.4ms self / 185.98ms commit (82%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=7` to see all._

**CPU during this commit:**
- `[Host Function] completeRoot` self=30.88ms total=30.88ms ([host]:0)
- `get` self=21.7ms total=21.7ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:90642)
- `[Host Function] reportMeasure` self=14.3ms total=14.3ms ([host]:0)
- `runWithFiberInDEV` self=13.63ms total=13.63ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:19376)
- `[Host Function] createTask` self=9.84ms total=9.84ms ([host]:0)

### Commit #8 — 1.86ms 🔵 (t=16.9s, margin)

- `NativeDetector` — 0.92ms self, 1.86ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.81ms self, 0.94ms w/children — props: onStartShouldSetResponder

### Commit #9 — 247.39ms 🔴 (t=18.2s)

**Root cause:** `View` re-rendered — props: style, children

Render cascade:
- `View` ×32 — 39.91ms self, 1000.29ms w/children — props: style, children
- `HomeScreen` [React Compiler] — 35.58ms self, 247.39ms w/children — hooks
- `ScrubBar` [React.memo + React Compiler] — 22.73ms self, 30.96ms w/children — props: scrub, accessibilityValue, children
- `IndicatorStrip` [React.memo + React Compiler] — 19.93ms self, 29.6ms w/children — props: linkedIds, linkedColor
- `StoryDock` [React.memo + React Compiler] — 17.03ms self, 69.99ms w/children — props: ruled
- `AnimatedComponent(View)` ×7 — 12.97ms self, 148.73ms w/children — props: style, children
- `ScrollView` ×10 — 12.66ms self, 122.12ms w/children — props: children
- `DeckSlot` [React.memo] ×2 — 11.53ms self, 64.01ms w/children — props: scrollEnabled, children
- `GestureDetector` ×6 — 11.51ms self, 210.27ms w/children — props: gesture, children
- `MapSheet` [React Compiler] — 6.04ms self, 93.01ms w/children — props: renderList
- `NativeDetector` ×6 — 4.65ms self, 198.76ms w/children — props: gesture, children
- `StoryDeck` [React.memo] — 4.47ms self, 74.39ms w/children — props: scrollEnabled, renderStory
- `LeanReanimatedNativeDetector` ×4 — 3.35ms self, 156.6ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- `GlobeGestureLayer` [React.memo] — 2.92ms self, 10.24ms w/children — props: enabled, collapseMode
- `StoryCard` [React.memo + React Compiler] — 2.71ms self, 22.29ms w/children — props: open
- _... and 12 more_
- _Shown: 208ms self / 247.39ms commit (84%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=9` to see all._

**CPU during this commit:**
- `appendAllChildren` self=23.67ms total=23.67ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:23777)
- `[Host Function] createTask` self=18.57ms total=18.57ms ([host]:0)
- `[Host Function] createTask` self=17.76ms total=17.76ms ([host]:0)
- `[Host Function] createTask` self=16.95ms total=16.95ms ([host]:0)
- `structuredCloneInternal` self=14.63ms total=14.63ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:29713)

### Commit #10 — 0.69ms 🔵 (t=18.3s, margin)

- `NativeDetector` — 0.4ms self, 0.69ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.25ms self, 0.3ms w/children — props: onStartShouldSetResponder

### Commit #12 — 15.33ms 🔵 (t=20.3s, margin)

- `AnimatedComponent(View)` ×7 — 12.49ms self, 40.43ms w/children — parent re-render
- `View` ×7 — 7.05ms self, 27.94ms w/children — props: style, transform

### Commit #13 — 61.6ms 🔴 (t=20.4s)

**Root cause:** `View` re-rendered — props: style, children

Render cascade:
- `View` ×32 — 9.93ms self, 260.66ms w/children — props: style, children
- `HomeScreen` [React Compiler] — 8.82ms self, 61.6ms w/children — hooks
- `ScrollView` ×10 — 6.42ms self, 40.21ms w/children — props: children
- `AnimatedComponent(View)` ×7 — 3.53ms self, 44.77ms w/children — props: style, children
- `IndicatorStrip` [React.memo + React Compiler] — 2.84ms self, 9.17ms w/children — props: linkedIds, linkedColor
- `NativeDetector` ×6 — 2.61ms self, 58.41ms w/children — props: gesture, children
- `DeckSlot` [React.memo] ×2 — 2.45ms self, 16.87ms w/children — props: scrollEnabled, children
- `LeanReanimatedNativeDetector` ×4 — 2.4ms self, 44.85ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- `MapSheet` [React Compiler] — 2.36ms self, 30.08ms w/children — props: renderList
- `StoryDeck` [React.memo] — 2.22ms self, 20.81ms w/children — props: scrollEnabled, renderStory
- `GestureDetector` ×6 — 1.99ms self, 60.4ms w/children — props: gesture, children
- `StoryDock` [React.memo + React Compiler] — 1.89ms self, 5.68ms w/children — props: ruled
- `AnimatedComponent(ScrollView)` ×2 — 1.26ms self, 9.81ms w/children — props: scrollEnabled, children
- `ScrubBar` [React.memo + React Compiler] — 1.2ms self, 2.87ms w/children — props: scrub, accessibilityValue, children
- `GlobeGestureLayer` [React.memo] — 1.19ms self, 3.51ms w/children — props: enabled, collapseMode
- _... and 12 more_
- _Shown: 51.1ms self / 61.6ms commit (83%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=13` to see all._

**CPU during this commit:**
- `[Host Function] createTask` self=15.04ms total=15.04ms ([host]:0)
- `[Host Function] createTask` self=13.22ms total=13.22ms ([host]:0)
- `[Host Function] createTask` self=10.51ms total=10.51ms ([host]:0)
- `[Host Function] createTask` self=10.41ms total=10.41ms ([host]:0)
- `render` self=3.25ms total=3.25ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:65195)

### Commit #14 — 0.9ms 🔵 (t=20.4s, margin)

- `NativeDetector` — 0.53ms self, 0.9ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.3ms self, 0.38ms w/children — props: onStartShouldSetResponder

### Commit #15 — 236.52ms 🔴 (t=21.9s)

**Root cause:** `View` re-rendered — props: style, children

Render cascade:
- `View` ×32 — 52.85ms self, 1130.57ms w/children — props: style, children
- `DeckSlot` [React.memo] ×2 — 27.05ms self, 88.71ms w/children — props: scrollEnabled, children
- `IndicatorStrip` [React.memo + React Compiler] — 27ms self, 38.38ms w/children — props: linkedIds, linkedColor
- `HomeScreen` [React Compiler] — 25.5ms self, 236.52ms w/children — hooks
- `ScrollView` ×10 — 21.11ms self, 119.54ms w/children — props: children
- `AnimatedComponent(View)` ×7 — 14.03ms self, 185.72ms w/children — props: style, children
- `NativeDetector` ×6 — 8.11ms self, 268.06ms w/children — props: gesture, children
- `MapSheet` [React Compiler] — 7.3ms self, 120.27ms w/children — props: renderList
- `StoryDeck` [React.memo] — 5.59ms self, 98.49ms w/children — props: scrollEnabled, renderStory
- `GestureDetector` ×6 — 5.23ms self, 273.29ms w/children — props: gesture, children
- `GlobeGestureLayer` [React.memo] — 4.97ms self, 15.28ms w/children — props: enabled, collapseMode
- `LeanReanimatedNativeDetector` ×4 — 4.19ms self, 219.08ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- `StoryDock` [React.memo + React Compiler] — 3.8ms self, 22.37ms w/children — props: ruled
- `MapHeader` [React.memo + React Compiler] — 3.59ms self, 45.46ms w/children — props: linkedIds, linkedColor
- `AnimatedComponent(ScrollView)` ×2 — 3.09ms self, 30.68ms w/children — props: scrollEnabled, children
- _... and 12 more_
- _Shown: 213.4ms self / 236.52ms commit (90%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=15` to see all._

**CPU during this commit:**
- `[Host Function] reportMeasure` self=29.74ms total=29.74ms ([host]:0)
- `jsxDEVImpl` self=16.87ms total=16.87ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:10966)
- `[Host Function] createTask` self=16.27ms total=16.27ms ([host]:0)
- `[Host Function] createTask` self=14.71ms total=14.71ms ([host]:0)
- `[Host Function] completeRoot` self=12.04ms total=12.04ms ([host]:0)

### Commit #16 — 0.56ms 🔵 (t=22.0s, margin)

- `NativeDetector` — 0.31ms self, 0.56ms w/children — state: useState
- `LeanReanimatedNativeDetector` — 0.21ms self, 0.25ms w/children — props: onStartShouldSetResponder

---
## Top Components by Total Render Cost

| Component | Renders | Total | Avg | Max | Reason | File |
|---|---|---|---|---|---|---|
| `View` ⚠️ | 208 | 179.5ms | 0.86ms | 12.76ms | props: children, style, pointerEvents | — |
| `HomeScreen` [React Compiler] ⚠️ | 6 | 125.8ms | 20.96ms | 35.58ms | hooks | — |
| `ScrollView` ⚠️ | 60 | 86.8ms | 1.45ms | 8.33ms | props: children, style, scrollEnabled | — |
| `IndicatorStrip` [React.memo + React Compiler] ⚠️ | 6 | 68.1ms | 11.35ms | 27ms | props: linkedIds, linkedColor | `map/IndicatorStrip.tsx:178` |
| `DeckSlot` [React.memo] ⚠️ | 12 | 58.8ms | 4.9ms | 24.02ms | props: scrollEnabled, children | `map/StoryDeck.tsx:136` |
| `StoryDock` [React.memo + React Compiler] ⚠️ | 6 | 57.3ms | 9.55ms | 27.16ms | props: ruled | `map/StoryDock.tsx:74` |
| `NativeDetector` ⚠️ | 42 | 41.9ms | 1ms | 4.13ms | props: children, gesture | — |
| `MapSheet` [React Compiler] ⚠️ | 6 | 33.7ms | 5.62ms | 8.43ms | props: renderList | `map/MapSheet.tsx:134` |
| `GestureDetector` ⚠️ | 36 | 31.3ms | 0.87ms | 6.82ms | props: children, gesture | — |
| `ScrubBar` [React.memo + React Compiler] ⚠️ | 6 | 31.2ms | 5.2ms | 22.73ms | props: scrub, accessibilityValue, children | `components/ScrubBar.tsx:281` |
| `LeanReanimatedNativeDetector` ⚠️ | 30 | 30.3ms | 1.01ms | 5.37ms | props: onStartShouldSetResponder, children, onGestureHandlerStateChange | — |
| `StoryDeck` [React.memo] ⚠️ | 6 | 25.7ms | 4.28ms | 6.01ms | props: scrollEnabled, renderStory | `map/StoryDeck.tsx:250` |
| `InterceptingGestureDetector` ⚠️ | 6 | 23.2ms | 3.86ms | 15.86ms | props: gesture, children | — |
| `StoryCard` [React.memo + React Compiler] ⚠️ | 6 | 16.5ms | 2.74ms | 3.76ms | props: open | `map/StoryCard.tsx:207` |
| `GlobeGestureLayer` [React.memo] ⚠️ | 6 | 16.3ms | 2.72ms | 4.97ms | props: enabled, collapseMode | `map/GlobeGestureLayer.tsx:128` |
| `MapHeader` [React.memo + React Compiler] ⚠️ | 6 | 11.7ms | 1.95ms | 3.59ms | props: linkedIds, linkedColor | `map/MapHeader.tsx:195` |
| `ScrollViewResponderProvider` ⚠️ | 6 | 7.1ms | 1.18ms | 1.9ms | props: children | — |
| `Veil` [React.memo + React Compiler] ⚠️ | 6 | 5.7ms | 0.94ms | 1.48ms | props: open | `map/StoryCard.tsx:160` |
| `BriefingChrome` [forwardRef] ⚠️ | 6 | 4.8ms | 0.81ms | 2.02ms | parent re-render | `components/BriefingChrome.tsx:62` |
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

### `DeckSlot` [React.memo] — `map/StoryDeck.tsx:136`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

<details><summary>Source — `map/StoryDeck.tsx:136`</summary>

```tsx

const DeckSlot = memo(function DeckSlot({
  position,
  restOffset,
  storyKey,
  progress,
  peekFade,
  pitch,
  width,
  current,
  sheetGesture,
  scrollEnabled,
  onScrollOffset,
  children,
}: {
  position: number;
  /** The story drawn here. A slot outlives its stories (`assignSlots`). */
  storyKey: string;
  /** Where this slot rests relative to the committed story, for its first style. */
  restOffset: number;
  progress: SharedValue<number>;
  peekFade?: SharedValue<number>;
  pitch: number;
  width: number;
  current: boolean;
  sheetGesture: SheetGesture;
  scrollEnabled: boolean;
  onScrollOffset: SharedValue<number>;
  children: ReactNode;
}) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const slotStyle = useAnimatedStyle(() => {
    // Reanimated runs this once on the JS thread when the slot mounts, for its
    // first style. A slot mounted as every swipe landed until slots were
    // recycled (2026-09-25), and still can mid-spring when the window first
    // grows to three, while the spring is writing
    // `progress` on the UI thread, and a JS read of a value the UI thread has
    // changed blocks until the UI thread answers (`runOnUISync`): 150–290 ms
    // of every landing's commit on the emulator, with the globe's reproject
    // queued behind it. So the first style is the one the slot rests at,
    // computed from props, and the UI mapper, which starts straight after,
    // draws the real one; a frame drawn before it takes over matches at rest.
    if (globalThis.__RUNTIME_KIND === 1) {
      const rest = Math.min(1, Math.abs(restOffset));
      return {
        opacity: 1 - (1 - PEEK_OPACITY) * rest,
        transform: [{ translateX: restOffset * pitch }],
      };
    }
    const offset = position - progress.value;
```

</details>


> 📝 Dev mode renders are ~3× slower than production. Divide ms values by ~3 for a rough production estimate.

---
## Next Steps

Ask the user which path to take:

1. **Investigate further** — use query tools to drill into specific findings before making changes:
   - `profiler-commit-query` mode=`by_index` commit_index=9 — full breakdown of the slowest commit
   - `profiler-cpu-query` mode=`component_cpu` component_name=`View` — CPU activity during this component's renders
   - `profiler-cpu-query` mode=`call_tree` — trace callers/callees of hot functions
2. **Implement fixes** — apply changes to the top offenders identified above, then re-profile the same scenario to measure improvement.
3. **Done for now** — save the report for reference.
