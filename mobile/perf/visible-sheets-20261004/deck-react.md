# Profiling Analysis — 11.3s session
**React Compiler:** ✓  **Hot commits:** 6 of 14 total

> **Duration columns:** `self` = this component's own render work only (exclusive).
> `w/children` = self + the entire subtree it owns (inclusive).
> Do not sum the `w/children` column — a parent's inclusive time already contains its
> children's time. Use `self` for summing; use `w/children` to understand container cost.

---
## Slow React Batches

### Commit #0 — 68.46ms 🔴 (t=1.7s)

**Root cause:** `View` re-rendered — props: style, children

Render cascade:
- `View` ×46 — 10.02ms self, 511.63ms w/children — props: style, children
- `DeckSlot` [React.memo] ×3 — 6.12ms self, 47.4ms w/children — props: restOffset, current, footer
- `HomeScreen(./index.tsx)` [React Compiler] — 5.36ms self, 68.46ms w/children — hooks
- `StoryDeck` [React.memo] — 4.72ms self, 53.07ms w/children — props: index, renderStory, renderFooter
- `AnimatedComponent(View)` ×10 — 4.4ms self, 105.57ms w/children — props: style, children
- `StoryCard` [React.memo + React Compiler] — 2.92ms self, 23ms w/children — (mount)
- `Text` ×9 — 2.81ms self, 9.47ms w/children — (mount)
- `ScrollView` ×9 — 2.72ms self, 82.42ms w/children — props: style, children
- `Pressable` ×3 — 1.92ms self, 13.07ms w/children — (mount)
- `MapSheet` — 1.61ms self, 57.87ms w/children — props: renderList
- `StoryDock` [React.memo] — 1.48ms self, 3.62ms w/children — props: index
- `NativeDetector` ×6 — 1.48ms self, 134.84ms w/children — props: children
- `Text` [React.memo + React Compiler] ×4 — 1.4ms self, 6.7ms w/children — (mount)
- `Veil` [React.memo + React Compiler] — 1.17ms self, 5.49ms w/children — (mount)
- `GestureDetector` ×6 — 0.95ms self, 135.79ms w/children — props: children
- _... and 10 more_
- _Shown: 49.1ms self / 68.46ms commit (72%) — 10 more components not shown. Use `profiler-commit-query mode=by_index commit_index=0` to see all._

**CPU during this commit:**
- `addCompilerSafeGetAndSet` self=17.75ms total=17.75ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:188249)
- `getChangedKeys` self=13.79ms total=13.79ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:44710)
- `[Native] ErrorConstructor` self=11.25ms total=11.25ms ([native]:0)
- `_handleAnimatedStylesUpdate` self=9.98ms total=9.98ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:186717)
- `addObjectDiffToProperties` self=7.66ms total=7.66ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:20174)

### Commit #1 — 17.67ms 🟡 (t=1.8s)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Initial render:** 7 components mounted

Mount cascade:
- `Pressable` [React.memo + React Compiler] ×3 — 4.33ms self, 15.02ms w/children — (mount)
- `Pressable` ×6 — 2.13ms self, 18.98ms w/children — (mount)
- `AnimatedComponent(Pressable)` ×3 — 1.75ms self, 10.04ms w/children — (mount)
- `View` ×5 — 1.27ms self, 39.33ms w/children — parent re-render
- `StoryActions` [React.memo + React Compiler] — 1.05ms self, 16.52ms w/children — (mount)
- `Text` [React.memo + React Compiler] ×3 — 0.83ms self, 3.47ms w/children — (mount)
- `Text` ×3 — 0.78ms self, 2.63ms w/children — (mount)
- `StoryFooter` [React.memo + React Compiler] — 0.6ms self, 17.67ms w/children — hooks
- `PressabilityDebugView` ×3 — 0.07ms self, 0.07ms w/children — (mount)
- _Shown: 12.8ms self / 17.67ms commit (72% explained by self-time — remainder is native/layout work outside JS)_

**CPU during this commit:**
- `_handleAnimatedStylesUpdate` self=7.7ms total=7.7ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:186717)
- `[GC Young Gen]` self=6.52ms total=6.52ms ([suspended]:0)

### Commit #2 — 20.89ms 🟡 (t=5.6s)
> After: "Story swipe 4" (0.2s prior)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Root cause:** `PlacedSegments` [React Compiler] re-rendered — props: colors, faded

Render cascade:
- `PlacedSegments` [React Compiler] — 7.04ms self, 8.71ms w/children — props: colors, faded
- `StoryDock` [React.memo] — 6.68ms self, 20.89ms w/children — hooks
- `View` ×11 — 2.39ms self, 55.16ms w/children — parent re-render
- `Text` [React.memo + React Compiler] ×4 — 1.29ms self, 5.03ms w/children — parent re-render
- `ScrubBar` [React.memo + React Compiler] — 0.87ms self, 13.47ms w/children — props: scrub, trackColors, faded
- `AnimatedComponent(View)` ×2 — 0.81ms self, 2.09ms w/children — props: style
- `PlacedSegment` [React.memo + React Compiler] — 0.25ms self, 1.56ms w/children — props: height, top, color
- `GestureDetector` — 0.2ms self, 12.6ms w/children — props: gesture, children
- `NativeDetector` — 0.2ms self, 12.4ms w/children — props: gesture, children
- `ScrubTooltip` [React.memo + React Compiler] — 0.17ms self, 0.18ms w/children — props: scrub
- `LeanReanimatedNativeDetector` — 0.16ms self, 12.2ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent

**CPU during this commit:**
- `getChangeDescription` self=10.3ms total=10.3ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:44594)
- `batchedUpdatesImpl` self=6.83ms total=6.83ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:28850)

### Commit #3 — 132.92ms 🔴 (t=6.4s)
> After: "Story swipe 4" (1.0s prior)

**Root cause:** `StoryDeck` [React.memo] re-rendered — props: index, renderStory, renderFooter

Render cascade:
- `StoryDeck` [React.memo] — 55.9ms self, 113.72ms w/children — props: index, renderStory, renderFooter
- `DeckSlot` [React.memo] ×2 — 39.47ms self, 56.44ms w/children — props: restOffset, current, footer
- `ScrollView` ×6 — 9.86ms self, 30.96ms w/children — props: style, children
- `HomeScreen(./index.tsx)` [React Compiler] — 8.99ms self, 132.92ms w/children — hooks
- `View` ×27 — 5.1ms self, 685.4ms w/children — props: style, children
- `AnimatedComponent(View)` ×7 — 2.64ms self, 134.95ms w/children — props: style, children
- `StoryDock` [React.memo] — 1.98ms self, 4.54ms w/children — props: index
- `NativeDetector` ×5 — 1.55ms self, 186.36ms w/children — props: children
- `MapSheet` — 1.32ms self, 117.67ms w/children — props: renderList
- `GestureDetector` ×5 — 0.9ms self, 187.26ms w/children — props: children
- `AnimatedComponent(ScrollView)` ×2 — 0.67ms self, 10.73ms w/children — props: onScroll, children
- `LeanReanimatedNativeDetector` ×3 — 0.65ms self, 173.27ms w/children — props: onStartShouldSetResponder, children
- `ScrubBar` [React.memo + React Compiler] — 0.48ms self, 1.96ms w/children — props: scrub, activeSegment, accessibilityValue
- `AnimatedScrollView` ×2 — 0.33ms self, 11.47ms w/children — props: onScroll, children
- `BriefingChrome` [React Compiler] — 0.33ms self, 0.33ms w/children — parent re-render
- _... and 2 more_
- _Shown: 130.2ms self / 132.92ms commit (98%) — 2 more components not shown. Use `profiler-commit-query mode=by_index commit_index=3` to see all._

**CPU during this commit:**
- `[Host Function] dropGestureHandler` self=18.74ms total=18.74ms ([host]:0)
- `[Native] mapIteratorPrototypeNext` self=14.75ms total=14.75ms ([native]:0)
- `[Native] errorStackGetter` self=14.68ms total=14.68ms ([native]:0)
- `[Host Function] run` self=14.09ms total=14.09ms ([host]:0)
- `propagateParentContextChanges` self=12.22ms total=12.22ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:20697)

### Commit #4 — 4.89ms 🔵 (t=6.5s, margin)
> After: "Story swipe 4" (1.0s prior)

- `StoryCard` [React.memo + React Compiler] — 1.32ms self, 4.89ms w/children — hooks
- `View` ×3 — 1.21ms self, 7.94ms w/children — props: children
- `Pressable` — 0.59ms self, 3.22ms w/children — props: accessibilityLabel, children
- `Text` — 0.59ms self, 0.8ms w/children — props: children
- `Text` [React.memo + React Compiler] — 0.41ms self, 1.21ms w/children — props: children
- `TextAncestorContext.Provider` — 0.03ms self, 0.21ms w/children — (mount)
- `PressabilityDebugView` — 0.03ms self, 0.03ms w/children — parent re-render

### Commit #5 — 12.19ms 🔵 (t=8.6s, margin)
> After: "Story swipe 6" (0.8s prior)

- `AnimatedComponent(View)` ×4 — 10.9ms self, 33.07ms w/children — parent re-render
- `View` ×4 — 8.04ms self, 22.17ms w/children — props: style, opacity

### Commit #6 — 114.46ms 🔴 (t=9.2s)
> After: "Story swipe 6" (1.4s prior)

**Root cause:** `ScrollView` re-rendered — props: children

Render cascade:
- `ScrollView` ×10 — 29.6ms self, 118.92ms w/children — props: children
- `HomeScreen(./index.tsx)` [React Compiler] — 21.24ms self, 114.46ms w/children — hooks
- `View` ×40 — 11.2ms self, 553.03ms w/children — props: style, children
- `AnimatedComponent(View)` ×9 — 7.88ms self, 117.87ms w/children — props: style, children
- `DeckSlot` [React.memo] ×2 — 7.2ms self, 50.62ms w/children — props: scrollEnabled, footer, children
- `MiniGlobe` [React.memo + React Compiler] — 7.05ms self, 7.07ms w/children — props: foundSlugs, foundProgress
- `IndicatorStrip` [React.memo + React Compiler] — 3.2ms self, 10.26ms w/children — props: linkedIds, linkedColor
- `MapSheet` — 2.65ms self, 61.76ms w/children — props: renderList
- `Text` ×5 — 2.57ms self, 3.75ms w/children — props: style, children
- `NativeDetector` ×6 — 2.3ms self, 147.74ms w/children — props: gesture, children
- `StoryDeck` [React.memo] — 2.25ms self, 54.6ms w/children — props: scrollEnabled, renderStory, renderFooter
- `GestureDetector` ×6 — 1.82ms self, 149.55ms w/children — props: gesture, children
- `StoryCard` [React.memo + React Compiler] — 1.55ms self, 7.28ms w/children — props: open
- `StoryDock` [React.memo] — 1.43ms self, 3.85ms w/children — props: progress, open
- `GlobeGestureLayer` [React.memo] — 1.14ms self, 2.94ms w/children — props: enabled, collapseMode
- _... and 16 more_
- _Shown: 103.1ms self / 114.46ms commit (90%) — 16 more components not shown. Use `profiler-commit-query mode=by_index commit_index=6` to see all._

**CPU during this commit:**
- `emitPoint` self=31.11ms total=31.11ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:347253)
- `[GC Young Gen]` self=25.16ms total=25.16ms ([suspended]:0)
- `getGlyphPath` self=16.05ms total=16.05ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:329251)
- `didStatefulHookChange` self=11.73ms total=11.73ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:44686)
- `[Native] ErrorConstructor` self=7.98ms total=7.98ms ([native]:0)

### Commit #7 — 8.71ms 🔵 (t=9.6s, margin)
> After: "Expand story" (0.3s prior)

- `PlacedSegments` [React Compiler] — 7.04ms self, 8.71ms w/children — parent re-render
- `Text` [React.memo + React Compiler] ×4 — 1.29ms self, 5.03ms w/children — parent re-render
- `View` ×5 — 1ms self, 2.52ms w/children — parent re-render
- `AnimatedComponent(View)` — 0.52ms self, 1.15ms w/children — parent re-render

### Commit #9 — 10.42ms 🔵 (t=10.6s, margin)
> After: "Expand story" (1.2s prior)

- `AnimatedComponent(View)` ×3 — 6.9ms self, 17.85ms w/children — parent re-render
- `View` ×3 — 0.75ms self, 10.95ms w/children — props: style, bottom, top
- _Shown: 7.7ms self / 10.42ms commit (73% explained by self-time — remainder is native/layout work outside JS)_

### Commit #10 — 287.58ms 🔴 (t=10.9s)
> After: "Expand story" (1.6s prior)

**Root cause:** `View` re-rendered — props: style, children

Render cascade:
- `View` ×40 — 54.53ms self, 1350.87ms w/children — props: style, children
- `NativeDetector` ×6 — 43.25ms self, 307.23ms w/children — props: gesture, children
- `HomeScreen(./index.tsx)` [React Compiler] — 37.92ms self, 287.58ms w/children — hooks
- `ScrollView` ×10 — 37.32ms self, 195.43ms w/children — props: children
- `StoryDeck` [React.memo] — 23.58ms self, 110.5ms w/children — props: scrollEnabled, renderStory, renderFooter
- `GlobeGestureLayer` [React.memo] — 20.74ms self, 57.93ms w/children — props: enabled, collapseMode
- `AnimatedComponent(ScrollView)` ×2 — 17ms self, 50.59ms w/children — props: scrollEnabled, showsVerticalScrollIndicator, children
- `MapSheet` — 14.43ms self, 147.78ms w/children — props: renderList
- `DeckSlot` [React.memo] ×2 — 11.91ms self, 78.44ms w/children — props: scrollEnabled, footer, children
- `StoryFooter` [React.memo + React Compiler] — 7.35ms self, 7.78ms w/children — props: open
- `AnimatedComponent(View)` ×9 — 4.73ms self, 252.76ms w/children — props: style, children
- `Text` ×5 — 1.74ms self, 2.77ms w/children — props: style, children
- `GestureDetector` ×6 — 1.74ms self, 308.97ms w/children — props: gesture, children
- `StoryDock` [React.memo] — 1.36ms self, 3.44ms w/children — props: open
- `IndicatorStrip` [React.memo + React Compiler] — 1.35ms self, 38.04ms w/children — props: linkedIds, linkedColor
- _... and 15 more_
- _Shown: 279ms self / 287.58ms commit (97%) — 15 more components not shown. Use `profiler-commit-query mode=by_index commit_index=10` to see all._

**CPU during this commit:**
- `[Host Function] queueMicrotask` self=28.76ms total=28.76ms ([host]:0)
- `structuredCloneInternal` self=13.1ms total=13.1ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:29713)

### Commit #11 — 1.23ms 🔵 (t=11.4s, margin)
> After: "Collapse story" (0.3s prior)

- `AnimatedComponent(View)` — 0.69ms self, 1.23ms w/children — parent re-render
- `View` — 0.41ms self, 0.54ms w/children — props: style, transform

---
## Top Components by Total Render Cost

| Component | Renders | Total | Avg | Max | Reason | File |
|---|---|---|---|---|---|---|
| `View` ⚠️ | 162 | 90.8ms | 0.56ms | 19.7ms | props: children, style, pointerEvents | — |
| `StoryDeck` [React.memo] | 4 | 86.5ms | 21.61ms | 55.9ms | props: renderStory, renderFooter, index | `map/StoryDeck.tsx:364` |
| `ScrollView` ⚠️ | 32 | 78.6ms | 2.46ms | 23.72ms | props: children, style, scrollEnabled | — |
| `HomeScreen(./index.tsx)` [React Compiler] | 4 | 73.5ms | 18.38ms | 37.92ms | hooks | — |
| `DeckSlot` [React.memo] ⚠️ | 8 | 61.4ms | 7.67ms | 38.22ms | props: footer, children, restOffset | `map/StoryDeck.tsx:150` |
| `NativeDetector` ⚠️ | 23 | 48.6ms | 2.11ms | 34.84ms | props: children, gesture | — |
| `MapSheet` | 4 | 20ms | 5ms | 14.43ms | props: renderList | `map/MapSheet.tsx:138` |
| `StoryDock` [React.memo] | 5 | 12.9ms | 2.58ms | 6.68ms | props: index, open, progress | `map/StoryDock.tsx:76` |
| `StoryFooter` [React.memo + React Compiler] | 3 | 8.4ms | 2.81ms | 7.35ms | props: open | `map/StoryCard.tsx:494` |
| `GestureDetector` ⚠️ | 23 | 5.4ms | 0.24ms | 0.62ms | props: children, gesture | — |
| `Text` ✓ | 11 | 4.9ms | 0.45ms | 1.05ms | parent re-render | `primitives/Text.tsx:58` |
| `StoryCard` [React.memo + React Compiler] | 3 | 3.8ms | 1.25ms | 1.55ms | props: open | `map/StoryCard.tsx:223` |
| `LeanReanimatedNativeDetector` ⚠️ | 15 | 3.3ms | 0.22ms | 0.34ms | props: onStartShouldSetResponder, children, onGestureHandlerStateChange | — |
| `Text` [React.memo + React Compiler] ⚠️ | 9 | 3ms | 0.33ms | 0.48ms | parent re-render | `primitives/Text.tsx:58` |
| `ScrubBar` [React.memo + React Compiler] | 5 | 2.5ms | 0.49ms | 0.87ms | props: scrub, accessibilityValue, children | `components/ScrubBar.tsx:387` |
| `Pressable` ✓ | 3 | 1.9ms | 0.64ms | 0.94ms | props: children, accessibilityLabel | `primitives/Pressable.tsx:34` |
| `BriefingChrome` [React Compiler] | 4 | 1.4ms | 0.34ms | 0.38ms | parent re-render | `components/BriefingChrome.tsx:64` |
| `ScrubTooltip` [React.memo + React Compiler] | 5 | 0.7ms | 0.13ms | 0.18ms | props: scrub | `components/ScrubBar.tsx:550` |
| `PressabilityDebugView` | 3 | 0.1ms | 0.02ms | 0.03ms | parent re-render | — |

---
## Suggested Improvements

### `View`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

### `StoryDeck` [React.memo] — `map/StoryDeck.tsx:364`

**Stabilize props:** `renderStory`, `renderFooter`, `index`. Likely inline objects/functions at the callsite — extract to constants or wrap with `useMemo`/`useCallback` (or fix the React Compiler bailout causing this).

<details><summary>Source — `map/StoryDeck.tsx:364`</summary>

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
  renderFooter,
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
```

</details>

### `ScrollView`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

### `HomeScreen(./index.tsx)` [React Compiler]

**Unstable hook deps:** unknown hooks. Check dependency arrays in `useEffect`/`useMemo` — a dependency may be recreated on every render.

### `DeckSlot` [React.memo] — `map/StoryDeck.tsx:150`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

<details><summary>Source — `map/StoryDeck.tsx:150`</summary>

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
  footer,
  children,
}: {
  /** Set under the scroll area: straight after a story that fits, and at the
   *  slot's foot while a longer one scrolls above it. */
  footer?: ReactNode;
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
  const { colors } = useTheme();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Reanimated runs both styles once on the JS thread when the slot mounts,
  // for their first values. A slot mounted as every swipe landed until slots
  // were recycled (2026-09-25), and still can mid-spring when the window first
  // grows to three, while the spring is writing
  // `progress` on the UI thread, and a JS read of a value the UI thread has
  // changed blocks until the UI thread answers (`runOnUISync`): 150–290 ms
  // of every landing's commit on the emulator, with the globe's reproject
  // queued behind it. So the first style is the one the slot rests at,
  // computed from props, and the UI mapper, which starts straight after,
  // draws the real one; a frame drawn before it takes over matches at rest.
  // `restOffset` only picks that first style; left to the closure it would
  // restart these mappers on every slot at every landing.
  //
  // **The slide and the dimming are two styles, and the sheet moves neither**
```

</details>


> 📝 Dev mode renders are ~3× slower than production. Divide ms values by ~3 for a rough production estimate.

---
## Next Steps

Ask the user which path to take:

1. **Investigate further** — use query tools to drill into specific findings before making changes:
   - `profiler-commit-query` mode=`by_index` commit_index=10 — full breakdown of the slowest commit
   - `profiler-cpu-query` mode=`component_cpu` component_name=`View` — CPU activity during this component's renders
   - `profiler-cpu-query` mode=`call_tree` — trace callers/callees of hot functions
2. **Implement fixes** — apply changes to the top offenders identified above, then re-profile the same scenario to measure improvement.
3. **Done for now** — save the report for reference.