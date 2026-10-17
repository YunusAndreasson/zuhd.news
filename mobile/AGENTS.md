# mobile/AGENTS.md

React Native + Expo app for zuhd.news. Voice and philosophy: `../foundation.md`.

**Read `DESIGN.md` before any UI change.** It holds the tokens, `<Text>`
variants, primitives, the spacing ladder, motion and the anti-patterns. Its
rules are tight on purpose; don't re-litigate them.

## Commands

Run in `mobile/`.

| | |
|---|---|
| `npm run verify` | typecheck, lint, the deprecated-API check and tests. Run it before finishing |
| `npm test -- <name>` | one jest file, for example `npm test -- globe-camera` |
| `npm run dev` | boots the Android emulator, installs the dev client if missing, starts Metro |
| `npm run bench` | the perf benches in `perf/` |
| `npm run deps:check` / `deps:update` | what Expo would change; the second applies it |
| `npm run lint` | Biome. Not `@expo/agent-cli lint` from the generated block below: that runs ESLint, which this project does not use |

## Non-negotiables

- Vanilla `StyleSheet` + `useTheme()`. No NativeWind, Unistyles, Tamagui or
  Restyle.
- No inline hex. Colours come from `useTheme().colors` or a `tone` prop.
- No inline `fontSize`. Use `<Text variant>`, and its `scale` prop before any
  style override. A `fontVariant` override is fine; a font-family override is
  an escape hatch and needs a comment.
- No raw `<SymbolView>` or symbol glyph. Go through `<Icon>`. Primitives are
  in `components/primitives/`.
- One typeface: Source Sans 3.
- A new token or variant goes in `constants/theme.ts` with a JSDoc that says
  what role it fills. Migrate the call sites and update `DESIGN.md`.
- Arithmetic lives in pure modules under `lib/` or `components/globe/`, with a
  test in `__tests__/`. The failure mode here is a plausible wrong number, not
  a crash. A failing baseline means fix the cause, not the number.

## Gestures: Gesture Handler 3 hooks only

Use `usePanGesture({…})`, `useTapGesture({…})` and `useCompetingGestures(a, b)`.
Never the v2 builder chain: `Gesture.Pan()` still compiles and runs, and is
silently routed to the legacy detector.

- The callbacks are `onActivate`, `onUpdate` and `onDeactivate` (not `onStart`,
  `onChange`, `onEnd`). A tap's success is `onDeactivate` plus its `canceled`
  flag. `onBegin` and `onFinalize` get plain handler data, with no
  `translationX` or `velocityX`.
- Keep the config in `useMemo((): PanGestureConfig => ({…}), deps)`. Annotate
  the return type, not `useMemo<PanGestureConfig>(…)`: only the first rejects a
  stale key such as `onEnd`.
- Anything that scrolls over the globe is gesture handler's `ScrollView`, or a
  scroll view inside a `useNativeGesture` detector. Under a plain one, the
  drag turns the earth instead.

## Dependencies

- `react-native-gesture-handler` follows the SDK set (3.3 on SDK 58). Keep one
  copy: two would mean two native gesture registries.
- **Never pass an inline function to an array method (`.map`, `.filter`,
  `.forEach`, …) inside a worklet.** It aborts a release build on launch and
  nothing names the offender. Scan for it before touching the versions of
  `react-native`, `react-native-reanimated` or `react-native-worklets`.
- Don't call `scheduleOnRN` from an animation's completion callback: it can
  abort the app. Tell JS from a reaction on the value, at the finger's lift, or
  with a JS timer.
- A native change needs a `runtimeVersion` bump and a store build.

## One screen

`app/index.tsx` is a single map screen. Every surface is a layer over **one**
`MiniGlobe` mounted at its root:

```
MiniGlobe (Skia, pointerEvents none)  the only globe in the app
GlobeGestureLayer                     drag turns · pinch zooms · tap hit-tests
MapHeader                             the strip of movers · ▶ listen · ≡ menu
MapSheet                              custom, non-modal · peek or the whole story
  StoryDeck → StoryCard               one story at a time, swiped sideways
StoryDock                             pinned to the foot: the story track
platform sheets                       menu · card · country · …
```

Settled decisions. Ask before reopening any of these:

- No section rail, no full-screen or modal reader, no list of every story.
- `MapSheet` is hand-built and non-modal, and it is the only one. Every other
  sheet is a platform sheet.
- An open story rises over the globe; the globe does not shrink.
- The dock is the story track and nothing else. No next or open buttons.
- The river is plain time order by publish time. No top-stories lead.
- A move is green up, red down, slate unmoved, everywhere (`moveTone`,
  `lib/valence.ts`). Colour never says what a move means, and odds are never
  tinted.
- The UI explains itself by looking: words, not codes or tickers, and no label
  the reader would learn without.
- The globe has no sky (no stars, no moon).

Across the layers:

- **Every mark has a row.** The gesture layer is hidden from screen readers, so
  each mark on the globe needs a row in the strip, a story card or the menu. A
  new mark layer without one is an accessibility regression. It also needs an
  entry in the map key (`SheetMapKeyPage`).
- **One number per thing.** A reading printed in two places is the same number
  from the same function. The strip, the globe's marks, the menu's lists and
  a card's first chip print the past seven days wherever the series has a week.
- **A count of people or a week names its date.** Sources run weeks behind.
- **Nothing without an honest place goes on the globe**: no prices, currencies,
  contracts, companies or AI labs.

## Rules that load with the files they cover

These are path-scoped in the repo root's `.claude/rules/mobile/`. Add new
subsystem rules there, not here.

| | |
|---|---|
| `globe.md` | `MiniGlobe`, the camera, projection, marks, hazard layers |
| `story-deck.md` | the river, the sheet, the card, the dock, arrivals |
| `instruments.md` | the strip, the menu's lists, cards, hazard lists |

A rule is one or two lines: what to do or not do, the symbol it lives in, and
a clause of why. No history, dates or measurements. If a test pins it, the
test is the rule.

## Performance

- **At rest the app renders zero frames.** Check with `adb shell dumpsys
  gfxinfo news.zuhd.app reset`, leave it untouched for 5 s, then read "Total
  frames rendered", beside a screenshot: a JS error also renders nothing.
- Never use Skia's `usePathValue`: it re-runs every frame forever. Use
  `useDerivedValue` returning a built path.
- A JS read of a shared value the UI thread has written blocks until the UI
  thread answers. Keep such reads out of render, effects and redraw paths. A
  `useAnimatedStyle` updater also runs on JS at mount: in a component that
  mounts while its inputs animate, return a style computed from props when
  `globalThis.__RUNTIME_KIND === 1`.
- What moves per frame costs a native update per frame on iOS, and the
  emulator hides it:
  - No opacity between 0 and 1 on a view with children. Fade a leaf over it, or
    switch 0/1 at the motion's true end.
  - Never animate opacity on a view with `backgroundImage`.
  - No layout props (`top`, `bottom`, `height`) per frame.
  - A style that returns a fresh `transform` array is re-sent on every run.
    Keep a transform in a style whose inputs change only when it does.
- No `localeCompare`, `Intl` or `toLocale*` in per-frame code. Compare with
  `<`; format a time through the cached `formatLocalTime`.
- Subscribe to a store in the component that shows it. `HomeScreen` takes only
  the `fresh` and `found` sets; the read store is `StoryDock`'s. The screen
  reads the network as one boolean (`useOffline`).
- Reduce Motion is Reanimated's default (`ReduceMotion.System`): no
  `useReducedMotion()` branch for a Reanimated animation. The exceptions and
  the spring rules are in `DESIGN.md` (Motion).
- `HomeScreen` and `MiniGlobe` keep their manual `useMemo` and `useCallback`:
  they are load-bearing. A `'use no memo'` or `'worklet'` directive must be
  the first statement of the function body.
- Emulator numbers mislead: its GL time is pipe transport, and
  `adb shell input swipe` reports zero velocity (use argent's `gesture-swipe`).
  Count mounts and frames, not milliseconds, and judge GPU cost on hardware.

<!-- BEGIN EXPO AGENT CLI MANAGED BLOCK -->
<!-- Generated by `npx @expo/agent-cli agents:setup`. Everything inside the markers is overwritten on the next run. -->

## Expo project

- Project: mobile
- SDK: 58.0.13
- Native: CNG (no native directories; they are generated by `npx expo prebuild`)
- Expo Go: not compatible (6 reasons; needs a development build, run `npx @expo/agent-cli status --json` for the details)
- Dev client: `expo-dev-client` is installed

## Commands

For the operations listed below, use `@expo/agent-cli` in place of the equivalent commands elsewhere in this file or in loaded skills. Package installation still uses Expo’s SDK-compatible version resolution. Use `bunx` instead of `npx` when `bun.lock` is present.

Most commands take `--json` for a machine-readable report.

- `npx @expo/agent-cli status` — where the project is right now, and what would happen next
- `npx @expo/agent-cli status --json` — the same report as one object, with the raw project probe under `probe`
- `npx @expo/agent-cli status --explain` — the deep dive: which sources changed, whether an update can ship over the air, and whether EAS already has a build for this fingerprint
- `npx @expo/agent-cli status --assert js-only` — a gate on what a change costs: exit 20 when it costs more than the class named, 22 when nothing could be measured, 0 otherwise
- `npx @expo/agent-cli dev --android` — get the app onto that platform's device: it prints the plan, then runs it. The platform flag (--ios, --android, --web) is required; add --plan to print the steps without running them
- `npx @expo/agent-cli start` — `expo start` and nothing else: a dev server no planning may touch
- `npx @expo/agent-cli install <pkg>` — install a package and report what it changes natively
- `npx @expo/agent-cli install --fix` — fix incompatible package versions using Expo's SDK-compatible version resolution
- `npx @expo/agent-cli lint` — run the project's Expo lint command
- `npx @expo/agent-cli doctor` — diagnose dependency and configuration issues with expo-doctor
- `npx @expo/agent-cli typecheck` — run the TypeScript compiler of this project as a gate: exit 20 with the diagnostics, exit 0 when there are none. A bundle that builds and an app that does not throw do not cover this.
- `npx @expo/agent-cli runtime:eval <js>` — evaluate JavaScript in the running app
- `npx @expo/agent-cli runtime:errors` — collect the runtime errors of the running app
- `npx @expo/agent-cli navigate <route>` — open a route as a deep link on a device
- `npx @expo/agent-cli runtime:tree` — what is on the screen of the running app, by testID
- `npx @expo/agent-cli runtime:tap <testID>` — tap an element; `--verify` reports what changed
- `npx @expo/agent-cli runtime:type <text> --testID <id>` — type into an input
- `npx @expo/agent-cli skills:list` — the agent skills the installed packages ship
- `npx @expo/agent-cli new <dir>` / `npx @expo/agent-cli deploy` — create a project headlessly / deploy web and native
- `npx @expo/agent-cli smoke --android` — the whole gate in one command: the dev server bundles, the app is up, and nothing threw

## Expo docs

The full Expo docs for this project’s SDK can be local Markdown files.
- `npx @expo/agent-cli docs:sync` downloads them and prints two directories: all docs, and this SDK’s API reference. Grep those directories.
- `npx @expo/agent-cli docs:search <query>` returns ranked pages with file paths and line numbers.
Links in the docs point to `https://docs.expo.dev/<path>.md`. To read one locally, open `<path>.md` in the docs directory that `docs:sync` printed.
Prefer the local docs over web fetches of docs.expo.dev.

## Devices

Run `npx @expo/agent-cli dev` before `navigate`, `runtime:reload` or `runtime:stop`, or they refuse with `NO_BOUND_DEVICE` and name the command. Never boot, shut down or delete a simulator named `agent-cli …` yourself, and never kill an emulator instance started with `-read-only`; it may be bound to another worktree.

## Expo skills

For Expo or EAS work, start with the `expo-overview` skill when it is available in your agent’s skill list. It routes your goal to the relevant Expo or EAS skill. Then read any matching package skills listed below for guidance specific to the installed packages.

<!-- BEGIN EXPO PACKAGE SKILLS -->
## Package skills

Before using or modifying a package listed below, read its relevant skill for package-specific guidance. Each link for a row opens the same skill.

| Package | Skill | Read |
| --- | --- | --- |
| expo-sqlite | expo-sqlite | [.agents/skills/expo-sqlite/SKILL.md](.agents/skills/expo-sqlite/SKILL.md), [.claude/skills/expo-sqlite/SKILL.md](.claude/skills/expo-sqlite/SKILL.md) |

Run `npx @expo/agent-cli skills:sync` after changing dependencies to refresh this index. Run `npx @expo/agent-cli skills:list` to see available package skills.
<!-- END EXPO PACKAGE SKILLS -->

Commands end with a `Suggested next:` section — suggested follow-up commands, not required steps. Run one only when it serves your current goal.
<!-- END EXPO AGENT CLI MANAGED BLOCK -->
