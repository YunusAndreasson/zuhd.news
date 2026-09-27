# Android Perfetto Analysis

**Trace:** `native-profiler-20260927-122521.pftrace`  |  **Platform:** Android  |  **Analyzed:** 2026-09-27T12:26:10.834Z

---

## Summary

| Category | Count | Severity |
|---|---|---|
| CPU Hotspots | 2 | 🟡 2 |
| UI Hangs | 60 | 🟡 60 |
| RSS Growth (weak signal) | 1 | 🟡 1 |

---

## CPU Hotspots

| # | Function | Thread | Weight (ms) | Weight % | Samples | During Hang? | Severity |
|---|---|---|---|---|---|---|---|
| 1 | `goldfish_pipe_read_write` | RenderThread | 670 | 12.03% | 67 | — | 🟡 |
| 2 | `internal_get_user_pages_fast` | RenderThread | 280 | 5.03% | 28 | — | 🟡 |

> **Note:** 2 of these hotspots are emulator/kernel frames (e.g. `goldfish_*`, `do_syscall_64`, `gup_*`) — the QEMU GPU-transport pipe and Linux syscall paths, not app code. They dominate RenderThread on the emulator and do not appear on physical devices. Re-profile on a real device for representative app CPU numbers.

### `goldfish_pipe_read_write` (RenderThread)

**Call chains:**
- (67×) `goldfish_pipe_read_write`

**Activity bursts:** 6 clusters
- 9.2s → 9.7s (15 samples)
- 10.4s → 10.9s (15 samples)
- 23.8s → 23.9s (8 samples)
- 24.7s → 25.2s (17 samples)
- 27.3s → 27.8s (8 samples)
- 28.6s → 28.7s (4 samples)


### `internal_get_user_pages_fast` (RenderThread)

**Call chains:**
- (28×) `internal_get_user_pages_fast`

**Activity bursts:** 6 clusters
- 9.3s → 9.6s (6 samples)
- 10.4s → 10.9s (4 samples)
- 23.4s → 23.9s (4 samples)
- 25.0s → 25.3s (9 samples)
- 27.6s → 27.8s (3 samples)
- 28.6s → 28.6s (2 samples)


---

## UI Hangs

| # | Type | Reason | Start | Duration | Severity |
|---|---|---|---|---|---|
| 1 | jank | Prediction Error, App Deadline Missed | 00:09.062 | 33ms | 🟡 |
| 2 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:09.083 | 50ms | 🟡 |
| 3 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:09.118 | 65ms | 🟡 |
| 4 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:09.171 | 70ms | 🟡 |
| 5 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:09.209 | 78ms | 🟡 |
| 6 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:09.267 | 0ms | 🟡 |
| 7 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:09.322 | 35ms | 🟡 |
| 8 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:09.355 | 0ms | 🟡 |
| 9 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:09.367 | 0ms | 🟡 |
| 10 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:09.395 | 39ms | 🟡 |
| 11 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:09.448 | 52ms | 🟡 |
| 12 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:09.497 | 52ms | 🟡 |
| 13 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:09.547 | 57ms | 🟡 |
| 14 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:09.602 | 69ms | 🟡 |
| 15 | jank | Prediction Error, App Deadline Missed | 00:10.362 | 44ms | 🟡 |
| 16 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:10.390 | 72ms | 🟡 |
| 17 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:10.418 | 85ms | 🟡 |
| 18 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:10.483 | 82ms | 🟡 |
| 19 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:10.545 | 59ms | 🟡 |
| 20 | jank | Prediction Error, App Deadline Missed | 00:10.612 | 24ms | 🟡 |
| 21 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:10.713 | 45ms | 🟡 |
| 22 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:10.783 | 47ms | 🟡 |
| 23 | jank | Prediction Error, App Deadline Missed | 00:23.379 | 32ms | 🟡 |
| 24 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:23.399 | 61ms | 🟡 |
| 25 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:23.433 | 65ms | 🟡 |
| 26 | jank | App Deadline Missed, Buffer Stuffing | 00:23.508 | 82ms | 🟡 |
| 27 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:23.591 | 61ms | 🟡 |
| 28 | jank | Prediction Error, App Deadline Missed | 00:23.662 | 22ms | 🟡 |
| 29 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:23.695 | 40ms | 🟡 |
| 30 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:23.731 | 56ms | 🟡 |
| 31 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:23.785 | 51ms | 🟡 |
| 32 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:23.835 | 53ms | 🟡 |
| 33 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:23.885 | 49ms | 🟡 |
| 34 | jank | Prediction Error, App Deadline Missed | 00:24.662 | 31ms | 🟡 |
| 35 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:24.680 | 45ms | 🟡 |
| 36 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:24.708 | 45ms | 🟡 |
| 37 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:24.756 | 53ms | 🟡 |
| 38 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:24.773 | 69ms | 🟡 |
| 39 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:24.810 | 77ms | 🟡 |
| 40 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:24.878 | 46ms | 🟡 |
| 41 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:24.961 | 40ms | 🟡 |
| 42 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:24.998 | 47ms | 🟡 |
| 43 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:25.067 | 0ms | 🟡 |
| 44 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:25.111 | 34ms | 🟡 |
| 45 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:25.141 | 59ms | 🟡 |
| 46 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:25.235 | 43ms | 🟡 |
| 47 | jank | Prediction Error, App Deadline Missed | 00:27.229 | 41ms | 🟡 |
| 48 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:27.253 | 73ms | 🟡 |
| 49 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:27.299 | 69ms | 🟡 |
| 50 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:27.353 | 78ms | 🟡 |
| 51 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:27.408 | 0ms | 🟡 |
| 52 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:27.459 | 40ms | 🟡 |
| 53 | jank | Prediction Error, App Deadline Missed | 00:27.529 | 21ms | 🟡 |
| 54 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:27.613 | 0ms | 🟡 |
| 55 | jank | Prediction Error, App Deadline Missed | 00:28.513 | 0ms | 🟡 |
| 56 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:28.530 | 0ms | 🟡 |
| 57 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:28.563 | 69ms | 🟡 |
| 58 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:28.597 | 106ms | 🟡 |
| 59 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:28.634 | 115ms | 🟡 |
| 60 | jank | Prediction Error, App Deadline Missed, Buffer Stuffing | 00:28.765 | 39ms | 🟡 |

**jank at 00:09.062 (33ms)** — reason: `Prediction Error, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| D | — | 0ms |
| R | — | 1ms |
| Running | — | 31ms |
| S | — | 1ms |

**jank at 00:09.083 (50ms)** — reason: `Prediction Error, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 7ms |
| R+ | — | 0ms |
| Running | — | 41ms |
| S | — | 1ms |

**jank at 00:09.118 (65ms)** — reason: `Prediction Error, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 19ms |
| R+ | — | 0ms |
| Running | — | 45ms |
| S | — | 1ms |

> ... and 57 more hang(s). See full report for details.

---

## RSS Growth — Weak Signal

> **Manual confirmation needed.** Resident-set size grew during the recording, but RSS growth is a weak proxy — it can be normal warm-up behaviour (JIT compilation, texture caches). Real Android leak detection lands in a later phase via heap-dump analysis.

| Start (MB) | Peak (MB) | Growth (MB) | Severity |
|---|---|---|---|
| 433.9 | 469.5 | 35.6 | 🟡 |

---

## Suggested Improvements

### CPU Hotspots

- 🟡 `goldfish_pipe_read_write` on RenderThread (12.03%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code — it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.
- 🟡 `internal_get_user_pages_fast` on RenderThread (5.03%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code — it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.

### UI Hangs

- 🟡 jank at 00:09.062 (33ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:09.083 (50ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.118 (65ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.171 (70ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.209 (78ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.267 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.322 (35ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.355 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.367 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.395 (39ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.448 (52ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.497 (52ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.547 (57ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.602 (69ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:10.362 (44ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:10.390 (72ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:10.418 (85ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:10.483 (82ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:10.545 (59ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:10.612 (24ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:10.713 (45ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:10.783 (47ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:23.379 (32ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:23.399 (61ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:23.433 (65ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:23.508 (82ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:23.591 (61ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:23.662 (22ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:23.695 (40ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:23.731 (56ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:23.785 (51ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:23.835 (53ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:23.885 (49ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:24.662 (31ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:24.680 (45ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:24.708 (45ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:24.756 (53ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:24.773 (69ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:24.810 (77ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:24.878 (46ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:24.961 (40ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:24.998 (47ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:25.067 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:25.111 (34ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:25.141 (59ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:25.235 (43ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:27.229 (41ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:27.253 (73ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:27.299 (69ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:27.353 (78ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:27.408 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:27.459 (40ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:27.529 (21ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:27.613 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:28.513 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed`.
- 🟡 jank at 00:28.530 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:28.563 (69ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:28.597 (106ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:28.634 (115ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:28.765 (39ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `Prediction Error, App Deadline Missed, Buffer Stuffing`.

---

## Next Steps

Ask the user which path to take:

1. **Investigate further** — use `profiler-stack-query` to drill into specific findings:
   - mode=`hang_stacks` hang_index=0 — main-thread state + any on-CPU stacks for the worst hang
   - mode=`thread_breakdown` — CPU distribution across threads
2. **Implement fixes** — apply changes to address the findings above, then re-profile to measure improvement.
3. **Done for now** — save the report for reference.

> Full report saved — 63 bottleneck(s) total, showing top 2 CPU hotspots and top 3 hangs inline. Use the Read tool on the `reportFile` path in this result to view all details.
