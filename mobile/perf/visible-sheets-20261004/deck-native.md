# Android Perfetto Analysis

**Trace:** `native-profiler-20261004-113913.pftrace`  |  **Platform:** Android  |  **Analyzed:** 2026-10-04T11:39:50.361Z

---

## Summary

| Category | Count | Severity |
|---|---|---|
| CPU Hotspots | 3 | 🔴 2  🟡 1 |
| UI Hangs | 18 | 🔴 3  🟡 15 |
| RSS Growth (weak signal) | 1 | 🟡 1 |

---

## CPU Hotspots

| # | Function | Thread | Weight (ms) | Weight % | Samples | During Hang? | Severity |
|---|---|---|---|---|---|---|---|
| 1 | `goldfish_pipe_read_write` | Main Thread | 3570 | 40.94% | 357 | — | 🔴 |
| 2 | `internal_get_user_pages_fast` | Main Thread | 1360 | 15.6% | 136 | — | 🔴 |
| 3 | `unpin_user_pages` | Main Thread | 420 | 4.82% | 42 | — | 🟡 |

> **Note:** 3 of these hotspots are emulator/kernel frames (e.g. `goldfish_*`, `do_syscall_64`, `gup_*`) — the QEMU GPU-transport pipe and Linux syscall paths, not app code. They dominate RenderThread on the emulator and do not appear on physical devices. Re-profile on a real device for representative app CPU numbers.

### `goldfish_pipe_read_write` (Main Thread)

**Call chains:**
- (357×) `goldfish_pipe_read_write`

**Active range:** 1.5s → 11.5s


### `internal_get_user_pages_fast` (Main Thread)

**Call chains:**
- (136×) `internal_get_user_pages_fast`

**Activity bursts:** 2 clusters
- 1.6s → 6.5s (78 samples)
- 7.2s → 11.5s (58 samples)


### `unpin_user_pages` (Main Thread)

**Call chains:**
- (42×) `unpin_user_pages`

**Activity bursts:** 6 clusters
- 1.6s → 1.8s (2 samples)
- 2.5s → 2.8s (5 samples)
- 3.4s → 4.0s (5 samples)
- 4.5s → 5.8s (11 samples)
- 6.5s → 6.5s (1 samples)
- 7.0s → 11.5s (18 samples)


---

## UI Hangs

| # | Type | Reason | Start | Duration | Severity |
|---|---|---|---|---|---|
| 1 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed | 00:01.177 | 677ms | 🔴 |
| 2 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:05.658 | 271ms | 🟡 |
| 3 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:05.968 | 593ms | 🔴 |
| 4 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:06.552 | 308ms | 🟡 |
| 5 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:06.834 | 235ms | 🟡 |
| 6 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:07.398 | 433ms | 🟡 |
| 7 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:07.789 | 477ms | 🟡 |
| 8 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.272 | 483ms | 🟡 |
| 9 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.830 | 36ms | 🟡 |
| 10 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:08.853 | 0ms | 🟡 |
| 11 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.507 | 396ms | 🟡 |
| 12 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.883 | 49ms | 🟡 |
| 13 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:09.917 | 619ms | 🔴 |
| 14 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.521 | 352ms | 🟡 |
| 15 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:10.859 | 455ms | 🟡 |
| 16 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:11.295 | 270ms | 🟡 |
| 17 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:11.568 | 119ms | 🟡 |
| 18 | jank | SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing | 00:11.683 | 68ms | 🟡 |

**jank at 00:01.177 (677ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| D | — | 0ms |
| R | — | 92ms |
| R+ | — | 40ms |
| Running | — | 545ms |
| S | — | 1ms |

**jank at 00:05.658 (271ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 6ms |
| R+ | — | 12ms |
| Running | — | 252ms |
| S | — | 0ms |

**jank at 00:05.968 (593ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| D | — | 1ms |
| R | — | 36ms |
| R+ | — | 90ms |
| Running | — | 464ms |
| S | — | 3ms |

**jank at 00:06.552 (308ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| D | — | 3ms |
| R | — | 51ms |
| R+ | — | 68ms |
| Running | — | 184ms |
| S | — | 3ms |

**jank at 00:06.834 (235ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 13ms |
| R+ | — | 47ms |
| Running | — | 173ms |
| S | — | 3ms |

**jank at 00:07.398 (433ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| D | — | 5ms |
| R | — | 5ms |
| R+ | — | 7ms |
| Running | — | 414ms |
| S | — | 2ms |

**jank at 00:07.789 (477ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| D | — | 5ms |
| R | — | 7ms |
| R+ | — | 21ms |
| Running | — | 419ms |
| S | — | 25ms |

**jank at 00:08.272 (483ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 9ms |
| R+ | — | 50ms |
| Running | — | 423ms |
| S | — | 1ms |

**jank at 00:08.830 (36ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 4ms |
| R+ | — | 11ms |
| Running | — | 19ms |
| S | — | 3ms |

**jank at 00:08.853 (0ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| Running | — | 0ms |

**jank at 00:09.507 (396ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| D | — | 0ms |
| R | — | 58ms |
| R+ | — | 14ms |
| Running | — | 306ms |
| S | — | 18ms |

**jank at 00:09.883 (49ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| D | — | 1ms |
| R | — | 0ms |
| R+ | — | 13ms |
| Running | — | 15ms |
| S | — | 20ms |

**jank at 00:09.917 (619ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| D | — | 1ms |
| R | — | 30ms |
| R+ | — | 29ms |
| Running | — | 556ms |
| S | — | 4ms |

**jank at 00:10.521 (352ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 42ms |
| R+ | — | 32ms |
| Running | — | 277ms |
| S | — | 2ms |

**jank at 00:10.859 (455ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| D | — | 0ms |
| R | — | 109ms |
| R+ | — | 118ms |
| Running | — | 224ms |
| S | — | 4ms |

**jank at 00:11.295 (270ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| D | — | 0ms |
| R | — | 12ms |
| R+ | — | 1ms |
| Running | — | 246ms |
| S | — | 11ms |

**jank at 00:11.568 (119ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 1ms |
| R+ | — | 0ms |
| Running | — | 6ms |
| S | — | 111ms |

**jank at 00:11.683 (68ms)** — reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing` — main-thread state breakdown:

| State | Blocked on | Duration |
|---|---|---|
| R | — | 19ms |
| R+ | — | 3ms |
| Running | — | 7ms |
| S | — | 39ms |

---

## RSS Growth — Weak Signal

> **Manual confirmation needed.** Resident-set size grew during the recording, but RSS growth is a weak proxy — it can be normal warm-up behaviour (JIT compilation, texture caches). Real Android leak detection lands in a later phase via heap-dump analysis.

| Start (MB) | Peak (MB) | Growth (MB) | Severity |
|---|---|---|---|
| 1128.4 | 1163.4 | 35.0 | 🟡 |

---

## Suggested Improvements

### CPU Hotspots

- 🔴 `goldfish_pipe_read_write` on Main Thread (40.94%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code — it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.
- 🔴 `internal_get_user_pages_fast` on Main Thread (15.6%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code — it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.
- 🟡 `unpin_user_pages` on Main Thread (4.82%): Emulator/kernel overhead (GPU-transport pipe or syscall), not app code — it does not appear on a physical device, so it is not directly actionable. Re-profile on a real device to see the app's own CPU cost.

### UI Hangs

- 🔴 jank at 00:01.177 (677ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed`.
- 🟡 jank at 00:05.658 (271ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🔴 jank at 00:05.968 (593ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:06.552 (308ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:06.834 (235ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:07.398 (433ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:07.789 (477ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.272 (483ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.830 (36ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:08.853 (0ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.507 (396ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:09.883 (49ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🔴 jank at 00:09.917 (619ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:10.521 (352ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:10.859 (455ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.295 (270ms): Main thread was executing (on-CPU) for most of the hang — genuine main-thread CPU work. Move heavy work off the main thread or reduce its cost. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.568 (119ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.
- 🟡 jank at 00:11.683 (68ms): Main thread was off-CPU (state `S`) for most of the hang — it was *waiting*, not doing CPU work. Investigate what it is blocked on (GPU/vsync, a lock, binder IPC, or I/O) via `hang_stacks`, rather than moving work off-thread. Reason: `SurfaceFlinger CPU Deadline Missed, App Deadline Missed, Buffer Stuffing`.

---

## Next Steps

Ask the user which path to take:

1. **Investigate further** — use `profiler-stack-query` to drill into specific findings:
   - mode=`hang_stacks` hang_index=0 — main-thread state + any on-CPU stacks for the worst hang
   - mode=`thread_breakdown` — CPU distribution across threads
2. **Implement fixes** — apply changes to address the findings above, then re-profile to measure improvement.
3. **Done for now** — save the report for reference.