// Runs one stage on inputs you give it, sealed off, and returns all it did.
//
// Moving a stage onto the shared modules must change nothing it does, and the
// only honest way to know is to run the old stage and the new one on the same
// inputs and compare everything: status, both streams, every file written.
// A stage could not be run like that. It reads and writes fixed paths in
// `/tmp` and `content/`, the live cycle's own, and it reads the clock.
//
// Here the stage runs as the cycle runs it, a script of its own, inside a
// mount and network namespace: `/tmp` is a scratch directory holding the
// inputs, `content/` is an overlay so every write lands in a scratch layer
// and the real tree is untouched, there is no network, and the clock is held
// at one moment (`lib/frozen-clock.js`). What comes back is the status, the
// streams, and each file the stage created or changed.

import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROOT } from './paths.js'

const CLOCK = fileURLToPath(new URL('./frozen-clock.js', import.meta.url))
const UNSHARE = '/usr/bin/unshare'

/** Whether this machine lets us make the sandbox: root, `unshare`, and an overlay. */
export function canReplay() {
  if (!existsSync(UNSHARE)) return false
  const probe = 'd=$(mktemp -d) && mkdir $d/l $d/u $d/w $d/m && mount -t overlay overlay -o lowerdir=$d/l,upperdir=$d/u,workdir=$d/w $d/m'
  return spawnSync(UNSHARE, ['-m', '-n', '--', '/bin/bash', '-c', probe], { stdio: 'ignore' }).status === 0
}

/** @param {string} dir @returns {string[]} every file under `dir`, by path from it */
function filesUnder(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, encoding: 'utf-8' })
    .filter((f) => !lstatSync(join(dir, f)).isDirectory())
    .sort()
}

/**
 * @typedef {object} Replay
 * @property {string} script the stage, by path from the tree's root
 * @property {string} now ISO; what the stage's clock says throughout
 * @property {string[]} [args]
 * @property {string} [tree] the checkout whose stage and `content/` are used; this one by default
 * @property {Record<string, string>} [tmp] files in `/tmp`, by name: the content, or `@path` to copy a file
 * @property {Record<string, string | null>} [content] changes to `content/` before the run, by path from it: the new content, `@path` to copy, or null to remove
 * @property {Record<string, string>} [env]
 * @property {string} [bin] a directory of commands to put ahead of the real ones: a `claude` that answers from a file, where the real one would need the network
 */

/**
 * @param {Replay} replay
 * @returns {Promise<{ status: number | null, stdout: string, stderr: string, written: Record<string, string | null> }>}
 *   `written` is every file the stage created or changed, by the path it used
 *   (`/tmp/…` or `content/…`), with its content; null for one it removed
 */
export async function replayStage({ script, now, args = [], tree = ROOT, tmp = {}, content = {}, env = {}, bin }) {
  const base = join(ROOT, '.cache', 'stage-replay')
  mkdirSync(base, { recursive: true })
  const box = mkdtempSync(join(base, 'run-'))
  const boxTmp = join(box, 'tmp')
  const upper = join(box, 'upper')
  const real = join(tree, 'content')
  /** @param {string} target @param {string} value */
  const place = (target, value) => {
    mkdirSync(dirname(target), { recursive: true })
    if (value.startsWith('@')) cpSync(value.slice(1), target)
    else writeFileSync(target, value)
  }

  try {
    for (const dir of [boxTmp, upper, join(box, 'work'), join(box, 'home')]) mkdirSync(dir, { recursive: true })
    for (const [name, value] of Object.entries(tmp)) place(join(boxTmp, name), value)

    // The changes to content/ are made through the overlay, once it is
    // mounted, so a removal is a removal there and nowhere else. They are
    // staged beside the box and applied by the same shell that starts the stage.
    const staged = join(box, 'staged')
    /** @type {string[]} */
    const prepare = []
    for (const [path, value] of Object.entries(content)) {
      if (value === null) prepare.push(`rm -f '${join(real, path)}'`)
      else {
        place(join(staged, path), value)
        prepare.push(`mkdir -p '${dirname(join(real, path))}' && cp '${join(staged, path)}' '${join(real, path)}'`)
      }
    }
    // What the changes themselves put in the upper layer is not the stage's
    // doing: note it after they are applied, and report only what differs.
    const marker = join(box, 'prepared')
    const steps = [
      `mount --bind '${boxTmp}' /tmp`,
      `mount -t overlay overlay -o 'lowerdir=${real},upperdir=${upper},workdir=${join(box, 'work')}' '${real}'`,
      ...prepare,
      `touch '${marker}'`,
      `cd '${tree}'`,
      `exec '${process.execPath}' --import '${CLOCK}' '${script}' "$@"`,
    ]

    const preparedTmp = new Map(filesUnder(boxTmp).map((f) => [f, readFileSync(join(boxTmp, f), 'utf-8')]))
    const res = await new Promise((resolve, reject) => {
      const child = spawn(UNSHARE, ['-m', '-n', '--', '/bin/bash', '-c', steps.join(' && '), 'stage', ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { PATH: `${bin ? `${bin}:` : ''}${dirname(process.execPath)}:/usr/bin:/bin`, HOME: join(box, 'home'), ZUHD_FROZEN_NOW: now, ...env },
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d) => {
        stdout += d
      })
      child.stderr.on('data', (d) => {
        stderr += d
      })
      child.on('error', reject)
      child.on('close', (status) => resolve({ status, stdout, stderr }))
    })

    /** @type {Record<string, string | null>} */
    const written = {}
    for (const f of filesUnder(boxTmp)) {
      const text = readFileSync(join(boxTmp, f), 'utf-8')
      if (preparedTmp.get(f) !== text) written[`/tmp/${f}`] = text
    }
    for (const f of preparedTmp.keys()) if (!existsSync(join(boxTmp, f))) written[`/tmp/${f}`] = null
    const since = existsSync(marker) ? lstatSync(marker).mtimeMs : 0
    for (const f of filesUnder(upper)) {
      const stat = lstatSync(join(upper, f))
      // An overlay records a removal as a character device of the same name.
      if (stat.isCharacterDevice()) {
        if (!(f in content && content[f] === null)) written[`content/${f}`] = null
      } else if (!(f in content) || stat.mtimeMs > since) {
        written[`content/${f}`] = readFileSync(join(upper, f), 'utf-8')
      }
    }
    return { ...res, written: Object.fromEntries(Object.entries(written).sort(([a], [b]) => a.localeCompare(b))) }
  } finally {
    rmSync(box, { recursive: true, force: true })
  }
}
