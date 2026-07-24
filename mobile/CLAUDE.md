# mobile/CLAUDE.md

React Native + Expo app for zuhd.news. Voice + philosophy in root `../foundation.md`.

`npm run verify` — typecheck + lint + test in one command; run before finishing.

## Before touching UI

**Read `DESIGN.md`.** It defines the token system, `<Text>` variants, primitives, and anti-patterns. The rules are tight by design — don't re-litigate them.

## Non-negotiables

- No NativeWind / Unistyles / Tamagui / Restyle. Vanilla StyleSheet + `useTheme()` is the committed approach. Matches the root "no framework" philosophy and the Globe 32ms perf budget.
- No inline hex codes. Colors come from `useTheme().colors` or a `tone` prop.
- No inline `fontSize`. Use `<Text variant>` from `components/primitives/`.
- No raw `<Ionicons>` — go through `<Icon>`.
- One typeface: Source Sans 3. No second family.

## Primitives live at

`mobile/components/primitives/` — `Text`, `Stack`, `Box`, `Screen`, `Pressable`, `IconButton`, `Icon`. Import from `./primitives`.

## Tokens live at

`mobile/constants/theme.ts` — add a new variant here with a JSDoc justifying the role; migrate call sites; update `DESIGN.md`.

## When a variant isn't quite right

Prefer the `scale` prop on `<Text>` over style overrides. `fontVariant` overrides (tabular-nums, oldstyle-nums) are OK as style overrides — they're orthogonal. Font family overrides (`font.bold`, `font.regular`) are an escape hatch; document them with a comment.

## Perf reminders

- Globe touches a 32ms JS budget; don't regress `callReproject` throttling.
- Reanimated animations gate on `useReducedMotion()` and battery saver — check before changing timings.
- React Compiler is **installed but NOT enabled** — in any build. The only
  switch is `app.json` → `experiments.reactCompiler`, which flows
  CLI → Metro `customTransformOptions.reactCompiler` → babel caller
  `supportsReactCompiler` → `babel-preset-expo`. That key is absent, so the
  plugin is dropped (`babel-preset-expo/build/configs/expo.js:135`). The
  `'react-compiler'` option in `babel.config.js` only *configures* or
  *disables* (`=== false`); it can never enable.
  Consequence: the ~320 manual `memo`/`useMemo`/`useCallback` sites are
  load-bearing today, not redundant — do not strip them on the assumption the
  compiler covers them. To actually turn it on, add
  `"reactCompiler": true` to `app.json` experiments, and add a `'use no memo'`
  directive to `components/globe/MiniGlobe.tsx` first: it relies on
  intentionally-stale `useCallback(..., [])` closures (three `biome-ignore`
  comments mark them) that the compiler would otherwise rewrite.
