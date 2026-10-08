// Runs the orchestrator for real, with nothing real behind it.
//
// `run-cycle.sh` is the most-changed file in the pipeline and no test had ever
// executed it: what it does on a selector failure, an empty selection or a
// held build lock was known from reading it and from the cycles that found
// out. This runs the script itself, start to finish, in a sandbox where every
// command it calls is `cycle-stub.js`, and returns what it did: the commands
// in order with their arguments, input and environment, the log it wrote, and
// what it printed. Recorded per scenario, that is the orchestrator's
// specification, and what a replacement has to reproduce.
//
// Fail-closed. The script runs on a copy of itself in a scratch tree, with a
// private `/tmp`, a network namespace that has no network, no `.env`, an empty
// HOME, and a PATH holding only the stubs and a few file tools. A command the
// stubs do not cover is not found; it cannot reach the real one.

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROOT } from './paths.js'

const STUB = fileURLToPath(new URL('./cycle-stub.js', import.meta.url))
const STUBBED = ['node', 'claude', 'git', 'npm', 'npx', 'curl', 'date', 'sleep']
// The real tools the script uses. None reaches outside the sandbox it is given.
const TOOLS = ['bash', 'cat', 'cp', 'dirname', 'find', 'flock', 'grep', 'head', 'mkdir', 'mount', 'rm', 'sort', 'tee', 'timeout', 'tr', 'wc']
// The prompts the script reads whole. Stood in for by one line each: the
// harness pins what the orchestrator wraps around a prompt, not its text,
// which changes weekly.
const PROMPTS = ['select-prompt.md', 'write-prompt.md', 'check-prompt.md', 'tune-prompt.md']

/** Whether this machine lets us make the sandbox: root, with `unshare`. */
export function canSandbox() {
  return existsSync('/usr/bin/unshare') && spawnSync('/usr/bin/unshare', ['-m', '-n', 'true'], { stdio: 'ignore' }).status === 0
}

/** @param {string} tool */
function realPath(tool) {
  for (const dir of ['/usr/bin', '/bin', '/usr/sbin', '/sbin']) if (existsSync(join(dir, tool))) return join(dir, tool)
  throw new Error(`cycle-harness: no ${tool} on this machine`)
}

/**
 * @typedef {object} Scenario
 * @property {string} now ISO; the moment `date` reports, which decides the cycle's kind
 * @property {{ id: string, cmd: string, match?: string, answers: { out?: string, exit?: number, writes?: Record<string, string> }[] }[]} rules
 * @property {Record<string, string>} [files] files in the scratch tree, by path from its root
 * @property {Record<string, string>} [env] added to the script's environment (`PUSH_SECRET`)
 * @property {boolean} [lockHeld] start with the cycle lock taken
 */

/**
 * Run one cycle of `script` under `scenario`.
 *
 * @typedef {{ status: number | null, out: string, log: string, kept: string[], trace: { id: string, cmd: string, argv: string[], cwd: string, stdin?: string, env: Record<string, string> }[] }} CycleRun
 *
 * @param {Scenario} scenario
 * @param {{ script?: string, keep?: boolean }} [opts]
 * @returns {Promise<CycleRun>}
 */
export async function runCycle(scenario, { script = join(ROOT, 'scripts', 'run-cycle.sh'), keep = false } = {}) {
  const base = join(ROOT, '.cache', 'cycle-harness')
  mkdirSync(base, { recursive: true })
  const sbx = mkdtempSync(join(base, 'run-'))
  const repo = join(sbx, 'repo')
  const tmp = join(sbx, 'tmp')
  const stubs = join(sbx, 'bin', 'stubs')
  const tools = join(sbx, 'bin', 'tools')
  /** @param {string} text */
  const placed = (text) => text.replaceAll('<repo>', repo)

  try {
    for (const dir of [join(repo, 'scripts'), join(repo, 'content', 'articles'), join(repo, 'logs'), tmp, stubs, tools, join(sbx, 'home')]) {
      mkdirSync(dir, { recursive: true })
    }
    cpSync(script, join(repo, 'scripts', 'run-cycle.sh'))
    chmodSync(join(repo, 'scripts', 'run-cycle.sh'), 0o755)
    for (const p of PROMPTS) writeFileSync(join(repo, 'scripts', p), `«${p}»\n`)
    for (const [path, content] of Object.entries(scenario.files ?? {})) {
      mkdirSync(dirname(join(repo, path)), { recursive: true })
      writeFileSync(join(repo, path), content)
    }
    for (const name of STUBBED) {
      writeFileSync(join(stubs, name), `#!/bin/bash\nexec '${process.execPath}' '${STUB}' ${name} "$@"\n`)
      chmodSync(join(stubs, name), 0o755)
    }
    for (const tool of TOOLS) symlinkSync(realPath(tool), join(tools, tool))

    const rules = scenario.rules.map((r) => ({
      ...r,
      answers: r.answers.map((a) => ({
        ...a,
        ...(a.writes ? { writes: Object.fromEntries(Object.entries(a.writes).map(([p, c]) => [placed(p), c])) } : {}),
      })),
    }))
    writeFileSync(join(sbx, 'scenario.json'), JSON.stringify({ now: scenario.now, rules }))

    const steps = [
      `mount --bind '${tmp}' /tmp`,
      // A second description of the lock file, held for the life of this shell:
      // what the script meets when another cycle is running.
      ...(scenario.lockHeld ? ['exec 9>/tmp/zuhd-cycle.lock', 'flock -n 9'] : []),
      `cd '${repo}'`,
      'bash scripts/run-cycle.sh 2>&1',
    ]
    const res = await run(realPath('unshare'), ['-m', '-n', '--', realPath('bash'), '-c', steps.join(' && ')], {
      env: {
        PATH: `${stubs}:${tools}`,
        HOME: join(sbx, 'home'),
        MISE_BIN: join(sbx, 'no-mise'),
        ZUHD_HARNESS_SCENARIO: join(sbx, 'scenario.json'),
        ZUHD_HARNESS_TRACE: join(sbx, 'trace.jsonl'),
        ...scenario.env,
      },
    })

    /** @param {string} text */
    const plain = (text) => text.replaceAll(repo, '<repo>').replaceAll(sbx, '<sbx>')
    const logs = readdirSync(join(repo, 'logs')).filter((f) => f.endsWith('.log'))
    const runs = join(repo, 'logs', 'runs')
    const kept = existsSync(runs) ? readdirSync(runs, { recursive: true, encoding: 'utf-8' }).filter((f) => f.includes('.')).sort() : []
    const tracePath = join(sbx, 'trace.jsonl')
    return {
      status: res.status,
      out: plain(res.out),
      log: logs.length ? plain(readFileSync(join(repo, 'logs', logs[0]), 'utf-8')) : '',
      kept: kept.map((f) => `logs/runs/${f}`),
      trace: existsSync(tracePath)
        ? plain(readFileSync(tracePath, 'utf-8'))
            .split('\n')
            .filter(Boolean)
            .map((l) => JSON.parse(l))
        : [],
    }
  } finally {
    if (!keep) rmSync(sbx, { recursive: true, force: true })
  }
}

/**
 * Start a command and wait for it: its status and everything it printed, the
 * two streams together and in order. Asynchronous so that several cycles can
 * run at once; one takes about eight seconds, nearly all of it stubs starting.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ env: Record<string, string | undefined> }} opts
 * @returns {Promise<{ status: number | null, out: string }>}
 */
function run(command, args, { env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => {
      out += d
    })
    child.stderr.on('data', (d) => {
      out += d
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000)
    child.on('error', reject)
    child.on('close', (status) => {
      clearTimeout(timer)
      resolve({ status, out })
    })
  })
}

/** @param {string} text */
const sha = (text) => createHash('sha1').update(text).digest('hex').slice(0, 8)

/**
 * A run as text: what a person reads to see what the orchestrator did, and
 * what a test compares. Every command on a line of its own with its
 * arguments; under it, whatever changed in its environment since the command
 * before, and its stdin. Then the long texts the commands were handed (a
 * prompt is an argument), the files it kept beside the cycle's record, the
 * log and the journal.
 *
 * An inline `node -e` program is shown by the name its rule gave it and a hash
 * of its text. Durations are `N`: the stubs answer at once, and how long the
 * real thing takes is not the orchestrator's behaviour.
 *
 * `full` adds the long texts themselves and the journal. The five healthy
 * cycles are recorded that way. A failure path is recorded without them: its
 * prompts are the healthy cycle's, shown by hash, and what reaches the journal
 * is a property of each call that the healthy cycles already pin.
 *
 * @param {CycleRun} run
 * @param {{ full?: boolean }} [opts]
 */
export function renderCycle(run, { full = true } = {}) {
  /** @type {string[]} */
  const texts = []
  /** @param {string} text */
  const ref = (text) => {
    if (!full) return `«text sha1:${sha(text)}»`
    let i = texts.indexOf(text)
    if (i === -1) i = texts.push(text) - 1
    return `«text ${i + 1}»`
  }
  /** @param {string} value */
  const shown = (value) => (value.includes('\n') || value.length > 200 ? ref(value) : value)
  /** @param {string} text */
  const timeless = (text) => text.replace(/— \d+s/g, '— Ns').replace(/total \d+s/g, 'total Ns')
  /** @param {string} text */
  const quoted = (text) => text.replace(/\n$/, '').split('\n').map((l) => `  | ${l}`.trimEnd())

  const lines = [`exit: ${run.status}`, '', 'commands']
  /** @type {Record<string, string>} */
  let before = {}
  for (const call of run.trace) {
    const args = call.argv.map((a, i) => {
      if (call.cmd === 'node' && call.argv[i - 1] === '-e') return `«${call.id}» sha1:${sha(a)}`
      return a === '' ? "''" : shown(a)
    })
    lines.push(`  ${call.cmd} ${args.join(' ')}`)
    for (const [k, v] of Object.entries(call.env)) if (before[k] !== v) lines.push(`      + ${k}=${shown(v)}`)
    for (const k of Object.keys(before)) if (!(k in call.env)) lines.push(`      - ${k}`)
    if (call.stdin) lines.push(`      < ${shown(call.stdin.replace(/\n$/, ''))}`)
    before = call.env
  }
  texts.forEach((text, i) => {
    lines.push('', `«text ${i + 1}»`, ...quoted(text))
  })
  if (run.kept.length) lines.push('', 'kept', ...run.kept.map((f) => `  ${f}`))
  lines.push('', 'log', ...quoted(timeless(run.log)))
  if (full) lines.push('', 'journal', ...quoted(timeless(run.out)))
  return `${lines.join('\n')}\n`
}
