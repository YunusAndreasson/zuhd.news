# Profiling Analysis — 38.7s session
**React Compiler:** ✓  **Hot commits:** 10 of 14 total

> **Duration columns:** `self` = this component's own render work only (exclusive).
> `w/children` = self + the entire subtree it owns (inclusive).
> Do not sum the `w/children` column — a parent's inclusive time already contains its
> children's time. Use `self` for summing; use `w/children` to understand container cost.

---
## Slow React Batches

### Commit #0 — 567.63ms 🔴 (t=11.5s)

**Root cause:** `MenuSheet` [React.memo + React Compiler] re-rendered — hooks

Render cascade:
- `MenuSheet` [React.memo + React Compiler] — 43.83ms self, 567.63ms w/children — hooks
- `Pressable` [React.memo + React Compiler] ×11 — 33.72ms self, 180.15ms w/children — (mount)
- `View` ×122 — 31.12ms self, 2929.59ms w/children — parent re-render
- `AnimatedComponent(View)` ×5 — 22.44ms self, 347.13ms w/children — parent re-render
- `VirtualizedList` — 21.8ms self, 286.3ms w/children — (mount)
- `SegmentedControl` [React Compiler] — 20.33ms self, 41.18ms w/children — (mount)
- `Text` ×82 — 19.36ms self, 70.24ms w/children — (mount)
- `Text` [React.memo + React Compiler] ×61 — 17.58ms self, 71.78ms w/children — (mount)
- `InstrumentRow` [React.memo + React Compiler] ×10 — 15.27ms self, 178.06ms w/children — (mount)
- `VirtualizedListContext.Provider` ×13 — 12.5ms self, 901.68ms w/children — (mount)
- `GestureHandlerRootView` — 12.4ms self, 378.99ms w/children — props: children
- `ListRow` [React.memo + React Compiler] ×10 — 11.99ms self, 162.79ms w/children — (mount)
- `RNHostView` ×2 — 9.88ms self, 994.55ms w/children — props: children
- `Pressable` ×25 — 9.4ms self, 292.16ms w/children — (mount)
- `GroupPage` [React Compiler] — 8.71ms self, 301.62ms w/children — (mount)
- _... and 35 more_
- _Shown: 290.3ms self / 567.63ms commit (51%) — 35 more components not shown. Use `profiler-commit-query mode=by_index commit_index=0` to see all._

**CPU during this commit:**
- `[Host Function] createTask` self=87.99ms total=87.99ms ([host]:0)
- `[Host Function] completeRoot` self=80.06ms total=80.06ms ([host]:0)
- `[Host Function] createTask` self=41.41ms total=41.41ms ([host]:0)
- `computeWindowedRenderLimits` self=19.54ms total=19.54ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:71925)
- `[Host Function] createNode` self=17.95ms total=17.95ms ([host]:0)

### Commit #1 — 0.04ms 🔵 (t=11.6s, margin)

- `RetainedListPage` [React Compiler] — 0.04ms self, 0.04ms w/children — hooks

### Commit #2 — 726.33ms 🔴 (t=12.6s)
> After: "Open markets" (0.8s prior)

**Root cause:** `VirtualizedListContextProvider` re-rendered — props: value, children

Render cascade:
- `View` ×93 — 123.35ms self, 2828.98ms w/children — parent re-render
- `Text` [React.memo + React Compiler] ×50 — 65.69ms self, 184.89ms w/children — (mount)
- `InstrumentRow` [React.memo + React Compiler] ×10 — 39.45ms self, 626.79ms w/children — (mount)
- `Pressable` [React.memo + React Compiler] ×10 — 39.22ms self, 555.49ms w/children — (mount)
- `Text` ×70 — 35.7ms self, 157.65ms w/children — (mount)
- `VirtualizedList` — 34.87ms self, 726.33ms w/children — parent re-render
- `ListRow` [React.memo + React Compiler] ×10 — 31.85ms self, 587.34ms w/children — (mount)
- `VirtualizedListContextProvider` — 25.86ms self, 691.32ms w/children — props: value, children
- `DeltaChip` [React.memo + React Compiler] ×10 — 15.91ms self, 110.7ms w/children — (mount)
- `CellRenderer` ×10 — 12.46ms self, 654.02ms w/children — (mount)
- `Pressable` ×20 — 12.16ms self, 1025.02ms w/children — (mount)
- `Icon` ×20 — 8.08ms self, 57.43ms w/children — (mount)
- `AnimatedComponent(Pressable)` ×10 — 5.41ms self, 514.15ms w/children — (mount)
- `ScrollViewContext.Provider` — 5.23ms self, 660.58ms w/children — (mount)
- `ScrollView` ×2 — 4.3ms self, 1330.45ms w/children — props: stickyHeaderIndices, children
- _... and 7 more_
- _Shown: 459.5ms self / 726.33ms commit (63%) — 7 more components not shown. Use `profiler-commit-query mode=by_index commit_index=2` to see all._

**CPU during this commit:**
- `[Host Function] completeRoot` self=182.18ms total=182.18ms ([host]:0)
- `[Host Function] createTask` self=25.43ms total=25.43ms ([host]:0)
- `[Native] weakMapPrototypeGet` self=24.81ms total=24.81ms ([native]:0)
- `[Native] mapPrototypeGet` self=20.89ms total=20.89ms ([native]:0)
- `[Host Function] getSettledUpdates` self=20.65ms total=20.65ms ([host]:0)

### Commit #3 — 224.89ms 🔴 (t=13.0s)
> After: "Open markets" (1.2s prior)

**Root cause:** `ScrollView` re-rendered — props: stickyHeaderIndices, children

Render cascade:
- `View` ×74 — 27.8ms self, 765.11ms w/children — parent re-render
- `ScrollView` ×2 — 20.35ms self, 435.51ms w/children — props: stickyHeaderIndices, children
- `Text` ×57 — 14.89ms self, 51.32ms w/children — (mount)
- `Pressable` [React.memo + React Compiler] ×8 — 14.01ms self, 163.53ms w/children — (mount)
- `Text` [React.memo + React Compiler] ×41 — 13.36ms self, 51.78ms w/children — (mount)
- `ListRow` [React.memo + React Compiler] ×8 — 10.94ms self, 174.47ms w/children — (mount)
- `DeltaChip` [React.memo + React Compiler] ×8 — 10.56ms self, 43.25ms w/children — (mount)
- `InstrumentRow` [React.memo + React Compiler] ×8 — 10.52ms self, 184.99ms w/children — (mount)
- `AnimatedComponent(Pressable)` ×8 — 9.46ms self, 147.81ms w/children — (mount)
- `VirtualizedList` — 6.81ms self, 224.89ms w/children — parent re-render
- `CellRenderer` ×8 — 5.86ms self, 195.83ms w/children — (mount)
- `Pressable` ×16 — 5.28ms self, 287.87ms w/children — (mount)
- `Icon` ×16 — 4.01ms self, 20.28ms w/children — (mount)
- `FlagGlyph` [React.memo + React Compiler] ×8 — 4ms self, 9.65ms w/children — (mount)
- `RowReading` [React Compiler] ×8 — 1.88ms self, 12ms w/children — (mount)
- _... and 7 more_
- _Shown: 159.7ms self / 224.89ms commit (71%) — 7 more components not shown. Use `profiler-commit-query mode=by_index commit_index=3` to see all._

**CPU during this commit:**
- `[Host Function] completeRoot` self=68.87ms total=68.87ms ([host]:0)
- `[Host Function] getSettledUpdates` self=20.65ms total=20.65ms ([host]:0)
- `recursivelyTraversePassiveMountEffects` self=19.91ms total=19.91ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:24842)
- `updateFiberRecursively` self=19.03ms total=19.03ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:45768)
- `[Host Function] createNode` self=16.87ms total=16.87ms ([host]:0)

### Commit #5 — 46.81ms 🟡 (t=13.4s)
> After: "Open markets" (1.6s prior)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Root cause:** `Pressable` re-rendered — props: style, transform, opacity

Render cascade:
- `Pressable` ×14 — 10.88ms self, 35.54ms w/children — props: style, transform, opacity
- `View` ×34 — 7.71ms self, 180.07ms w/children — props: accessibilityState, accessibilityValue, style
- `AnimatedComponent(Pressable)` ×11 — 6.4ms self, 32.85ms w/children — parent re-render
- `AnimatedComponent(View)` ×3 — 1.24ms self, 49.88ms w/children — parent re-render
- `PressabilityDebugView` ×11 — 0.19ms self, 0.19ms w/children — parent re-render
- _Shown: 26.4ms self / 46.81ms commit (56% explained by self-time — remainder is native/layout work outside JS)_

**CPU during this commit:**
- `[Host Function] completeRoot` self=46.81ms total=46.81ms ([host]:0)

### Commit #6 — 21.6ms 🟡 (t=13.6s)
> After: "Open markets" (1.9s prior)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Root cause:** `Pressable` re-rendered — props: style, transform

Render cascade:
- `Pressable` ×14 — 10.36ms self, 23.21ms w/children — props: style, transform
- `View` ×34 — 9.23ms self, 142.5ms w/children — props: transform, accessibilityState, accessibilityValue
- `AnimatedComponent(Pressable)` ×11 — 6.7ms self, 20.81ms w/children — parent re-render
- `AnimatedComponent(View)` ×3 — 1.36ms self, 24.25ms w/children — parent re-render
- `PressabilityDebugView` ×11 — 0.18ms self, 0.18ms w/children — parent re-render

### Commit #7 — 143.26ms 🔴 (t=14.4s)
> After: "Open markets" (2.6s prior)

**Root cause:** `Pressable` re-rendered — props: style, transform, opacity

Render cascade:
- `Pressable` ×18 — 57.62ms self, 111.79ms w/children — props: style, transform, opacity
- `AnimatedComponent(Pressable)` ×18 — 35.72ms self, 147.51ms w/children — parent re-render
- `View` ×54 — 35.32ms self, 664.64ms w/children — parent re-render
- `PressabilityDebugView` ×18 — 1.69ms self, 1.69ms w/children — parent re-render

**CPU during this commit:**
- `[Host Function] completeRoot` self=73.75ms total=73.75ms ([host]:0)
- `addObjectDiffToProperties` self=19.45ms total=19.45ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:20174)
- `moveChild` self=14.88ms total=14.88ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:45119)
- `stopProfilerTimerIfRunningAndRecordIncompleteDuration` self=12.48ms total=12.48ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:20851)
- `[Host Function] createTask` self=6.43ms total=6.43ms ([host]:0)

### Commit #8 — 143.26ms 🔴 (t=14.7s)
> After: "Open markets" (3.0s prior)

**Root cause:** `Pressable` re-rendered — props: style, transform

Render cascade:
- `Pressable` ×18 — 28.42ms self, 52.14ms w/children — props: style, transform
- `AnimatedComponent(Pressable)` ×18 — 28.23ms self, 80.37ms w/children — parent re-render
- `View` ×54 — 26.29ms self, 634.18ms w/children — parent re-render
- `PressabilityDebugView` ×18 — 1.13ms self, 1.13ms w/children — parent re-render
- _Shown: 84.1ms self / 143.26ms commit (59% explained by self-time — remainder is native/layout work outside JS)_

**CPU during this commit:**
- `formatDurationToMicrosecondsGranularity` self=19.39ms total=19.39ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:38669)
- `[Native] weakMapPrototypeGet` self=16.06ms total=16.06ms ([native]:0)
- `structuredCloneInternal` self=15.95ms total=15.95ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:29713)
- `[Host Function] createTask` self=15.13ms total=15.13ms ([host]:0)
- `[Host Function] createTask` self=12.66ms total=12.66ms ([host]:0)

### Commit #9 — 1406.85ms 🔴 (t=36.3s)
> After: "Back to Menu" (0.9s prior)

**Initial render:** 47 components mounted

Mount cascade:
- `Pressable` [React.memo + React Compiler] ×16 — 238.1ms self, 1066.56ms w/children — (mount)
- `ListRow` [React.memo + React Compiler] ×16 — 98.22ms self, 1164.78ms w/children — (mount)
- `MenuSheet` [React.memo + React Compiler] — 96.87ms self, 1406.85ms w/children — hooks
- `Pressable` ×32 — 85.48ms self, 1598.31ms w/children — (mount)
- `View` ×69 — 80.93ms self, 6424.74ms w/children — parent re-render
- `DeltaChip` [React.memo + React Compiler] ×6 — 68.93ms self, 170.04ms w/children — (mount)
- `Text` [React.memo + React Compiler] ×28 — 63.91ms self, 240.91ms w/children — (mount)
- `MenuRow` [React.memo + React Compiler] ×16 — 53.55ms self, 1218.33ms w/children — (mount)
- `Text` ×50 — 52.92ms self, 260.34ms w/children — (mount)
- `AnimatedComponent(Pressable)` ×16 — 38.14ms self, 807.98ms w/children — (mount)
- `Icon` ×40 — 16.65ms self, 185.71ms w/children — (mount)
- `GroupRow` [React.memo + React Compiler] ×10 — 11.44ms self, 897.06ms w/children — (mount)
- `Icon` [React.memo + React Compiler] ×20 — 10.8ms self, 109.04ms w/children — (mount)
- `AnimatedComponent(View)` ×3 — 9.81ms self, 1256.97ms w/children — parent re-render
- `ModalBottomSheetComponent` — 1.97ms self, 1307.01ms w/children — props: interceptBackPress, onBackPress, properties
- _... and 32 more_
- _Shown: 927.7ms self / 1406.85ms commit (66%) — 32 more components not shown. Use `profiler-commit-query mode=by_index commit_index=9` to see all._

**CPU during this commit:**
- `[Native] errorStackGetter` self=73.1ms total=73.1ms ([native]:0)
- `[Native] errorStackGetter` self=62.44ms total=62.44ms ([native]:0)
- `[GC Young Gen]` self=59.95ms total=59.95ms ([suspended]:0)
- `[Host Function] scheduleOnUI` self=46.93ms total=46.93ms ([host]:0)
- `[Host Function] createSerializableString` self=41.54ms total=41.54ms ([host]:0)

### Commit #10 — 117.82ms 🔴 (t=38.5s)
> After: "Back to Menu" (3.1s prior)

**Root cause:** `Pressable` re-rendered — props: nativeID, style, transform

Render cascade:
- `DeltaChip` [React.memo + React Compiler] ×6 — 68.93ms self, 170.04ms w/children — parent re-render
- `View` ×33 — 44.18ms self, 415.03ms w/children — parent re-render
- `Pressable` ×16 — 42.82ms self, 91.35ms w/children — props: nativeID, style, transform
- `AnimatedComponent(Pressable)` ×16 — 25.13ms self, 116.48ms w/children — parent re-render
- `Text` [React.memo + React Compiler] ×2 — 24.14ms self, 26.39ms w/children — parent re-render
- `PressabilityDebugView` ×16 — 8.96ms self, 8.96ms w/children — parent re-render
- `Icon` [React.memo + React Compiler] ×16 — 8.89ms self, 100.44ms w/children — parent re-render
- `AnimatedComponent(View)` — 0.45ms self, 117.82ms w/children — parent re-render

**CPU during this commit:**
- `performUnitOfWork` self=19.22ms total=19.22ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:25726)
- `[Host Function] createTask` self=15.44ms total=15.44ms ([host]:0)
- `renderWithHooks` self=15.19ms total=15.19ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:21912)
- `[Host Function] completeRoot` self=11.9ms total=11.9ms ([host]:0)
- `deepDiffer` self=11ms total=11ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:16973)

### Commit #11 — 156.1ms 🔴 (t=39.1s)
> After: "Back to Menu" (3.7s prior)

**Root cause:** `Pressable` re-rendered — props: style, transform

Render cascade:
- `PressabilityDebugView` ×16 — 72.28ms self, 72.28ms w/children — parent re-render
- `DeltaChip` [React.memo + React Compiler] ×6 — 68.93ms self, 170.04ms w/children — parent re-render
- `AnimatedComponent(Pressable)` ×16 — 31.26ms self, 138.19ms w/children — parent re-render
- `Pressable` ×16 — 28.77ms self, 106.93ms w/children — props: style, transform
- `Text` [React.memo + React Compiler] ×2 — 24.14ms self, 26.39ms w/children — parent re-render
- `View` ×33 — 22.2ms self, 466.67ms w/children — parent re-render
- `AnimatedComponent(View)` — 16.72ms self, 156.1ms w/children — parent re-render
- `Icon` [React.memo + React Compiler] ×16 — 8.89ms self, 100.44ms w/children — parent re-render

---
## Top Components by Total Render Cost

| Component | Renders | Total | Avg | Max | Reason | File |
|---|---|---|---|---|---|---|
| `Pressable` ✓ | 96 | 178.9ms | 1.86ms | 13.81ms | props: style, transform, opacity | `primitives/Pressable.tsx:34` |
| `View` ⚠️ | 256 | 166.1ms | 0.65ms | 12.85ms | parent re-render | — |
| `MenuSheet` [React.memo + React Compiler] | 2 | 140.7ms | 70.35ms | 96.87ms | hooks | — |
| `DeltaChip` [React.memo + React Compiler] ⚠️ | 12 | 137.9ms | 11.49ms | 55.63ms | parent re-render | `components/DeltaChip.tsx:29` |
| `PressabilityDebugView` ⚠️ | 90 | 84.4ms | 0.94ms | 71.95ms | parent re-render | — |
| `Text` [React.memo + React Compiler] | 4 | 48.3ms | 12.07ms | 23.56ms | parent re-render | `primitives/Text.tsx:58` |
| `VirtualizedList` | 2 | 41.7ms | 20.84ms | 34.87ms | parent re-render | — |
| `ScrollView` | 4 | 24.7ms | 6.16ms | 20.16ms | props: stickyHeaderIndices, children | — |
| `Icon` [React.memo + React Compiler] ⚠️ | 32 | 17.8ms | 0.56ms | 1.96ms | parent re-render | `primitives/Icon.tsx:67` |
| `RNHostView` | 4 | 10.5ms | 2.63ms | 9.14ms | props: children | — |
| `PageVeil` [React Compiler] | 4 | 1.9ms | 0.48ms | 0.73ms | props: pageKey, move, style | `components/SheetPager.tsx:51` |

---
## Suggested Improvements

### `Pressable` — `primitives/Pressable.tsx:34`

> React Compiler has already optimized this component. Re-render cost may originate at the callsite — check that props passed to `Pressable` are stable (no inline objects/functions).

<details><summary>Source — `primitives/Pressable.tsx:34`</summary>

```tsx
 */
export const Pressable = memo(function Pressable({
  onPress,
  style,
  onPressIn,
  onPressOut,
  tapSlop,
  ...rest
}: PressableProps) {
  const start = useRef({ x: 0, y: 0 });
  const trackPressIn = useCallback(
    (e: GestureResponderEvent) => {
      start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
      onPressIn?.(e);
    },
    [onPressIn],
  );
  const {
    animatedStyle,
    onPressIn: handlePressIn,
    onPressOut: handlePressOut,
  } = useSpringPress(tapSlop === undefined ? onPressIn : trackPressIn, onPressOut);

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (tapSlop !== undefined) {
        const dx = e.nativeEvent.pageX - start.current.x;
        const dy = e.nativeEvent.pageY - start.current.y;
        if (dx * dx + dy * dy > tapSlop * tapSlop) return;
      }
      onPress();
    },
    [onPress, tapSlop],
  );

  return (
    <AnimatedPressable
      {...rest}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animatedStyle]}
    />
  );
});

```

</details>

### `View`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

### `MenuSheet` [React.memo + React Compiler]

**Unstable hook deps:** unknown hooks. Check dependency arrays in `useEffect`/`useMemo` — a dependency may be recreated on every render.

### `DeltaChip` [React.memo + React Compiler] — `components/DeltaChip.tsx:29`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

<details><summary>Source — `components/DeltaChip.tsx:29`</summary>

```tsx
 */
export const DeltaChip = memo(function DeltaChip({
  delta,
  window = true,
  scale = 1.15,
}: {
  delta: CardDelta;
  /** Print the period the move was measured over. Off where there is no room. */
  window?: boolean;
  scale?: number;
}) {
  const tone = moveTone(delta);
  return (
    <View style={styles.delta}>
      {delta.direction !== 'flat' ? (
        // The caret is an icon-font glyph a screen reader announces as an
        // empty element; the direction it draws is spoken with the number.
        <View
          style={styles.deltaCaret}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Icon
            name={delta.direction === 'up' ? 'caret-up' : 'caret-down'}
            // The caret follows the figure: at the base 11pt (the strip, the
            // markets list) the 14pt triangle outweighed the number it points
            // at, as `▶` at 20pt outweighed the menu beside it.
            size={scale > 1 ? 'sm' : 'xs'}
            tone={tone}
          />
        </View>
      ) : null}
      {/* Semibold tabular type makes the move readable *as a number* inside a
          mixed metadata row. Set like the regular unit or small-caps window,
          it disappears into them and defeats the point of taking the move out
          of a sentence. */}
      <Text
        variant="tabularEmphasis"
        tone={tone}
        scale={scale}
        maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
        accessibilityLabel={spokenDelta(delta, { window: false })}
      >
        {delta.magnitude}
      </Text>
      {/* Plain caption, the same register as the unit on the other side of
          the dot. This was small caps, which put the window in the kicker's
          register and made the row three type treatments wide — regular,
          semibold, caps — for four words. Two now: quiet text, and the one
          coloured number the row exists to show. */}
```

</details>

### `PressabilityDebugView`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.


> 📝 Dev mode renders are ~3× slower than production. Divide ms values by ~3 for a rough production estimate.

---
## Next Steps

Ask the user which path to take:

1. **Investigate further** — use query tools to drill into specific findings before making changes:
   - `profiler-commit-query` mode=`by_index` commit_index=9 — full breakdown of the slowest commit
   - `profiler-cpu-query` mode=`component_cpu` component_name=`Pressable` — CPU activity during this component's renders
   - `profiler-cpu-query` mode=`call_tree` — trace callers/callees of hot functions
2. **Implement fixes** — apply changes to the top offenders identified above, then re-profile the same scenario to measure improvement.
3. **Done for now** — save the report for reference.