# Android Perfetto Analysis

**Trace:** `native-profiler-20261004-110523.pftrace`  |  **Platform:** Android  |  **Analyzed:** 2026-10-04T11:05:55.877Z

---

## Summary

| Category | Count | Severity |
|---|---|---|
| CPU Hotspots | 2 | 🔴 1  🟡 1 |
| UI Hangs | 63 | 🟡 63 |
| RSS Growth (weak signal) | 1 | 🟡 1 |

---

## CPU Hotspots

| # | Function | Thread | Weight (ms) | Weight % | Samples | During Hang? | Severity |
|---|---|---|---|---|---|---|---|
| 1 | `goldfish_pipe_read_write` | RenderThread | 670 | 17.77% | 67 | — | 🔴 |
| 2 | `internal_get_user_pages_fast` | RenderThread | 260 | 6.9% | 26 | — | 🟡 |

> **Note:** 2 of these hotspots are emulator/kernel frames (e.g. `goldfish_*`, `do_syscall_64`, `gup_*`) — the QEMU GPU-transport pipe and Linux syscall paths, not app code. They dominate RenderThread on the emulator and do not appear on physical devices. Re-profile on a real device for representative app CPU numbers.

### `goldfish_pipe_read_write` (RenderThread)

**Call chains:**
- (67×) `goldfish_pipe_read_write`

**Activity bursts:** 6 clusters
- 12.0s → 12.1s (4 samples)
- 12.9s → 13.2s (5 samples)
- 14.3s → 14.7s (9 samples)
- 15.7s → 15.7s (1 samples)
- 16.9s → 19.2s (32 samples)
- 19.9s → 20.5s (16 samples)


### `internal_get_user_pages_fast` (RenderThread)

**Call chains:**
- (26×) `internal_get_user_pages_fast`

**Activity bursts:** 7 clusters
- 12.0s → 12.0s (1 samples)
- 12.7s → 13.0s (5 samples)
- 13.7s → 14.6s (9 samples)
- 17.3s → 17.6s (4 samples)
- 18.1s → 18.1s (1 samples)
- 19.0s → 19.1s (2 samples)
- 19.9s → 20.5s (4 samples)


---

## UI Hangs

| # | Type | Reason | Start | Duration | Severity |
|---|---|---|---|---|---|
| 1 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:11.967 | 23ms | 🟡 |
| 2 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:11.985 | 105ms | 🟡 |
| 3 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.008 | 138ms | 🟡 |
| 4 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.098 | 166ms | 🟡 |
| 5 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.226 | 92ms | 🟡 |
| 6 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:12.650 | 92ms | 🟡 |
| 7 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.724 | 116ms | 🟡 |
| 8 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.743 | 170ms | 🟡 |
| 9 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.840 | 164ms | 🟡 |
| 10 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.917 | 147ms | 🟡 |
| 11 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:13.023 | 110ms | 🟡 |
| 12 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:13.077 | 156ms | 🟡 |
| 13 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:13.217 | 87ms | 🟡 |
| 14 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:13.287 | 84ms | 🟡 |
| 15 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:13.627 | 86ms | 🟡 |
| 16 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:13.780 | 30ms | 🟡 |
| 17 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:14.050 | 55ms | 🟡 |
| 18 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:14.106 | 0ms | 🟡 |
| 19 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:14.268 | 24ms | 🟡 |
| 20 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:14.284 | 101ms | 🟡 |
| 21 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:14.357 | 114ms | 🟡 |
| 22 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:14.408 | 126ms | 🟡 |
| 23 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:14.474 | 134ms | 🟡 |
| 24 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:14.541 | 113ms | 🟡 |
| 25 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:14.613 | 132ms | 🟡 |
| 26 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:15.251 | 27ms | 🟡 |
| 27 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:15.634 | 60ms | 🟡 |
| 28 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:16.952 | 45ms | 🟡 |
| 29 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:17.037 | 57ms | 🟡 |
| 30 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:17.054 | 80ms | 🟡 |
| 31 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:17.098 | 105ms | 🟡 |
| 32 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:17.201 | 75ms | 🟡 |
| 33 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:17.236 | 107ms | 🟡 |
| 34 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:17.294 | 115ms | 🟡 |
| 35 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:17.372 | 107ms | 🟡 |
| 36 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:17.450 | 94ms | 🟡 |
| 37 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:17.498 | 117ms | 🟡 |
| 38 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:17.582 | 94ms | 🟡 |
| 39 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:17.642 | 131ms | 🟡 |
| 40 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:17.732 | 89ms | 🟡 |
| 41 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:17.783 | 111ms | 🟡 |
| 42 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:17.876 | 83ms | 🟡 |
| 43 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:17.923 | 120ms | 🟡 |
| 44 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:18.033 | 71ms | 🟡 |
| 45 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:18.066 | 108ms | 🟡 |
| 46 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:18.145 | 122ms | 🟡 |
| 47 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:18.210 | 150ms | 🟡 |
| 48 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:18.317 | 153ms | 🟡 |
| 49 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:18.451 | 78ms | 🟡 |
| 50 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:18.472 | 155ms | 🟡 |
| 51 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:18.583 | 96ms | 🟡 |
| 52 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:18.835 | 44ms | 🟡 |
| 53 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:18.884 | 82ms | 🟡 |
| 54 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:18.947 | 46ms | 🟡 |
| 55 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:18.977 | 77ms | 🟡 |
| 56 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:19.014 | 110ms | 🟡 |
| 57 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:19.081 | 112ms | 🟡 |
| 58 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:19.918 | 46ms | 🟡 |
| 59 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:19.948 | 109ms | 🟡 |
| 60 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:20.029 | 207ms | 🟡 |
| 61 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:20.166 | 143ms | 🟡 |
| 62 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:20.262 | 108ms | 🟡 |
| 63 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:20.450 | 33ms | 🟡 |

**jank at 00:11.967 (23ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 0ms |
| Running | — | 13ms |
| S | — | 9ms |

**jank at 00:11.985 (105ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 0ms |
| Running | — | 17ms |
| S | — | 87ms |

**jank at 00:12.008 (138ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 46ms |
| R+ | — | 0ms |
| Running | — | 8ms |
| S | — | 84ms |

**jank at 00:12.098 (166ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 56ms |
| R+ | — | 28ms |
| Running | — | 19ms |
| S | — | 63ms |

**jank at 00:12.226 (92ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 29ms |
| R+ | — | 43ms |
| Running | — | 16ms |
| S | — | 4ms |

**jank at 00:12.650 (92ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 6ms |
| R+ | — | 6ms |
| Running | — | 79ms |
| S | — | 1ms |

**jank at 00:12.724 (116ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 5ms |
| R+ | — | 6ms |
| Running | — | 9ms |
| S | — | 95ms |

**jank at 00:12.743 (170ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 4ms |
| Running | — | 5ms |
| S | — | 160ms |

**jank at 00:12.840 (164ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 12ms |
| R+ | — | 13ms |
| Running | — | 15ms |
| S | — | 124ms |

**jank at 00:12.917 (147ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 31ms |
| R+ | — | 10ms |
| Running | — | 46ms |
| S | — | 60ms |

**jank at 00:13.023 (110ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 18ms |
| R+ | — | 6ms |
| Running | — | 31ms |
| S | — | 54ms |

**jank at 00:13.077 (156ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 4ms |
| R+ | — | 9ms |
| Running | — | 15ms |
| S | — | 127ms |

**jank at 00:13.217 (87ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 12ms |
| R+ | — | 34ms |
| Running | — | 33ms |
| S | — | 8ms |

**jank at 00:13.287 (84ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 9ms |
| R+ | — | 36ms |
| Running | — | 23ms |
| S | — | 15ms |

**jank at 00:13.627 (86ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 21ms |
| R+ | — | 10ms |
| Running | — | 54ms |

**jank at 00:13.780 (30ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 4ms |
| Running | — | 20ms |
| S | — | 6ms |

**jank at 00:14.050 (55ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 3ms |
| R+ | — | 6ms |
| Running | — | 45ms |
| S | — | 1ms |

**jank at 00:14.106 (0ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| Running | — | 0ms |

**jank at 00:14.268 (24ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 1ms |
| Running | — | 3ms |
| S | — | 20ms |

**jank at 00:14.284 (101ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 0ms |
| Running | — | 4ms |
| S | — | 97ms |

**jank at 00:14.357 (114ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R+ | — | 7ms |
| Running | — | 8ms |
| S | — | 100ms |

**jank at 00:14.408 (126ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 7ms |
| Running | — | 6ms |
| S | — | 113ms |

**jank at 00:14.474 (134ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 4ms |
| Running | — | 3ms |
| S | — | 126ms |

**jank at 00:14.541 (113ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R+ | — | 4ms |
| Running | — | 3ms |
| S | — | 105ms |

**jank at 00:14.613 (132ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 27ms |
| Running | — | 20ms |
| S | — | 86ms |

**jank at 00:15.251 (27ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 5ms |
| R+ | — | 4ms |
| Running | — | 7ms |
| S | — | 11ms |

**jank at 00:15.634 (60ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 14ms |
| R+ | — | 10ms |
| Running | — | 14ms |
| S | — | 22ms |

**jank at 00:16.952 (45ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R+ | — | 0ms |
| Running | — | 4ms |
| S | — | 41ms |

**jank at 00:17.037 (57ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 9ms |
| R+ | — | 5ms |
| Running | — | 10ms |
| S | — | 33ms |

**jank at 00:17.054 (80ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 20ms |
| R+ | — | 18ms |
| Running | — | 10ms |
| S | — | 32ms |

**jank at 00:17.098 (105ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 19ms |
| R+ | — | 25ms |
| Running | — | 15ms |
| S | — | 46ms |

**jank at 00:17.201 (75ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 7ms |
| R+ | — | 9ms |
| Running | — | 15ms |
| S | — | 44ms |

**jank at 00:17.236 (107ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 7ms |
| R+ | — | 22ms |
| Running | — | 18ms |
| S | — | 61ms |

**jank at 00:17.294 (115ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 9ms |
| R+ | — | 21ms |
| Running | — | 15ms |
| S | — | 70ms |

**jank at 00:17.372 (107ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 12ms |
| R+ | — | 11ms |
| Running | — | 14ms |
| S | — | 71ms |

**jank at 00:17.450 (94ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 12ms |
| R+ | — | 30ms |
| Running | — | 22ms |
| S | — | 30ms |

**jank at 00:17.498 (117ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 34ms |
| R+ | — | 31ms |
| Running | — | 27ms |
| S | — | 25ms |

**jank at 00:17.582 (94ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 21ms |
| R+ | — | 5ms |
| Running | — | 11ms |
| S | — | 57ms |

**jank at 00:17.642 (131ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 20ms |
| R+ | — | 14ms |
| Running | — | 16ms |
| S | — | 80ms |

**jank at 00:17.732 (89ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 16ms |
| R+ | — | 20ms |
| Running | — | 20ms |
| S | — | 33ms |

**jank at 00:17.783 (111ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 4ms |
| R+ | — | 24ms |
| Running | — | 16ms |
| S | — | 67ms |

**jank at 00:17.876 (83ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 32ms |
| Running | — | 17ms |
| S | — | 33ms |

**jank at 00:17.923 (120ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 17ms |
| R+ | — | 25ms |
| Running | — | 16ms |
| S | — | 61ms |

**jank at 00:18.033 (71ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 8ms |
| R+ | — | 17ms |
| Running | — | 18ms |
| S | — | 28ms |

**jank at 00:18.066 (108ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 26ms |
| R+ | — | 16ms |
| Running | — | 15ms |
| S | — | 51ms |

**jank at 00:18.145 (122ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 24ms |
| R+ | — | 14ms |
| Running | — | 14ms |
| S | — | 70ms |

**jank at 00:18.210 (150ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 33ms |
| R+ | — | 8ms |
| Running | — | 30ms |
| S | — | 79ms |

**jank at 00:18.317 (153ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 32ms |
| R+ | — | 20ms |
| Running | — | 76ms |
| S | — | 25ms |

**jank at 00:18.451 (78ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 3ms |
| Running | — | 10ms |
| S | — | 64ms |

**jank at 00:18.472 (155ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R+ | — | 12ms |
| Running | — | 6ms |
| S | — | 137ms |

**jank at 00:18.583 (96ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 21ms |
| Running | — | 8ms |
| S | — | 66ms |

**jank at 00:18.835 (44ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 16ms |
| R+ | — | 8ms |
| Running | — | 20ms |

**jank at 00:18.884 (82ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 7ms |
| R+ | — | 2ms |
| Running | — | 7ms |
| S | — | 65ms |

**jank at 00:18.947 (46ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 7ms |
| R+ | — | 10ms |
| Running | — | 9ms |
| S | — | 21ms |

**jank at 00:18.977 (77ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 2ms |
| R+ | — | 0ms |
| Running | — | 8ms |
| S | — | 67ms |

**jank at 00:19.014 (110ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 6ms |
| R+ | — | 0ms |
| Running | — | 6ms |
| S | — | 98ms |

**jank at 00:19.081 (112ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 4ms |
| R+ | — | 8ms |
| Running | — | 6ms |
| S | — | 95ms |

**jank at 00:19.918 (46ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 4ms |
| R+ | — | 7ms |
| Running | — | 9ms |
| S | — | 27ms |

**jank at 00:19.948 (109ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 5ms |
| R+ | — | 63ms |
| Running | — | 10ms |
| S | — | 31ms |

**jank at 00:20.029 (207ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 5ms |
| R+ | — | 8ms |
| Running | — | 6ms |
| S | — | 188ms |

**jank at 00:20.166 (143ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 2ms |
| Running | — | 4ms |
| S | — | 136ms |

**jank at 00:20.262 (108ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 0ms |
| Running | — | 4ms |
| S | — | 103ms |

**jank at 00:20.450 (33ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 7ms |
| R+ | — | 0ms |
| Running | — | 6ms |
| S | — | 19ms |

---

## RSS Growth — Weak Signal

> **Manual confirmation needed.** Resident-set size grew during the recording, but RSS growth is a weak proxy — it can be normal warm-up behaviour (JIT compilation, texture caches). Real Android leak detection lands in a later phase via heap-dump analysis.

| Start (MB) | Peak (MB) | Growth (MB) | Severity |
|---|---|---|---|
| 1109.5 | 1149.2 | 39.7 | 🟡 |

---

## Suggested Improvements

### CPU Hotspots

- 🔴 `goldfish_pipe_read_write` on RenderThread (17.77%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code — it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.
- 🟡 `internal_get_user_pages_fast` on RenderThread (6.9%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code — it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.

### UI Hangs

- 🟡 jank at 00:11.967 (23ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:11.985 (105ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.008 (138ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.098 (166ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.226 (92ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.650 (92ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:12.724 (116ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.743 (170ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.840 (164ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:12.917 (147ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:13.023 (110ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:13.077 (156ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:13.217 (87ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:13.287 (84ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:13.627 (86ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:13.780 (30ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:14.050 (55ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:14.106 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:14.268 (24ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:14.284 (101ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:14.357 (114ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:14.408 (126ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:14.474 (134ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:14.541 (113ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:14.613 (132ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:15.251 (27ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:15.634 (60ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:16.952 (45ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:17.037 (57ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:17.054 (80ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:17.098 (105ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:17.201 (75ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:17.236 (107ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:17.294 (115ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:17.372 (107ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:17.450 (94ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:17.498 (117ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:17.582 (94ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:17.642 (131ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:17.732 (89ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:17.783 (111ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:17.876 (83ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:17.923 (120ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:18.033 (71ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:18.066 (108ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:18.145 (122ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:18.210 (150ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:18.317 (153ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:18.451 (78ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:18.472 (155ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:18.583 (96ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:18.835 (44ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:18.884 (82ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:18.947 (46ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:18.977 (77ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:19.014 (110ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:19.081 (112ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:19.918 (46ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:19.948 (109ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:20.029 (207ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:20.166 (143ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:20.262 (108ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:20.450 (33ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.

---

## Next Steps

Ask the user which path to take:

1. **Investigate further** — use `profiler-stack-query` to drill into specific findings:
   - mode=`hang_stacks` hang_index=0 — main-thread state + any on-CPU stacks for the worst hang
   - mode=`thread_breakdown` — CPU distribution across threads
2. **Implement fixes** — apply changes to address the findings above, then re-profile to measure improvement.
3. **Done for now** — save the report for reference.