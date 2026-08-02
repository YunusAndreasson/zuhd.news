#!/usr/bin/env node
/**
 * DIAGNOSTIC ONLY — delete this file, its postinstall entry, and the
 * `keep_fnames` block in metro.config.js in the commit that lands the fix.
 *
 * Why this exists
 * ---------------
 * Builds 288 and 289 abort ~0.4s after launch on iOS with an uncaught JS
 * exception raised from a `requestAnimationFrame` callback on the UI worklet
 * runtime. The exception is worklets' remote-function guard:
 *
 *   [Worklets] Tried to synchronously call a Remote Function.
 *   Called "<name>" on the UI Runtime.
 *
 * `<name>` is the one piece of information that would name the offending
 * function — and in a release build it is *always* `"anonymous"`, because
 * `cloneNonWorkletFunction` passes the name only under `__DEV__`:
 *
 *   node_modules/react-native-worklets/src/memory/serializable.native.ts
 *     WorkletsModule.createSerializableNonWorkletFunction(
 *       fun, functionId, __DEV__ ? fun.name : undefined)
 *
 * That is why the previous investigation could not attribute the abort to a
 * line: the information is discarded by the build, not missing from the crash.
 * The crash does not reproduce on Android (build 288's exact JS + matching
 * native boots clean in both dev and `--no-dev --minify` bundles), so the only
 * way to read the name is to ship an iOS build that keeps it.
 *
 * This drops the `__DEV__` gate and appends a slice of the function's own
 * source, so the culprit is identifiable even if the minifier mangles its
 * name. Metro resolves `react-native-worklets` through its `"react-native"`
 * field to `src/`, so `src/` is the file that actually gets bundled.
 *
 * Fails soft on purpose: a missing file or a changed upstream expression logs
 * and exits 0 rather than breaking `npm ci` on the EAS builder.
 */

const fs = require('node:fs');
const path = require('node:path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-worklets',
  'src',
  'memory',
  'serializable.native.ts',
);

const NEEDLE = '__DEV__ ? fun.name : undefined';
const PATCH = "(fun.name || 'anon') + '@' + String(fun).replace(/\\s+/g, ' ').slice(0, 180)";

if (!fs.existsSync(target)) {
  console.warn('[patch-worklets-diagnostic] target not found, skipping:', target);
  process.exit(0);
}

const src = fs.readFileSync(target, 'utf8');

if (src.includes(PATCH)) {
  console.log('[patch-worklets-diagnostic] already applied');
  process.exit(0);
}

if (!src.includes(NEEDLE)) {
  console.warn(
    '[patch-worklets-diagnostic] expected expression not found — worklets changed upstream. Skipping.',
  );
  process.exit(0);
}

fs.writeFileSync(target, src.replace(NEEDLE, PATCH), 'utf8');
console.log('[patch-worklets-diagnostic] remote-function names will survive this release build');
