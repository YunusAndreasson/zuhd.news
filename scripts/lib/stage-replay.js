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
// and the real one is untouched, there is no network, and the clock is held
// at one moment (`lib/frozen-clock.js`). What comes back is the status, the
// streams, and each file the stage created or changed there.
//
// That is all it seals. The rest of the tree (`dist/`, `logs/`, `.cache/`,
// the repository) is the real one inside the sandbox too, so a stage that
// names any of it is not replayed in the repository itself
// (`outsideTheSeal`): it is replayed in a checkout.

import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATASETS } from './datasets.js'
import { ROOT } from './paths.js'

const CLOCK = fileURLToPath(new URL('./frozen-clock.js', import.meta.url))
const UNSHARE = '/usr/bin/unshare'

/** Where a run's scratch layers are kept, and removed from when it ends. */
const SCRATCH = join(ROOT, '.cache', 'stage-replay')

/**
 * Whether this machine lets us make the sandbox: root, `unshare`, and an overlay.
 *
 * The probe mounts an overlay over four directories, and they are made and
 * removed here, beside the ones a run uses. They were made by `mktemp -d`
 * inside the probe's shell and never removed: the mount goes with the
 * namespace, the directories do not, and every `npm test` left one more
 * `/tmp/tmp.XXXXXXXXXX` behind (51 of them in the fourteen hours after this
 * landed).
 */
export function canReplay() {
  if (!existsSync(UNSHARE)) return false
  mkdirSync(SCRATCH, { recursive: true })
  const probe = mkdtempSync(join(SCRATCH, 'probe-'))
  try {
    for (const layer of ['l', 'u', 'w', 'm']) mkdirSync(join(probe, layer))
    const mount = 'mount -t overlay overlay -o "lowerdir=$1/l,upperdir=$1/u,workdir=$1/w" "$1/m"'
    return spawnSync(UNSHARE, ['-m', '-n', '--', '/bin/bash', '-c', mount, 'probe', probe], { stdio: 'ignore' }).status === 0
  } finally {
    rmSync(probe, { recursive: true, force: true })
  }
}

/** @param {string} dir @returns {string[]} every file under `dir`, by path from it */
function filesUnder(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, encoding: 'utf-8' })
    .filter((f) => !lstatSync(join(dir, f)).isDirectory())
    .sort()
}

// ── What the sandbox does not seal ───────────────────────────────────

/** The tree's directories a stage may write that stay the real ones in the sandbox. */
const UNSEALED = ['dist', '.cache', 'logs', 'shared']

/** The runner is not a stage: it commits to the tree's repository, and nothing here seals that. */
const RUNNER = /(^|\/)scripts\/cycle\/run\.js$/

/**
 * What a stage's source names that a run of it would not seal, as phrases;
 * empty when it stays inside `/tmp` and `content/`.
 *
 * The sandbox seals those two and the network. The rest of the tree is the
 * real one, writable as root: a replay of `build.js` in the repository
 * rebuilds the live `dist/` under the cycle's own `.build.lock`, and one of
 * `cycle/record.js` rewrites `logs/cycles.jsonl`, the only copy of every
 * cycle older than a week. Neither shows in what the run reports as written.
 *
 * Read off the script's own text, comment lines apart: the datasets it asks
 * `pathOf` for that live elsewhere (`lib/datasets.js`), and the directories
 * it spells. A name is not a write, so a stage that only reads the logs is
 * named too; given `logs`, that directory is a stand-in and is not counted.
 * What a module it imports does is not seen.
 *
 * @param {string} script the stage, by path from the tree's root
 * @param {string} source its text
 * @param {{ logs?: boolean }} [given] whether the run stands a directory in for `logs/`
 * @returns {string[]}
 */
export function outsideTheSeal(script, source, { logs = false } = {}) {
  const code = source.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n')
  /** @param {string} path a location, from the tree's root */
  const sealed = (path) => path.startsWith('/tmp/') || path === 'content' || path.startsWith('content/') || (logs && (path === 'logs' || path.startsWith('logs/')))
  const named = []
  if (RUNNER.test(script)) named.push('the repository (the runner commits)')
  for (const [name, { path }] of Object.entries(DATASETS)) {
    if (!sealed(path) && new RegExp(`pathOf\\(['"]${name}['"]\\)`).test(code)) named.push(`${path} (pathOf('${name}'))`)
  }
  for (const dir of UNSEALED) {
    if (!sealed(dir) && new RegExp(`['"\`/]${dir.replace('.', '\\.')}['"\`/]`).test(code)) named.push(`${dir}/`)
  }
  if (code.includes('.build.lock')) named.push('.build.lock')
  return named
}

/**
 * `path` as a place under `dir`, or a throw. A path from the inputs is a name
 * someone typed: `../scripts/build.js` in a list of files to remove names the
 * real file, outside everything the sandbox seals.
 *
 * @param {string} dir absolute
 * @param {string} path
 * @param {string} what for the message
 */
function under(dir, path, what) {
  const target = resolve(dir, path)
  if (!target.startsWith(`${dir}${sep}`)) throw new Error(`stage-replay: ${what} "${path}" does not stay under ${dir}`)
  return target
}

// The sandbox, as one shell program that is handed everything it works on as
// an argument. The paths were written into its text between single quotes, so
// one with a quote in it ended the string and the rest ran as a command.
//
//   $1 the scratch /tmp   $2 $3 a stand-in for logs/ and where it goes, or two empty strings
//   $4 content/   $5 $6 its upper and work layers
//   $7 how many changes to content/ follow, three arguments each: `rm <path> ''` or `cp <from> <path>`
//   then: a file to touch when they are made, the tree, a file for stdin or '', and the command
const SANDBOX = `
set -e
mount --bind "$1" /tmp
if [ -n "$2" ]; then mount --bind "$2" "$3"; fi
mount -t overlay overlay -o "lowerdir=$4,upperdir=$5,workdir=$6" "$4"
changes=$7
shift 7
while [ "$changes" -gt 0 ]; do
  if [ "$1" = rm ]; then rm -f -- "$2"; else mkdir -p -- "$(dirname -- "$3")" && cp -- "$2" "$3"; fi
  shift 3
  changes=$((changes - 1))
done
touch -- "$1"
cd -- "$2"
stdin=$3
shift 3
if [ -n "$stdin" ]; then exec "$@" < "$stdin"; else exec "$@"; fi
`

/** What a replay leaves in its output directory (`cycle/replay-stage.js`), and nothing else. */
export const OUTPUT = ['status', 'stdout', 'stderr', 'written']

/**
 * Why `dir` may not be taken as a replay's output directory, or null when it
 * may: it is not there, it is empty, or it holds an earlier replay and only
 * that.
 *
 * The directory is removed before the run's output is written into it, so
 * that two runs compare clean. It was removed whatever it was: `--out .` or
 * `--out content` was the end of that directory, from a tool whose point is
 * that nothing real is touched.
 *
 * @param {string} dir
 * @returns {string | null}
 */
export function outputProblem(dir) {
  let names
  try {
    names = readdirSync(dir)
  } catch (err) {
    const { code } = /** @type {NodeJS.ErrnoException} */ (err)
    return code === 'ENOENT' ? null : code === 'ENOTDIR' ? 'it is a file' : `it cannot be read (${code})`
  }
  if (names.length === 0) return null
  const other = names.filter((name) => !OUTPUT.includes(name))
  if (other.length) return `it holds ${other.length === 1 ? `"${other[0]}"` : `${other.length} things`} no replay wrote`
  return names.includes('status') ? null : 'it holds no earlier replay (no `status`)'
}

/**
 * @typedef {object} Replay
 * @property {string} script the stage, by path from the tree's root
 * @property {string} now ISO; what the stage's clock says throughout
 * @property {string[]} [args]
 * @property {string} [tree] the checkout whose stage and `content/` are used; this one by default, for a stage that stays inside the seal
 * @property {Record<string, string>} [tmp] files in `/tmp`, by name: the content, or `@path` to copy a file
 * @property {Record<string, string | null>} [content] changes to `content/` before the run, by path from it: the new content, `@path` to copy, or null to remove
 * @property {Record<string, string>} [env]
 * @property {string} [bin] a directory of commands to put ahead of the real ones: a `claude` that answers from a file, where the real one would need the network
 * @property {string} [logs] a directory to stand in for the tree's `logs/`, for a stage that reads the cycle logs
 * @property {string} [stdin] what the stage is given on its standard input; nothing by default
 */

/**
 * @param {Replay} replay
 * @returns {Promise<{ status: number | null, stdout: string, stderr: string, written: Record<string, string | null> }>}
 *   `written` is every file the stage created or changed, by the path it used
 *   (`/tmp/…` or `content/…`), with its content; null for one it removed
 */
export async function replayStage({ script, now, args = [], tree = ROOT, tmp = {}, content = {}, env = {}, bin, logs, stdin }) {
  tree = resolve(tree)
  if (tree === resolve(ROOT)) {
    const named = outsideTheSeal(script, readFileSync(resolve(tree, script), 'utf-8'), { logs: Boolean(logs) })
    if (named.length) {
      throw new Error(
        `stage-replay: ${script} names ${named.join(', ')}, and the tree is the repository itself. ` +
          `Only /tmp and content/ are sealed${logs ? ' (and logs/, which is stood in for)' : ''}: it would write the real ones. ` +
          'Replay it in a checkout (`tree`); what it writes there outside the seal is not reported either.',
      )
    }
  }
  mkdirSync(SCRATCH, { recursive: true })
  const box = mkdtempSync(join(SCRATCH, 'run-'))
  const boxTmp = join(box, 'tmp')
  const upper = join(box, 'upper')
  const work = join(box, 'work')
  const real = join(tree, 'content')
  // An overlay's layers are given as one option, split on commas and colons.
  for (const layer of [real, upper, work]) if (/[,:]/.test(layer)) throw new Error(`stage-replay: "${layer}" cannot be an overlay layer: it has a comma or a colon in it`)
  /** @param {string} target @param {string} value */
  const place = (target, value) => {
    mkdirSync(dirname(target), { recursive: true })
    if (value.startsWith('@')) cpSync(value.slice(1), target)
    else writeFileSync(target, value)
  }

  try {
    for (const dir of [boxTmp, upper, work, join(box, 'home')]) mkdirSync(dir, { recursive: true })
    for (const [name, value] of Object.entries(tmp)) place(under(boxTmp, name, 'the /tmp file'), value)

    // The changes to content/ are made through the overlay, once it is
    // mounted, so a removal is a removal there and nowhere else. They are
    // staged beside the box and applied by the same shell that starts the stage.
    const staged = join(box, 'staged')
    /** @type {string[]} */
    const changes = []
    for (const [path, value] of Object.entries(content)) {
      const target = under(real, path, 'the content path')
      if (value === null) changes.push('rm', target, '')
      else {
        place(under(staged, path, 'the content path'), value)
        changes.push('cp', join(staged, path), target)
      }
    }
    // What the changes themselves put in the upper layer is not the stage's
    // doing: note it after they are applied, and report only what differs.
    const marker = join(box, 'prepared')
    // A mount needs somewhere to land, and a checkout made for the comparison
    // has no `logs/` (it is not tracked).
    if (logs) mkdirSync(join(tree, 'logs'), { recursive: true })
    // From a file, not a pipe of node's making: that is a socket, which a
    // program that opens /dev/stdin by name cannot open.
    if (stdin !== undefined) writeFileSync(join(box, 'stdin'), stdin)
    const sandbox = [
      boxTmp, logs ? resolve(logs) : '', logs ? join(tree, 'logs') : '',
      real, upper, work,
      String(changes.length / 3), ...changes,
      marker, tree, stdin === undefined ? '' : join(box, 'stdin'),
      process.execPath, '--import', CLOCK, script, ...args,
    ]

    const preparedTmp = new Map(filesUnder(boxTmp).map((f) => [f, readFileSync(join(boxTmp, f), 'utf-8')]))
    const res = await new Promise((done, reject) => {
      const child = spawn(UNSHARE, ['-m', '-n', '--', '/bin/bash', '-c', SANDBOX, 'stage', ...sandbox], {
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
      child.on('close', (status) => done({ status, stdout, stderr }))
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
