# Profiling Analysis — 14.4s session
**React Compiler:** ✓  **Hot commits:** 10 of 14 total

> **Duration columns:** `self` = this component's own render work only (exclusive).
> `w/children` = self + the entire subtree it owns (inclusive).
> Do not sum the `w/children` column — a parent's inclusive time already contains its
> children's time. Use `self` for summing; use `w/children` to understand container cost.

---
## Slow React Batches

### Commit #0 — 926.24ms 🔴 (t=3.8s)

**Root cause:** `SheetHandle` [React.memo + React Compiler] re-rendered — props: title, onBack, pageKey

Render cascade:
- `Text` ×82 — 139.21ms self, 225.58ms w/children — (mount)
- `View` ×154 — 58.43ms self, 6243.97ms w/children — parent re-render
- `SheetHandle` [React.memo + React Compiler] — 53.69ms self, 152.45ms w/children — props: title, onBack, pageKey
- `AnimatedComponent(Pressable)` ×26 — 45.63ms self, 491.5ms w/children — parent re-render
- `MenuSheet` [React.memo + React Compiler] — 44.85ms self, 926.24ms w/children — hooks
- `SheetScrollView` [React Compiler] — 37.18ms self, 132.36ms w/children — props: children
- `Pressable` [React.memo + React Compiler] ×26 — 36.04ms self, 532.47ms w/children — parent re-render
- `Pressable` ×55 — 28.7ms self, 950.82ms w/children — parent re-render
- `Icon` ×24 — 22.46ms self, 175.57ms w/children — (mount)
- `ListRow` [React.memo + React Compiler] ×25 — 21.19ms self, 471.73ms w/children — props: onPress
- `Text` [React.memo + React Compiler] ×63 — 19.4ms self, 158.22ms w/children — parent re-render
- `AnimatedComponent(View)` ×5 — 17.05ms self, 732.36ms w/children — parent re-render
- `ScrollView` ×4 — 14.45ms self, 1271.39ms w/children — props: children
- `DeltaChip` [React.memo + React Compiler] ×17 — 11.82ms self, 191.41ms w/children — parent re-render
- `InstrumentRow` [React.memo + React Compiler] ×10 — 11.68ms self, 408.57ms w/children — (mount)
- _... and 43 more_
- _Shown: 561.8ms self / 926.24ms commit (61%) — 43 more components not shown. Use `profiler-commit-query mode=by_index commit_index=0` to see all._

**CPU during this commit:**
- `[Host Function] createSynchronizable` self=64.62ms total=64.62ms ([host]:0)
- `[Host Function] createTask` self=54.08ms total=54.08ms ([host]:0)
- `[Native] ErrorConstructor` self=45.09ms total=45.09ms ([native]:0)
- `[Native] ErrorConstructor` self=43.74ms total=43.74ms ([native]:0)
- `[Host Function] createTask` self=43.06ms total=43.06ms ([host]:0)

### Commit #1 — 0.04ms 🔵 (t=3.9s, margin)

- `RetainedListPage` [React Compiler] — 0.04ms self, 0.04ms w/children — hooks

### Commit #2 — 573.1ms 🔴 (t=4.7s)

**Initial render:** 22 components mounted

Mount cascade:
- `View` ×93 — 79.57ms self, 1982.48ms w/children — parent re-render
- `Pressable` [React.memo + React Compiler] ×10 — 71.95ms self, 457.25ms w/children — (mount)
- `AnimatedComponent(Pressable)` ×10 — 56.24ms self, 383.3ms w/children — (mount)
- `Text` ×70 — 50.2ms self, 156.39ms w/children — (mount)
- `ListRow` [React.memo + React Compiler] ×10 — 31.48ms self, 488.74ms w/children — (mount)
- `InstrumentRow` [React.memo + React Compiler] ×10 — 28.13ms self, 516.86ms w/children — (mount)
- `Text` [React.memo + React Compiler] ×50 — 22.84ms self, 158.45ms w/children — (mount)
- `Icon` ×20 — 21.27ms self, 45.44ms w/children — (mount)
- `DeltaChip` [React.memo + React Compiler] ×10 — 10.6ms self, 105.72ms w/children — (mount)
- `Pressable` ×20 — 7.31ms self, 712.35ms w/children — (mount)
- `CellRenderer` ×10 — 5.69ms self, 528.94ms w/children — (mount)
- `VirtualizedList` — 5.09ms self, 573.1ms w/children — parent re-render
- `FlagGlyph` [React.memo + React Compiler] ×10 — 2.56ms self, 12.35ms w/children — (mount)
- `Icon` [React.memo + React Compiler] ×10 — 2.18ms self, 34.45ms w/children — (mount)
- `VirtualizedListCellContextProvider` ×11 — 2.11ms self, 523.66ms w/children — props: children
- _... and 7 more_
- _Shown: 397.2ms self / 573.1ms commit (69%) — 7 more components not shown. Use `profiler-commit-query mode=by_index commit_index=2` to see all._

**CPU during this commit:**
- `[Host Function] createTask` self=62.22ms total=62.22ms ([host]:0)
- `[Host Function] completeRoot` self=33.18ms total=33.18ms ([host]:0)
- `getChangedKeys` self=18.78ms total=18.78ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:44710)
- `runWithFiberInDEV` self=18.21ms total=18.21ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:19376)
- `[Host Function] createNode` self=17.9ms total=17.9ms ([host]:0)

### Commit #3 — 254.09ms 🔴 (t=5.1s)

**Root cause:** `VirtualizedListCellContextProvider` re-rendered — props: children

Render cascade:
- `VirtualizedList` — 61.11ms self, 254.09ms w/children — parent re-render
- `Text` ×57 — 20.49ms self, 55.33ms w/children — (mount)
- `View` ×74 — 18.99ms self, 751.96ms w/children — parent re-render
- `Pressable` [React.memo + React Compiler] ×8 — 16.21ms self, 159.32ms w/children — (mount)
- `Pressable` ×16 — 14.74ms self, 280.48ms w/children — (mount)
- `Text` [React.memo + React Compiler] ×41 — 14.01ms self, 48.52ms w/children — (mount)
- `ListRow` [React.memo + React Compiler] ×8 — 10.08ms self, 169.4ms w/children — (mount)
- `InstrumentRow` [React.memo + React Compiler] ×8 — 10.05ms self, 179.45ms w/children — (mount)
- `DeltaChip` [React.memo + React Compiler] ×8 — 8.06ms self, 49.02ms w/children — (mount)
- `CellRenderer` ×8 — 5.21ms self, 189.76ms w/children — (mount)
- `FlagGlyph` [React.memo + React Compiler] ×8 — 4.8ms self, 9.02ms w/children — (mount)
- `Icon` ×16 — 4.16ms self, 39.83ms w/children — (mount)
- `AnimatedComponent(Pressable)` ×8 — 3.55ms self, 140.93ms w/children — (mount)
- `VirtualizedListCellContextProvider` ×9 — 1.84ms self, 184.99ms w/children — props: children
- `Icon` [React.memo + React Compiler] ×8 — 1.56ms self, 22.33ms w/children — (mount)
- _... and 7 more_
- _Shown: 194.9ms self / 254.09ms commit (77%) — 7 more components not shown. Use `profiler-commit-query mode=by_index commit_index=3` to see all._

**CPU during this commit:**
- `getChangedKeys` self=18.78ms total=18.78ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:44710)
- `runWithFiberInDEV` self=18.21ms total=18.21ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:19376)
- `commitReconciliationEffects` self=16.81ms total=16.81ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:24698)
- `isPseudoSelectorValue` self=14.84ms total=14.84ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:182349)
- `mountChildrenRecursively` self=14.55ms total=14.55ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:45282)

### Commit #4 — 65.73ms 🔴 (t=5.1s)

**Root cause:** `View` re-rendered — props: accessibilityState, accessibilityValue, style

Render cascade:
- `View` ×33 — 11.65ms self, 328.43ms w/children — props: accessibilityState, accessibilityValue, style
- `Pressable` ×14 — 5.5ms self, 20.4ms w/children — props: style, transform, opacity
- `AnimatedComponent(Pressable)` ×11 — 3.58ms self, 15.45ms w/children — parent re-render
- `AnimatedComponent(View)` ×2 — 0.67ms self, 2.47ms w/children — parent re-render
- `PressabilityDebugView` ×11 — 0.16ms self, 0.16ms w/children — parent re-render
- _Shown: 21.6ms self / 65.73ms commit (33% explained by self-time — remainder is native/layout work outside JS)_

**CPU during this commit:**
- `getChangedKeys` self=18.78ms total=18.78ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:44710)
- `[Host Function] completeRoot` self=3.87ms total=3.87ms ([host]:0)

### Commit #6 — 73.96ms 🔴 (t=5.5s)

**Root cause:** `View` re-rendered — props: transform, accessibilityState, accessibilityValue

Render cascade:
- `View` ×34 — 22.44ms self, 412.1ms w/children — props: transform, accessibilityState, accessibilityValue
- `Pressable` ×14 — 21.8ms self, 45.45ms w/children — props: style, transform
- `AnimatedComponent(Pressable)` ×11 — 20.94ms self, 57.86ms w/children — parent re-render
- `AnimatedComponent(View)` ×3 — 4.14ms self, 80.87ms w/children — parent re-render
- `PressabilityDebugView` ×11 — 0.69ms self, 0.69ms w/children — parent re-render

**CPU during this commit:**
- `unmountRemainingChildren` self=35.31ms total=35.31ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:45154)
- `recordProfilingDurations` self=14.77ms total=14.77ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:45422)
- `getChangeDescription` self=9.96ms total=9.96ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:44594)
- `[Native] functionPrototypeBind` self=8.73ms total=8.73ms ([native]:0)
- `commitMutationEffectsOnFiber` self=3.92ms total=3.92ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:24592)

### Commit #7 — 82.4ms 🔴 (t=6.0s)

**Root cause:** `View` re-rendered — props: transform, accessibilityState, accessibilityValue

Render cascade:
- `View` ×66 — 57.42ms self, 742.1ms w/children — props: transform, accessibilityState, accessibilityValue
- `Pressable` ×25 — 18.21ms self, 77.33ms w/children — props: style, transform
- `AnimatedComponent(Pressable)` ×22 — 10.62ms self, 79.43ms w/children — parent re-render
- `AnimatedComponent(View)` ×3 — 1.32ms self, 85.02ms w/children — parent re-render
- `DeltaChip` [React.memo + React Compiler] — 0.55ms self, 3.09ms w/children — parent re-render
- `PressabilityDebugView` ×22 — 0.37ms self, 0.37ms w/children — parent re-render
- `Icon` [React.memo + React Compiler] — 0.16ms self, 1.03ms w/children — parent re-render

**CPU during this commit:**
- `[Native] mapIteratorPrototypeNext` self=13ms total=13ms ([native]:0)
- `[Host Function] completeRoot` self=12.65ms total=12.65ms ([host]:0)
- `structuredCloneInternal` self=3.86ms total=3.86ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:29713)

### Commit #8 — 49.52ms 🟡 (t=6.5s)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Root cause:** `Pressable` re-rendered — props: style, transform

Render cascade:
- `Pressable` ×19 — 33.43ms self, 62.64ms w/children — props: style, transform
- `AnimatedComponent(Pressable)` ×19 — 30.29ms self, 92.92ms w/children — parent re-render
- `View` ×56 — 23.8ms self, 434.38ms w/children — parent re-render
- `PressabilityDebugView` ×19 — 0.77ms self, 0.77ms w/children — parent re-render
- `DeltaChip` [React.memo + React Compiler] — 0.55ms self, 3.09ms w/children — parent re-render
- `Icon` [React.memo + React Compiler] — 0.16ms self, 1.03ms w/children — parent re-render

**CPU during this commit:**
- `[Host Function] completeRoot` self=15.11ms total=15.11ms ([host]:0)
- `[Native] arrayFrom` self=12.19ms total=12.19ms ([native]:0)
- `structuredCloneInternal` self=10.98ms total=10.98ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:29713)
- `[Host Function] reportMeasure` self=1.13ms total=1.13ms ([host]:0)

### Commit #9 — 19.53ms 🟡 (t=7.0s)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Root cause:** `Pressable` re-rendered — props: style, transform

Render cascade:
- `AnimatedComponent(Pressable)` ×8 — 16.88ms self, 35.03ms w/children — parent re-render
- `Pressable` ×8 — 9.3ms self, 18.14ms w/children — props: style, transform
- `View` ×24 — 8.57ms self, 126.46ms w/children — parent re-render
- `PressabilityDebugView` ×8 — 0.39ms self, 0.39ms w/children — parent re-render

**CPU during this commit:**
- `[Host Function] run` self=7.16ms total=7.16ms ([host]:0)
- `jsxDEVImpl` self=6.07ms total=6.07ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:10966)
- `startProfilerTimer` self=5.93ms total=5.93ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:20839)
- `unmountRemainingChildren` self=0.36ms total=0.36ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:45154)

### Commit #10 — 253.26ms 🔴 (t=9.5s)

**Root cause:** `MenuSheet` [React.memo + React Compiler] re-rendered — hooks

Render cascade:
- `MenuSheet` [React.memo + React Compiler] — 65.2ms self, 253.26ms w/children — hooks
- `Pressable` ×30 — 63.07ms self, 164.43ms w/children — props: onPress, style
- `Pressable` [React.memo + React Compiler] ×15 — 35.82ms self, 125.63ms w/children — props: onPress
- `View` ×42 — 18.35ms self, 901.36ms w/children — parent re-render
- `AnimatedComponent(View)` ×3 — 14.76ms self, 179.87ms w/children — parent re-render
- `AnimatedComponent(Pressable)` ×15 — 11.83ms self, 86.45ms w/children — props: onPress
- `MenuRow` [React.memo + React Compiler] ×15 — 9.51ms self, 142.69ms w/children — props: onPress
- `ListRow` [React.memo + React Compiler] ×15 — 7.54ms self, 133.18ms w/children — props: onPress
- `PageVeil` [React Compiler] ×2 — 4.42ms self, 21.18ms w/children — props: pageKey, move, style
- `DeltaChip` [React.memo + React Compiler] ×6 — 3.2ms self, 16.22ms w/children — parent re-render
- `GroupRow` [React.memo + React Compiler] ×10 — 3ms self, 93.95ms w/children — props: onPress
- `Icon` [React.memo + React Compiler] ×15 — 2.8ms self, 17.51ms w/children — parent re-render
- `BottomSheet` — 1.82ms self, 187.05ms w/children — props: onBackPress, children
- `Canvas` — 1.38ms self, 2.06ms w/children — (mount)
- `Text` ×3 — 1.26ms self, 4.39ms w/children — (mount)
- _... and 28 more_
- _Shown: 244ms self / 253.26ms commit (96%) — 28 more components not shown. Use `profiler-commit-query mode=by_index commit_index=10` to see all._

**CPU during this commit:**
- `[Host Function] createSerializableObject` self=49.28ms total=49.28ms ([host]:0)
- `[Native] errorStackGetter` self=34.25ms total=34.25ms ([native]:0)
- `cloneObjectProperties` self=22.77ms total=22.77ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:158659)
- `[Native] errorStackGetter` self=16.22ms total=16.22ms ([native]:0)
- `recursivelyTraversePassiveMountEffects` self=15.87ms total=15.87ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:24842)

### Commit #11 — 149.04ms 🔴 (t=11.6s)

**Root cause:** `View` re-rendered — props: style, transform

Render cascade:
- `AnimatedComponent(View)` — 4.19ms self, 4.48ms w/children — parent re-render
- `View` — 0.21ms self, 0.29ms w/children — props: style, transform
- `RetainedListPage` [React Compiler] — 0.17ms self, 149.04ms w/children — parent re-render
- _Shown: 4.6ms self / 149.04ms commit (3% explained by self-time — remainder is native/layout work outside JS)_

**CPU during this commit:**
- `recordProfilingDurations` self=12.15ms total=12.15ms (/&platform=android&dev=true&hot=false&lazy=true&transform.engine=hermes&transform.bytecode=1&transform.routerRoot=app&transform.reactCompiler=true&unstable_transformProfile=hermes-stable:45422)

---
## Top Components by Total Render Cost

| Component | Renders | Total | Avg | Max | Reason | File |
|---|---|---|---|---|---|---|
| `Pressable` ✓ | 140 | 164.8ms | 1.18ms | 22.24ms | props: style, transform, onPress | `primitives/Pressable.tsx:34` |
| `View` ⚠️ | 292 | 161.7ms | 0.55ms | 23.82ms | parent re-render | — |
| `MenuSheet` [React.memo + React Compiler] | 2 | 110.1ms | 55.03ms | 65.2ms | hooks | — |
| `VirtualizedList` | 2 | 66.2ms | 33.1ms | 61.11ms | parent re-render | — |
| `SheetHandle` [React.memo + React Compiler] | 2 | 54.4ms | 27.19ms | 53.69ms | props: title, onBack, pageKey | `components/SheetHandle.tsx:20` |
| `Pressable` [React.memo + React Compiler] ⚠️ | 30 | 43.6ms | 1.45ms | 31.19ms | props: onPress | `primitives/Pressable.tsx:34` |
| `SheetScrollView` [React Compiler] | 2 | 37.3ms | 18.66ms | 37.18ms | props: children | `components/SheetContent.tsx:50` |
| `ScrollView` ⚠️ | 8 | 16.4ms | 2.05ms | 13.07ms | props: children, stickyHeaderIndices | — |
| `ListRow` [React.memo + React Compiler] ⚠️ | 30 | 14.1ms | 0.47ms | 4.26ms | props: onPress | `components/ListRow.tsx:61` |
| `MenuRow` [React.memo + React Compiler] ⚠️ | 30 | 13.3ms | 0.44ms | 3.96ms | props: onPress | `components/MenuRow.tsx:53` |
| `DeltaChip` [React.memo + React Compiler] ⚠️ | 14 | 7.5ms | 0.54ms | 0.72ms | parent re-render | `components/DeltaChip.tsx:29` |
| `Icon` [React.memo + React Compiler] ⚠️ | 32 | 5.9ms | 0.19ms | 0.34ms | parent re-render | `primitives/Icon.tsx:67` |
| `GroupRow` [React.memo + React Compiler] ⚠️ | 20 | 5.5ms | 0.28ms | 0.73ms | props: onPress | — |
| `PageVeil` [React Compiler] | 4 | 5.5ms | 1.36ms | 4.01ms | props: pageKey, move, style | `components/SheetPager.tsx:51` |
| `PressabilityDebugView` ⚠️ | 101 | 3.3ms | 0.03ms | 0.41ms | parent re-render | — |
| `RNHostView` | 4 | 1.5ms | 0.38ms | 0.6ms | props: children | — |
| `RetainedListPage` [React Compiler] | 4 | 1ms | 0.24ms | 0.59ms | props: hidden, children | — |
| `Text` [React.memo + React Compiler] | 4 | 0.8ms | 0.2ms | 0.22ms | parent re-render | `primitives/Text.tsx:58` |
| `SectionLabel` [React Compiler] | 4 | 0.2ms | 0.04ms | 0.06ms | parent re-render | `components/MenuRow.tsx:145` |

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

### `VirtualizedList`

**Unnecessary parent re-render** — check for a React Compiler bailout in the parent, or wrap with `React.memo` if the parent can't be fixed.

### `SheetHandle` [React.memo + React Compiler] — `components/SheetHandle.tsx:20`

**Stabilize props:** `title`, `onBack`, `pageKey`. Likely inline objects/functions at the callsite — extract to constants or wrap with `useMemo`/`useCallback` (or fix the React Compiler bailout causing this).

<details><summary>Source — `components/SheetHandle.tsx:20`</summary>

```tsx

export const SheetHandle = memo(function SheetHandle({
  title,
  onBack,
  pageKey,
  move,
}: SheetHandleProps) {
  const { colors, typography } = useTheme();
  // Tighten line-height to match glyph height so flex center + absolute center
  // align against the same reference (no 1–2px optical drift from line-leading).
  const tightTitle = { lineHeight: typography.sizeBase };
  // The title is the sheet's heading, and nothing else here is an element of
  // its own. The row used to claim `adjustable` with no actions — a control
  // that promised to move and could not — and the indicator is a picture of a
  // drag the platform's own dismiss gesture already provides.
  return (
    <View style={styles.container}>
      <View
        style={[styles.indicator, { backgroundColor: colors.rule }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      {(title || onBack) && (
        // A title's height even without one: the back button is absolute, so
        // a page with no title (a card, which heads itself) had a 0pt row and
        // a back button of no size — nothing to tap.
        <View style={[styles.titleRow, { minHeight: typography.sizeBase }]}>
          {onBack && (
            <IconButton onPress={onBack} style={styles.back} accessibilityLabel="Back">
              <Icon name="chevron-back" tone="default" />
            </IconButton>
          )}
          {typeof title === 'string' ? (
            // Lowercase on screen, as it was written in the spoken label: small
            // caps draw a capital at full height, so a title that arrives in
            // data case — a GDACS event name, "Attack on civilians" — read as a
            // different tier from every lowercase title beside it.
            <Text
              variant="label"
              style={[styles.textTitle, tightTitle]}
              numberOfLines={3}
              accessibilityRole="header"
              accessibilityLabel={title}
            >
              {title.toLocaleLowerCase()}
            </Text>
          ) : (
            title
          )}
          {pageKey !== undefined && move ? (
```

</details>


> 📝 Dev mode renders are ~3× slower than production. Divide ms values by ~3 for a rough production estimate.

---
## Next Steps

Ask the user which path to take:

1. **Investigate further** — use query tools to drill into specific findings before making changes:
   - `profiler-commit-query` mode=`by_index` commit_index=0 — full breakdown of the slowest commit
   - `profiler-cpu-query` mode=`component_cpu` component_name=`Pressable` — CPU activity during this component's renders
   - `profiler-cpu-query` mode=`call_tree` — trace callers/callees of hot functions
2. **Implement fixes** — apply changes to the top offenders identified above, then re-profile the same scenario to measure improvement.
3. **Done for now** — save the report for reference.