# Android Perfetto Analysis

**Trace:** `native-profiler-20261004-110754.pftrace`  |  **Platform:** Android  |  **Analyzed:** 2026-10-04T11:08:30.653Z

---

## Summary

| Category | Count | Severity |
|---|---|---|
| CPU Hotspots | 2 | 🟡 2 |
| UI Hangs | 53 | 🟡 53 |
| RSS Growth (weak signal) | 1 | 🟡 1 |

---

## CPU Hotspots

| # | Function | Thread | Weight (ms) | Weight % | Samples | During Hang? | Severity |
|---|---|---|---|---|---|---|---|
| 1 | `goldfish_pipe_read_write` | RenderThread | 530 | 13.8% | 53 | — | 🟡 |
| 2 | `internal_get_user_pages_fast` | RenderThread | 210 | 5.47% | 21 | — | 🟡 |

> **Note:** 2 of these hotspots are emulator/kernel frames (e.g. `goldfish_*`, `do_syscall_64`, `gup_*`) — the QEMU GPU-transport pipe and Linux syscall paths, not app code. They dominate RenderThread on the emulator and do not appear on physical devices. Re-profile on a real device for representative app CPU numbers.

### `goldfish_pipe_read_write` (RenderThread)

**Call chains:**
- (53×) `goldfish_pipe_read_write`

**Activity bursts:** 6 clusters
- 2.0s → 2.9s (10 samples)
- 3.5s → 4.1s (10 samples)
- 4.7s → 5.5s (10 samples)
- 6.1s → 6.1s (1 samples)
- 8.6s → 9.6s (13 samples)
- 10.6s → 11.0s (9 samples)


### `internal_get_user_pages_fast` (RenderThread)

**Call chains:**
- (21×) `internal_get_user_pages_fast`

**Activity bursts:** 6 clusters
- 2.5s → 2.5s (1 samples)
- 3.0s → 3.0s (1 samples)
- 4.0s → 4.1s (3 samples)
- 5.2s → 5.3s (2 samples)
- 8.6s → 9.7s (12 samples)
- 11.0s → 11.0s (2 samples)


---

## UI Hangs

| # | Type | Reason | Start | Duration | Severity |
|---|---|---|---|---|---|
| 1 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:02.000 | 64ms | 🟡 |
| 2 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.017 | 274ms | 🟡 |
| 3 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.316 | 122ms | 🟡 |
| 4 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.380 | 150ms | 🟡 |
| 5 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.464 | 0ms | 🟡 |
| 6 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.559 | 149ms | 🟡 |
| 7 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.662 | 0ms | 🟡 |
| 8 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.772 | 110ms | 🟡 |
| 9 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.867 | 80ms | 🟡 |
| 10 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.898 | 137ms | 🟡 |
| 11 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.025 | 71ms | 🟡 |
| 12 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.180 | 55ms | 🟡 |
| 13 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.236 | 92ms | 🟡 |
| 14 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.319 | 149ms | 🟡 |
| 15 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.474 | 82ms | 🟡 |
| 16 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.500 | 117ms | 🟡 |
| 17 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.565 | 141ms | 🟡 |
| 18 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.627 | 140ms | 🟡 |
| 19 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.714 | 143ms | 🟡 |
| 20 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.778 | 133ms | 🟡 |
| 21 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.845 | 150ms | 🟡 |
| 22 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.913 | 139ms | 🟡 |
| 23 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.006 | 126ms | 🟡 |
| 24 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:04.199 | 77ms | 🟡 |
| 25 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:04.582 | 57ms | 🟡 |
| 26 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.637 | 87ms | 🟡 |
| 27 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:04.916 | 60ms | 🟡 |
| 28 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.940 | 266ms | 🟡 |
| 29 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.977 | 293ms | 🟡 |
| 30 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:05.206 | 120ms | 🟡 |
| 31 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:05.275 | 145ms | 🟡 |
| 32 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:05.516 | 20ms | 🟡 |
| 33 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:06.066 | 18ms | 🟡 |
| 34 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:08.566 | 72ms | 🟡 |
| 35 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.601 | 164ms | 🟡 |
| 36 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.645 | 170ms | 🟡 |
| 37 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.779 | 105ms | 🟡 |
| 38 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:08.999 | 40ms | 🟡 |
| 39 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.019 | 80ms | 🟡 |
| 40 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.040 | 126ms | 🟡 |
| 41 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.175 | 58ms | 🟡 |
| 42 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.183 | 120ms | 🟡 |
| 43 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.302 | 68ms | 🟡 |
| 44 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.372 | 71ms | 🟡 |
| 45 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.425 | 106ms | 🟡 |
| 46 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.498 | 82ms | 🟡 |
| 47 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.563 | 86ms | 🟡 |
| 48 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.598 | 115ms | 🟡 |
| 49 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:10.600 | 63ms | 🟡 |
| 50 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.621 | 235ms | 🟡 |
| 51 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.665 | 264ms | 🟡 |
| 52 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.860 | 122ms | 🟡 |
| 53 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.931 | 141ms | 🟡 |

**jank at 00:02.000 (64ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 7ms |
| R+ | — | 1ms |
| Running | — | 36ms |
| S | — | 20ms |

**jank at 00:02.017 (274ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 168ms |
| R+ | — | 23ms |
| Running | — | 59ms |
| S | — | 24ms |

**jank at 00:02.316 (122ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 40ms |
| R+ | — | 21ms |
| Running | — | 15ms |
| S | — | 46ms |

**jank at 00:02.380 (150ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 51ms |
| R+ | — | 40ms |
| Running | — | 34ms |
| S | — | 25ms |

**jank at 00:02.464 (0ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| Running | — | 0ms |

**jank at 00:02.559 (149ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 73ms |
| R+ | — | 22ms |
| Running | — | 22ms |
| S | — | 32ms |

**jank at 00:02.662 (0ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| Running | — | 0ms |

**jank at 00:02.772 (110ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 67ms |
| R+ | — | 17ms |
| Running | — | 26ms |

**jank at 00:02.867 (80ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 56ms |
| R+ | — | 6ms |
| Running | — | 18ms |
| S | — | 0ms |

**jank at 00:02.898 (137ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 74ms |
| R+ | — | 2ms |
| Running | — | 15ms |
| S | — | 47ms |

**jank at 00:03.025 (71ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 45ms |
| R+ | — | 5ms |
| Running | — | 19ms |
| S | — | 2ms |

**jank at 00:03.180 (55ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 5ms |
| R+ | — | 3ms |
| Running | — | 41ms |
| S | — | 6ms |

**jank at 00:03.236 (92ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 7ms |
| R+ | — | 63ms |
| Running | — | 22ms |
| S | — | 0ms |

**jank at 00:03.319 (149ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 41ms |
| R+ | — | 2ms |
| Running | — | 88ms |
| S | — | 17ms |

**jank at 00:03.474 (82ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 3ms |
| Running | — | 25ms |
| S | — | 53ms |

**jank at 00:03.500 (117ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 5ms |
| R+ | — | 16ms |
| Running | — | 24ms |
| S | — | 72ms |

**jank at 00:03.565 (141ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 13ms |
| R+ | — | 39ms |
| Running | — | 37ms |
| S | — | 52ms |

**jank at 00:03.627 (140ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 8ms |
| R+ | — | 28ms |
| Running | — | 34ms |
| S | — | 70ms |

**jank at 00:03.714 (143ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 13ms |
| R+ | — | 41ms |
| Running | — | 37ms |
| S | — | 51ms |

**jank at 00:03.778 (133ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| D | — | 15ms |
| R | — | 12ms |
| R+ | — | 41ms |
| Running | — | 28ms |
| S | — | 38ms |

**jank at 00:03.845 (150ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| D | — | 15ms |
| R | — | 17ms |
| R+ | — | 17ms |
| Running | — | 21ms |
| S | — | 81ms |

**jank at 00:03.913 (139ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 15ms |
| R+ | — | 25ms |
| Running | — | 28ms |
| S | — | 71ms |

**jank at 00:04.006 (126ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 5ms |
| R+ | — | 46ms |
| Running | — | 31ms |
| S | — | 44ms |

**jank at 00:04.199 (77ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 3ms |
| R+ | — | 3ms |
| Running | — | 60ms |
| S | — | 11ms |

**jank at 00:04.582 (57ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 5ms |
| Running | — | 46ms |
| S | — | 6ms |

**jank at 00:04.637 (87ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 52ms |
| R+ | — | 1ms |
| Running | — | 17ms |
| S | — | 18ms |

**jank at 00:04.916 (60ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 0ms |
| Running | — | 7ms |
| S | — | 52ms |

**jank at 00:04.940 (266ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 97ms |
| Running | — | 7ms |
| S | — | 162ms |

**jank at 00:04.977 (293ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 2ms |
| R+ | — | 100ms |
| Running | — | 4ms |
| S | — | 187ms |

**jank at 00:05.206 (120ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 2ms |
| R+ | — | 4ms |
| Running | — | 2ms |
| S | — | 112ms |

**jank at 00:05.275 (145ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 3ms |
| Running | — | 9ms |
| S | — | 132ms |

**jank at 00:05.516 (20ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 2ms |
| Running | — | 9ms |
| S | — | 8ms |

**jank at 00:06.066 (18ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| Running | — | 5ms |
| S | — | 13ms |

**jank at 00:08.566 (72ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 5ms |
| R+ | — | 6ms |
| Running | — | 39ms |
| S | — | 22ms |

**jank at 00:08.601 (164ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 9ms |
| R+ | — | 0ms |
| Running | — | 31ms |
| S | — | 124ms |

**jank at 00:08.645 (170ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 10ms |
| R+ | — | 22ms |
| Running | — | 21ms |
| S | — | 117ms |

**jank at 00:08.779 (105ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 6ms |
| R+ | — | 23ms |
| Running | — | 14ms |
| S | — | 63ms |

**jank at 00:08.999 (40ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 6ms |
| Running | — | 22ms |
| S | — | 11ms |

**jank at 00:09.019 (80ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 5ms |
| R+ | — | 6ms |
| Running | — | 8ms |
| S | — | 61ms |

**jank at 00:09.040 (126ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 4ms |
| R+ | — | 0ms |
| Running | — | 3ms |
| S | — | 119ms |

**jank at 00:09.175 (58ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 5ms |
| Running | — | 4ms |
| S | — | 48ms |

**jank at 00:09.183 (120ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 0ms |
| Running | — | 2ms |
| S | — | 117ms |

**jank at 00:09.302 (68ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 6ms |
| R+ | — | 3ms |
| Running | — | 31ms |
| S | — | 28ms |

**jank at 00:09.372 (71ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 0ms |
| Running | — | 8ms |
| S | — | 62ms |

**jank at 00:09.425 (106ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 18ms |
| R+ | — | 0ms |
| Running | — | 7ms |
| S | — | 80ms |

**jank at 00:09.498 (82ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 46ms |
| R+ | — | 1ms |
| Running | — | 11ms |
| S | — | 24ms |

**jank at 00:09.563 (86ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 2ms |
| R+ | — | 8ms |
| Running | — | 13ms |
| S | — | 62ms |

**jank at 00:09.598 (115ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 7ms |
| R+ | — | 17ms |
| Running | — | 24ms |
| S | — | 67ms |

**jank at 00:10.600 (63ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 0ms |
| Running | — | 7ms |
| S | — | 55ms |

**jank at 00:10.621 (235ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 9ms |
| R+ | — | 87ms |
| Running | — | 12ms |
| S | — | 127ms |

**jank at 00:10.665 (264ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 9ms |
| R+ | — | 89ms |
| Running | — | 10ms |
| S | — | 156ms |

**jank at 00:10.860 (122ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 47ms |
| Running | — | 3ms |
| S | — | 72ms |

**jank at 00:10.931 (141ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 4ms |
| R+ | — | 71ms |
| Running | — | 22ms |
| S | — | 43ms |

---

## RSS Growth — Weak Signal

> **Manual confirmation needed.** Resident-set size grew during the recording, but RSS growth is a weak proxy — it can be normal warm-up behaviour (JIT compilation, texture caches). Real Android leak detection lands in a later phase via heap-dump analysis.

| Start (MB) | Peak (MB) | Growth (MB) | Severity |
|---|---|---|---|
| 1104.0 | 1118.6 | 14.6 | 🟡 |

---

## Suggested Improvements

### CPU Hotspots

- 🟡 `goldfish_pipe_read_write` on RenderThread (13.8%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code — it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.
- 🟡 `internal_get_user_pages_fast` on RenderThread (5.47%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code — it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.

### UI Hangs

- 🟡 jank at 00:02.000 (64ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:02.017 (274ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.316 (122ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.380 (150ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.464 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.559 (149ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.662 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.772 (110ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.867 (80ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.898 (137ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.025 (71ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.180 (55ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.236 (92ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.319 (149ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.474 (82ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.500 (117ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.565 (141ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.627 (140ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.714 (143ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.778 (133ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.845 (150ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.913 (139ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.006 (126ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.199 (77ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:04.582 (57ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:04.637 (87ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.916 (60ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:04.940 (266ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.977 (293ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:05.206 (120ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:05.275 (145ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:05.516 (20ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:06.066 (18ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:08.566 (72ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:08.601 (164ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.645 (170ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.779 (105ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.999 (40ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:09.019 (80ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.040 (126ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.175 (58ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.183 (120ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.302 (68ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.372 (71ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.425 (106ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.498 (82ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.563 (86ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.598 (115ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:10.600 (63ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:10.621 (235ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:10.665 (264ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:10.860 (122ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:10.931 (141ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.

---

## Next Steps

Ask the user which path to take:

1. **Investigate further** — use `profiler-stack-query` to drill into specific findings:
   - mode=`hang_stacks` hang_index=0 — main-thread state + any on-CPU stacks for the worst hang
   - mode=`thread_breakdown` — CPU distribution across threads
2. **Implement fixes** — apply changes to address the findings above, then re-profile to measure improvement.
3. **Done for now** — save the report for reference.