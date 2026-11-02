# Android Perfetto Analysis

**Trace:** `native-profiler-20261004-110319.pftrace`  |  **Platform:** Android  |  **Analyzed:** 2026-10-04T11:04:16.999Z

---

## Summary

| Category | Count | Severity |
|---|---|---|
| CPU Hotspots | 2 | 🔴 1  🟡 1 |
| UI Hangs | 60 | 🟡 60 |
| RSS Growth (weak signal) | 1 | 🟡 1 |

---

## CPU Hotspots

| # | Function | Thread | Weight (ms) | Weight % | Samples | During Hang? | Severity |
|---|---|---|---|---|---|---|---|
| 1 | `goldfish_pipe_read_write` | RenderThread | 740 | 16.89% | 74 | — | 🔴 |
| 2 | `internal_get_user_pages_fast` | RenderThread | 140 | 3.2% | 14 | — | 🟡 |

> **Note:** 2 of these hotspots are emulator/kernel frames (e.g. `goldfish_*`, `do_syscall_64`, `gup_*`) — the QEMU GPU-transport pipe and Linux syscall paths, not app code. They dominate RenderThread on the emulator and do not appear on physical devices. Re-profile on a real device for representative app CPU numbers.

### `goldfish_pipe_read_write` (RenderThread)

**Call chains:**
- (74×) `goldfish_pipe_read_write`

**Activity bursts:** 7 clusters
- 10.5s → 10.6s (3 samples)
- 11.4s → 11.8s (5 samples)
- 12.8s → 13.2s (14 samples)
- 14.1s → 14.1s (3 samples)
- 32.6s → 32.6s (1 samples)
- 34.0s → 36.9s (37 samples)
- 37.5s → 38.2s (11 samples)


### `internal_get_user_pages_fast` (RenderThread)

**Call chains:**
- (14×) `internal_get_user_pages_fast`

**Activity bursts:** 8 clusters
- 11.4s → 11.4s (1 samples)
- 12.3s → 12.3s (1 samples)
- 13.2s → 13.2s (1 samples)
- 34.1s → 34.3s (2 samples)
- 35.0s → 35.0s (1 samples)
- 35.6s → 35.8s (2 samples)
- 36.3s → 36.3s (2 samples)
- 37.5s → 38.2s (4 samples)


---

## UI Hangs

| # | Type | Reason | Start | Duration | Severity |
|---|---|---|---|---|---|
| 1 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:00.280 | 139ms | 🟡 |
| 2 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:10.431 | 106ms | 🟡 |
| 3 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.466 | 175ms | 🟡 |
| 4 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.619 | 81ms | 🟡 |
| 5 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:11.163 | 174ms | 🟡 |
| 6 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:11.376 | 111ms | 🟡 |
| 7 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:11.511 | 79ms | 🟡 |
| 8 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:11.554 | 108ms | 🟡 |
| 9 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:11.596 | 176ms | 🟡 |
| 10 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:11.707 | 136ms | 🟡 |
| 11 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:12.263 | 82ms | 🟡 |
| 12 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:12.665 | 68ms | 🟡 |
| 13 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.763 | 99ms | 🟡 |
| 14 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.806 | 124ms | 🟡 |
| 15 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.890 | 104ms | 🟡 |
| 16 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.953 | 120ms | 🟡 |
| 17 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:13.041 | 100ms | 🟡 |
| 18 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:13.096 | 113ms | 🟡 |
| 19 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:14.080 | 46ms | 🟡 |
| 20 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:32.344 | 254ms | 🟡 |
| 21 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:33.949 | 0ms | 🟡 |
| 22 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:34.016 | 212ms | 🟡 |
| 23 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:34.188 | 94ms | 🟡 |
| 24 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:34.247 | 86ms | 🟡 |
| 25 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:34.290 | 143ms | 🟡 |
| 26 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:34.382 | 101ms | 🟡 |
| 27 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:34.454 | 119ms | 🟡 |
| 28 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:34.513 | 181ms | 🟡 |
| 29 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:34.624 | 100ms | 🟡 |
| 30 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:34.678 | 0ms | 🟡 |
| 31 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:34.775 | 148ms | 🟡 |
| 32 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:34.908 | 98ms | 🟡 |
| 33 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:34.955 | 139ms | 🟡 |
| 34 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:35.029 | 139ms | 🟡 |
| 35 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:35.113 | 123ms | 🟡 |
| 36 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:35.193 | 109ms | 🟡 |
| 37 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:35.273 | 104ms | 🟡 |
| 38 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:35.334 | 124ms | 🟡 |
| 39 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:35.375 | 166ms | 🟡 |
| 40 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:35.463 | 166ms | 🟡 |
| 41 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:35.604 | 89ms | 🟡 |
| 42 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:35.690 | 55ms | 🟡 |
| 43 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:35.738 | 78ms | 🟡 |
| 44 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:35.847 | 147ms | 🟡 |
| 45 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:35.983 | 95ms | 🟡 |
| 46 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:36.022 | 132ms | 🟡 |
| 47 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:36.079 | 135ms | 🟡 |
| 48 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:36.172 | 95ms | 🟡 |
| 49 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:36.218 | 129ms | 🟡 |
| 50 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:36.294 | 124ms | 🟡 |
| 51 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:36.564 | 31ms | 🟡 |
| 52 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:36.584 | 65ms | 🟡 |
| 53 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:36.743 | 43ms | 🟡 |
| 54 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:36.808 | 96ms | 🟡 |
| 55 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:37.447 | 51ms | 🟡 |
| 56 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:37.465 | 98ms | 🟡 |
| 57 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:37.519 | 331ms | 🟡 |
| 58 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:37.746 | 190ms | 🟡 |
| 59 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:37.884 | 127ms | 🟡 |
| 60 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:38.163 | 18ms | 🟡 |

**jank at 00:00.280 (139ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 1ms |
| Running | — | 4ms |
| S | — | 134ms |

**jank at 00:10.431 (106ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| D | — | 2ms |
| R | — | 14ms |
| R+ | — | 1ms |
| Running | — | 33ms |
| S | — | 57ms |

**jank at 00:10.466 (175ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 19ms |
| R+ | — | 3ms |
| Running | — | 21ms |
| S | — | 133ms |

**jank at 00:10.619 (81ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 15ms |
| R+ | — | 8ms |
| Running | — | 13ms |
| S | — | 45ms |

**jank at 00:11.163 (174ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 61ms |
| R+ | — | 14ms |
| Running | — | 95ms |
| S | — | 3ms |

**jank at 00:11.376 (111ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 9ms |
| Running | — | 30ms |
| S | — | 71ms |

**jank at 00:11.511 (79ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 30ms |
| R+ | — | 7ms |
| Running | — | 13ms |
| S | — | 30ms |

**jank at 00:11.554 (108ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 40ms |
| R+ | — | 1ms |
| Running | — | 8ms |
| S | — | 59ms |

**jank at 00:11.596 (176ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 22ms |
| R+ | — | 11ms |
| Running | — | 18ms |
| S | — | 126ms |

**jank at 00:11.707 (136ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 5ms |
| R+ | — | 24ms |
| Running | — | 19ms |
| S | — | 88ms |

**jank at 00:12.263 (82ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 9ms |
| R+ | — | 4ms |
| Running | — | 68ms |
| S | — | 1ms |

**jank at 00:12.665 (68ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 6ms |
| R+ | — | 6ms |
| Running | — | 56ms |
| S | — | 0ms |

**jank at 00:12.763 (99ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R+ | — | 0ms |
| Running | — | 2ms |
| S | — | 97ms |

**jank at 00:12.806 (124ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R+ | — | 0ms |
| Running | — | 3ms |
| S | — | 121ms |

**jank at 00:12.890 (104ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R+ | — | 0ms |
| Running | — | 2ms |
| S | — | 101ms |

**jank at 00:12.953 (120ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 1ms |
| Running | — | 6ms |
| S | — | 112ms |

**jank at 00:13.041 (100ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 9ms |
| R+ | — | 1ms |
| Running | — | 11ms |
| S | — | 79ms |

**jank at 00:13.096 (113ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 10ms |
| R+ | — | 4ms |
| Running | — | 5ms |
| S | — | 94ms |

**jank at 00:14.080 (46ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 8ms |
| R+ | — | 5ms |
| Running | — | 12ms |
| S | — | 20ms |

**jank at 00:32.344 (254ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 41ms |
| R+ | — | 72ms |
| Running | — | 23ms |
| S | — | 118ms |

**jank at 00:33.949 (0ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| Running | — | 0ms |

**jank at 00:34.016 (212ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 30ms |
| R+ | — | 4ms |
| Running | — | 17ms |
| S | — | 160ms |

**jank at 00:34.188 (94ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 20ms |
| R+ | — | 2ms |
| Running | — | 21ms |
| S | — | 51ms |

**jank at 00:34.247 (86ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 2ms |
| Running | — | 9ms |
| S | — | 75ms |

**jank at 00:34.290 (143ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 42ms |
| Running | — | 15ms |
| S | — | 85ms |

**jank at 00:34.382 (101ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 3ms |
| R+ | — | 48ms |
| Running | — | 20ms |
| S | — | 30ms |

**jank at 00:34.454 (119ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 13ms |
| R+ | — | 22ms |
| Running | — | 27ms |
| S | — | 57ms |

**jank at 00:34.513 (181ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 40ms |
| R+ | — | 34ms |
| Running | — | 41ms |
| S | — | 67ms |

**jank at 00:34.624 (100ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 29ms |
| R+ | — | 17ms |
| Running | — | 16ms |
| S | — | 38ms |

**jank at 00:34.678 (0ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| Running | — | 0ms |

**jank at 00:34.775 (148ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 26ms |
| R+ | — | 66ms |
| Running | — | 34ms |
| S | — | 21ms |

**jank at 00:34.908 (98ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 14ms |
| R+ | — | 16ms |
| Running | — | 15ms |
| S | — | 53ms |

**jank at 00:34.955 (139ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 16ms |
| R+ | — | 9ms |
| Running | — | 15ms |
| S | — | 100ms |

**jank at 00:35.029 (139ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 30ms |
| R+ | — | 10ms |
| Running | — | 18ms |
| S | — | 81ms |

**jank at 00:35.113 (123ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 56ms |
| R+ | — | 4ms |
| Running | — | 22ms |
| S | — | 41ms |

**jank at 00:35.193 (109ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 37ms |
| R+ | — | 31ms |
| Running | — | 32ms |
| S | — | 9ms |

**jank at 00:35.273 (104ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 31ms |
| R+ | — | 22ms |
| Running | — | 27ms |
| S | — | 25ms |

**jank at 00:35.334 (124ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 16ms |
| R+ | — | 10ms |
| Running | — | 10ms |
| S | — | 88ms |

**jank at 00:35.375 (166ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 42ms |
| R+ | — | 26ms |
| Running | — | 17ms |
| S | — | 81ms |

**jank at 00:35.463 (166ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 49ms |
| R+ | — | 50ms |
| Running | — | 45ms |
| S | — | 22ms |

**jank at 00:35.604 (89ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 49ms |
| R+ | — | 10ms |
| Running | — | 24ms |
| S | — | 6ms |

**jank at 00:35.690 (55ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 2ms |
| R+ | — | 35ms |
| Running | — | 16ms |
| S | — | 2ms |

**jank at 00:35.738 (78ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 0ms |
| Running | — | 5ms |
| S | — | 73ms |

**jank at 00:35.847 (147ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 43ms |
| R+ | — | 10ms |
| Running | — | 90ms |
| S | — | 3ms |

**jank at 00:35.983 (95ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 6ms |
| R+ | — | 11ms |
| Running | — | 25ms |
| S | — | 53ms |

**jank at 00:36.022 (132ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 2ms |
| Running | — | 6ms |
| S | — | 124ms |

**jank at 00:36.079 (135ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 5ms |
| R+ | — | 3ms |
| Running | — | 17ms |
| S | — | 111ms |

**jank at 00:36.172 (95ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 2ms |
| R+ | — | 1ms |
| Running | — | 7ms |
| S | — | 85ms |

**jank at 00:36.218 (129ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 7ms |
| R+ | — | 3ms |
| Running | — | 7ms |
| S | — | 112ms |

**jank at 00:36.294 (124ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 6ms |
| R+ | — | 23ms |
| Running | — | 16ms |
| S | — | 79ms |

**jank at 00:36.564 (31ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 8ms |
| Running | — | 14ms |
| S | — | 8ms |

**jank at 00:36.584 (65ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 5ms |
| Running | — | 6ms |
| S | — | 53ms |

**jank at 00:36.743 (43ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 6ms |
| R+ | — | 10ms |
| Running | — | 15ms |
| S | — | 13ms |

**jank at 00:36.808 (96ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 6ms |
| Running | — | 11ms |
| S | — | 79ms |

**jank at 00:37.447 (51ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 1ms |
| Running | — | 8ms |
| S | — | 41ms |

**jank at 00:37.465 (98ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 10ms |
| R+ | — | 6ms |
| Running | — | 14ms |
| S | — | 68ms |

**jank at 00:37.519 (331ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 4ms |
| R+ | — | 6ms |
| Running | — | 6ms |
| S | — | 315ms |

**jank at 00:37.746 (190ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R+ | — | 6ms |
| Running | — | 3ms |
| S | — | 181ms |

**jank at 00:37.884 (127ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R+ | — | 7ms |
| Running | — | 6ms |
| S | — | 115ms |

**jank at 00:38.163 (18ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 0ms |
| Running | — | 6ms |
| S | — | 12ms |

---

## RSS Growth — Weak Signal

> **Manual confirmation needed.** Resident-set size grew during the recording, but RSS growth is a weak proxy — it can be normal warm-up behaviour (JIT compilation, texture caches). Real Android leak detection lands in a later phase via heap-dump analysis.

| Start (MB) | Peak (MB) | Growth (MB) | Severity |
|---|---|---|---|
| 1010.9 | 1077.2 | 66.3 | 🟡 |

---

## Suggested Improvements

### CPU Hotspots

- 🔴 `goldfish_pipe_read_write` on RenderThread (16.89%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code — it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.
- 🟡 `internal_get_user_pages_fast` on RenderThread (3.2%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code — it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.

### UI Hangs

- 🟡 jank at 00:00.280 (139ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:10.431 (106ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:10.466 (175ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:10.619 (81ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.163 (174ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:11.376 (111ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.511 (79ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.554 (108ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.596 (176ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.707 (136ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.263 (82ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:12.665 (68ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:12.763 (99ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.806 (124ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.890 (104ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.953 (120ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:13.041 (100ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:13.096 (113ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:14.080 (46ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:32.344 (254ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:33.949 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:34.016 (212ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:34.188 (94ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:34.247 (86ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:34.290 (143ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:34.382 (101ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:34.454 (119ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:34.513 (181ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:34.624 (100ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:34.678 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:34.775 (148ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:34.908 (98ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:34.955 (139ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:35.029 (139ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:35.113 (123ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:35.193 (109ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:35.273 (104ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:35.334 (124ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:35.375 (166ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:35.463 (166ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:35.604 (89ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:35.690 (55ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:35.738 (78ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:35.847 (147ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:35.983 (95ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:36.022 (132ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:36.079 (135ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:36.172 (95ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:36.218 (129ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:36.294 (124ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:36.564 (31ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:36.584 (65ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:36.743 (43ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:36.808 (96ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:37.447 (51ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:37.465 (98ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:37.519 (331ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:37.746 (190ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:37.884 (127ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:38.163 (18ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.

---

## Next Steps

Ask the user which path to take:

1. **Investigate further** — use `profiler-stack-query` to drill into specific findings:
   - mode=`hang_stacks` hang_index=0 — main-thread state + any on-CPU stacks for the worst hang
   - mode=`thread_breakdown` — CPU distribution across threads
2. **Implement fixes** — apply changes to address the findings above, then re-profile to measure improvement.
3. **Done for now** — save the report for reference.