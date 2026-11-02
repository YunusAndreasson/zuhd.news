# Profiling Analysis — 12.5s session
**React Compiler:** ✓  **Hot commits:** 9 of 16 total

> **Duration columns:** `self` = this component's own render work only (exclusive).
> `w/children` = self + the entire subtree it owns (inclusive).
> Do not sum the `w/children` column — a parent's inclusive time already contains its
> children's time. Use `self` for summing; use `w/children` to understand container cost.

---
## Slow React Batches

### Commit #0 — 555.07ms 🔴 (t=2.8s)

**Initial render:** 50 components mounted

Mount cascade:
- `Text` ×82 — 88.01ms self, 149.38ms w/children — (mount)
- `Pressable` [React.memo + React Compiler] ×11 — 65.59ms self, 231.57ms w/children — (mount)
- `View` ×123 — 59.76ms self, 4653.36ms w/children — parent re-render
- `SegmentedControl` [React Compiler] — 33.96ms self, 141.58ms w/children — (mount)
- `Text` [React.memo + React Compiler] ×61 — 15.72ms self, 146.21ms w/children — (mount)
- `ListRow` [React.memo + React Compiler] ×10 — 14.17ms self, 192.38ms w/children — (mount)
- `InstrumentRow` [React.memo + React Compiler] ×10 — 12.16ms self, 204.54ms w/children — (mount)
- `CellRenderer` ×10 — 11.46ms self, 222.28ms w/children — (mount)
- `AnimatedComponent(View)` ×5 — 10.38ms self, 513.01ms w/children — parent re-render
- `Pressable` ×25 — 8.84ms self, 409.08ms w/children — (mount)
- `DeltaChip` [React.memo + React Compiler] ×11 — 8.67ms self, 54.43ms w/children — (mount)
- `Icon` ×24 — 5.59ms self, 35.4ms w/children — (mount)
- `BottomSheet` — 5.18ms self, 550.9ms w/children — props: onBackPress, children
- `AnimatedComponent(Pressable)` ×11 — 4.22ms self, 163.98ms w/children — (mount)
- `MenuSheet` [React.memo + React Compiler] — 3.35ms self, 555.07ms w/children — hooks
- _... and 35 more_
- _Shown: 347.1ms self / 555.07ms commit (63%) — 35 more components not shown. Use `profiler-commit-query mode=by_index commit_index=0` to see all._

**CPU during this commit:**
- `createSerializable` self=75.04ms total=75.04ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:158461)
- `cloneWorklet` self=61.16ms total=61.16ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:158703)
- `insertChild` self=50.2ms total=50.2ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:45102)
- `flushPendingEvents` self=44.97ms total=44.97ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:44813)
- `cloneWorklet` self=36.88ms total=36.88ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:158703)

### Commit #1 — 0.07ms 🔵 (t=3.3s, margin)

- `RetainedListPage` [React Compiler] — 0.06ms self, 0.07ms w/children — hooks

### Commit #2 — 662.31ms 🔴 (t=4.2s)

**Root cause:** `VirtualizedListCellContextProvider` re-rendered — props: children

Render cascade:
- `VirtualizedList` — 122.28ms self, 662.31ms w/children — parent re-render
- `Pressable` [React.memo + React Compiler] ×10 — 91.61ms self, 475.43ms w/children — (mount)
- `Text` ×70 — 77.84ms self, 191.38ms w/children — (mount)
- `View` ×93 — 23.1ms self, 2010.02ms w/children — parent re-render
- `Text` [React.memo + React Compiler] ×50 — 20.38ms self, 186.25ms w/children — (mount)
- `Icon` ×20 — 13.29ms self, 53.31ms w/children — (mount)
- `Pressable` ×20 — 12.85ms self, 762.42ms w/children — (mount)
- `ListRow` [React.memo + React Compiler] ×10 — 11.41ms self, 486.84ms w/children — (mount)
- `InstrumentRow` [React.memo + React Compiler] ×10 — 11.17ms self, 498.01ms w/children — (mount)
- `RowReading` [React Compiler] ×10 — 9.82ms self, 21.93ms w/children — (mount)
- `DeltaChip` [React.memo + React Compiler] ×10 — 6.69ms self, 73.65ms w/children — (mount)
- `CellRenderer` ×10 — 5.48ms self, 529.35ms w/children — (mount)
- `VirtualizedListCellContextProvider` ×11 — 4.54ms self, 524.4ms w/children — props: children
- `VirtualizedListContextProvider` — 3.89ms self, 539.98ms w/children — props: value, children
- `AnimatedComponent(Pressable)` ×10 — 3.55ms self, 382.15ms w/children — (mount)
- _... and 7 more_
- _Shown: 417.9ms self / 662.31ms commit (63%) — 7 more components not shown. Use `profiler-commit-query mode=by_index commit_index=2` to see all._

**CPU during this commit:**
- `[Host Function] completeRoot` self=161.73ms total=161.73ms ([host]:0)
- `[Host Function] createTask` self=73.77ms total=73.77ms ([host]:0)
- `createSerializable` self=64.46ms total=64.46ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:158461)
- `[Host Function] createTask` self=51.05ms total=51.05ms ([host]:0)
- `FiberNode` self=33.19ms total=33.19ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:26327)

### Commit #3 — 13.33ms 🔵 (t=4.3s, margin)

- `View` ×31 — 6.56ms self, 144.41ms w/children — props: accessibilityState, accessibilityValue, style
- `AnimatedComponent(Pressable)` ×11 — 3.72ms self, 12.12ms w/children — parent re-render
- `Pressable` ×11 — 3.45ms self, 8.4ms w/children — props: style, transform, opacity
- `PressabilityDebugView` ×11 — 0.16ms self, 0.16ms w/children — parent re-render

### Commit #4 — 373.79ms 🔴 (t=4.9s)

**Initial render:** 22 components mounted

Mount cascade:
- `Text` ×57 — 82.16ms self, 122.42ms w/children — (mount)
- `Pressable` [React.memo + React Compiler] ×8 — 65.35ms self, 304.42ms w/children — (mount)
- `View` ×105 — 47.59ms self, 1556.47ms w/children — props: transform, accessibilityState, accessibilityValue
- `VirtualizedList` — 30.29ms self, 373.79ms w/children — parent re-render
- `Icon` [React.memo + React Compiler] ×8 — 10.47ms self, 21.4ms w/children — (mount)
- `Text` [React.memo + React Compiler] ×41 — 9.29ms self, 63.18ms w/children — (mount)
- `ListRow` [React.memo + React Compiler] ×8 — 8.45ms self, 312.87ms w/children — (mount)
- `Pressable` ×27 — 8.33ms self, 481.14ms w/children — props: style, transform
- `InstrumentRow` [React.memo + React Compiler] ×8 — 7.88ms self, 320.75ms w/children — (mount)
- `AnimatedComponent(Pressable)` ×19 — 6.38ms self, 248.44ms w/children — parent re-render
- `DeltaChip` [React.memo + React Compiler] ×8 — 5.37ms self, 63.09ms w/children — (mount)
- `CellRenderer` ×8 — 5.15ms self, 330.97ms w/children — (mount)
- `PressabilityDebugView` ×19 — 4.54ms self, 4.54ms w/children — parent re-render
- `Icon` ×16 — 3.72ms self, 19.95ms w/children — (mount)
- `VirtualizedListCellContextProvider` ×9 — 1.54ms self, 326.21ms w/children — props: children
- _... and 7 more_
- _Shown: 296.5ms self / 373.79ms commit (79%) — 7 more components not shown. Use `profiler-commit-query mode=by_index commit_index=4` to see all._

**CPU during this commit:**
- `[Host Function] completeRoot` self=90.17ms total=90.17ms ([host]:0)
- `[Host Function] createTask` self=49.76ms total=49.76ms ([host]:0)
- `[Host Function] createSerializableObject` self=11.78ms total=11.78ms ([host]:0)
- `[Native] errorStackGetter` self=11.64ms total=11.64ms ([native]:0)
- `cloneWorklet` self=11.11ms total=11.11ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:158703)

### Commit #5 — 59.35ms 🔴 (t=5.1s)

**Root cause:** `View` re-rendered — props: transform, accessibilityState, accessibilityValue

Render cascade:
- `View` ×34 — 6.8ms self, 155.15ms w/children — props: transform, accessibilityState, accessibilityValue
- `Pressable` ×14 — 5.16ms self, 89.5ms w/children — props: style, transform
- `AnimatedComponent(Pressable)` ×11 — 4.28ms self, 10.43ms w/children — parent re-render
- `AnimatedComponent(View)` ×3 — 1.24ms self, 14.27ms w/children — parent re-render
- `PressabilityDebugView` ×11 — 0.13ms self, 0.13ms w/children — parent re-render
- _Shown: 17.6ms self / 59.35ms commit (30% explained by self-time — remainder is native/layout work outside JS)_

**CPU during this commit:**
- `[Host Function] createTask` self=44.15ms total=44.15ms ([host]:0)

### Commit #7 — 59.35ms 🔴 (t=5.4s)

**Root cause:** `View` re-rendered — props: style, transform

Render cascade:
- `AnimatedComponent(View)` ×3 — 4.43ms self, 15.38ms w/children — parent re-render
- `View` ×3 — 2.39ms self, 10.95ms w/children — props: style, transform
- `Pressable` ×3 — 1.67ms self, 83.35ms w/children — parent re-render
- _Shown: 8.5ms self / 59.35ms commit (14% explained by self-time — remainder is native/layout work outside JS)_

**CPU during this commit:**
- `startProfilerTimer` self=12.69ms total=12.69ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:20839)
- `executeForEachEventHandler` self=5.34ms total=5.34ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:203006)
- `updateVirtualChildrenRecursively` self=0.92ms total=0.92ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:45574)

### Commit #8 — 64.81ms 🔴 (t=6.0s)

**Root cause:** `Pressable` re-rendered — props: style, transform

Render cascade:
- `Pressable` ×11 — 14.31ms self, 35.12ms w/children — props: style, transform
- `View` ×32 — 14.05ms self, 315.35ms w/children — parent re-render
- `AnimatedComponent(Pressable)` ×11 — 13.76ms self, 48.88ms w/children — parent re-render
- `DeltaChip` [React.memo + React Compiler] — 0.95ms self, 5.41ms w/children — parent re-render
- `PressabilityDebugView` ×11 — 0.49ms self, 0.49ms w/children — parent re-render
- `Icon` [React.memo + React Compiler] — 0.3ms self, 1.82ms w/children — parent re-render
- _Shown: 43.9ms self / 64.81ms commit (68% explained by self-time — remainder is native/layout work outside JS)_

**CPU during this commit:**
- `[Host Function] run` self=20.33ms total=20.33ms ([host]:0)
- `recordProfilingDurations` self=14.66ms total=14.66ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:45422)
- `[Host Function] completeRoot` self=8.44ms total=8.44ms ([host]:0)

### Commit #9 — 76.09ms 🔴 (t=6.6s)

**Root cause:** `Pressable` re-rendered — props: style, transform

Render cascade:
- `Pressable` ×9 — 22.67ms self, 42.6ms w/children — props: style, transform
- `AnimatedComponent(Pressable)` ×9 — 14.54ms self, 57.14ms w/children — parent re-render
- `View` ×26 — 11.49ms self, 235.31ms w/children — parent re-render
- `DeltaChip` [React.memo + React Compiler] — 0.95ms self, 5.41ms w/children — parent re-render
- `PressabilityDebugView` ×9 — 0.63ms self, 0.63ms w/children — parent re-render
- `Icon` [React.memo + React Compiler] — 0.3ms self, 1.82ms w/children — parent re-render
- _Shown: 50.6ms self / 76.09ms commit (66% explained by self-time — remainder is native/layout work outside JS)_

**CPU during this commit:**
- `pushComponentEffectDidSpawnUpdate` self=30.2ms total=30.2ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:20834)
- `[Host Function] completeRoot` self=12.38ms total=12.38ms ([host]:0)

### Commit #10 — 76.09ms 🔴 (t=7.0s)

**Root cause:** `Pressable` re-rendered — props: style, transform

Render cascade:
- `Pressable` ×8 — 20.1ms self, 33.31ms w/children — props: style, transform
- `AnimatedComponent(Pressable)` ×8 — 12.96ms self, 46.27ms w/children — parent re-render
- `View` ×24 — 12.09ms self, 225.8ms w/children — parent re-render
- `PressabilityDebugView` ×8 — 0.5ms self, 0.5ms w/children — parent re-render
- _Shown: 45.7ms self / 76.09ms commit (60% explained by self-time — remainder is native/layout work outside JS)_

**CPU during this commit:**
- `[Native] setConstructor` self=18.23ms total=18.23ms ([native]:0)
- `[Native] stringPrototypeRepeat` self=13.79ms total=13.79ms ([native]:0)
- `[GC Young Gen]` self=7.93ms total=7.93ms ([suspended]:0)
- `getComponentNameFromType` self=0.53ms total=0.53ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:10823)

### Commit #11 — 53.59ms 🔴 (t=7.4s)

**Root cause:** `MenuSheet` [React.memo + React Compiler] re-rendered — hooks

Render cascade:
- `MenuSheet` [React.memo + React Compiler] — 26.03ms self, 53.59ms w/children — hooks
- `ModalBottomSheetComponent` — 8.41ms self, 24.78ms w/children — props: interceptBackPress, onBackPress, properties
- `AnimatedComponent(View)` ×3 — 4.48ms self, 9.82ms w/children — parent re-render
- `View` ×11 — 2.26ms self, 51.92ms w/children — parent re-render
- `BottomSheet` — 1.08ms self, 26.86ms w/children — props: onBackPress, children
- `Text` ×3 — 0.87ms self, 3ms w/children — (mount)
- `Canvas` — 0.86ms self, 1.37ms w/children — (mount)
- `GestureHandlerRootView` — 0.55ms self, 14.58ms w/children — props: children
- `PageVeil` [React Compiler] ×2 — 0.55ms self, 6.16ms w/children — props: pageKey, move, style
- `RNHostView` ×2 — 0.53ms self, 31.44ms w/children — props: children
- `SheetHandle` [React.memo + React Compiler] — 0.51ms self, 8.63ms w/children — props: title, onBack, pageKey
- `SheetPager` [React Compiler] — 0.5ms self, 5.3ms w/children — props: pageKey, move, children
- `Host` — 0.5ms self, 25.75ms w/children — props: style, children
- `SheetLayout` [React.memo + React Compiler] — 0.44ms self, 27.55ms w/children — props: handle, onBackPress, children
- `SheetScrollContextReset` — 0.42ms self, 15.03ms w/children — props: children
- _... and 12 more_
- _Shown: 48ms self / 53.59ms commit (90%) — 12 more components not shown. Use `profiler-commit-query mode=by_index commit_index=11` to see all._

**CPU during this commit:**
- `[Native] errorStackGetter` self=12.62ms total=12.62ms ([native]:0)
- `[Host Function] completeRoot` self=12.07ms total=12.07ms ([host]:0)
- `formatDurationToMicrosecondsGranularity` self=10.96ms total=10.96ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:38669)
- `untrackFiber` self=9.68ms total=9.68ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:44559)
- `clonePlainJSObject` self=8.25ms total=8.25ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:158779)

### Commit #12 — 1.09ms 🔵 (t=9.4s, margin)

- `AnimatedComponent(View)` — 0.69ms self, 1.09ms w/children — parent re-render
- `View` — 0.29ms self, 0.4ms w/children — props: style, transform
- `RetainedListPage` [React Compiler] — 0.22ms self, 0.71ms w/children — parent re-render

---
## Top Components by Total Render Cost

| Component | Renders | Total | Avg | Max | Reason | File |
|---|---|---|---|---|---|---|
| `VirtualizedList` | 2 | 152.6ms | 76.28ms | 122.28ms | parent re-render | — |
| `View` ⚠️ | 198 | 78.1ms | 0.39ms | 14.35ms | parent re-render | — |
| `Pressable` ✓ | 67 | 71.4ms | 1.07ms | 7.33ms | props: style, transform, opacity | `primitives/Pressable.tsx:34` |
| `ScrollView` | 4 | 3.3ms | 0.84ms | 1.75ms | props: stickyHeaderIndices, children | — |
| `PressabilityDebugView` ⚠️ | 61 | 2.1ms | 0.03ms | 0.15ms | parent re-render | — |
| `RNHostView` | 4 | 1.2ms | 0.29ms | 0.33ms | props: children | — |
| `PageVeil` [React Compiler] | 4 | 1.1ms | 0.28ms | 0.35ms | props: pageKey, move, style | `components/SheetPager.tsx:51` |
| `RetainedListPage` [React Compiler] | 4 | 0.7ms | 0.17ms | 0.22ms | props: hidden | — |

---
## Suggested Improvements

### `VirtualizedList`

**Unnecessary parent re-render** — check for a React Compiler bailout in the parent, or wrap with `React.memo` if the parent can't be fixed.

### `View`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

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

### `ScrollView`

**Stabilize props:** `stickyHeaderIndices`, `children`. Likely inline objects/functions at the callsite — extract to constants or wrap with `useMemo`/`useCallback` (or fix the React Compiler bailout causing this).

### `PressabilityDebugView`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.


> 📝 Dev mode renders are ~3× slower than production. Divide ms values by ~3 for a rough production estimate.

---
## Next Steps

Ask the user which path to take:

1. **Investigate further** — use query tools to drill into specific findings before making changes:
   - `profiler-commit-query` mode=`by_index` commit_index=2 — full breakdown of the slowest commit
   - `profiler-cpu-query` mode=`component_cpu` component_name=`VirtualizedList` — CPU activity during this component's renders
   - `profiler-cpu-query` mode=`call_tree` — trace callers/callees of hot functions
2. **Implement fixes** — apply changes to the top offenders identified above, then re-profile the same scenario to measure improvement.
3. **Done for now** — save the report for reference.