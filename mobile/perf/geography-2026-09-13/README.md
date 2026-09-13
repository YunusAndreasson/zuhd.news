# Country border detail

All render tiers come from the checked-in Natural Earth 10m topology. The
build-time generator simplifies shared arcs, corrects reversed island rings,
and packs quantized deltas losslessly. Resting source error is bounded by
projected scale times each tier's tolerance (0.001 / 0.00025 / 0.00006).
Projection resampling at 0.25 logical pixels smooths long edges. Motion uses a
separate shared-arc tier with small islands omitted; the final frame restores
the resting tier. Land, borders, ice and highlight change together.

## Validation

`npm run verify`: 50 suites, 472 tests. Geometry tests check sampled source
error, land winding, shared topology, culling at polar/dateline views, and
Singapore selection. Android dev-client checks covered rendering, pinch and
restored detail. Full-resolution Argent captures failed with a data-size
mismatch; one adb PNG was used to inspect fine coastline detail.

## Measured tradeoff

On the same Android emulator, a single isolated Europe hemisphere projection
of land and borders took 44.9 ms with the old full 110m geometry (precision 0),
467.8 ms with detailed overview geometry (precision 0.25), and 32.6 ms with the
new motion tier (precision 0.5). These are diagnostic samples, not an FPS
benchmark; the app uses precision 0.25 and also draws other layers. Fine
geometry is therefore reserved for resting frames. The motion tier projects
3,206 land/border vertices globally and keeps the existing latest-frame queue.

An isolated HEAD export produced 8,430,791 bytes of iOS Hermes bytecode.
Unpacked new geography inflated this to 16,250,401; lossless delta packing
reduced it to 10,482,912 (+2,052,121 versus HEAD). The bundle budget is updated
for the intentional map data with the existing 10% headroom policy.
