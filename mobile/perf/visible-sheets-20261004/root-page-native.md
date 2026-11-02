# Android Perfetto Analysis

**Trace:** `native-profiler-20261004-110938.pftrace`  |  **Platform:** Android  |  **Analyzed:** 2026-10-04T11:10:15.867Z

---

## Summary

| Category | Count | Severity |
|---|---|---|
| CPU Hotspots | 2 | 🟡 2 |
| UI Hangs | 51 | 🟡 51 |
| RSS Growth (weak signal) | 1 | 🟡 1 |

---

## CPU Hotspots

| # | Function | Thread | Weight (ms) | Weight % | Samples | During Hang? | Severity |
|---|---|---|---|---|---|---|---|
| 1 | `goldfish_pipe_read_write` | RenderThread | 490 | 14.16% | 49 | — | 🟡 |
| 2 | `internal_get_user_pages_fast` | RenderThread | 220 | 6.36% | 22 | — | 🟡 |

> **Note:** 2 of these hotspots are emulator/kernel frames (e.g. `goldfish_*`, `do_syscall_64`, `gup_*`) — the QEMU GPU-transport pipe and Linux syscall paths, not app code. They dominate RenderThread on the emulator and do not appear on physical devices. Re-profile on a real device for representative app CPU numbers.

### `goldfish_pipe_read_write` (RenderThread)

**Call chains:**
- (49×) `goldfish_pipe_read_write`

**Activity bursts:** 4 clusters
- 2.5s → 2.7s (4 samples)
- 3.3s → 5.5s (17 samples)
- 7.6s → 8.5s (16 samples)
- 9.4s → 9.8s (12 samples)


### `internal_get_user_pages_fast` (RenderThread)

**Call chains:**
- (22×) `internal_get_user_pages_fast`

**Activity bursts:** 5 clusters
- 2.7s → 2.7s (2 samples)
- 3.7s → 4.9s (6 samples)
- 5.5s → 5.5s (1 samples)
- 7.6s → 8.5s (7 samples)
- 9.4s → 9.8s (6 samples)


---

## UI Hangs

| # | Type | Reason | Start | Duration | Severity |
|---|---|---|---|---|---|
| 1 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:02.516 | 17ms | 🟡 |
| 2 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:02.535 | 51ms | 🟡 |
| 3 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.551 | 131ms | 🟡 |
| 4 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.591 | 159ms | 🟡 |
| 5 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.683 | 128ms | 🟡 |
| 6 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:03.150 | 0ms | 🟡 |
| 7 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.231 | 51ms | 🟡 |
| 8 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.250 | 113ms | 🟡 |
| 9 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.395 | 37ms | 🟡 |
| 10 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.426 | 78ms | 🟡 |
| 11 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:03.609 | 30ms | 🟡 |
| 12 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.641 | 105ms | 🟡 |
| 13 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.753 | 87ms | 🟡 |
| 14 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.792 | 128ms | 🟡 |
| 15 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.848 | 136ms | 🟡 |
| 16 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.927 | 159ms | 🟡 |
| 17 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.075 | 94ms | 🟡 |
| 18 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.144 | 84ms | 🟡 |
| 19 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.175 | 141ms | 🟡 |
| 20 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.310 | 87ms | 🟡 |
| 21 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.399 | 49ms | 🟡 |
| 22 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.432 | 71ms | 🟡 |
| 23 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:04.633 | 83ms | 🟡 |
| 24 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.742 | 97ms | 🟡 |
| 25 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.790 | 139ms | 🟡 |
| 26 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.879 | 143ms | 🟡 |
| 27 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:05.001 | 80ms | 🟡 |
| 28 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:05.080 | 108ms | 🟡 |
| 29 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:05.185 | 64ms | 🟡 |
| 30 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:05.333 | 63ms | 🟡 |
| 31 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:05.435 | 45ms | 🟡 |
| 32 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:05.516 | 37ms | 🟡 |
| 33 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:06.417 | 41ms | 🟡 |
| 34 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:07.567 | 0ms | 🟡 |
| 35 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:07.591 | 128ms | 🟡 |
| 36 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:07.783 | 99ms | 🟡 |
| 37 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:07.870 | 86ms | 🟡 |
| 38 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:07.886 | 137ms | 🟡 |
| 39 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:07.953 | 135ms | 🟡 |
| 40 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.024 | 146ms | 🟡 |
| 41 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.092 | 153ms | 🟡 |
| 42 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.276 | 30ms | 🟡 |
| 43 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.284 | 96ms | 🟡 |
| 44 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.372 | 66ms | 🟡 |
| 45 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.406 | 94ms | 🟡 |
| 46 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.495 | 86ms | 🟡 |
| 47 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:09.384 | 44ms | 🟡 |
| 48 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.404 | 180ms | 🟡 |
| 49 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.429 | 267ms | 🟡 |
| 50 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.697 | 68ms | 🟡 |
| 51 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.722 | 123ms | 🟡 |

**jank at 00:02.516 (17ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| Running | — | 4ms |
| S | — | 13ms |

**jank at 00:02.535 (51ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 5ms |
| R+ | — | 10ms |
| Running | — | 14ms |
| S | — | 22ms |

**jank at 00:02.551 (131ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 9ms |
| R+ | — | 4ms |
| Running | — | 12ms |
| S | — | 106ms |

**jank at 00:02.591 (159ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 48ms |
| R+ | — | 9ms |
| Running | — | 15ms |
| S | — | 86ms |

**jank at 00:02.683 (128ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 44ms |
| R+ | — | 68ms |
| Running | — | 12ms |
| S | — | 4ms |

**jank at 00:03.150 (0ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| Running | — | 0ms |

**jank at 00:03.231 (51ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 15ms |
| R+ | — | 1ms |
| Running | — | 11ms |
| S | — | 25ms |

**jank at 00:03.250 (113ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 6ms |
| R+ | — | 0ms |
| Running | — | 5ms |
| S | — | 101ms |

**jank at 00:03.395 (37ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 4ms |
| R+ | — | 10ms |
| Running | — | 14ms |
| S | — | 9ms |

**jank at 00:03.426 (78ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 21ms |
| R+ | — | 10ms |
| Running | — | 16ms |
| S | — | 31ms |

**jank at 00:03.609 (30ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 5ms |
| R+ | — | 2ms |
| Running | — | 20ms |
| S | — | 3ms |

**jank at 00:03.641 (105ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| Running | — | 6ms |
| S | — | 98ms |

**jank at 00:03.753 (87ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 30ms |
| R+ | — | 15ms |
| Running | — | 35ms |
| S | — | 8ms |

**jank at 00:03.792 (128ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 57ms |
| R+ | — | 1ms |
| Running | — | 37ms |
| S | — | 32ms |

**jank at 00:03.848 (136ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 37ms |
| R+ | — | 7ms |
| Running | — | 28ms |
| S | — | 64ms |

**jank at 00:03.927 (159ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 8ms |
| R+ | — | 6ms |
| Running | — | 20ms |
| S | — | 125ms |

**jank at 00:04.075 (94ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 20ms |
| R+ | — | 19ms |
| Running | — | 22ms |
| S | — | 33ms |

**jank at 00:04.144 (84ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 14ms |
| R+ | — | 8ms |
| Running | — | 16ms |
| S | — | 46ms |

**jank at 00:04.175 (141ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 3ms |
| R+ | — | 1ms |
| Running | — | 10ms |
| S | — | 127ms |

**jank at 00:04.310 (87ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 51ms |
| R+ | — | 1ms |
| Running | — | 33ms |
| S | — | 2ms |

**jank at 00:04.399 (49ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 9ms |
| R+ | — | 4ms |
| Running | — | 24ms |
| S | — | 11ms |

**jank at 00:04.432 (71ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 10ms |
| Running | — | 11ms |
| S | — | 49ms |

**jank at 00:04.633 (83ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 22ms |
| R+ | — | 7ms |
| Running | — | 54ms |

**jank at 00:04.742 (97ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 6ms |
| R+ | — | 2ms |
| Running | — | 20ms |
| S | — | 68ms |

**jank at 00:04.790 (139ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 36ms |
| R+ | — | 11ms |
| Running | — | 20ms |
| S | — | 71ms |

**jank at 00:04.879 (143ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 86ms |
| R+ | — | 24ms |
| Running | — | 33ms |
| S | — | 0ms |

**jank at 00:05.001 (80ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 4ms |
| R+ | — | 63ms |
| Running | — | 12ms |

**jank at 00:05.080 (108ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 73ms |
| R+ | — | 8ms |
| Running | — | 26ms |
| S | — | 1ms |

**jank at 00:05.185 (64ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 6ms |
| Running | — | 14ms |
| S | — | 43ms |

**jank at 00:05.333 (63ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 8ms |
| R+ | — | 3ms |
| Running | — | 43ms |
| S | — | 10ms |

**jank at 00:05.435 (45ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 22ms |
| R+ | — | 1ms |
| Running | — | 12ms |
| S | — | 10ms |

**jank at 00:05.516 (37ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 15ms |
| R+ | — | 11ms |
| Running | — | 11ms |
| S | — | 0ms |

**jank at 00:06.417 (41ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 5ms |
| R+ | — | 4ms |
| Running | — | 15ms |
| S | — | 18ms |

**jank at 00:07.567 (0ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| Running | — | 0ms |

**jank at 00:07.591 (128ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 12ms |
| R+ | — | 5ms |
| Running | — | 6ms |
| S | — | 105ms |

**jank at 00:07.783 (99ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 49ms |
| R+ | — | 12ms |
| Running | — | 34ms |
| S | — | 3ms |

**jank at 00:07.870 (86ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 18ms |
| R+ | — | 4ms |
| Running | — | 15ms |
| S | — | 49ms |

**jank at 00:07.886 (137ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 18ms |
| R+ | — | 0ms |
| Running | — | 6ms |
| S | — | 113ms |

**jank at 00:07.953 (135ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 2ms |
| R+ | — | 0ms |
| Running | — | 5ms |
| S | — | 128ms |

**jank at 00:08.024 (146ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 18ms |
| R+ | — | 2ms |
| Running | — | 8ms |
| S | — | 118ms |

**jank at 00:08.092 (153ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 37ms |
| R+ | — | 4ms |
| Running | — | 28ms |
| S | — | 85ms |

**jank at 00:08.276 (30ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 3ms |
| Running | — | 7ms |
| S | — | 20ms |

**jank at 00:08.284 (96ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 13ms |
| R+ | — | 2ms |
| Running | — | 17ms |
| S | — | 64ms |

**jank at 00:08.372 (66ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 4ms |
| R+ | — | 8ms |
| Running | — | 10ms |
| S | — | 44ms |

**jank at 00:08.406 (94ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 3ms |
| R+ | — | 16ms |
| Running | — | 14ms |
| S | — | 62ms |

**jank at 00:08.495 (86ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 13ms |
| Running | — | 26ms |
| S | — | 46ms |

**jank at 00:09.384 (44ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 0ms |
| Running | — | 8ms |
| S | — | 36ms |

**jank at 00:09.404 (180ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 3ms |
| R+ | — | 0ms |
| Running | — | 11ms |
| S | — | 166ms |

**jank at 00:09.429 (267ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 3ms |
| R+ | — | 0ms |
| Running | — | 7ms |
| S | — | 257ms |

**jank at 00:09.697 (68ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 4ms |
| R+ | — | 1ms |
| Running | — | 7ms |
| S | — | 57ms |

**jank at 00:09.722 (123ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 0ms |
| R+ | — | 0ms |
| Running | — | 2ms |
| S | — | 120ms |

---

## RSS Growth — Weak Signal

> **Manual confirmation needed.** Resident-set size grew during the recording, but RSS growth is a weak proxy — it can be normal warm-up behaviour (JIT compilation, texture caches). Real Android leak detection lands in a later phase via heap-dump analysis.

| Start (MB) | Peak (MB) | Growth (MB) | Severity |
|---|---|---|---|
| 1122.7 | 1151.6 | 29.0 | 🟡 |

---

## Suggested Improvements

### CPU Hotspots

- 🟡 `goldfish_pipe_read_write` on RenderThread (14.16%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code — it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.
- 🟡 `internal_get_user_pages_fast` on RenderThread (6.36%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code — it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.

### UI Hangs

- 🟡 jank at 00:02.516 (17ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:02.535 (51ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:02.551 (131ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.591 (159ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:02.683 (128ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.150 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:03.231 (51ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.250 (113ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.395 (37ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.426 (78ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.609 (30ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:03.641 (105ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.753 (87ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.792 (128ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.848 (136ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:03.927 (159ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.075 (94ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.144 (84ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.175 (141ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.310 (87ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.399 (49ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.432 (71ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.633 (83ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:04.742 (97ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.790 (139ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:04.879 (143ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:05.001 (80ms): Main thread was runnable but not scheduled (state `R+`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:05.080 (108ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:05.185 (64ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:05.333 (63ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:05.435 (45ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:05.516 (37ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:06.417 (41ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:07.567 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:07.591 (128ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:07.783 (99ms): Main thread was runnable but not scheduled (state `R`) for most of the hang — ready to run but starved of CPU. Look for other busy threads or background work contending for cores. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:07.870 (86ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:07.886 (137ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:07.953 (135ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.024 (146ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.092 (153ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.276 (30ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.284 (96ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.372 (66ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.406 (94ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.495 (86ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.384 (44ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:09.404 (180ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.429 (267ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.697 (68ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.722 (123ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.

---

## Next Steps

Ask the user which path to take:

1. **Investigate further** — use `profiler-stack-query` to drill into specific findings:
   - mode=`hang_stacks` hang_index=0 — main-thread state + any on-CPU stacks for the worst hang
   - mode=`thread_breakdown` — CPU distribution across threads
2. **Implement fixes** — apply changes to address the findings above, then re-profile to measure improvement.
3. **Done for now** — save the report for reference.