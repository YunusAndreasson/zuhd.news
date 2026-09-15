# Android Perfetto Analysis

**Trace:** `native-profiler-20260915-164023.pftrace`  |  **Platform:** Android  |  **Analyzed:** 2026-09-15T16:41:04.377Z

---

## Summary

| Category | Count | Severity |
|---|---|---|
| CPU Hotspots | 5 | ð´ 2  ð¡ 3 |
| UI Hangs | 121 | ð´ 4  ð¡ 117 |
| RSS Growth (weak signal) | 1 | ð¡ 1 |

---

## CPU Hotspots

| # | Function | Thread | Weight (ms) | Weight % | Samples | During Hang? | Severity |
|---|---|---|---|---|---|---|---|
| 1 | `goldfish_pipe_read_write` | RenderThread | 2800 | 24.98% | 280 | â | ð´ |
| 2 | `goldfish_pipe_read_write` | Main Thread | 2130 | 19% | 213 | â | ð´ |
| 3 | `internal_get_user_pages_fast` | RenderThread | 960 | 8.56% | 96 | â | ð¡ |
| 4 | `internal_get_user_pages_fast` | Main Thread | 560 | 5% | 56 | â | ð¡ |
| 5 | `preempt_schedule_irq` | RenderThread | 420 | 3.75% | 42 | â | ð¡ |

> **Note:** 5 of these hotspots are emulator/kernel frames (e.g. `goldfish_*`, `do_syscall_64`, `gup_*`) â the QEMU GPU-transport pipe and Linux syscall paths, not app code. They dominate RenderThread on the emulator and do not appear on physical devices. Re-profile on a real device for representative app CPU numbers.

### `goldfish_pipe_read_write` (RenderThread)

**Call chains:**
- (280Ã) `goldfish_pipe_read_write`

**Activity bursts:** 6 clusters
- 0.2s â 4.5s (156 samples)
- 5.0s â 5.4s (4 samples)
- 6.3s â 7.5s (15 samples)
- 8.1s â 10.8s (69 samples)
- 11.8s â 11.9s (7 samples)
- 12.5s â 14.1s (29 samples)


### `goldfish_pipe_read_write` (Main Thread)

**Call chains:**
- (213Ã) `goldfish_pipe_read_write`

**Activity bursts:** 5 clusters
- 4.0s â 5.3s (53 samples)
- 6.0s â 8.3s (79 samples)
- 9.4s â 9.8s (20 samples)
- 11.0s â 12.4s (35 samples)
- 13.3s â 13.9s (26 samples)


### `internal_get_user_pages_fast` (RenderThread)

**Call chains:**
- (96Ã) `internal_get_user_pages_fast`

**Activity bursts:** 7 clusters
- 0.3s â 5.0s (52 samples)
- 6.9s â 7.5s (5 samples)
- 8.1s â 9.3s (11 samples)
- 9.8s â 10.7s (14 samples)
- 11.8s â 11.9s (2 samples)
- 12.5s â 12.9s (7 samples)
- 13.5s â 14.1s (5 samples)


### `internal_get_user_pages_fast` (Main Thread)

**Call chains:**
- (56Ã) `internal_get_user_pages_fast`

**Activity bursts:** 6 clusters
- 4.1s â 5.3s (12 samples)
- 6.0s â 8.3s (21 samples)
- 9.5s â 9.8s (3 samples)
- 10.8s â 11.7s (8 samples)
- 12.4s â 12.5s (4 samples)
- 13.4s â 13.9s (8 samples)


### `preempt_schedule_irq` (RenderThread)

**Call chains:**
- (42Ã) `preempt_schedule_irq`

**Activity bursts:** 11 clusters
- 0.3s â 1.3s (7 samples)
- 1.9s â 2.2s (3 samples)
- 2.9s â 3.7s (8 samples)
- 5.0s â 5.0s (1 samples)
- 6.5s â 6.5s (1 samples)
- 7.5s â 7.5s (1 samples)
- 8.1s â 8.1s (3 samples)
- 8.8s â 9.1s (2 samples)
- 10.3s â 10.8s (5 samples)
- 11.8s â 11.9s (2 samples)
- 12.5s â 13.2s (9 samples)


---

## UI Hangs

| # | Type | Reason | Start | Duration | Severity |
|---|---|---|---|---|---|
| 1 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:00.060 | 105ms | ð¡ |
| 2 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:00.118 | 101ms | ð¡ |
| 3 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:00.184 | 117ms | ð¡ |
| 4 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:00.242 | 127ms | ð¡ |
| 5 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:00.304 | 115ms | ð¡ |
| 6 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:00.371 | 144ms | ð¡ |
| 7 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:00.442 | 133ms | ð¡ |
| 8 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:00.522 | 151ms | ð¡ |
| 9 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:00.595 | 143ms | ð¡ |
| 10 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:00.679 | 161ms | ð¡ |
| 11 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:00.766 | 185ms | ð¡ |
| 12 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:00.869 | 159ms | ð¡ |
| 13 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:00.956 | 150ms | ð¡ |
| 14 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:01.055 | 135ms | ð¡ |
| 15 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:01.131 | 164ms | ð¡ |
| 16 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:01.215 | 144ms | ð¡ |
| 17 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:01.306 | 133ms | ð¡ |
| 18 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:01.384 | 141ms | ð¡ |
| 19 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:01.466 | 166ms | ð¡ |
| 20 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:01.552 | 154ms | ð¡ |
| 21 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:01.637 | 168ms | ð¡ |
| 22 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:01.731 | 142ms | ð¡ |
| 23 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:01.810 | 159ms | ð¡ |
| 24 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:01.899 | 122ms | ð¡ |
| 25 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:01.974 | 112ms | ð¡ |
| 26 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.041 | 106ms | ð¡ |
| 27 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.104 | 111ms | ð¡ |
| 28 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.164 | 105ms | ð¡ |
| 29 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.228 | 84ms | ð¡ |
| 30 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.276 | 107ms | ð¡ |
| 31 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.329 | 96ms | ð¡ |
| 32 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.385 | 115ms | ð¡ |
| 33 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.449 | 94ms | ð¡ |
| 34 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.507 | 94ms | ð¡ |
| 35 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.562 | 104ms | ð¡ |
| 36 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.620 | 110ms | ð¡ |
| 37 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.686 | 106ms | ð¡ |
| 38 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.748 | 122ms | ð¡ |
| 39 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.812 | 105ms | ð¡ |
| 40 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.876 | 110ms | ð¡ |
| 41 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:02.934 | 122ms | ð¡ |
| 42 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.002 | 99ms | ð¡ |
| 43 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.059 | 120ms | ð¡ |
| 44 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.120 | 127ms | ð¡ |
| 45 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.182 | 127ms | ð¡ |
| 46 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.250 | 130ms | ð¡ |
| 47 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.324 | 118ms | ð¡ |
| 48 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.388 | 119ms | ð¡ |
| 49 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.446 | 112ms | ð¡ |
| 50 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.510 | 131ms | ð¡ |
| 51 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.579 | 141ms | ð¡ |
| 52 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.674 | 117ms | ð¡ |
| 53 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.723 | 135ms | ð¡ |
| 54 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.822 | 84ms | ð¡ |
| 55 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.863 | 122ms | ð¡ |
| 56 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.928 | 111ms | ð¡ |
| 57 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:03.991 | 268ms | ð¡ |
| 58 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.260 | 234ms | ð¡ |
| 59 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.497 | 210ms | ð¡ |
| 60 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.700 | 162ms | ð¡ |
| 61 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:04.850 | 0ms | ð¡ |
| 62 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:05.000 | 57ms | ð¡ |
| 63 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:05.217 | 135ms | ð¡ |
| 64 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:05.352 | 48ms | ð¡ |
| 65 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:06.117 | 153ms | ð¡ |
| 66 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:06.253 | 61ms | ð¡ |
| 67 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:06.270 | 244ms | ð¡ |
| 68 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:06.488 | 65ms | ð¡ |
| 69 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:06.512 | 404ms | ð¡ |
| 70 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:06.885 | 134ms | ð¡ |
| 71 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:06.920 | 545ms | ð´ |
| 72 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:07.425 | 108ms | ð¡ |
| 73 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:07.468 | 626ms | ð´ |
| 74 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.083 | 55ms | ð¡ |
| 75 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.101 | 261ms | ð¡ |
| 76 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.346 | 57ms | ð¡ |
| 77 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.369 | 87ms | ð¡ |
| 78 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.457 | 0ms | ð¡ |
| 79 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.484 | 107ms | ð¡ |
| 80 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.535 | 132ms | ð¡ |
| 81 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.610 | 0ms | ð¡ |
| 82 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.684 | 116ms | ð¡ |
| 83 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.745 | 147ms | ð¡ |
| 84 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.835 | 104ms | ð¡ |
| 85 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.902 | 103ms | ð¡ |
| 86 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.958 | 112ms | ð¡ |
| 87 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.028 | 113ms | ð¡ |
| 88 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.094 | 123ms | ð¡ |
| 89 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.163 | 106ms | ð¡ |
| 90 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.220 | 336ms | ð¡ |
| 91 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.555 | 276ms | ð¡ |
| 92 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.827 | 56ms | ð¡ |
| 93 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.850 | 84ms | ð¡ |
| 94 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.884 | 126ms | ð¡ |
| 95 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.955 | 142ms | ð¡ |
| 96 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.107 | 113ms | ð¡ |
| 97 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.195 | 111ms | ð¡ |
| 98 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.246 | 107ms | ð¡ |
| 99 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.307 | 114ms | ð¡ |
| 100 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.373 | 116ms | ð¡ |
| 101 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.459 | 113ms | ð¡ |
| 102 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.506 | 120ms | ð¡ |
| 103 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.576 | 114ms | ð¡ |
| 104 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.641 | 121ms | ð¡ |
| 105 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.718 | 118ms | ð¡ |
| 106 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.789 | 1061ms | ð´ |
| 107 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:11.729 | 337ms | ð¡ |
| 108 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:11.819 | 662ms | ð´ |
| 109 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.463 | 77ms | ð¡ |
| 110 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.482 | 130ms | ð¡ |
| 111 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.544 | 138ms | ð¡ |
| 112 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.607 | 135ms | ð¡ |
| 113 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.696 | 117ms | ð¡ |
| 114 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.745 | 159ms | ð¡ |
| 115 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.823 | 139ms | ð¡ |
| 116 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.907 | 121ms | ð¡ |
| 117 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:12.964 | 134ms | ð¡ |
| 118 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:13.032 | 146ms | ð¡ |
| 119 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:13.147 | 99ms | ð¡ |
| 120 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:13.180 | 358ms | ð¡ |
| 121 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:13.519 | 90ms | ð¡ |

**jank at 00:00.060 (105ms)** â reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`

**jank at 00:00.118 (101ms)** â reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`

**jank at 00:00.184 (117ms)** â reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`

> ... and 118 more hang(s). See full report for details.

---

## RSS Growth â Weak Signal

> **Manual confirmation needed.** Resident-set size grew during the recording, but RSS growth is a weak proxy â it can be normal warm-up behaviour (JIT compilation, texture caches). Real Android leak detection lands in a later phase via heap-dump analysis.

| Start (MB) | Peak (MB) | Growth (MB) | Severity |
|---|---|---|---|
| 963.2 | 997.1 | 33.8 | ð¡ |

---

## Suggested Improvements

### CPU Hotspots

- ð´ `goldfish_pipe_read_write` on RenderThread (24.98%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code â it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.
- ð´ `goldfish_pipe_read_write` on Main Thread (19%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code â it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.
- ð¡ `internal_get_user_pages_fast` on RenderThread (8.56%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code â it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.
- ð¡ `internal_get_user_pages_fast` on Main Thread (5%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code â it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.
- ð¡ `preempt_schedule_irq` on RenderThread (3.75%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code â it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.

### UI Hangs

- ð¡ jank at 00:00.060 (105ms): Main thread stalled past the frame budget â move heavy work off the main thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:00.118 (101ms): Main thread stalled past the frame budget â move heavy work off the main thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:00.184 (117ms): Main thread stalled past the frame budget â move heavy work off the main thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:00.242 (127ms): Main thread stalled past the frame budget â move heavy work off the main thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:00.304 (115ms): Main thread stalled past the frame budget â move heavy work off the main thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:00.371 (144ms): Main thread stalled past the frame budget â move heavy work off the main thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:00.442 (133ms): Main thread stalled past the frame budget â move heavy work off the main thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:00.522 (151ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:00.595 (143ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:00.679 (161ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:00.766 (185ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:00.869 (159ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:00.956 (150ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:01.055 (135ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:01.131 (164ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:01.215 (144ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:01.306 (133ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:01.384 (141ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:01.466 (166ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:01.552 (154ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:01.637 (168ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:01.731 (142ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:01.810 (159ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:01.899 (122ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:01.974 (112ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.041 (106ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.104 (111ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.164 (105ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.228 (84ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.276 (107ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.329 (96ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.385 (115ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.449 (94ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.507 (94ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.562 (104ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.620 (110ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.686 (106ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.748 (122ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.812 (105ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.876 (110ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:02.934 (122ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.002 (99ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.059 (120ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.120 (127ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.182 (127ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.250 (130ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.324 (118ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.388 (119ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.446 (112ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.510 (131ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.579 (141ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.674 (117ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.723 (135ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.822 (84ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.863 (122ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.928 (111ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:03.991 (268ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:04.260 (234ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:04.497 (210ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:04.700 (162ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:04.850 (0ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:05.000 (57ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:05.217 (135ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- ð¡ jank at 00:05.352 (48ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:06.117 (153ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- ð¡ jank at 00:06.253 (61ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:06.270 (244ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:06.488 (65ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:06.512 (404ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:06.885 (134ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð´ jank at 00:06.920 (545ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:07.425 (108ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð´ jank at 00:07.468 (626ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:08.083 (55ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:08.101 (261ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:08.346 (57ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:08.369 (87ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:08.457 (0ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:08.484 (107ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:08.535 (132ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:08.610 (0ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:08.684 (116ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:08.745 (147ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:08.835 (104ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:08.902 (103ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:08.958 (112ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:09.028 (113ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:09.094 (123ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:09.163 (106ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:09.220 (336ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:09.555 (276ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:09.827 (56ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:09.850 (84ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:09.884 (126ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:09.955 (142ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:10.107 (113ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:10.195 (111ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:10.246 (107ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:10.307 (114ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:10.373 (116ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:10.459 (113ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:10.506 (120ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:10.576 (114ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:10.641 (121ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:10.718 (118ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð´ jank at 00:10.789 (1061ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:11.729 (337ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð´ jank at 00:11.819 (662ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:12.463 (77ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:12.482 (130ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:12.544 (138ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:12.607 (135ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:12.696 (117ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:12.745 (159ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:12.823 (139ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:12.907 (121ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:12.964 (134ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:13.032 (146ms): Main thread was off-CPU (state `S`) for most of the hang â it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:13.147 (99ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:13.180 (358ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- ð¡ jank at 00:13.519 (90ms): Main thread was executing (on-CPU) for most of the hang â genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.

---

## Next Steps

Ask the user which path to take:

1. **Investigate further** â use `profiler-stack-query` to drill into specific findings:
   - mode=`hang_stacks` hang_index=0 â main-thread state + any on-CPU stacks for the worst hang
   - mode=`thread_breakdown` â CPU distribution across threads
2. **Implement fixes** â apply changes to address the findings above, then re-profile to measure improvement.
3. **Done for now** â save the report for reference.

> Full report saved â 127 bottleneck(s) total, showing top 5 CPU hotspots and top 3 hangs inline. Use the Read tool on the `reportFile` path in this result to view all details.",
  "reportFile": "/tmp/argent-profiler-cwd/native-profiler-20260915-164023-report.md",
  "bottlenecksTotal": 127,
  "status": "ok