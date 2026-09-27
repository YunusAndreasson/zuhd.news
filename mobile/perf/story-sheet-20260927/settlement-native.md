# Android Perfetto Analysis

**Trace:** `native-profiler-20260927-123126.pftrace`  |  **Platform:** Android  |  **Analyzed:** 2026-09-27T12:31:59.895Z

---

## Summary

| Category | Count | Severity |
|---|---|---|
| CPU Hotspots | 2 | 🔴 1  🟡 1 |
| UI Hangs | 66 | 🔴 1  🟡 65 |
| RSS Growth (weak signal) | 1 | 🟡 1 |

---

## CPU Hotspots

| # | Function | Thread | Weight (ms) | Weight % | Samples | During Hang? | Severity |
|---|---|---|---|---|---|---|---|
| 1 | `goldfish_pipe_read_write` | RenderThread | 890 | 16.45% | 89 | — | 🔴 |
| 2 | `internal_get_user_pages_fast` | RenderThread | 300 | 5.55% | 30 | — | 🟡 |

> **Note:** 2 of these hotspots are emulator/kernel frames (e.g. `goldfish_*`, `do_syscall_64`, `gup_*`) — the QEMU GPU-transport pipe and Linux syscall paths, not app code. They dominate RenderThread on the emulator and do not appear on physical devices. Re-profile on a real device for representative app CPU numbers.

### `goldfish_pipe_read_write` (RenderThread)

**Call chains:**
- (89×) `goldfish_pipe_read_write`

**Activity bursts:** 6 clusters
- 2.6s → 3.0s (19 samples)
- 3.9s → 4.4s (10 samples)
- 6.9s → 7.5s (20 samples)
- 8.3s → 8.8s (13 samples)
- 11.1s → 11.6s (17 samples)
- 12.3s → 12.7s (10 samples)


### `internal_get_user_pages_fast` (RenderThread)

**Call chains:**
- (30×) `internal_get_user_pages_fast`

**Activity bursts:** 5 clusters
- 2.6s → 3.1s (9 samples)
- 4.1s → 4.4s (3 samples)
- 6.9s → 7.4s (6 samples)
- 8.2s → 8.8s (7 samples)
- 11.1s → 11.6s (5 samples)


---

## UI Hangs

| # | Type | Reason | Start | Duration | Severity |
|---|---|---|---|---|---|
| 1 | jank | App Deadline Missed | 00:02.533 | 0ms | 🔴 |
| 2 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:02.554 | 70ms | 🟡 |
| 3 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:02.623 | 89ms | 🟡 |
| 4 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:02.655 | 83ms | 🟡 |
| 5 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:02.711 | 77ms | 🟡 |
| 6 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:02.787 | 0ms | 🟡 |
| 7 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:02.811 | 0ms | 🟡 |
| 8 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:02.966 | 62ms | 🟡 |
| 9 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:02.983 | 0ms | 🟡 |
| 10 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:03.030 | 75ms | 🟡 |
| 11 | jank | Prediction Error, App Deadline Missed | 00:03.350 | 58ms | 🟡 |
| 12 | jank | Prediction Error, App Deadline Missed | 00:03.833 | 27ms | 🟡 |
| 13 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:03.850 | 55ms | 🟡 |
| 14 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:03.871 | 85ms | 🟡 |
| 15 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:03.960 | 77ms | 🟡 |
| 16 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:04.042 | 0ms | 🟡 |
| 17 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:04.085 | 89ms | 🟡 |
| 18 | jank | App Deadline Missed, Buffer Stuffing | 00:04.176 | 47ms | 🟡 |
| 19 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:04.222 | 49ms | 🟡 |
| 20 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:04.322 | 0ms | 🟡 |
| 21 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:04.367 | 36ms | 🟡 |
| 22 | jank | Prediction Error, App Deadline Missed | 00:04.502 | 19ms | 🟡 |
| 23 | jank | Prediction Error, App Deadline Missed | 00:06.867 | 38ms | 🟡 |
| 24 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:06.889 | 86ms | 🟡 |
| 25 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:06.911 | 0ms | 🟡 |
| 26 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:06.977 | 0ms | 🟡 |
| 27 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:07.020 | 68ms | 🟡 |
| 28 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:07.087 | 0ms | 🟡 |
| 29 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:07.165 | 77ms | 🟡 |
| 30 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:07.243 | 83ms | 🟡 |
| 31 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:07.328 | 75ms | 🟡 |
| 32 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:07.405 | 73ms | 🟡 |
| 33 | jank | Prediction Error, App Deadline Missed | 00:07.616 | 22ms | 🟡 |
| 34 | jank | Prediction Error, App Deadline Missed | 00:08.167 | 28ms | 🟡 |
| 35 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:08.183 | 55ms | 🟡 |
| 36 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:08.218 | 0ms | 🟡 |
| 37 | jank | App Deadline Missed, Buffer Stuffing | 00:08.243 | 80ms | 🟡 |
| 38 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:08.326 | 90ms | 🟡 |
| 39 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:08.400 | 53ms | 🟡 |
| 40 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:08.454 | 57ms | 🟡 |
| 41 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:08.511 | 44ms | 🟡 |
| 42 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:08.555 | 49ms | 🟡 |
| 43 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:08.639 | 0ms | 🟡 |
| 44 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:08.657 | 47ms | 🟡 |
| 45 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:08.740 | 45ms | 🟡 |
| 46 | jank | Prediction Error, App Deadline Missed | 00:08.866 | 25ms | 🟡 |
| 47 | jank | Prediction Error, App Deadline Missed | 00:11.017 | 26ms | 🟡 |
| 48 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:11.033 | 59ms | 🟡 |
| 49 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:11.054 | 0ms | 🟡 |
| 50 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:11.096 | 56ms | 🟡 |
| 51 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:11.134 | 86ms | 🟡 |
| 52 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:11.221 | 0ms | 🟡 |
| 53 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:11.243 | 91ms | 🟡 |
| 54 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:11.336 | 0ms | 🟡 |
| 55 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:11.360 | 92ms | 🟡 |
| 56 | jank | App Deadline Missed, Buffer Stuffing | 00:11.454 | 0ms | 🟡 |
| 57 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:11.532 | 0ms | 🟡 |
| 58 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:11.555 | 101ms | 🟡 |
| 59 | jank | Prediction Error, App Deadline Missed | 00:11.833 | 23ms | 🟡 |
| 60 | jank | Prediction Error, App Deadline Missed | 00:12.333 | 26ms | 🟡 |
| 61 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:12.350 | 55ms | 🟡 |
| 62 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:12.409 | 81ms | 🟡 |
| 63 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:12.493 | 79ms | 🟡 |
| 64 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:12.530 | 80ms | 🟡 |
| 65 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:12.587 | 53ms | 🟡 |
| 66 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:12.645 | 44ms | 🟡 |

**jank at 00:02.533 (0ms)** — reason: `App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| Running | — | 0ms |

**jank at 00:02.554 (70ms)** — reason: `Prediction Error, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 2ms |
| R+ | — | 0ms |
| Running | — | 46ms |
| S | — | 22ms |

**jank at 00:02.623 (89ms)** — reason: `Prediction Error, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 17ms |
| R+ | — | 1ms |
| Running | — | 59ms |
| S | — | 13ms |

> ... and 63 more hang(s). See full report for details.

---

## RSS Growth — Weak Signal

> **Manual confirmation needed.** Resident-set size grew during the recording, but RSS growth is a weak proxy — it can be normal warm-up behaviour (JIT compilation, texture caches). Real Android leak detection lands in a later phase via heap-dump analysis.

| Start (MB) | Peak (MB) | Growth (MB) | Severity |
|---|---|---|---|
| 653.1 | 673.5 | 20.4 | 🟡 |

---

## Suggested Improvements

### CPU Hotspots

- 🔴 `goldfish_pipe_read_write` on RenderThread (16.45%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code — it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.
- 🟡 `internal_get_user_pages_fast` on RenderThread (5.55%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code — it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.

### UI Hangs

- 🔴 jank at 00:02.533 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `App Deadline Missed`.
- 🟡 jank at 00:02.554 (70ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.623 (89ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.655 (83ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.711 (77ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.787 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.811 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.966 (62ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.983 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.030 (75ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.350 (58ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:03.833 (27ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:03.850 (55ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.871 (85ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.960 (77ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.042 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.085 (89ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.176 (47ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.222 (49ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.322 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.367 (36ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.502 (19ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:06.867 (38ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:06.889 (86ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:06.911 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:06.977 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:07.020 (68ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:07.087 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:07.165 (77ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:07.243 (83ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:07.328 (75ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:07.405 (73ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:07.616 (22ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:08.167 (28ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:08.183 (55ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.218 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.243 (80ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.326 (90ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.400 (53ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.454 (57ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.511 (44ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.555 (49ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.639 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.657 (47ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.740 (45ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.866 (25ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:11.017 (26ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:11.033 (59ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.054 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.096 (56ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.134 (86ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.221 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.243 (91ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.336 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.360 (92ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.454 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.532 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.555 (101ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.833 (23ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:12.333 (26ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:12.350 (55ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.409 (81ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.493 (79ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.530 (80ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.587 (53ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.645 (44ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.

---

## Next Steps

Ask the user which path to take:

1. **Investigate further** — use `profiler-stack-query` to drill into specific findings:
   - mode=`hang_stacks` hang_index=0 — main-thread state + any on-CPU stacks for the worst hang
   - mode=`thread_breakdown` — CPU distribution across threads
2. **Implement fixes** — apply changes to address the findings above, then re-profile to measure improvement.
3. **Done for now** — save the report for reference.

> Full report saved — 69 bottleneck(s) total, showing top 2 CPU hotspots and top 3 hangs inline. Use the Read tool on the `reportFile` path in this result to view all details.
