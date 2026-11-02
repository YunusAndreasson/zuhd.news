# Profiling Analysis — 13.0s session
**React Compiler:** ✓  **Hot commits:** 10 of 15 total

> **Duration columns:** `self` = this component's own render work only (exclusive).
> `w/children` = self + the entire subtree it owns (inclusive).
> Do not sum the `w/children` column — a parent's inclusive time already contains its
> children's time. Use `self` for summing; use `w/children` to understand container cost.

---
## Slow React Batches

### Commit #0 — 580.1ms 🔴 (t=3.0s)

**Root cause:** `ModalBottomSheetView` re-rendered — props: interceptBackPress, onBackPress, properties

Render cascade:
- `Text` ×82 — 64.42ms self, 113.33ms w/children — (mount)
- `ModalBottomSheetView` — 58.2ms self, 506.4ms w/children — props: interceptBackPress, onBackPress, properties
- `SegmentedControl` [React Compiler] — 45.38ms self, 120.38ms w/children — (mount)
- `InstrumentRow` [React.memo + React Compiler] ×10 — 34.25ms self, 241.58ms w/children — (mount)
- `ListRow` [React.memo + React Compiler] ×10 — 31.09ms self, 207.32ms w/children — (mount)
- `View` ×122 — 29.59ms self, 3990.86ms w/children — parent re-render
- `BottomSheet` — 22.34ms self, 546.12ms w/children — props: onBackPress, children
- `Pressable` [React.memo + React Compiler] ×11 — 21.87ms self, 180.94ms w/children — (mount)
- `Text` [React.memo + React Compiler] ×61 — 20.17ms self, 110.78ms w/children — (mount)
- `MenuSheet` [React.memo + React Compiler] — 17.32ms self, 580.1ms w/children — hooks
- `Icon` ×24 — 15.47ms self, 52.36ms w/children — (mount)
- `BottomSheetModal` — 14.3ms self, 560.42ms w/children — props: onBackPress, children
- `PresentedContent` — 12.55ms self, 448.03ms w/children — props: children
- `Pressable` ×25 — 11.52ms self, 316.81ms w/children — (mount)
- `HostView` — 11.38ms self, 520.49ms w/children — props: style, children
- _... and 35 more_
- _Shown: 409.9ms self / 580.1ms commit (71%) — 35 more components not shown. Use `profiler-commit-query mode=by_index commit_index=0` to see all._

**CPU during this commit:**
- `[Host Function] createSerializableObject` self=72.85ms total=72.85ms ([host]:0)
- `[Host Function] run` self=37.27ms total=37.27ms ([host]:0)
- `hasValidKey` self=32.25ms total=32.25ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:10899)
- `[Native] errorStackGetter` self=26.3ms total=26.3ms ([native]:0)
- `[Host Function] createTask` self=24.06ms total=24.06ms ([host]:0)

### Commit #1 — 0.05ms 🔵 (t=3.2s, margin)

- `RetainedListPage` [React Compiler] — 0.05ms self, 0.05ms w/children — hooks

### Commit #2 — 600.96ms 🔴 (t=3.9s)

**Initial render:** 22 components mounted

Mount cascade:
- `ListRow` [React.memo + React Compiler] ×10 — 94.8ms self, 496.42ms w/children — (mount)
- `Text` [React.memo + React Compiler] ×50 — 89.75ms self, 213.67ms w/children — (mount)
- `View` ×93 — 52.5ms self, 2104.5ms w/children — parent re-render
- `Pressable` [React.memo + React Compiler] ×10 — 42.18ms self, 401.62ms w/children — (mount)
- `InstrumentRow` [React.memo + React Compiler] ×10 — 37.9ms self, 534.32ms w/children — (mount)
- `Text` ×70 — 32.16ms self, 138.9ms w/children — (mount)
- `DeltaChip` [React.memo + React Compiler] ×10 — 28.92ms self, 75.19ms w/children — (mount)
- `VirtualizedList` — 28.28ms self, 600.96ms w/children — parent re-render
- `Pressable` ×20 — 13.02ms self, 709.93ms w/children — (mount)
- `CellRenderer` ×10 — 8.58ms self, 550.38ms w/children — (mount)
- `FlagGlyph` [React.memo + React Compiler] ×10 — 6.37ms self, 13.29ms w/children — (mount)
- `Icon` ×20 — 5.39ms self, 24.45ms w/children — (mount)
- `AnimatedComponent(Pressable)` ×10 — 4.64ms self, 355.14ms w/children — (mount)
- `RowReading` [React Compiler] ×10 — 3.14ms self, 22.8ms w/children — (mount)
- `Icon` [React.memo + React Compiler] ×10 — 3.09ms self, 16.55ms w/children — (mount)
- _... and 7 more_
- _Shown: 450.7ms self / 600.96ms commit (75%) — 7 more components not shown. Use `profiler-commit-query mode=by_index commit_index=2` to see all._

**CPU during this commit:**
- `[Host Function] completeRoot` self=46.03ms total=46.03ms ([host]:0)
- `[Host Function] createTask` self=43.23ms total=43.23ms ([host]:0)
- `_loop` self=28.86ms total=28.86ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:203139)
- `[GC Young Gen]` self=23.27ms total=23.27ms ([suspended]:0)
- `[Host Function] createTask` self=22.32ms total=22.32ms ([host]:0)

### Commit #3 — 275.85ms 🔴 (t=4.4s)

**Initial render:** 22 components mounted

Mount cascade:
- `InstrumentRow` [React.memo + React Compiler] ×8 — 46.86ms self, 247.4ms w/children — (mount)
- `Pressable` ×16 — 22.25ms self, 319.43ms w/children — (mount)
- `AnimatedComponent(Pressable)` ×8 — 20.21ms self, 164.89ms w/children — (mount)
- `View` ×74 — 15.24ms self, 887.9ms w/children — parent re-render
- `Pressable` [React.memo + React Compiler] ×8 — 14.85ms self, 189.59ms w/children — (mount)
- `VirtualizedList` — 13.75ms self, 275.85ms w/children — parent re-render
- `Text` ×57 — 13.64ms self, 69.42ms w/children — (mount)
- `ListRow` [React.memo + React Compiler] ×8 — 10.95ms self, 200.54ms w/children — (mount)
- `Text` [React.memo + React Compiler] ×41 — 8.98ms self, 68ms w/children — (mount)
- `Icon` [React.memo + React Compiler] ×8 — 6.07ms self, 15.5ms w/children — (mount)
- `DeltaChip` [React.memo + React Compiler] ×8 — 5.4ms self, 35.33ms w/children — (mount)
- `CellRenderer` ×8 — 4.96ms self, 257.41ms w/children — (mount)
- `Icon` ×16 — 3.73ms self, 16.92ms w/children — (mount)
- `ScrollView` ×2 — 2.22ms self, 523.11ms w/children — props: stickyHeaderIndices, children
- `VirtualizedListCellContextProvider` ×9 — 1.99ms self, 253.07ms w/children — props: children
- _... and 7 more_
- _Shown: 191.1ms self / 275.85ms commit (69%) — 7 more components not shown. Use `profiler-commit-query mode=by_index commit_index=3` to see all._

**CPU during this commit:**
- `[Host Function] completeRoot` self=32.77ms total=32.77ms ([host]:0)
- `[GC Young Gen]` self=23.27ms total=23.27ms ([suspended]:0)
- `_shouldRenderWithPriority` self=12.24ms total=12.24ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:73121)
- `[Host Function] createTask` self=11.91ms total=11.91ms ([host]:0)
- `[Native] ErrorConstructor` self=11.88ms total=11.88ms ([native]:0)

### Commit #4 — 15.07ms 🔵 (t=4.5s, margin)

- `View` ×33 — 7.31ms self, 135.29ms w/children — props: accessibilityState, accessibilityValue, style
- `Pressable` ×14 — 5.72ms self, 16.05ms w/children — props: style, transform, opacity
- `AnimatedComponent(Pressable)` ×11 — 4.02ms self, 14.06ms w/children — parent re-render
- `AnimatedComponent(View)` ×2 — 0.65ms self, 2.54ms w/children — parent re-render
- `PressabilityDebugView` ×11 — 0.19ms self, 0.19ms w/children — parent re-render

### Commit #6 — 39.35ms 🟡 (t=4.8s)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Root cause:** `Pressable` re-rendered — props: style, transform

Render cascade:
- `AnimatedComponent(Pressable)` ×11 — 22.83ms self, 40.63ms w/children — parent re-render
- `Pressable` ×14 — 14.77ms self, 23.81ms w/children — props: style, transform
- `View` ×34 — 8.23ms self, 172.89ms w/children — props: transform, accessibilityState, accessibilityValue
- `AnimatedComponent(View)` ×3 — 1.41ms self, 42.2ms w/children — parent re-render
- `PressabilityDebugView` ×11 — 0.19ms self, 0.19ms w/children — parent re-render

**CPU during this commit:**
- `resolveFunctionForHotReloading` self=11.21ms total=11.21ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:26256)
- `structuredCloneInternal` self=7ms total=7ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:29713)
- `updateVirtualChildrenRecursively` self=5.63ms total=5.63ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:45574)
- `bubbleProperties` self=4.29ms total=4.29ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:23852)

### Commit #7 — 126.48ms 🔴 (t=5.5s)

**Root cause:** `Pressable` re-rendered — props: style, transform

Render cascade:
- `Pressable` ×24 — 35.85ms self, 79.29ms w/children — props: style, transform
- `AnimatedComponent(Pressable)` ×21 — 34.6ms self, 107.87ms w/children — parent re-render
- `View` ×64 — 32.51ms self, 624.81ms w/children — props: transform, accessibilityState, accessibilityValue
- `AnimatedComponent(View)` ×3 — 2.88ms self, 132.05ms w/children — parent re-render
- `PressabilityDebugView` ×21 — 1.26ms self, 1.26ms w/children — parent re-render

**CPU during this commit:**
- `structuredCloneInternal` self=28.08ms total=28.08ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:29713)
- `removeChild` self=23.18ms total=23.18ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:45123)
- `[Native] arrayFrom` self=21.03ms total=21.03ms ([native]:0)
- `get` self=7.03ms total=7.03ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:176744)

### Commit #8 — 58.41ms 🔴 (t=5.9s)

**Root cause:** `Pressable` re-rendered — props: style, transform

Render cascade:
- `View` ×54 — 19.07ms self, 467.18ms w/children — parent re-render
- `Pressable` ×18 — 13.62ms self, 29.94ms w/children — props: style, transform
- `AnimatedComponent(Pressable)` ×18 — 12.98ms self, 42.92ms w/children — parent re-render
- `PressabilityDebugView` ×18 — 0.57ms self, 0.57ms w/children — parent re-render
- _Shown: 46.2ms self / 58.41ms commit (79% explained by self-time — remainder is native/layout work outside JS)_

**CPU during this commit:**
- `getChangedKeys` self=22.27ms total=22.27ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:44710)
- `formatDurationToMicrosecondsGranularity` self=17.66ms total=17.66ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:38669)
- `popComponentEffectDuration` self=13.54ms total=13.54ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:20826)
- `[GC Young Gen]` self=4.94ms total=4.94ms ([suspended]:0)

### Commit #9 — 32.26ms 🟡 (t=6.3s)
> 🟡 May be acceptable in production (dev mode is ~3× slower)

**Root cause:** `Pressable` re-rendered — props: style, transform

Render cascade:
- `Pressable` ×8 — 12ms self, 21.32ms w/children — props: style, transform
- `AnimatedComponent(Pressable)` ×8 — 9.95ms self, 31.27ms w/children — parent re-render
- `View` ×24 — 9.8ms self, 131.04ms w/children — parent re-render
- `PressabilityDebugView` ×8 — 0.37ms self, 0.37ms w/children — parent re-render

**CPU during this commit:**
- `didFiberRender` self=13.56ms total=13.56ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:44733)
- `pop` self=11.87ms total=11.87ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:20069)
- `addObjectDiffToProperties` self=6.84ms total=6.84ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:20174)

### Commit #10 — 996.26ms 🔴 (t=8.8s)

**Initial render:** 47 components mounted

Mount cascade:
- `Pressable` [React.memo + React Compiler] ×16 — 149.68ms self, 719.2ms w/children — (mount)
- `View` ×69 — 120.44ms self, 4846.92ms w/children — parent re-render
- `MenuRow` [React.memo + React Compiler] ×16 — 71.76ms self, 855ms w/children — (mount)
- `ListRow` [React.memo + React Compiler] ×16 — 64.04ms self, 783.23ms w/children — (mount)
- `Icon` ×40 — 48.87ms self, 173.08ms w/children — (mount)
- `Text` ×50 — 47.83ms self, 160.4ms w/children — (mount)
- `GroupRow` [React.memo + React Compiler] ×10 — 36.66ms self, 611.7ms w/children — (mount)
- `Pressable` ×32 — 27.1ms self, 1107.29ms w/children — (mount)
- `DeltaChip` [React.memo + React Compiler] ×6 — 25.91ms self, 108.72ms w/children — (mount)
- `AnimatedComponent(Pressable)` ×16 — 24.48ms self, 562.24ms w/children — (mount)
- `AnimatedComponent(View)` ×3 — 23.4ms self, 993.31ms w/children — parent re-render
- `Text` [React.memo + React Compiler] ×28 — 12.32ms self, 113.12ms w/children — (mount)
- `Icon` [React.memo + React Compiler] ×20 — 12.29ms self, 119.57ms w/children — (mount)
- `MenuSheet` [React.memo + React Compiler] — 9.38ms self, 996.26ms w/children — hooks
- `SheetPager` [React Compiler] — 9.25ms self, 970.28ms w/children — props: pageKey, move, children
- _... and 32 more_
- _Shown: 683.4ms self / 996.26ms commit (69%) — 32 more components not shown. Use `profiler-commit-query mode=by_index commit_index=10` to see all._

**CPU during this commit:**
- `[Host Function] createSerializableString` self=88.09ms total=88.09ms ([host]:0)
- `[Native] errorStackGetter` self=33.93ms total=33.93ms ([native]:0)
- `[Native] ErrorConstructor` self=30.61ms total=30.61ms ([native]:0)
- `[Host Function] scheduleOnUI` self=26.94ms total=26.94ms ([host]:0)
- `[Host Function] createSerializableObject` self=25.55ms total=25.55ms ([host]:0)

### Commit #11 — 105ms 🔴 (t=10.8s)

**Root cause:** `Pressable` re-rendered — props: nativeID, style, transform

Render cascade:
- `AnimatedComponent(Pressable)` ×16 — 34.97ms self, 74.83ms w/children — parent re-render
- `AnimatedComponent(View)` — 27.91ms self, 105ms w/children — parent re-render
- `DeltaChip` [React.memo + React Compiler] ×6 — 25.91ms self, 108.72ms w/children — parent re-render
- `View` ×33 — 16.81ms self, 307.84ms w/children — parent re-render
- `Pressable` ×16 — 16ms self, 39.86ms w/children — props: nativeID, style, transform
- `Icon` [React.memo + React Compiler] ×16 — 11.34ms self, 78.22ms w/children — parent re-render
- `PressabilityDebugView` ×16 — 4.29ms self, 4.29ms w/children — parent re-render
- `Text` [React.memo + React Compiler] ×2 — 0.55ms self, 1.93ms w/children — parent re-render

**CPU during this commit:**
- `_getViewInfo` self=18.76ms total=18.76ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:194077)
- `updateFiberRecursively` self=6.4ms total=6.4ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:45768)
- `formatDurationToMicrosecondsGranularity` self=5.08ms total=5.08ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:38669)
- `structuredCloneInternal` self=1.89ms total=1.89ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:29713)
- `fiber_renderer_arrayLikeToArray` self=1.38ms total=1.38ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:43221)

### Commit #12 — 219.93ms 🔴 (t=11.3s)

**Root cause:** `Pressable` re-rendered — props: style, transform

Render cascade:
- `AnimatedComponent(Pressable)` ×16 — 161.97ms self, 216.35ms w/children — parent re-render
- `Pressable` ×16 — 34.02ms self, 54.38ms w/children — props: style, transform
- `DeltaChip` [React.memo + React Compiler] ×6 — 25.91ms self, 108.72ms w/children — parent re-render
- `View` ×33 — 23.76ms self, 445.57ms w/children — parent re-render
- `Icon` [React.memo + React Compiler] ×16 — 11.34ms self, 78.22ms w/children — parent re-render
- `AnimatedComponent(View)` — 1.61ms self, 219.93ms w/children — parent re-render
- `PressabilityDebugView` ×16 — 0.89ms self, 0.89ms w/children — parent re-render
- `Text` [React.memo + React Compiler] ×2 — 0.55ms self, 1.93ms w/children — parent re-render

**CPU during this commit:**
- `flushPendingEvents` self=14.97ms total=14.97ms (/&platform=android&dev=true&lazy=true&minify=false&app=news.zuhd.app&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server&transform.routerRoot=app&transform.reactCompiler=true&transform.engine=hermes&transform.bytecode=1&unstable_transformProfile=hermes-stable:44813)
- `[Host Function] createTask` self=8.38ms total=8.38ms ([host]:0)

---
## Top Components by Total Render Cost

| Component | Renders | Total | Avg | Max | Reason | File |
|---|---|---|---|---|---|---|
| `View` ⚠️ | 289 | 140.8ms | 0.49ms | 20.15ms | parent re-render | — |
| `Pressable` ✓ | 110 | 132ms | 1.2ms | 8.97ms | props: style, transform, opacity | `primitives/Pressable.tsx:34` |
| `ModalBottomSheetView` | 2 | 58.4ms | 29.21ms | 58.2ms | props: interceptBackPress, onBackPress, properties | — |
| `DeltaChip` [React.memo + React Compiler] ⚠️ | 12 | 51.8ms | 4.32ms | 16.47ms | parent re-render | `components/DeltaChip.tsx:29` |
| `Icon` [React.memo + React Compiler] ⚠️ | 32 | 22.7ms | 0.71ms | 3.64ms | parent re-render | `primitives/Icon.tsx:67` |
| `PressabilityDebugView` ⚠️ | 101 | 7.8ms | 0.08ms | 3.82ms | parent re-render | — |
| `ScrollView` | 4 | 3.3ms | 0.82ms | 1.8ms | props: stickyHeaderIndices, children | — |
| `PageVeil` [React Compiler] | 4 | 1.8ms | 0.44ms | 0.87ms | props: pageKey, move, style | `components/SheetPager.tsx:51` |
| `RNHostView` | 4 | 1.4ms | 0.35ms | 0.52ms | props: children | — |
| `Text` [React.memo + React Compiler] | 4 | 1.1ms | 0.27ms | 0.35ms | parent re-render | `primitives/Text.tsx:58` |

---
## Suggested Improvements

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

### `ModalBottomSheetView`

**Stabilize props:** `interceptBackPress`, `onBackPress`, `properties`. Likely inline objects/functions at the callsite — extract to constants or wrap with `useMemo`/`useCallback` (or fix the React Compiler bailout causing this).

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

### `Icon` [React.memo + React Compiler] — `primitives/Icon.tsx:67`

⚠️ **React Compiler should have optimized this** — check for patterns that prevent compilation (conditionally called hooks, mutations of props/state). Run `npx react-compiler-healthcheck`.

<details><summary>Source — `primitives/Icon.tsx:67`</summary>

```tsx
 */
export const Icon = memo(function Icon({
  name,
  size = 'md',
  tone = 'secondary',
  color,
}: IconProps) {
  const { colors } = useTheme();
  const resolved = color ?? toneColor(tone, colors);
  const px = ICON[size];

  if (Platform.OS === 'ios') {
    const sf = IONICON_TO_SF[name];
    if (sf) {
      // SF Symbols inherit optical sizing — no `width`/`height` style, just
      // `size` prop. The square frame style keeps layout math compatible
      // with the Ionicons drop-in expectation.
      return (
        <SymbolView name={sf} size={px} tintColor={resolved} style={{ width: px, height: px }} />
      );
    }
  }
  return <Ionicons name={name} size={px} color={resolved} />;
});

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