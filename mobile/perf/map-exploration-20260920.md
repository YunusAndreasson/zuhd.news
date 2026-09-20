# Map exploration — 20 September 2026

Implemented:
- All 30 published exchanges from `/api/markets.json`, validated and cached through the existing query system.
- Compact 26dp green up / red down / neutral flat markers with 48dp hit targets; latest quoted-session percentages, not an implied live quote.
- Deterministic screen-space clustering, member-preserving choosers, obstacle avoidance and leader lines to geographic origins.
- Collision-aware semibold labels bounded to the visible map, with older-quote asterisks.
- Fixed Markets entry point; all/rising/falling filters, movement sorting, accessible rows, quote dates and sources/context/charts in detail sheets. Selecting a row flies to its exchange.
- Other data retains commodities, currencies, shipping and prediction readings; indicators without meaningful coordinates remain available in the browser.
- Strait coastline glyphs now carry compact green/red direction signs and all-ship traffic change labels. The stated window is seven-day average versus 90-day normal, matching detail cards.
- Stronger light-theme direction and strait contrast; aligned legend and chooser symbols.
- Quote histories exclude cached entries stamped later than the provider's actual observation date.
- Fixed RNGH 3 detector geometry: the positioned parent bounds the recognizer and makes taps and pinch anchors use the same coordinate space as the canvas. Header controls remain outside it.

Verification:
- Full `npm run verify`: 64 suites, 570 tests passed, plus typecheck, lint and deprecated-API checks.
- After the final label/contrast refinements: typecheck, lint, diff whitespace check and 15 focused tests passed.
- Android 15 emulator: all 30 exchanges loaded (8 rising / 22 falling at inspection), rising filter, Other data, exchange selection → camera flight → chart, older quotes, clustered Malaysia/Singapore and Stockholm/Frankfurt chooser, chooser → exchange detail, direct Hormuz marker → shipping detail, pinch zoom, header/menu/settings reachability, large text, light and dark map rendering.
- Recorded `.argent/flows/market-browser-20260920.yaml`: nine steps passed uninterrupted. Run with `argent flow run market-browser-20260920 --platform android` from a loaded globe with no sheets open. No coordinate exceptions. A final replay also passed all nine steps; its Other data idle check reported minor screen motion after the expected Strait of Hormuz row was confirmed. The following action targets the stable Close sheet control, not a loading-dependent row.

Limits: feed snapshots are not live prices. Older quotes remain explicitly dated. Dense regions use grouped targets and may hide labels until zoomed; all exchange rows stay available. iOS was not exercised in this session.
