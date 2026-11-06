// The cycle's way to GitHub: pull, install, push, after each commit that has
// to reach the remote. `scripts/cycle/sync.js` runs it, and both orchestrators
// start that by name, so what runs is the file as the last pull left it.
//
// Two writers share `master`: this box, committing `content/` five times a day,
// and the owner's laptop, pushing the app, the site and the rules. When the two
// diverge, every push from here is refused while the site goes on deploying
// from the local tree as if nothing were wrong. That happened 2026-04-23→25,
// 05-22→27 and 11-02→06, the last over two files: the owner committed
// `content/.ai-models.json` and `content/.companies.json`, which the box writes
// every cycle and had never tracked, and for 20 cycles `git pull` refused to
// overwrite them ("untracked working tree files would be overwritten by
// checkout") and no commit reached the remote. So the pull settles what it can,
// and says plainly what it cannot:
//
//   - `package-lock.json` is put back to the committed one before each pull.
//     The box never commits it, and its npm rewrites the owner's in its own
//     dialect on every install; carried through a pull in the autostash, an
//     owner's lockfile change comes back with conflict markers in it.
//   - An untracked `content/` file that the remote now tracks is the box's own,
//     and newer: the cycle wrote it. It is set aside for the pull and put back
//     over the remote's copy, where it reads as a local change, as the other
//     snapshots the box keeps uncommitted do.
//   - An autostash that comes back in conflict is settled the same way: the
//     box's copy of a `content/` file, out of the stash. Anything else keeps the
//     pulled copy, the stash is kept, and the line says where. A conflict left
//     in place would stop every later commit and pull, and leave markers in a
//     file the build reads.
//   - A rebase stopped on a conflict is aborted, so the tree is as it was and
//     the next cycle tries again.
//
// A failure it reports starts `WARNING: git pull --rebase failed` or
// `WARNING: git push failed`, the marks the run record and `logs.test.js`
// count, and ends with git's own reason. Nothing here fails the cycle.

import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const REMOTE = 'origin'
const BRANCH = 'master'
const LOCKFILE = 'package-lock.json'

/**
 * Whether the cycle writes this path, and so may keep its own copy over the
 * remote's. The cycle commits nothing outside `content/`.
 *
 * @param {string} path repository-relative
 */
export const cycleOwns = (path) => path.startsWith('content/')

/**
 * The files a refused pull names as in the way: git lists untracked files it
 * would overwrite one a line, indented, under the line that says so.
 *
 * @param {string} out what the pull printed
 * @returns {string[]}
 */
export function untrackedInTheWay(out) {
  const lines = out.split('\n')
  const at = lines.findIndex((line) => /untracked working tree files would be (?:overwritten|removed)/.test(line))
  if (at === -1) return []
  const paths = []
  for (const line of lines.slice(at + 1)) {
    if (!/^\s+\S/.test(line)) break
    paths.push(line.trim())
  }
  return paths
}

/**
 * Git's reason, for a warning line: the first line that says what went wrong,
 * or the last it printed. Progress lines (`Rebasing (3/114)`) are cut at the
 * carriage return that separates them.
 *
 * @param {string} out
 */
export function gitReason(out) {
  const lines = out
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.find((line) => /^(?:error|fatal):|^! \[(?:rejected|remote rejected)\]|^CONFLICT/.test(line)) ?? lines.at(-1) ?? 'git printed nothing'
}

/**
 * @typedef {object} SyncResult
 * @property {boolean} pulled whether the remote's commits are under this branch now
 * @property {boolean} pushed
 * @property {number | null} ahead commits here that the remote does not have, after the push
 */

/**
 * Pull, install, push, in the working tree at `root`.
 *
 * @param {{ root: string, say?: (line: string) => void, install?: () => void }} options
 *   `install` runs between the pull and the push: `npm install` unless a test says otherwise
 * @returns {SyncResult}
 */
export function syncRemote({ root, say = (line) => console.log(line), install }) {
  /** @param {string[]} args */
  const git = (args) => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    return { status: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trimEnd() }
  }
  /** @param {string} out */
  const echo = (out) => {
    if (out) say(out)
  }

  // The lockfile as committed, before anything is stashed (see the top).
  if (git(['diff', '--quiet', '--', LOCKFILE]).status === 1) git(['checkout', '--', LOCKFILE])

  const pull = () => {
    const r = git(['pull', '--rebase', '--autostash', REMOTE, BRANCH])
    echo(r.out)
    if (r.status !== 0 && rebasing()) {
      const at = git(['rev-parse', '--short', 'REBASE_HEAD'])
      const stopped = at.status === 0 ? at.out : ''
      echo(git(['rebase', '--abort']).out)
      say(`sync: the rebase stopped on a conflict${stopped ? ` at ${stopped}` : ''} and was aborted; the tree is as it was before the pull`)
    }
    return r
  }
  const rebasing = () =>
    ['rebase-merge', 'rebase-apply'].some((name) => {
      // Relative to `root`, or absolute in a linked worktree.
      const path = git(['rev-parse', '--git-path', name])
      return path.status === 0 && statOrNull(resolve(root, path.out)) !== null
    })

  let pulled = pull()
  let inTheWay = untrackedInTheWay(pulled.out)
  if (pulled.status !== 0) {
    if (inTheWay.length > 0 && inTheWay.every(cycleOwns)) {
      say(`sync: the remote now tracks ${inTheWay.length} file(s) the cycle writes and never committed; the pull goes ahead with the cycle's copies set aside, and they are kept: ${inTheWay.join(', ')}`)
      const aside = setAside(root, inTheWay)
      try {
        pulled = pull()
      } finally {
        aside.restore()
      }
      inTheWay = untrackedInTheWay(pulled.out)
    }
  }
  // The run record keeps the warning lines and not git's: the files go in it.
  const why = inTheWay.length > 0 ? `untracked files the remote now tracks are in the way: ${inTheWay.join(', ')}` : gitReason(pulled.out)
  if (pulled.status !== 0) say(`WARNING: git pull --rebase failed: ${why}`)
  else settleAutostash()

  if (install) install()
  else npmInstall(root, say)

  const pushed = git(['push', REMOTE, BRANCH])
  echo(pushed.out)
  const count = git(['rev-list', '--count', `${REMOTE}/${BRANCH}..HEAD`])
  const ahead = count.status === 0 ? Number(count.out) : null
  if (pushed.status !== 0) {
    const behind = ahead === null ? '' : `; ${ahead} commit(s) here are not on ${REMOTE}`
    say(`WARNING: git push failed: ${gitReason(pushed.out)}${behind}`)
  }
  return { pulled: pulled.status === 0, pushed: pushed.status === 0, ahead }

  /**
   * A pull that worked can still leave files in conflict: the autostash put
   * back over the rebased tree. Git keeps that stash and says "Your changes
   * are safe in the stash". The cycle's files take the stash's copy; anything
   * else takes the pulled one, and the stash stays for a person.
   */
  function settleAutostash() {
    const unmerged = git(['diff', '--name-only', '--diff-filter=U']).out.split('\n').filter(Boolean)
    if (unmerged.length === 0) return
    if (git(['log', '-g', '-1', '--format=%gs', 'refs/stash']).out !== 'autostash') {
      say(`WARNING: git pull --rebase failed: ${unmerged.length} file(s) in conflict and no autostash to settle them from: ${unmerged.join(', ')}`)
      return
    }
    const pulledCopy = []
    for (const path of unmerged) {
      if (cycleOwns(path)) {
        const theirs = spawnSync('git', ['show', `refs/stash:${path}`], { cwd: root })
        if (theirs.status === 0) {
          writeFileSync(join(root, path), theirs.stdout)
          continue
        }
      }
      git(['checkout', 'HEAD', '--', path])
      pulledCopy.push(path)
    }
    // The index as HEAD's: an unmerged entry stops every later commit. Nothing
    // else is staged at a sync; the cycle's commits are `--only`.
    git(['reset', '-q'])
    if (pulledCopy.length === 0) {
      git(['stash', 'drop', '-q'])
      say(`sync: the autostash came back in conflict with the pull on ${unmerged.join(', ')}; the cycle's copies are kept`)
    } else {
      say(`WARNING: git pull --rebase failed: a local change to ${pulledCopy.join(', ')} conflicted with the pull; the pulled copy is in the tree and the change is in the stash (git stash show -p)`)
    }
  }
}

/**
 * Move files out of the tree, keeping their times, and back again.
 *
 * @param {string} root
 * @param {string[]} paths repository-relative
 */
function setAside(root, paths) {
  const dir = mkdtempSync(join(tmpdir(), 'zuhd-sync-'))
  const kept = paths.map((path, i) => {
    const from = join(root, path)
    const to = join(dir, String(i))
    const { atime, mtime } = statSync(from)
    copyFileSync(from, to)
    rmSync(from)
    return { from, to, atime, mtime }
  })
  return {
    restore() {
      for (const { from, to, atime, mtime } of kept) {
        mkdirSync(dirname(from), { recursive: true })
        copyFileSync(to, from)
        utimesSync(from, atime, mtime)
      }
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/** @param {string} path */
function statOrNull(path) {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

/**
 * Whatever build dependency the pull brought; a no-op when nothing changed.
 *
 * @param {string} root
 * @param {(line: string) => void} say
 */
function npmInstall(root, say) {
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: root, encoding: 'utf8' })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trimEnd()
  if (out) say(out)
  if (r.status !== 0) say('WARNING: npm install after pull failed')
}
