// Every command the orchestrator runs, standing in for it under the harness
// (`cycle-harness.js`). Started as `node`, `claude`, `git`, `npm`, `npx`,
// `curl`, `date` or `sleep` by a launcher of that name on the sandbox's PATH;
// it writes down how it was called and answers from the scenario.
//
// Nothing here does what the real command does. The point is the trace: which
// commands the orchestrator ran, in what order, with what arguments, input and
// environment. That is its behaviour, and it had never been written down.

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const [, , cmd, ...argv] = process.argv
const scenario = JSON.parse(readFileSync(/** @type {string} */ (process.env.ZUHD_HARNESS_SCENARIO), 'utf8'))
const tracePath = /** @type {string} */ (process.env.ZUHD_HARNESS_TRACE)

// Not the orchestrator's doing: what the sandbox itself put in the environment.
const OWN_ENV = /^(PATH|HOME|PWD|OLDPWD|SHLVL|_|MISE_BIN|ZUHD_HARNESS_.*)$/
const SILENT = cmd === 'date' || cmd === 'sleep'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * `date`, from the scenario's fixed moment: `+FORMAT` for the fields the
 * script formats, and the bare form its `Started:` line prints.
 *
 * @param {string[]} args
 */
function date(args) {
  const at = new Date(scenario.now)
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
  const format = args.find((a) => a.startsWith('+'))
  if (!format) {
    const h = at.getUTCHours()
    const clock = `${pad(h % 12 || 12)}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())} ${h < 12 ? 'AM' : 'PM'}`
    return `${DAYS[at.getUTCDay()]} ${MONTHS[at.getUTCMonth()]} ${String(at.getUTCDate()).padStart(2, ' ')} ${clock} UTC ${at.getUTCFullYear()}`
  }
  /** @type {Record<string, string>} */
  const fields = {
    Y: String(at.getUTCFullYear()),
    m: pad(at.getUTCMonth() + 1),
    d: pad(at.getUTCDate()),
    H: pad(at.getUTCHours()),
    M: pad(at.getUTCMinutes()),
    S: pad(at.getUTCSeconds()),
    u: String(at.getUTCDay() || 7),
  }
  return format.slice(1).replace(/%([YmdHMSu])/g, (_, f) => fields[f])
}

/**
 * A name for a call no rule covers: `node:merge-feeds`, `git:push`,
 * `npm:install`. An inline program with no rule is `node:inline?`, which is a
 * hole in the scenario and reads like one.
 *
 * @param {string} command
 * @param {string[]} args
 */
function nameOf(command, args) {
  if (command === 'node') return args[0] === '-e' ? 'node:inline?' : `node:${String(args[0]).replace(/^.*\//, '').replace(/\.js$/, '')}`
  if (command === 'git') return `git:${args[0] === '-C' ? args[2] : args[0]}`
  if (command === 'npm') return `npm:${args[0] === 'run' ? args[1] : args[0]}`
  if (command === 'npx') return `npx:${args[0]}`
  return command
}

/** What was piped or redirected in, if anything was. */
function stdinText() {
  if (process.stdin.isTTY) return ''
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

// The first rule whose pattern matches the whole call takes it. A rule with
// several answers gives them in turn and repeats the last, so a scenario can
// say "fails once, then works".
/** @type {{ id: string, cmd: string, match?: string, answers: { out?: string, exit?: number, writes?: Record<string, string>, kill?: NodeJS.Signals }[] }[]} */
const rules = scenario.rules
const line = argv.join(' ')
const rule = rules.find((r) => r.cmd === cmd && (!r.match || new RegExp(r.match, 's').test(line)))
const id = rule?.id ?? nameOf(cmd, argv)

let seen = 0
try {
  const mine = `{"id":${JSON.stringify(id)},`
  seen = readFileSync(tracePath, 'utf8').split('\n').filter((l) => l.startsWith(mine)).length
} catch {
  /* the first call of the run */
}
// A call says its name on stdout unless its answer gives it something else to
// say, which shows where that stream goes. Whatever the script parses is given.
const answer = rule ? rule.answers[Math.min(seen, rule.answers.length - 1)] : {}
const out = answer.out ?? `${id}: stdout\n`

if (!SILENT) {
  const stdin = stdinText()
  const env = Object.fromEntries(
    Object.entries(process.env)
      .filter(([k]) => !OWN_ENV.test(k))
      .sort(([a], [b]) => a.localeCompare(b)),
  )
  appendFileSync(tracePath, `${JSON.stringify({ id, cmd, argv, cwd: process.cwd(), ...(stdin ? { stdin } : {}), env })}\n`)
}

for (const [path, content] of Object.entries(answer.writes ?? {})) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

if (cmd === 'date') process.stdout.write(`${date(argv)}\n`)
else process.stdout.write(out)
// Always on stderr, which the script never parses: where this lands (the log,
// the journal, both or neither) is how that call's output is routed.
if (!SILENT) process.stderr.write(`«${id}»\n`)

// A call can be the moment the cycle is stopped: it signals the orchestrator
// while it is itself still running, which is how systemd finds a stage when
// the unit's hour is up. The pauses let what it printed reach the log first,
// and let the orchestrator act before this stage is seen to end.
if (answer.kill) {
  const pause = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400)
  pause()
  process.kill(Number(readFileSync(join(dirname(tracePath), 'pid'), 'utf8')), answer.kill)
  pause()
}
process.exit(answer.exit ?? 0)
