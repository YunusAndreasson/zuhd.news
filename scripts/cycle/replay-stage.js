#!/usr/bin/env node
// Replay one stage on kept inputs, and write everything it did to a directory.
//
//   node scripts/cycle/replay-stage.js --script scripts/merge-feeds.js \
//     --inputs <dir> --now <iso> --out <dir> [--tree <checkout>] [-- <stage args>]
//
//   <inputs>/tmp/*           the stage's /tmp
//   <inputs>/content/**      state to put under content/ first
//   <inputs>/remove.txt      paths under content/ to remove first, one a line
//   <inputs>/bin/*           commands to put ahead of the real ones (a `claude`
//                            that answers from a file in /tmp, say)
//   <inputs>/logs/*          what the stage finds in logs/
//
// Run it for the tree as it was (`--tree`, a checkout of the commit before)
// and again for the tree as it is, then `diff -r` the two directories. That
// is how a stage is shown to do the same thing after it has been moved onto
// the shared modules: status, both streams, and every file it wrote.
//
// The sandbox is `lib/stage-replay.js`: nothing here touches the real /tmp,
// the real content/, or the network.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { argAt } from '../lib/argv.js'
import { ROOT } from '../lib/paths.js'
import { replayStage } from '../lib/stage-replay.js'

const script = argAt('script')
const inputs = argAt('inputs')
const now = argAt('now')
const out = argAt('out')
const tree = argAt('tree', ROOT)
if (!script || !inputs || !now || !out) {
  console.error('usage: replay-stage.js --script <path> --inputs <dir> --now <iso> --out <dir> [--tree <checkout>] [-- <stage args>]')
  process.exit(2)
}

/** @param {string} dir @returns {string[]} */
const under = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, encoding: 'utf-8' }).filter((f) => statSync(join(dir, f)).isFile())
    : []

/** @type {Record<string, string | null>} */
const content = Object.fromEntries(under(join(inputs, 'content')).map((f) => [f, `@${join(inputs, 'content', f)}`]))
if (existsSync(join(inputs, 'remove.txt'))) {
  for (const path of readFileSync(join(inputs, 'remove.txt'), 'utf-8').split('\n').filter(Boolean)) content[path] = null
}
const dashes = process.argv.indexOf('--')

const run = await replayStage({
  script,
  now,
  tree,
  args: dashes === -1 ? [] : process.argv.slice(dashes + 1),
  tmp: Object.fromEntries(under(join(inputs, 'tmp')).map((f) => [f, `@${join(inputs, 'tmp', f)}`])),
  content,
  bin: existsSync(join(inputs, 'bin')) ? resolve(inputs, 'bin') : undefined,
  logs: existsSync(join(inputs, 'logs')) ? resolve(inputs, 'logs') : undefined,
})

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'status'), `${run.status}\n`)
writeFileSync(join(out, 'stdout'), run.stdout)
writeFileSync(join(out, 'stderr'), run.stderr)
for (const [path, text] of Object.entries(run.written)) {
  const target = join(out, 'written', path.replace(/^\//, ''))
  mkdirSync(dirname(target), { recursive: true })
  if (text === null) writeFileSync(`${target}.REMOVED`, '')
  else writeFileSync(target, text)
}
console.log(`${script}: exit ${run.status}, wrote ${Object.keys(run.written).length} file(s) → ${out}`)
