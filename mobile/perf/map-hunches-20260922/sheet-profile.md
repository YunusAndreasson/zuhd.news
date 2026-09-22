# Profiling Analysis — 4.9s session
**React Compiler:** ✓  **Hot commits:** 4 of 18 total

> **Duration columns:** `self` = this component's own render work only (exclusive).
> `w/children` = self + the entire subtree it owns (inclusive).
> Do not sum the `w/children` column — a parent's inclusive time already contains its
> children's time. Use `self` for summing; use `w/children` to understand container cost.

---
## Slow React Batches

### Commit #0 — 157.19ms 🔴 (t=0.9s)
> After: "Expand story" (0.0s prior)

**Root cause:** `AnimatedComponent(View)` re-rendered — props: style

Render cascade:
- `AnimatedComponent(View)` ×8 — 24.45ms self, 101.81ms w/children — props: style
- `IndicatorStrip` [React.memo + React Compiler] — 21.65ms self, 27.64ms w/children — props: linkedIds, linkedColor
- `MiniGlobe` [React.memo + React Compiler] — 20.72ms self, 42.28ms w/children — props: marketViewport
- `View` ×37 — 13.25ms self, 607.21ms w/children — props: style
- `MapHeader` [React.memo + React Compiler] — 11.99ms self, 40.21ms w/children — props: linkedIds, linkedColor
- `HomeScreen(./index.tsx)` [React Compiler] — 11.39ms self, 157.19ms w/children — hooks
- `ScrollView` ×10 — 10.14ms self, 86.6ms w/children — props: children
- `GlobeGestureLayer` [React.memo] — 7.84ms self, 23.19ms w/children — props: enabled, collapseMode
- `GestureDetector` ×5 — 7.03ms self, 99.97ms w/children — props: gesture, children
- `StoryCard` [React.memo + React Compiler] ×2 — 5.12ms self, 15.77ms w/children — props: open
- `LeanReanimatedNativeDetector` ×3 — 3.08ms self, 66.65ms w/children — props: onStartShouldSetResponder, onGestureHandlerStateChange, onGestureHandlerEvent
- `Canvas` ×3 — 2.64ms self, 2.79ms w/children — props: style, children
- `MapSheet` [React Compiler] — 2.27ms self, 37.81ms w/children — props: renderList
- `Veil` [React.memo + React Compiler] ×2 — 1.96ms self, 6.79ms w/children — props: open
- `Pressable` ×2 — 1.56ms self, 2.7ms w/children — props: children
- _... and 14 more_
- _Shown: 145.1ms self / 157.19ms commit (92%) — 14 more components not shown. Use `profiler-commit-query mode=by_index commit_index=0` to see all._

**CPU during this commit:**
- `[Host Function] unstable_now` self=20.66ms total=20.66ms ([host]:0)
- `[Native] mapPrototypeSet` self=19.67ms total=19.67ms ([native]:0)
- `[GC Young Gen]` self=18.89ms total=18.89ms ([suspended]:0)
- `bubbleProperties` self=16.22ms total=16.22ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:23852)
- `[Host Function] promiseFn` self=15.23ms total=15.23ms ([host]:0)

### Commit #1 — 69.64ms 🔴 (t=1.1s)
> After: "Horizontal deck swipe during collapse" (0.0s prior)

**Root cause:** `IndicatorStrip` [React.memo + React Compiler] re-rendered — props: linkedIds, linkedColor

Render cascade:
- `IndicatorStrip` [React.memo + React Compiler] — 8.55ms self, 13.55ms w/children — props: linkedIds, linkedColor
- `MiniGlobe` [React.memo + React Compiler] — 8.54ms self, 10.01ms w/children — props: marketViewport
- `View` ×37 — 8.46ms self, 344.17ms w/children — props: style
- `HomeScreen(./index.tsx)` [React Compiler] — 7.16ms self, 69.64ms w/children — hooks
- `ScrollView` ×10 — 5.24ms self, 59.72ms w/children — props: children
- `AnimatedComponent(View)` ×8 — 4.16ms self, 57.62ms w/children — props: style
- `GlobeGestureLayer` [React.memo] — 3.07ms self, 5.45ms w/children — props: enabled, collapseMode
- `Pressable` ×2 — 2.7ms self, 4.02ms w/children — props: children
- `MapSheet` [React Compiler] — 2.37ms self, 30.64ms w/children — props: renderList
- `Veil` [React.memo + React Compiler] ×2 — 2.04ms self, 8.8ms w/children — props: open
- `StoryCard` [React.memo + React Compiler] ×2 — 1.71ms self, 12.74ms w/children — props: open
- `DeckSlot` [React.memo] ×2 — 1.66ms self, 21.48ms w/children — props: scrollEnabled, children
- `StoryDeck` [React.memo] — 1.47ms self, 24.14ms w/children — props: scrollEnabled, renderStory
- `NativeDetector` ×5 — 1.47ms self, 68.27ms w/children — props: gesture, children
- `Text` ×6 — 1.4ms self, 4.37ms w/children — parent re-render
- _... and 14 more_
- _Shown: 60ms self / 69.64ms commit (86%) — 14 more components not shown. Use `profiler-commit-query mode=by_index commit_index=1` to see all._

**CPU during this commit:**
- `createSerializable` self=32.86ms total=32.86ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:158367)
- `[Native] errorStackGetter` self=10.79ms total=10.79ms ([native]:0)
- `[Host Function] completeRoot` self=9.42ms total=9.42ms ([host]:0)
- `[Native] arrayPrototypeConcat` self=6.46ms total=6.46ms ([native]:0)
- `[GC Young Gen]` self=6.35ms total=6.35ms ([suspended]:0)

### Commit #2 — 106.91ms 🔴 (t=2.4s)
> After: "Horizontal deck swipe during collapse" (1.3s prior)

**Root cause:** `ScrollView` re-rendered — props: style, children

Render cascade:
- `ScrollView` ×9 — 20.62ms self, 182.41ms w/children — props: style, children
- `Pressable` [React.memo + React Compiler] ×3 — 9.76ms self, 21.06ms w/children — (mount)
- `View` ×42 — 8.96ms self, 882.21ms w/children — props: style
- `MiniGlobe` [React.memo + React Compiler] — 6.93ms self, 8.07ms w/children — props: marketViewport
- `HomeScreen(./index.tsx)` [React Compiler] — 6.34ms self, 106.91ms w/children — hooks
- `DeckSlot` [React.memo] ×3 — 4.86ms self, 80ms w/children — props: restOffset, current, children
- `Pressable` ×9 — 3.39ms self, 31.15ms w/children — (mount)
- `Text` ×12 — 3.16ms self, 13.51ms w/children — (mount)
- `AnimatedComponent(View)` ×7 — 2.64ms self, 164.1ms w/children — props: style
- `StoryCard` [React.memo + React Compiler] — 2.56ms self, 44.73ms w/children — (mount)
- `MapSheet` [React Compiler] — 1.82ms self, 87.05ms w/children — props: renderList
- `Veil` [React.memo + React Compiler] — 1.67ms self, 5.13ms w/children — (mount)
- `Text` [React.memo + React Compiler] ×7 — 1.64ms self, 9.52ms w/children — (mount)
- `NativeDetector` ×6 — 1.5ms self, 235.93ms w/children — props: children
- `StoryActions` [React.memo + React Compiler] — 1.39ms self, 22.9ms w/children — (mount)
- _... and 16 more_
- _Shown: 77.2ms self / 106.91ms commit (72%) — 16 more components not shown. Use `profiler-commit-query mode=by_index commit_index=2` to see all._

**CPU during this commit:**
- `drawPolygon` self=21.79ms total=21.79ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:343628)
- `[Host Function] completeRoot` self=19.42ms total=19.42ms ([host]:0)
- `[Native] objectEntries` self=14.2ms total=14.2ms ([native]:0)
- `[Host Function] createSerializableObject` self=12.76ms total=12.76ms ([host]:0)
- `[Native] errorStackGetter` self=9.91ms total=9.91ms ([native]:0)

### Commit #3 — 1.09ms 🔵 (t=2.5s, margin)
> After: "Horizontal deck swipe during collapse" (1.4s prior)

- `AnimatedComponent(View)` ×4 — 1.9ms self, 3.75ms w/children — parent re-render
- `View` ×4 — 1.03ms self, 1.85ms w/children — props: style

### Commit #4 — 19.95ms 🟡 (t=3.2s)
> After: "Horizontal deck swipe during collapse" (2.2s prior)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Root cause:** `HomeScreen(./index.tsx)` [React Compiler] re-rendered — hooks

Render cascade:
- `HomeScreen(./index.tsx)` [React Compiler] — 8.06ms self, 19.95ms w/children — hooks
- `MiniGlobe` [React.memo + React Compiler] — 5.53ms self, 6.75ms w/children — props: marketViewport
- `View` ×12 — 2.07ms self, 27.91ms w/children — props: style
- `MapSheet` [React Compiler] — 1.36ms self, 3.87ms w/children — parent re-render
- `AnimatedComponent(View)` ×3 — 1.01ms self, 3.52ms w/children — props: style
- `Canvas` — 0.33ms self, 0.4ms w/children — props: style, children
- `BriefingChrome` [forwardRef] — 0.32ms self, 0.32ms w/children — parent re-render
- `NativeDetector` — 0.2ms self, 1.69ms w/children — props: children
- `LeanReanimatedNativeDetector` — 0.18ms self, 1.49ms w/children — props: onStartShouldSetResponder, children
- `GestureDetector` — 0.16ms self, 1.85ms w/children — props: children
- `MarketBrowserSheet` [React Compiler] — 0.06ms self, 0.07ms w/children — props: instruments

**CPU during this commit:**
- `propagateParentContextChanges` self=15.82ms total=15.82ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:20697)
- `close` self=4.13ms total=4.13ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:344481)

### Commit #5 — 0.97ms 🔵 (t=3.4s, margin)
> After: "Horizontal deck swipe during collapse" (2.4s prior)

- `AnimatedComponent(View)` — 0.45ms self, 0.97ms w/children — parent re-render
- `View` — 0.2ms self, 0.52ms w/children — props: style, backgroundColor
- _Shown: 0.7ms self / 0.97ms commit (67% explained by self-time — remainder is native/layout work outside JS)_

---
## Top Components by Total Render Cost

| Component | Renders | Total | Avg | Max | Reason | File |
|---|---|---|---|---|---|---|
| `MiniGlobe` [React.memo + React Compiler] | 4 | 41.7ms | 10.43ms | 20.72ms | props: marketViewport | — |
| `ScrollView` ⚠️ | 26 | 35.1ms | 1.35ms | 18.02ms | props: children, style, scrollEnabled | — |
| `HomeScreen(./index.tsx)` [React Compiler] | 4 | 33ms | 8.24ms | 11.39ms | hooks | — |
| `View` ⚠️ | 114 | 29.3ms | 0.26ms | 2.19ms | props: children, style, pointerEvents | — |
| `GestureDetector` ⚠️ | 16 | 9.1ms | 0.57ms | 6.25ms | props: children, gesture | — |
| `MapSheet` [React Compiler] | 4 | 7.8ms | 1.95ms | 2.37ms | props: renderList | `map/MapSheet.tsx:134` |
| `StoryCard` [React.memo + React Compiler] | 4 | 6.8ms | 1.71ms | 4.42ms | props: open | `map/StoryCard.tsx:160` |
| `DeckSlot` [React.memo] ⚠️ | 6 | 5.4ms | 0.91ms | 1.36ms | props: children, scrollEnabled, restOffset | `map/StoryDeck.tsx:126` |
| `LeanReanimatedNativeDetector` ⚠️ | 10 | 4.7ms | 0.47ms | 2.6ms | props: onStartShouldSetResponder, children, onGestureHandlerStateChange | — |
| `NativeDetector` ⚠️ | 16 | 4.3ms | 0.27ms | 0.37ms | props: children, gesture | — |
| `Pressable` ✓ | 4 | 4.3ms | 1.07ms | 2.33ms | props: children | `primitives/Pressable.tsx:26` |
| `Canvas` ⚠️ | 8 | 4.1ms | 0.52ms | 2.21ms | props: style, children | — |
| `Veil` [React.memo + React Compiler] | 4 | 4ms | 1ms | 1.22ms | props: open | `map/StoryCard.tsx:114` |
| `StoryDeck` [React.memo] | 3 | 3.8ms | 1.28ms | 1.47ms | props: scrollEnabled, renderStory, index | `map/StoryDeck.tsx:226` |
| `Text` ✓ | 12 | 2.8ms | 0.23ms | 0.32ms | parent re-render | `primitives/Text.tsx:33` |
| `BriefingChrome` [forwardRef] | 4 | 1.1ms | 0.28ms | 0.32ms | parent re-render | `components/BriefingChrome.tsx:60` |
| `MarketBrowserSheet` [React Compiler] | 4 | 0.2ms | 0.05ms | 0.06ms | props: instruments | `components/MarketBrowserSheet.tsx:19` |
| `PressabilityDebugView` | 4 | 0.1ms | 0.02ms | 0.02ms | parent re-render | — |

---
## Suggested Improvements

### `MiniGlobe` [React.memo + React Compiler]

**Stabilize props:** `marketViewport`. Likely inline objects/functions at the callsite — extract to constants or wrap with `useMemo`/`useCallback` (or fix the React Compiler bailout causing this).

### `ScrollView`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

### `HomeScreen(./index.tsx)` [React Compiler]

**Unstable hook deps:** unknown hooks. Check dependency arrays in `useEffect`/`useMemo` — a dependency may be recreated on every render.

### `View`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

### `GestureDetector`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.


> 📝 Dev mode renders are ~3× slower than production. Divide ms values by ~3 for a rough production estimate.

---
## Next Steps

Ask the user which path to take:

1. **Investigate further** — use query tools to drill into specific findings before making changes:
   - `profiler-commit-query` mode=`by_index` commit_index=0 — full breakdown of the slowest commit
   - `profiler-cpu-query` mode=`component_cpu` component_name=`Forget(Memo(MiniGlobe))` — CPU activity during this component's renders
   - `profiler-cpu-query` mode=`call_tree` — trace callers/callees of hot functions
2. **Implement fixes** — apply changes to the top offenders identified above, then re-profile the same scenario to measure improvement.
3. **Done for now** — save the report for reference.